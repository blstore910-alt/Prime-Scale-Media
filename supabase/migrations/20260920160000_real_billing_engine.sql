-- =====================================================================
-- SUPERSEDED. Do not run the function half of this file again.
-- =====================================================================
-- Read off production on 2026-09-20, AFTER this was written and pasted:
--
--   * the billing cron is a VERCEL cron (vercel.json, 03:00 daily) that
--     calls /api/cron/subscription-billing, which calls
--     subscription_billing_run() -- NOT process_recurring_subscriptions;
--   * pg_cron carries no billing job at all (only backup, rate-limit
--     prune and audit stats), so process_recurring_subscriptions is
--     called by nothing;
--   * subscription_billing_run already does everything the section
--     below was written to add, and more: it generates for active and
--     past_due only, honours subscription_waiver and
--     subscription_discount perks, sets currency, subscription_id,
--     period_start and due_date, collects after the grace, marks
--     past_due with a notification, skips deactivated customers, and
--     raises an integration failure when a customer has no company to
--     invoice.
--
-- So the function this file rewrites is dead code, and the faults it
-- claims to fix do not exist in the engine that runs. Rewriting it did
-- no harm -- nothing calls it -- but it fixed nothing either.
--
-- WHAT WAS REAL, and has been applied: the backfill in section 0. It
-- filled subscription_id, currency, period_start and due_date on
-- invoices the OLD engine had left null, which is exactly what
-- subscription_billing_run writes for every new one. That makes the
-- legacy rows consistent rather than invisible. It is safe to run
-- again; it is idempotent and it leaves duplicates alone.
--
-- Anything that needs fixing in the live engine has to be done against
-- subscription_billing_run. This file is kept for the backfill and for
-- the record of how the mistake was found.
-- =====================================================================

-- =====================================================================
-- process_recurring_subscriptions — what the app has always said it does
-- =====================================================================
-- Read off production on 2026-09-20, the live function:
--
--   * generates a monthly invoice for `status = 'active'` plans, and
--   * stops there.
--
-- It does NOT set currency, subscription_id, due_date or period_start,
-- and there is no auto-debit and no dunning anywhere. Which means:
--
--   1. Every subscription invoice carries currency NULL, and
--      invoice_pay_from_wallet charges coalesce(currency,'EUR'). A
--      customer on a USD plan is debited in euros.
--   2. subscription_id is NULL — the id lives inside
--      items[0].subscription_id — so _on_subscription_invoice_paid,
--      which keys on new.subscription_id, has never fired for a single
--      live subscription invoice.
--   3. due_date is NULL, so nothing can be "overdue" and the seven-day
--      grace the product promises does not exist.
--   4. Nothing ever collects. Invoices pile up unpaid and the only way
--      money moves is the customer pressing Pay now.
--   5. The duplicate guard is "an invoice for this subscription created
--      TODAY", so a run that lands either side of midnight can raise a
--      second invoice for the same period.
--
-- This replaces it with the three phases the product describes, against
-- the columns the live table actually has (confirmed 2026-09-20:
-- currency, subscription_id, due_date, period_start all exist).
--
-- DELIBERATELY UNCHANGED: a plan that changes mid-month is still billed
-- a whole month, not prorated. That is the owner's decision of
-- 2026-09-20, not an oversight.
--
-- Paused plans were already safe here — the live loop reads 'active'
-- only — and they stay that way.
--
-- Safe to run more than once.
-- =====================================================================

set search_path = public;

-- ── 0. Backfill, so the existing rows join up ────────────────────────
-- Everything the old function left NULL, recovered from where it did
-- put it. Without this the paid-trigger stays dead for every invoice
-- already raised, and their currency stays NULL.
--
-- CAREFULLY, because live already carries
-- invoices_subscription_period_uq on (subscription_id, period_start)
-- AND already carries duplicate subscription invoices for one period --
-- raised by the old function, whose guard was "not invoiced TODAY", so
-- a run either side of midnight raised a second one. Filling
-- subscription_id in naively makes those duplicates collide, which is
-- exactly what happened on the first attempt.
--
-- So: period_start first (harmless while subscription_id is still
-- NULL, since NULLs do not collide), then subscription_id for ONE row
-- per (subscription, period) -- the earliest -- and only where nothing
-- already holds that key. The rows left behind are listed at the
-- bottom; they are genuine duplicates and want voiding by hand, not
-- merging by a migration.

update public.invoices i
   set period_start = i.created_at::date
 where i.type = 'subscription'
   and i.period_start is null;

with cand as (
  select i.id,
         (i.items -> 0 ->> 'subscription_id')::uuid as sub,
         i.period_start,
         row_number() over (
           partition by (i.items -> 0 ->> 'subscription_id')::uuid,
                        i.period_start
           order by i.created_at, i.id
         ) as rn
    from public.invoices i
   where i.type = 'subscription'
     and i.subscription_id is null
     and (i.items -> 0 ->> 'subscription_id') is not null
)
update public.invoices i
   set subscription_id = c.sub
  from cand c
 where c.id = i.id
   and c.rn = 1
   and not exists (
     select 1
       from public.invoices o
      where o.subscription_id = c.sub
        and o.period_start is not distinct from c.period_start
   );

update public.invoices i
   set currency = upper(coalesce(s.currency, 'EUR'))
  from public.subscriptions s
 where s.id = i.subscription_id
   and i.type = 'subscription'
   and coalesce(i.currency, '') = '';

-- Anything still without a currency has no subscription to read one
-- from. EUR is what invoice_pay_from_wallet would have charged anyway,
-- so this changes no behaviour -- it only stops the column lying about
-- being unknown.
update public.invoices i
   set currency = 'EUR'
 where i.type = 'subscription'
   and coalesce(i.currency, '') = '';

update public.invoices i
   set due_date = i.created_at + interval '7 days'
 where i.type = 'subscription'
   and i.due_date is null
   and i.status <> 'paid';

-- ── 1. The engine ────────────────────────────────────────────────────
create or replace function public.process_recurring_subscriptions()
returns void
language plpgsql
security definer
set search_path = public
as $blk0$
declare
  rec       record;
  inv       record;
  v_period  date;
  v_cur     text;
  v_company uuid;
  v_grace   interval := interval '7 days';
  v_can_pay boolean := to_regprocedure('public.invoice_pay_from_wallet(uuid)') is not null;
begin
  -- ── PHASE 1: RAISE ────────────────────────────────────────────────
  -- 'active' only. A paused plan is not billed and a cancelled one is
  -- not either; past_due is picked up by phase 2 on the invoice it
  -- already has, not by raising another.
  for rec in
    select s.*
      from public.subscriptions s
     where s.status = 'active'
       and coalesce(s.amount, 0) > 0
       and s.next_payment_date is not null
       and s.next_payment_date::date <= current_date
  loop
    begin
      v_period := rec.next_payment_date::date;
      v_cur    := upper(coalesce(rec.currency, 'EUR'));

      -- The guard is the PERIOD, not the calendar day the row happened
      -- to be written on. Both shapes are checked so a row raised by
      -- the old function is still recognised.
      if exists (
        select 1 from public.invoices i
         where i.type = 'subscription'
           and (
                 i.subscription_id = rec.id
              or (i.items -> 0 ->> 'subscription_id')::uuid = rec.id
               )
           and (
                 i.period_start = v_period
              or i.created_at::date = current_date
               )
      ) then
        -- Already invoiced for this period. Move the clock on anyway,
        -- or the same row is examined on every run for ever.
        update public.subscriptions
           set next_payment_date = (v_period + interval '1 month')::date,
               updated_at = now()
         where id = rec.id;
        continue;
      end if;

      select c.id into v_company
        from public.companies c
       where c.advertiser_id = rec.advertiser_id
       limit 1;

      insert into public.invoices (
        tenant_id, company_id, items, sub_total, total, advertiser_id,
        type, status, currency, subscription_id, period_start, due_date
      )
      values (
        rec.tenant_id,
        v_company,
        jsonb_build_array(
          jsonb_build_object(
            'name', 'subscription',
            'quantity', 1,
            'rate', rec.amount,
            'tax', 0,
            'amount', rec.amount,
            'currency', v_cur,
            'subscription_id', rec.id
          )
        ),
        rec.amount,
        rec.amount,
        rec.advertiser_id,
        'subscription',
        'unpaid',
        v_cur,
        rec.id,
        v_period,
        now() + v_grace
      );

      update public.subscriptions
         set next_payment_date = (v_period + interval '1 month')::date,
             updated_at = now()
       where id = rec.id;
    exception when others then
      -- One bad plan must not stop the run for everybody else.
      raise warning 'subscription invoice generate failed for sub %: %',
        rec.id, sqlerrm;
    end;
  end loop;

  -- ── PHASE 2: COLLECT, after the grace ─────────────────────────────
  -- Only what is genuinely overdue, and only from a plan that is still
  -- meant to be billing. A paused plan's invoice is left alone: the
  -- customer can still pay it by hand, and nothing takes it from them.
  if v_can_pay then
    for inv in
      select i.id, i.subscription_id, s.status as sub_status
        from public.invoices i
        join public.subscriptions s on s.id = i.subscription_id
       where i.type = 'subscription'
         and i.status = 'unpaid'
         and i.due_date is not null
         and i.due_date <= now()
         and s.status in ('active', 'past_due')
    loop
      begin
        perform public.invoice_pay_from_wallet(inv.id);
      exception when others then
        -- ── PHASE 3: DUNNING ──────────────────────────────────────
        -- Could not collect, nearly always an empty wallet. Mark the
        -- plan past_due so the desk and the customer can both see it.
        -- Its own block: a status value the table will not accept must
        -- not take down the collection run.
        begin
          if inv.sub_status is distinct from 'past_due' then
            update public.subscriptions
               set status = 'past_due',
                   updated_at = now()
             where id = inv.subscription_id
               and status = 'active';
          end if;
        exception when others then
          raise warning 'dunning failed for sub %: %', inv.subscription_id, sqlerrm;
        end;
      end;
    end loop;
  else
    raise notice 'OVERGESLAGEN: invoice_pay_from_wallet bestaat niet, dus geen auto-incasso';
  end if;
end;
$blk0$;

revoke all on function public.process_recurring_subscriptions() from public, anon;

-- ── The report ───────────────────────────────────────────────────────
-- The SQL editor shows only the LAST result set, so this is the one.
select 'invoices with a subscription_id' as item,
       (select count(*)::text from public.invoices
         where type = 'subscription' and subscription_id is not null) as waarde
union all
select 'subscription invoices still missing one',
       (select count(*)::text from public.invoices
         where type = 'subscription' and subscription_id is null)
union all
select 'subscription invoices with no currency',
       (select count(*)::text from public.invoices
         where type = 'subscription' and coalesce(currency, '') = '')
union all
select 'unpaid subscription invoices with no due date',
       (select count(*)::text from public.invoices
         where type = 'subscription' and status <> 'paid' and due_date is null)
union all
select 'the engine now collects',
       case when position('invoice_pay_from_wallet' in coalesce((
         select pg_get_functiondef(p.oid) from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.proname = 'process_recurring_subscriptions' limit 1), '')) > 0
       then 'ja' else 'NEE' end
union all
select 'DUBBELE facturen, zelfde plan + periode (handmatig voiden)',
       (select count(*)::text
          from public.invoices i
         where i.type = 'subscription'
           and i.subscription_id is null
           and (i.items -> 0 ->> 'subscription_id') is not null)
union all
select 'invoice_pay_from_wallet bestaat',
       case when to_regprocedure('public.invoice_pay_from_wallet(uuid)') is not null
       then 'ja' else 'NEE - auto-incasso blijft uit' end;
