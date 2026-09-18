-- =====================================================================
-- PSM — ALLES WAT NOG OPENSTAAT, IN ÉÉN PLAK.
-- =====================================================================
-- Generated from the repo files, not retyped, so nothing here can drift
-- from what is in version control.
--
-- SAFE TO RUN TWICE. Every part either uses `create or replace`, `if not
-- exists`, or a DO block that inspects the live function first and says
-- "already guarded — no change." So if you have pasted some of this
-- already, run the whole thing anyway: the parts that are in will print a
-- notice and do nothing.
--
-- ORDER MATTERS. Run it top to bottom.
--
--   DEEL A  The three views — the one item from tonight's bundle that is
--           not confirmed closed. Read the first two queries BEFORE the
--           ALTERs, and send me what they say.
--   DEEL B  ad_account_request_reject_refund. Until this lands, NO ad
--           account request can be rejected on production at all — the
--           screen now names this file instead of showing a Postgres
--           error, but the desk is still stuck.
--   DEEL C  The scalar rewrite of the clawback. 20260918230000 installed
--           the triggers and they are failing silently without this.
--   DEEL D  The four per-currency price columns, so the $225 you set is
--           the one that gets charged.
--
-- At the very bottom is one row of booleans covering the lot.
-- =====================================================================



-- ---------------------------------------------------------------------
-- DEEL A — DE DRIE VIEWS
-- ---------------------------------------------------------------------
-- A Postgres view runs with its OWNER's permissions unless told
-- otherwise, so these three read their base tables with row-level
-- security switched off — and the browser reads two of them directly
-- with no tenant filter. One of those readers is on /inactive, so a
-- customer you have switched off can read every tenant's top-ups.
-- Steps 1 and 2 are READ-ONLY: send me what they print.
-- source: supabase/checks/DEEL1-RECHECK.sql
-- ---------------------------------------------------------------------

-- =====================================================================
-- DEEL 1, opnieuw gemeten. READ-ONLY — dit schrijft niets.
-- =====================================================================
-- The summary row said views_read_as_caller = false. That can mean two
-- very different things, and they need different answers:
--
--   (a) The ALTER worked and my CHECK was wrong. I wrote
--       `security_invoker = on` and then compared the stored value to
--       the string 'true'. Postgres stores reloptions as written, so
--       'on' is not 'true' and a perfectly good view reports false.
--
--   (b) The ALTER did not work. Either one of them is a MATERIALIZED
--       view (which cannot carry security_invoker at all and always
--       bypasses RLS), or this Postgres is older than 15, where the
--       option does not exist.
--
-- One is a cosmetic bug in my query. The other means a deactivated
-- customer can still read every tenant's top-ups. So: measure.
-- =====================================================================

-- 1. Which Postgres. security_invoker needs 15 or newer.
select version() as postgres_version;


-- 2. The three objects, as they actually are.
--    kind 'view' can be fixed; 'MATERIALIZED VIEW' cannot.
--    raw_options is the truth. reads_as_caller casts properly this time,
--    so on / true / yes / 1 all count.
select
  c.relname                                   as object_name,
  case c.relkind
    when 'v' then 'view'
    when 'm' then 'MATERIALIZED VIEW - cannot be fixed this way'
    when 'r' then 'table'
    else c.relkind::text
  end                                         as kind,
  c.reloptions                                as raw_options,
  coalesce(
    (select option_value::boolean
       from pg_options_to_table(c.reloptions)
      where option_name = 'security_invoker'),
    false
  )                                           as reads_as_caller
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relname in ('top_ups_view',
                     'referral_links_with_details',
                     'referral_commissions_with_details')
 order by c.relname;


-- 3. If step 2 shows kind = 'view' and reads_as_caller = false, run the
--    three lines below and then step 2 again. If a row is missing
--    entirely, that view does not exist here and nothing reads it. If
--    any row says MATERIALIZED VIEW, tell me — that one needs replacing
--    with a plain view, and it is not a one-line fix.

-- GUARDED, because this is a single paste. A bare `alter view` against a
-- view that does not exist here — or against a MATERIALIZED one, which
-- cannot carry security_invoker at all — raises, and a raise in the
-- middle of one script means parts B, C and D never run. The loop skips
-- what it cannot fix and says which, out loud.
do $viewfix$
declare
  v_name text;
  v_kind "char";
begin
  foreach v_name in array array[
    'top_ups_view',
    'referral_links_with_details',
    'referral_commissions_with_details'
  ] loop
    select c.relkind into v_kind
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = v_name;

    if v_kind is null then
      raise notice 'DEEL A: % does not exist here - nothing reads it.', v_name;
    elsif v_kind = 'm' then
      raise warning 'DEEL A: % is a MATERIALIZED view. It bypasses RLS and cannot be fixed this way - tell me about this one.', v_name;
    elsif v_kind <> 'v' then
      raise warning 'DEEL A: % is not a view (relkind %).', v_name, v_kind;
    else
      execute format('alter view public.%I set (security_invoker = true)', v_name);
      raise notice 'DEEL A: % now reads as the caller.', v_name;
    end if;
  end loop;
end;
$viewfix$;


-- 4. Step 2 again, after the ALTERs above.
select
  c.relname                                   as object_name,
  c.reloptions                                as raw_options,
  coalesce(
    (select option_value::boolean
       from pg_options_to_table(c.reloptions)
      where option_name = 'security_invoker'),
    false
  )                                           as reads_as_caller
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'v'
   and c.relname in ('top_ups_view',
                     'referral_links_with_details',
                     'referral_commissions_with_details')
 order by c.relname;


-- 5. THE PROOF THAT DOES NOT DEPEND ON ANY FLAG.
--
-- Owner semantics means the view ignores the policies on its base table.
-- Running the query below HERE shows everything, because the SQL editor
-- is superuser — that is expected and proves nothing either way.
--
-- The real test is one line in the browser console, logged in as a
-- CUSTOMER on app.primescalemedia.com:
--
--     await supabase.from('top_ups_view').select('tenant_id')
--
-- Count the distinct tenant_ids that come back. One is the fix holding.
-- More than one is the leak still open, whatever the flag says.
--
-- This number is what that test should be compared against: if the view
-- holds two tenants and a customer gets one, RLS is doing its job.
select
  count(distinct tenant_id) as tenants_in_the_view,
  count(*)                  as rows_total
  from public.top_ups_view;


-- ---------------------------------------------------------------------
-- DEEL B — REJECTING A REQUEST GIVES THE 50 EUR BACK
-- ---------------------------------------------------------------------
-- Requesting an ad account costs the customer 50 EUR, taken from the
-- wallet the moment they send it. Rejecting used to write
-- status='rejected' and nothing else: we declined the service and
-- kept the money, with nothing on any screen saying so.
-- source: supabase/migrations/20260918220000_refund_rejected_request_fee.sql
-- ---------------------------------------------------------------------

-- =====================================================================
-- Rejecting an ad-account request gives the 50 euro back.
-- =====================================================================
-- ⚠️ APPLY ON SUPABASE MANUALLY.
--
-- WHAT IS WRONG. Requesting an ad account costs the customer 50 EUR (or
-- the USD equivalent), taken from their wallet the moment they send it —
-- the form says so in those words. Rejecting the request writes
-- `status = 'rejected'` and nothing else.
--
-- The fee is recorded on the request (metadata.request_fee), and the
-- migration that put it there says it is stored "so the refund flow can
-- use it". No code has ever read it. So PSM declines to provide the thing,
-- and keeps the money, and nothing on any screen says so.
--
-- A request covered by a free-request PERK burns one off the perk's
-- remaining count in the same way, and that is not given back either.
--
-- THIS RPC does the rejection and the refund as one transaction, because
-- two steps is how the second one gets forgotten — which is exactly what
-- happened.
--
--   * admin of the request's tenant, and ACTIVE (a deactivated admin
--     cannot move money; see 20260918110000)
--   * the request is locked and must still be open — a completed or
--     already-rejected request is refused rather than refunded twice
--   * the wallet is credited in the currency it was charged in
--   * a perk-covered request gives the perk back, when one is still there
--     to give it back to
--   * metadata.request_fee_refunded_at makes it idempotent: a second call
--     refunds nothing
--
-- WHAT IT DOES NOT DO: it does not refund a request that was FREE by plan
-- (request_fee_included), because nothing was taken.
-- =====================================================================

set search_path = public;

create or replace function public.ad_account_request_reject_refund(
  p_request_id uuid,
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $blk0$
declare
  -- SCALARS, NOT RECORDS. A record variable's field cannot be referenced
  -- inside a SQL statement — Postgres tries to resolve `v_admin.id` as
  -- relation.column and reports `relation "v_admin" does not exist`. Every
  -- value that is used inside an UPDATE or a SELECT below is its own
  -- variable for that reason.
  v_uid          uuid := auth.uid();
  v_admin_id     uuid;
  v_admin_tenant uuid;
  v_req_tenant   uuid;
  v_req_status   text;
  v_req_adv      uuid;
  v_meta         jsonb;
  v_fee          numeric;
  v_cur          text;
  v_src          text;
  v_wallet_id    uuid;
  v_perk_id      uuid;
  v_refunded     numeric := 0;
  v_perk_restored boolean := false;
  v_already      boolean;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- Active admin only. Same gate as every other money mover.
  select up.id, up.tenant_id into v_admin_id, v_admin_tenant
    from public.user_profiles up
   where up.user_id = v_uid
     and up.role = 'admin'
     and coalesce(up.is_active, true)
   limit 1;
  if not found then
    raise exception 'admins only' using errcode = '42501';
  end if;

  select r.tenant_id, r.status, r.advertiser_id, coalesce(r.metadata, '{}'::jsonb)
    into v_req_tenant, v_req_status, v_req_adv, v_meta
    from public.ad_account_requests r
   where r.id = p_request_id
   for update;
  if not found then
    raise exception 'request not found' using errcode = '42704';
  end if;
  if v_req_tenant <> v_admin_tenant then
    raise exception 'not your tenant' using errcode = '42501';
  end if;
  if v_req_status = 'completed' then
    raise exception 'That request was already completed — it cannot be rejected.'
      using errcode = '22000';
  end if;
  if v_req_status = 'rejected' then
    raise exception 'That request was already rejected.' using errcode = '22000';
  end if;

  v_fee := coalesce((v_meta->>'request_fee')::numeric, 0);
  v_cur := upper(coalesce(v_meta->>'request_fee_currency', 'EUR'));
  v_src := coalesce(v_meta->>'request_fee_free_source', '');
  v_already := (v_meta->>'request_fee_refunded_at') is not null;

  -- ── The rejection itself ──────────────────────────────────────────
  update public.ad_account_requests
     set status = 'rejected',
         rejection_reason = nullif(btrim(coalesce(p_reason, '')), '')
   where id = p_request_id;

  -- ── Give the money back ───────────────────────────────────────────
  -- Only when something was actually taken, and only once.
  if v_fee > 0 and not v_already then
    select w.id into v_wallet_id
      from public.wallets w
     where w.advertiser_id = v_req_adv
     for update;
    if not found then
      raise exception 'That advertiser has no wallet to refund into.'
        using errcode = '42704';
    end if;

    if v_cur = 'USD' then
      update public.wallets
         set usd_balance = coalesce(usd_balance, 0) + v_fee,
             updated_at = now()
       where id = v_wallet_id;
    else
      update public.wallets
         set eur_balance = coalesce(eur_balance, 0) + v_fee,
             updated_at = now()
       where id = v_wallet_id;
    end if;
    v_refunded := v_fee;
  end if;

  -- ── Give the perk back ────────────────────────────────────────────
  -- The perk that was consumed was not recorded by id, so this restores
  -- to a free-request perk that is still live. If there is none left, the
  -- count is simply not restored — inventing one would be worse.
  if v_src = 'perk' and not v_already then
    select ap.id into v_perk_id
      from public.advertiser_perks ap
     where ap.advertiser_id = v_req_adv
       and ap.kind = 'free_ad_account_requests'
       and ap.active
       and (ap.expires_at is null or ap.expires_at > now())
     order by ap.expires_at nulls last
     for update
     limit 1;
    if found then
      update public.advertiser_perks
         set remaining = coalesce(remaining, 0) + 1, updated_at = now()
       where id = v_perk_id;
      v_perk_restored := true;
    end if;
  end if;

  -- Stamp it, so a second call refunds nothing.
  if v_refunded > 0 or v_perk_restored then
    update public.ad_account_requests
       set metadata = coalesce(metadata, '{}'::jsonb)
                      || jsonb_build_object(
                           'request_fee_refunded_at', now(),
                           'request_fee_refunded_by', v_admin_id
                         )
     where id = p_request_id;
  end if;

  return jsonb_build_object(
    'refunded', v_refunded,
    'currency', v_cur,
    'perk_restored', v_perk_restored
  );
end;
$blk0$;

revoke all on function public.ad_account_request_reject_refund(uuid, text)
  from public, anon;
grant execute on function public.ad_account_request_reject_refund(uuid, text)
  to authenticated;

-- ── Read back ────────────────────────────────────────────────────────
-- Requests already rejected, that were paid for, and were never refunded:
-- money PSM is holding for something it declined to do. Each one is a
-- customer to make good with by hand.
select
  r.id,
  a.tenant_client_code                              as client,
  (r.metadata->>'request_fee')::numeric             as fee,
  r.metadata->>'request_fee_currency'               as currency,
  r.created_at
  from public.ad_account_requests r
  left join public.advertisers a on a.id = r.advertiser_id
 where r.status = 'rejected'
   and coalesce((r.metadata->>'request_fee')::numeric, 0) > 0
   and (r.metadata->>'request_fee_refunded_at') is null
 order by r.created_at desc;


-- ---------------------------------------------------------------------
-- DEEL C — THE CLAWBACK, WITH SCALARS
-- ---------------------------------------------------------------------
-- A PL/pgSQL record field cannot be referenced inside a SQL statement:
-- Postgres reads v_link.id as relation.column and reports
-- 'relation "v_link" does not exist'. The triggers are installed and
-- the error is swallowed by a `raise warning`, so every clawback is
-- failing into a log nobody reads.
-- source: supabase/migrations/20260918240000_scalar_not_record.sql
-- ---------------------------------------------------------------------

-- =====================================================================
-- Replace two functions that used a RECORD field inside a SQL statement.
-- =====================================================================
-- ⚠️ APPLY ON SUPABASE MANUALLY. Run this after 20260918230000.
--
-- `relation "v_admin" does not exist` — Postgres resolving `v_admin.id`
-- inside an UPDATE as relation.column rather than as a PL/pgSQL record
-- field. The refund function hit it on the way in; the clawback function
-- has the same shape and would have hit it at the first real clawback,
-- which is a worse place to find out.
--
-- Both are rewritten with plain scalar variables. Nothing about what they
-- DO has changed — same gates, same arithmetic, same idempotency.
-- =====================================================================

set search_path = public;

create or replace function public._claw_back_referral_commission(
  p_advertiser_id uuid,
  p_amount numeric,
  p_currency text,
  p_source text,
  p_source_id uuid,
  p_reason text default null
) returns numeric
language plpgsql
security definer
set search_path = public
as $blk0$
declare
  -- SCALARS. A record variable's field cannot be referenced inside a SQL
  -- statement — Postgres resolves `v_link_id` as relation.column and
  -- reports `relation "v_link" does not exist`. Every value used inside a
  -- SELECT or an UPDATE below is its own variable.
  v_link_id     uuid;
  v_link_tenant uuid;
  v_cur      text := upper(coalesce(p_currency, 'EUR'));
  v_volume   numeric := 0;
  v_earned   numeric := 0;
  v_clawed   numeric := 0;
  v_share    numeric := 0;
  v_amount   numeric := 0;
begin
  if p_amount is null or p_amount <= 0 then
    return 0;
  end if;

  -- The link that refers THIS advertiser. If they were not referred there
  -- is nothing to claw back.
  select rl.id, rl.tenant_id into v_link_id, v_link_tenant
    from public.referral_links rl
   where rl.referred_advertiser_id = p_advertiser_id
   order by rl.created_at
   limit 1;
  if not found then
    return 0;
  end if;

  -- Everything they ever topped up successfully, in this currency.
  select coalesce(sum(wt.amount), 0) into v_volume
    from public.wallet_topups wt
    join public.wallets w on w.id = wt.wallet_id
   where w.advertiser_id = p_advertiser_id
     and wt.status = 'completed'
     and upper(coalesce(wt.currency, 'EUR')) = v_cur;

  if v_volume <= 0 then
    return 0;
  end if;

  select coalesce(sum(rc.amount), 0) into v_earned
    from public.referral_commissions rc
   where rc.referral_link_id = v_link_id
     and upper(coalesce(rc.currency, 'EUR')) = v_cur;

  select coalesce(sum(cb.amount), 0) into v_clawed
    from public.referral_clawbacks cb
   where cb.referral_link_id = v_link_id
     and cb.currency = v_cur;

  if v_earned - v_clawed <= 0 then
    return 0;
  end if;

  v_share := least(p_amount / v_volume, 1);
  v_amount := round((v_earned * v_share)::numeric, 2);
  -- Never more than is still standing.
  v_amount := least(v_amount, round((v_earned - v_clawed)::numeric, 2));
  if v_amount <= 0 then
    return 0;
  end if;

  insert into public.referral_clawbacks
    (tenant_id, referral_link_id, advertiser_id, amount, currency,
     source, source_id, returned_amount, topup_volume, share, reason)
  values
    (v_link_tenant, v_link_id, p_advertiser_id, v_amount, v_cur,
     p_source, p_source_id, round(p_amount::numeric, 2),
     round(v_volume::numeric, 2), round(v_share, 4), p_reason)
  on conflict (source, source_id) do nothing;

  if not found then
    return 0;   -- already clawed back for this row
  end if;

  -- Keep the running total on the link in step, the same figure the
  -- accrual trigger maintains.
  if v_cur = 'USD' then
    update public.referral_links
       set earnings_usd = greatest(coalesce(earnings_usd, 0) - v_amount, 0),
           updated_at = now()
     where id = v_link_id;
  else
    update public.referral_links
       set earnings_eur = greatest(coalesce(earnings_eur, 0) - v_amount, 0),
           updated_at = now()
     where id = v_link_id;
  end if;

  return v_amount;
end;
$blk0$;

revoke all on function public._claw_back_referral_commission(uuid, numeric, text, text, uuid, text)
  from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- DEEL D — A PRICE PER CURRENCY
-- ---------------------------------------------------------------------
-- EUR 200 converted is $226.14, which moves with the ECB and reads like
-- a rounding error on an invoice. The price per currency is stored so
-- $225 is a number somebody chose. Without these columns the app
-- still runs — it just cannot pin one, and says so.
-- source: supabase/migrations/20260918300000_plan_price_per_currency.sql
-- ---------------------------------------------------------------------

-- =====================================================================
-- A plan has a PRICE per currency, not a conversion.
-- =====================================================================
-- ⚠️ APPLY ON SUPABASE MANUALLY. Additive: four nullable columns. Nothing
-- changes for anybody until a price is actually pinned.
--
-- THE PROBLEM. `plans` carries one `monthly_fee` and one `currency`. A
-- customer paying in the other currency therefore gets a conversion:
-- €200 at today's rate is $226.14. That number moves every time the ECB
-- moves, it reads like a rounding error on an invoice, and nobody has
-- ever sold a subscription for $226.14.
--
-- THE OWNER'S RULE, which is the right one: the €200 plan costs $225, the
-- €150 plan costs $170, the €75 plan costs $85. Round numbers a person
-- chose. So the price per currency is STORED, and conversion is demoted
-- to what it should always have been — a SUGGESTION shown to the admin
-- setting the price, which they may take or ignore. The same shape as the
-- top-up fee: the system advises, the human decides, and what the human
-- decided is what gets charged.
--
-- WHY FOUR COLUMNS AND NOT A PRICES TABLE. There are two currencies and
-- two terms — four numbers. A table would bring its own RLS, its own
-- triggers and its own join for four nullable numerics, and every one of
-- those is somewhere a price can go missing.
--
-- NULL MEANS NOTHING WAS CHOSEN, and the price is derived: converted for
-- a monthly one, twelve months less the discount for a yearly one. ZERO
-- MEANS FREE and is a decision — lib/pure-plan-price.ts keeps that
-- distinction, and the tests in tests/lib/plan-price.test.ts hold it.
--
-- The existing `monthly_fee` + `currency` stay exactly as they are and
-- keep working. This only adds somewhere better to look first.
--
-- ROLLBACK: alter table public.plans drop column monthly_fee_eur, ... ;
-- =====================================================================

set search_path = public;

alter table public.plans
  add column if not exists monthly_fee_eur numeric(10, 2)
    check (monthly_fee_eur is null or monthly_fee_eur >= 0),
  add column if not exists monthly_fee_usd numeric(10, 2)
    check (monthly_fee_usd is null or monthly_fee_usd >= 0),
  add column if not exists yearly_fee_eur numeric(10, 2)
    check (yearly_fee_eur is null or yearly_fee_eur >= 0),
  add column if not exists yearly_fee_usd numeric(10, 2)
    check (yearly_fee_usd is null or yearly_fee_usd >= 0);

comment on column public.plans.monthly_fee_eur is
  'The monthly price in EUR, as a person chose it. NULL = derive it (from monthly_fee, or by conversion). 0 = free in EUR, which is a decision.';
comment on column public.plans.monthly_fee_usd is
  'The monthly price in USD, as a person chose it — e.g. 225 for the €200 plan, never 226.14. NULL = derive it.';
comment on column public.plans.yearly_fee_eur is
  'The yearly price in EUR. NULL = twelve monthly prices less yearly_discount_pct.';
comment on column public.plans.yearly_fee_usd is
  'The yearly price in USD. NULL = twelve monthly prices less yearly_discount_pct.';

-- ── Seed the base currency's own price, so nothing is derived twice ──
-- A plan priced in EUR already has its EUR price in monthly_fee. Copying
-- it across makes the pinned column the single place to read, and leaves
-- monthly_fee as the untouched fallback for anything not yet updated.
update public.plans
   set monthly_fee_eur = monthly_fee
 where monthly_fee_eur is null
   and upper(coalesce(currency, 'EUR')) = 'EUR';

update public.plans
   set monthly_fee_usd = monthly_fee
 where monthly_fee_usd is null
   and upper(coalesce(currency, 'EUR')) = 'USD';

-- ── Read back ────────────────────────────────────────────────────────
-- The USD column is deliberately empty for EUR plans: that is the whole
-- point — somebody has to choose 225, and until they do the screen says
-- "suggested" rather than pretending they did.
select
  t.initials            as tenant,
  p.name,
  p.kind,
  p.currency            as base,
  p.monthly_fee,
  p.monthly_fee_eur,
  p.monthly_fee_usd,
  p.yearly_discount_pct,
  p.yearly_fee_eur,
  p.yearly_fee_usd
  from public.plans p
  join public.tenants t on t.id = p.tenant_id
 order by t.initials, p.kind, p.sort_order;


-- =====================================================================
-- ALLES IN ÉÉN RIJ. Alles true is waar je naartoe wilt.
-- =====================================================================
select
  coalesce((select option_value::boolean
              from pg_class c
              join pg_namespace n on n.oid = c.relnamespace,
                   pg_options_to_table(c.reloptions)
             where n.nspname='public' and c.relname='top_ups_view'
               and option_name='security_invoker'), false)
                                                  as a_views_read_as_caller,
  to_regprocedure('public.ad_account_request_reject_refund(uuid, text)')
    is not null                                   as b_reject_refund_exists,
  (select position('v_link_id' in pg_get_functiondef(p.oid)) > 0
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='_claw_back_referral_commission')
                                                  as c_clawback_uses_scalars,
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='plans'
      and column_name in ('monthly_fee_eur','monthly_fee_usd',
                          'yearly_fee_eur','yearly_fee_usd'))
                                                  as d_price_columns_of_4;

-- And the numbers behind them, for the record.
select
  p.name,
  p.currency                as base,
  p.monthly_fee,
  p.monthly_fee_usd,
  p.yearly_discount_pct
  from public.plans p
 where p.kind = 'tier'
 order by p.sort_order;
