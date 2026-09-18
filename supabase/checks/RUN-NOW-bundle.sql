-- =====================================================================
-- EVERYTHING OUTSTANDING THAT IS SAFE. Run the whole file, top to bottom.
-- =====================================================================
--   PART 1  Rejecting an ad-account request returns the 50 EUR.
--   PART 2  Replaces two functions that used a RECORD field inside a SQL
--           statement (`relation "v_admin" does not exist`). Harmless to
--           run whatever state you are in.
--   PART 3  Repricing a plan becomes owner-only, in the database — the
--           screen and the action already are.
--   PART 4  The wallet integrity check. READ-ONLY, six questions.
--
-- NOT HERE, ON PURPOSE: money_to_numeric. It REWRITES STORED VALUES in 21
-- columns and drops three views to rebuild them. It gets its own file and
-- its own backup, because it does not belong in something you paste and
-- scroll past.
--
-- Every dollar-quoted block carries a NAMED tag.
-- =====================================================================


-- ═══ PART 1 of 4 ═══════════════════════════════════════

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

-- ═══ PART 2 of 4 ═══════════════════════════════════════

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

-- ═══ PART 3 of 4 ═══════════════════════════════════════

-- =====================================================================
-- Changing what a customer pays is the owner's decision, not an admin's.
-- =====================================================================
-- ⚠️ APPLY ON SUPABASE MANUALLY.
--
-- WHAT WAS OPEN. change_subscription_amount checked for role = 'admin'.
-- The screen hid its Amount button from anyone but the tenant owner, and
-- the server action did not check at all — so a plain admin, an employee,
-- could reprice any customer's plan by calling the action or the RPC
-- directly. On a DOWNGRADE that path can also hand money back.
--
-- A hidden button is not a boundary. The button, the action and this
-- function now all say the same thing, and this one is the only one that
-- cannot be gone around.
--
-- SUPER-ADMIN means what it means everywhere else in this app: the owner
-- of the tenant (tenants.owner_id). _is_super_admin_of exists for exactly
-- this and is used where present; the ownership test is inlined as a
-- fallback so this migration does not depend on it.
--
-- The is_active gate that 20260918130000 added is preserved — this narrows
-- WHO, it does not widen anything.
--
-- ROLLBACK: re-apply 20260918170000_restore_orphan_void.sql, which carries
-- the current body with the admin-only gate.
-- =====================================================================

set search_path = public;

do $blk0$
declare
  v_src text;
  v_new text;
  v_old text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'change_subscription_amount'
   limit 1;

  if v_src is null then
    raise exception 'change_subscription_amount not found';
  end if;

  if position('tenants t' in v_src) > 0
     or position('_is_super_admin_of' in v_src) > 0
  then
    raise notice 'Already owner-gated — no change.';
    return;
  end if;

  -- The admin lookup this function performs. Narrow it to the owner by
  -- adding an EXISTS on tenants. Written to match the shape used by
  -- 20260918130000 (role + is_active), and to say so loudly if the body
  -- has moved on since.
  v_old := 'and up.role = ''admin''';
  if position(v_old in v_src) = 0 then
    raise notice
      'The admin test is written differently — gate it by hand. Look for the select into the admin profile.';
    return;
  end if;

  v_new := replace(
    v_src,
    v_old,
    'and up.role = ''admin''
       and exists (
         select 1 from public.tenants t
          where t.id = up.tenant_id
            and t.owner_id = up.user_id
       )'
  );

  execute v_new;
  raise notice 'Repricing is now owner-only.';
end;
$blk0$;

-- ── Read back ────────────────────────────────────────────────────────
-- owner_gated must be true. admins_who_can_reprice is how many people in
-- each tenant still can — it should equal the number of tenants.
select
  (pg_get_functiondef(p.oid) like '%owner_id = up.user_id%') as owner_gated
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname = 'change_subscription_amount';

select
  t.initials                                      as tenant,
  count(*) filter (where up.role = 'admin')       as admins,
  count(*) filter (where up.role = 'admin'
                     and t.owner_id = up.user_id) as can_reprice_now
  from public.tenants t
  left join public.user_profiles up on up.tenant_id = t.id
 group by t.id, t.initials
 order by t.initials;

-- ═══ PART 4 of 4 ═══════════════════════════════════════

-- =====================================================================
-- Does every euro in every wallet have a reason?
-- =====================================================================
-- READ-ONLY. Nothing here writes. Run it whenever you want an answer to
-- "is anything leaking", and run it before and after the J1–J8 walkthrough.
--
-- WHY THIS EXISTS, AND WHY SWEEPING CODE IS NOT ENOUGH.
--
-- A wallet balance is mutated in place — `eur_balance = eur_balance + x` —
-- by more than a dozen separate functions: top-up verify, refund, payout,
-- adjustment, precharge, precharge settle, invoice payment, ad-account
-- top-up, ad-account withdrawal, the request fee, the exchange, the Wise
-- confirm. There is no ledger. Nothing records WHY a balance changed, only
-- what it became.
--
-- That means a bug in any one of those paths is invisible by construction.
-- No amount of code review closes that, because review finds the faults you
-- thought to look for, and this has to catch the ones nobody thought of.
--
-- What makes it checkable anyway is that `wallets` is in the audited list,
-- so every balance change left a row in audit_events with the old and new
-- values. This replays that trail and asks one question of each step:
-- is there a business event that explains it?
--
-- A DISCREPANCY IS NOT PROOF OF THEFT. It is money that moved without a
-- recorded reason, which is the only thing a machine can tell you. Read
-- each one.
-- =====================================================================

-- ── 1. Every balance change, with its delta ──────────────────────────
with moves as (
  select
    e.occurred_at,
    e.row_id::uuid                                        as wallet_id,
    e.actor_profile_id,
    coalesce((e.after_data->>'eur_balance')::numeric, 0)
      - coalesce((e.before_data->>'eur_balance')::numeric, 0)          as d_eur,
    coalesce((e.after_data->>'usd_balance')::numeric, 0)
      - coalesce((e.before_data->>'usd_balance')::numeric, 0)          as d_usd
    from public.audit_events e
   where e.table_name = 'wallets'
     and e.action = 'UPDATE'
),
real_moves as (
  select * from moves where d_eur <> 0 or d_usd <> 0
)

-- ── 2. The headline: does each wallet's balance equal its own history? ─
-- A wallet's current balance must equal the sum of every recorded change
-- plus whatever it was created with. If these disagree, a balance was
-- written by something that did not leave an audit row, or a row was
-- deleted.
select
  w.id                                                   as wallet_id,
  a.tenant_client_code                                   as client,
  round(w.eur_balance::numeric, 2)                       as eur_now,
  round(coalesce(m.sum_eur, 0) + coalesce(o.open_eur, 0), 2)
                                                         as eur_from_history,
  round(w.eur_balance::numeric
        - (coalesce(m.sum_eur, 0) + coalesce(o.open_eur, 0)), 2)
                                                         as eur_unexplained,
  round(w.usd_balance::numeric, 2)                       as usd_now,
  round(coalesce(m.sum_usd, 0) + coalesce(o.open_usd, 0), 2)
                                                         as usd_from_history,
  round(w.usd_balance::numeric
        - (coalesce(m.sum_usd, 0) + coalesce(o.open_usd, 0)), 2)
                                                         as usd_unexplained
  from public.wallets w
  left join public.advertisers a on a.id = w.advertiser_id
  left join lateral (
    select sum(d_eur) as sum_eur, sum(d_usd) as sum_usd
      from real_moves rm where rm.wallet_id = w.id
  ) m on true
  -- What the wallet was created with, from its INSERT row.
  left join lateral (
    select
      coalesce((e.after_data->>'eur_balance')::numeric, 0) as open_eur,
      coalesce((e.after_data->>'usd_balance')::numeric, 0) as open_usd
      from public.audit_events e
     where e.table_name = 'wallets'
       and e.action = 'INSERT'
       and e.row_id = w.id::text
     order by e.occurred_at
     limit 1
  ) o on true
 order by
   abs(w.eur_balance::numeric - (coalesce(m.sum_eur,0) + coalesce(o.open_eur,0)))
   + abs(w.usd_balance::numeric - (coalesce(m.sum_usd,0) + coalesce(o.open_usd,0)))
   desc;

-- ── 3. Credits with no completed top-up to explain them ──────────────
-- Every INCREASE in a wallet should be one of: a verified top-up, a
-- refund, an admin adjustment, a precharge, an ad-account withdrawal
-- coming back, or an exchange. This lists increases with no completed
-- wallet_topup within five minutes either side — the ordinary case — so
-- what is left is the set worth reading. An adjustment or a withdrawal
-- credit will legitimately appear here; a top-up should not.
with moves as (
  select
    e.occurred_at,
    e.row_id::uuid as wallet_id,
    coalesce((e.after_data->>'eur_balance')::numeric,0)
      - coalesce((e.before_data->>'eur_balance')::numeric,0) as d_eur,
    coalesce((e.after_data->>'usd_balance')::numeric,0)
      - coalesce((e.before_data->>'usd_balance')::numeric,0) as d_usd
    from public.audit_events e
   where e.table_name = 'wallets' and e.action = 'UPDATE'
)
select
  m.occurred_at,
  a.tenant_client_code            as client,
  round(m.d_eur, 2)               as credited_eur,
  round(m.d_usd, 2)               as credited_usd
  from moves m
  join public.wallets w on w.id = m.wallet_id
  left join public.advertisers a on a.id = w.advertiser_id
 where (m.d_eur > 0 or m.d_usd > 0)
   and not exists (
     select 1
       from public.wallet_topups t
      where t.wallet_id = m.wallet_id
        and t.status = 'completed'
        and t.updated_at between m.occurred_at - interval '5 minutes'
                            and m.occurred_at + interval '5 minutes'
        and abs(t.amount::numeric - greatest(m.d_eur, m.d_usd)) <= 0.01
   )
 order by m.occurred_at desc
 limit 50;

-- ── 4. Outstanding advances that nothing is going to settle ──────────
-- A precharge credits a wallet against a payment that has not cleared. It
-- is settled when that payment is verified — but only when the precharge
-- knows which top-up it belongs to. One with no source, or one whose
-- source is no longer pending, will sit outstanding for ever and the
-- customer keeps credit for money that never arrived.
select
  p.id,
  a.tenant_client_code                       as client,
  p.currency,
  round(p.outstanding::numeric, 2)           as outstanding,
  p.created_at,
  case
    when p.source_wallet_topup_id is null
      then 'no top-up attached — will never settle itself'
    when t.status = 'rejected'
      then 'its top-up was REJECTED — the advance was never repaid'
    when t.status is null
      then 'its top-up is gone'
    when t.status <> 'pending'
      then 'its top-up is ' || t.status
    else 'waiting for its top-up'
  end                                        as why
  from public.wallet_precharges p
  left join public.advertisers a on a.id = p.advertiser_id
  left join public.wallet_topups t on t.id = p.source_wallet_topup_id
 where p.status = 'outstanding'
 order by p.outstanding desc;

-- ── 5. Commission that the links do not agree with ───────────────────
-- referral_links carries running earnings totals; referral_commissions is
-- the detail. They are written by the same trigger, so they should agree.
select
  rl.id                                              as referral_link_id,
  round(coalesce(rl.earnings_eur, 0)::numeric, 2)    as link_says_eur,
  round(coalesce(c.eur, 0), 2)                       as commissions_say_eur,
  round(coalesce(rl.earnings_eur, 0)::numeric - coalesce(c.eur, 0), 2)
                                                     as eur_drift,
  round(coalesce(rl.earnings_usd, 0)::numeric, 2)    as link_says_usd,
  round(coalesce(c.usd, 0), 2)                       as commissions_say_usd,
  round(coalesce(rl.earnings_usd, 0)::numeric - coalesce(c.usd, 0), 2)
                                                     as usd_drift
  from public.referral_links rl
  left join lateral (
    select
      sum(rc.amount::numeric) filter (where upper(rc.currency) = 'EUR') as eur,
      sum(rc.amount::numeric) filter (where upper(rc.currency) = 'USD') as usd
      from public.referral_commissions rc
     where rc.referral_link_id = rl.id
  ) c on true
 where abs(coalesce(rl.earnings_eur,0)::numeric - coalesce(c.eur,0)) > 0.01
    or abs(coalesce(rl.earnings_usd,0)::numeric - coalesce(c.usd,0)) > 0.01
 order by abs(coalesce(rl.earnings_eur,0)::numeric - coalesce(c.eur,0)) desc;

-- ── 6. Money columns stored as floating point ────────────────────────
-- A float cannot hold 0.10 exactly. Every addition to a balance stored as
-- `real` or `double precision` loses a little, and it never comes back —
-- a leak that no code review can find because no line of code is wrong.
-- Anything listed here should become `numeric`.
select
  c.table_name,
  c.column_name,
  c.data_type
  from information_schema.columns c
 where c.table_schema = 'public'
   and c.data_type in ('real', 'double precision')
   and (c.column_name ilike '%amount%'
     or c.column_name ilike '%balance%'
     or c.column_name ilike '%total%'
     or c.column_name ilike '%fee%'
     or c.column_name ilike '%earnings%'
     or c.column_name ilike '%outstanding%')
 order by c.table_name, c.column_name;
