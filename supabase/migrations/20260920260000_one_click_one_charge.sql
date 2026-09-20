-- =====================================================================
-- One click, one charge
-- =====================================================================
-- The concurrency sweep found four money movers with no idempotency at
-- all. In each, the UI button IS guarded -- so this is not the
-- double-click case. It is the case the guard cannot reach: a Vercel
-- retry of a POST whose response was lost, two browser tabs, or
-- back-then-submit.
--
--   ad_account_request_create_paid   EUR 50 off the wallet, per call
--   wallet_precharge_create          credits the wallet, per call
--   wallet_refund_request            a pending row an admin later pays
--   wallet_adjustment_request        a pending row an admin later applies
--
-- ad_account_request_create_paid is the worst of them, and it has a
-- second fault underneath: its ONLY serialisation is
--
--     select included_ad_accounts ... from advertiser_plans ... for update
--
-- and `for update` on a SELECT that matches no rows locks NOTHING. Every
-- advertiser who was not invited with a plan has no advertiser_plans row,
-- so for all of them the lock is absent and the "is this one included?"
-- count is unprotected as well. The report at the bottom counts that
-- population.
--
-- ── WHY TRIGGERS AND NOT `create or replace function` ────────────────
--
-- Because the bodies on live are not the bodies in this repository, and
-- replacing one from the repo has already taken production down once.
-- A BEFORE INSERT trigger is purely additive: it does not read, rewrite
-- or depend on the function it protects, and it can be dropped in one
-- line if it ever refuses something it should not.
--
-- The rollback comes free. Each of these inserts happens INSIDE the
-- money function, in the same transaction as the debit or the credit,
-- so a trigger that raises unwinds the money with it. That is the whole
-- point: refuse the second row and the second charge never happened.
--
-- The window is 90 seconds. Long enough to cover an edge timeout and a
-- human pressing the button again; short enough that somebody
-- deliberately asking for a second identical thing two minutes later is
-- not stopped. A deliberate repeat inside the window gets a message
-- that says exactly that, and what to do.
--
-- Safe to run more than once.
-- =====================================================================

set search_path = public;

-- ── 1. EUR 50 leaves the wallet once per request ─────────────────────
create or replace function public._no_twin_ad_account_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $blk0$
declare
  v_twin uuid;
begin
  select r.id into v_twin
    from public.ad_account_requests r
   where r.advertiser_id = new.advertiser_id
     and coalesce(r.status, 'pending') = 'pending'
     and coalesce(r.platform, '') is not distinct from coalesce(new.platform, '')
     and coalesce(r.currency, '') is not distinct from coalesce(new.currency, '')
     and r.created_at > now() - interval '90 seconds'
   limit 1;

  if v_twin is not null then
    raise exception
      'An identical account request was filed a moment ago and is still pending -- nothing further has been charged. Open Requests to see it; if you really do want a second account, ask again in a minute.'
      using errcode = '23505';
  end if;

  return new;
end;
$blk0$;

drop trigger if exists trg_no_twin_ad_account_request
  on public.ad_account_requests;
create trigger trg_no_twin_ad_account_request
  before insert on public.ad_account_requests
  for each row execute function public._no_twin_ad_account_request();

-- ── 2. An advance is credited once ───────────────────────────────────
-- wallet_precharge_from_topup is already right: `for update` on the
-- top-up, an explicit "already precharged" refusal, AND a unique index
-- on the source top-up. The free-form create has none of the three.
--
-- source_topup_id arrived in 20260831280000. If that has not been
-- pasted on this database yet, the guard is built without it.
do $blk1$
declare
  v_has_source boolean := exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'wallet_precharges'
       and column_name = 'source_topup_id'
  );
begin
  execute format($blk2$
    create or replace function public._no_twin_wallet_precharge()
    returns trigger
    language plpgsql
    security definer
    set search_path = public
    as $blk3$
    declare
      v_twin uuid;
    begin
      select p.id into v_twin
        from public.wallet_precharges p
       where p.wallet_id = new.wallet_id
         and p.currency  = new.currency
         and p.amount    = new.amount
         and p.status    = 'outstanding'
         and p.created_at > now() - interval '90 seconds'
         %s
       limit 1;

      if v_twin is not null then
        raise exception
          'An advance of this exact amount was created for this wallet a moment ago and is still outstanding. The wallet has NOT been credited twice -- check Precharges before creating another.'
          using errcode = '23505';
      end if;

      return new;
    end;
    $blk3$;
  $blk2$,
  case when v_has_source
       then 'and coalesce(p.source_topup_id::text, '''') is not distinct from coalesce(new.source_topup_id::text, '''')'
       else '' end);
end;
$blk1$;

drop trigger if exists trg_no_twin_wallet_precharge
  on public.wallet_precharges;
create trigger trg_no_twin_wallet_precharge
  before insert on public.wallet_precharges
  for each row execute function public._no_twin_wallet_precharge();

-- -- 3. One refund asked for is one refund paid ----------------------
-- A duplicate here is NOT caught downstream. wallet_refund_approve and
-- wallet_adjustment_approve each check only that THIS row is pending
-- and that the balance covers THIS amount -- so two EUR 2,000 refunds
-- on a EUR 5,000 wallet both pass the floor and both pay out, and the
-- customer is sent their money twice. The withdrawal path is already
-- safe by a different route: fundedUsd counts pending rows against the
-- balance at approve time.
--
-- Two tables, two shapes: wallet_refunds has `amount`,
-- wallet_adjustments has a signed `delta`.
create or replace function public._no_twin_wallet_refund()
returns trigger
language plpgsql
security definer
set search_path = public
as $blk7$
declare
  v_twin uuid;
begin
  select r.id into v_twin
    from public.wallet_refunds r
   where r.wallet_id = new.wallet_id
     and coalesce(r.status, '') = 'pending'
     and coalesce(r.currency, '') is not distinct from coalesce(new.currency, '')
     and coalesce(r.amount, 0) = coalesce(new.amount, 0)
     and r.created_at > now() - interval '90 seconds'
   limit 1;

  if v_twin is not null then
    raise exception
      'A refund of this exact amount for this wallet is already waiting for the owner to approve. It has not been paid out twice -- it is in the queue once.'
      using errcode = '23505';
  end if;

  return new;
end;
$blk7$;

drop trigger if exists trg_no_twin_wallet_refund on public.wallet_refunds;
create trigger trg_no_twin_wallet_refund
  before insert on public.wallet_refunds
  for each row execute function public._no_twin_wallet_refund();

create or replace function public._no_twin_wallet_adjustment()
returns trigger
language plpgsql
security definer
set search_path = public
as $blk8$
declare
  v_twin uuid;
begin
  -- The subscription-change path writes its own adjustment rows and is
  -- already deduplicated by wallet_adjustments_change_refund_uq on
  -- `reference`. Never refuse it a second time from here: a reference
  -- that is already unique cannot be a twin.
  select a.id into v_twin
    from public.wallet_adjustments a
   where a.wallet_id = new.wallet_id
     and coalesce(a.status, '') = 'pending'
     and coalesce(a.currency, '') is not distinct from coalesce(new.currency, '')
     and coalesce(a.delta, 0) = coalesce(new.delta, 0)
     -- ── AND ONLY WHEN THE NEW ROW HAS NO REFERENCE OF ITS OWN ─────
     --
     -- The first draft read `is distinct from`, which is exactly
     -- backwards: two free-form corrections both carry NULL, so
     -- '' IS DISTINCT FROM '' is FALSE and the guard never fired for
     -- the case it was written for -- while a subscription-change row
     -- (which has a reference, and is already deduped on it) was the
     -- one thing it DID refuse.
     --
     -- The rule is simpler than the test was: this guard is for
     -- free-form requests. A row that carries a reference has its own
     -- unique index and is none of our business.
     and coalesce(new.reference, '') = ''
     and coalesce(a.reference, '') = ''
     and a.created_at > now() - interval '90 seconds'
   limit 1;

  if v_twin is not null then
    raise exception
      'The same correction for this exact amount is already waiting for the owner to approve. It has not been applied twice -- it is in the queue once.'
      using errcode = '23505';
  end if;

  return new;
end;
$blk8$;

drop trigger if exists trg_no_twin_wallet_adjustment on public.wallet_adjustments;
create trigger trg_no_twin_wallet_adjustment
  before insert on public.wallet_adjustments
  for each row execute function public._no_twin_wallet_adjustment();

-- =====================================================================
-- The report -- the SQL editor shows only the LAST result set
-- =====================================================================
-- Rows 4 and 5 are the interesting ones: they count what these guards
-- WOULD have refused over the last 30 days. Anything above 0 is a
-- duplicate charge that already happened.
select 1 as sort,
  'ad-account request: twin guard' as item,
  case when exists (select 1 from pg_trigger
                     where tgname = 'trg_no_twin_ad_account_request'
                       and not tgisinternal)
       then 'ON' else 'NOT APPLIED' end as status
union all
select 2, 'wallet precharge: twin guard',
  case when exists (select 1 from pg_trigger
                     where tgname = 'trg_no_twin_wallet_precharge'
                       and not tgisinternal)
       then 'ON' else 'NOT APPLIED' end
union all
select 3, 'refund / adjustment: twin guards',
  (select case when count(*) = 2 then 'ON (both)'
               else count(*)::text || ' of 2 - NOT APPLIED' end
     from pg_trigger
    where not tgisinternal
      and tgname in ('trg_no_twin_wallet_refund',
                     'trg_no_twin_wallet_adjustment'))
union all
select 4, 'ad-account requests that look like twins (last 30d)',
  (select count(*)::text from (
     select r.id from public.ad_account_requests r
      where exists (
        select 1 from public.ad_account_requests o
         where o.advertiser_id = r.advertiser_id
           and o.id <> r.id
           -- The same predicates the trigger uses, or this over-counts
           -- against a line that says "anything above 0 already happened".
           and coalesce(o.status, 'pending') = 'pending'
           and coalesce(o.platform, '') is not distinct from coalesce(r.platform, '')
           and coalesce(o.currency, '') is not distinct from coalesce(r.currency, '')
           and o.created_at between r.created_at - interval '90 seconds'
                                and r.created_at
      ) and r.created_at > now() - interval '30 days') x)
union all
select 5, 'precharges that look like twins (last 30d)',
  (select count(*)::text from (
     select p.id from public.wallet_precharges p
      where exists (
        select 1 from public.wallet_precharges o
         where o.wallet_id = p.wallet_id and o.id <> p.id
           and o.amount = p.amount and o.currency = p.currency
           and o.status = 'outstanding'
           and o.created_at between p.created_at - interval '90 seconds'
                                and p.created_at
      ) and p.created_at > now() - interval '30 days') x)
union all
select 6, 'advertisers with NO plan row (the unlocked population)',
  case
    when to_regclass('public.advertiser_plans') is null
      then 'advertiser_plans is not on this database'
    else (select count(*)::text || ' of ' ||
            (select count(*)::text from public.advertisers)
            from public.advertisers a
           where not exists (select 1 from public.advertiser_plans p
                              where p.advertiser_id = a.id))
  end
order by sort;
