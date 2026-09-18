-- =====================================================================
-- RUN THIS WHOLE FILE. Two parts, in this order.
-- =====================================================================
-- Everything still outstanding that is SAFE to run in one go.
--
--   PART 1  Rejecting an ad-account request gives the 50 EUR back.
--           Adds one function and rewires the reject path. Additive:
--           nothing existing changes shape.
--
--   PART 2  The wallet integrity check. READ-ONLY — six questions about
--           whether every euro has a reason. Run it now, and again before
--           and after the J1-J8 walkthrough, so you can tell what that
--           session did to the books.
--
-- DELIBERATELY NOT IN HERE:
--
--   20260918200000_money_to_numeric.sql — it REWRITES STORED VALUES in
--   21 columns. Take a Supabase backup first and run it on its own, with
--   its own header read. It does not belong in a bundle you paste and
--   scroll past.
--
-- Every dollar-quoted block below carries a NAMED tag ($blk0$ and so on)
-- rather than a bare $$, because the SQL editor refused a file whose
-- quotes were balanced.
-- =====================================================================

-- ═══ PART 1 of 2 ═══════════════════════════════════════════════════
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
  v_uid   uuid := auth.uid();
  v_admin record;
  v_req   record;
  v_fee   numeric;
  v_cur   text;
  v_src   text;
  v_wallet record;
  v_perk_id uuid;
  v_refunded numeric := 0;
  v_perk_restored boolean := false;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- Active admin only. Same gate as every other money mover.
  select up.* into v_admin
    from public.user_profiles up
   where up.user_id = v_uid
     and up.role = 'admin'
     and coalesce(up.is_active, true)
   limit 1;
  if not found then
    raise exception 'admins only' using errcode = '42501';
  end if;

  select * into v_req
    from public.ad_account_requests
   where id = p_request_id
   for update;
  if not found then
    raise exception 'request not found' using errcode = '42704';
  end if;
  if v_req.tenant_id <> v_admin.tenant_id then
    raise exception 'not your tenant' using errcode = '42501';
  end if;
  if v_req.status = 'completed' then
    raise exception 'That request was already completed — it cannot be rejected.'
      using errcode = '22000';
  end if;
  if v_req.status = 'rejected' then
    raise exception 'That request was already rejected.' using errcode = '22000';
  end if;

  v_fee := coalesce((v_req.metadata->>'request_fee')::numeric, 0);
  v_cur := upper(coalesce(v_req.metadata->>'request_fee_currency', 'EUR'));
  v_src := coalesce(v_req.metadata->>'request_fee_free_source', '');

  -- ── The rejection itself ──────────────────────────────────────────
  update public.ad_account_requests
     set status = 'rejected',
         rejection_reason = nullif(btrim(coalesce(p_reason, '')), '')
   where id = p_request_id;

  -- ── Give the money back ───────────────────────────────────────────
  -- Only when something was actually taken, and only once.
  if v_fee > 0 and (v_req.metadata->>'request_fee_refunded_at') is null then
    select * into v_wallet from public.wallets
     where advertiser_id = v_req.advertiser_id
     for update;
    if not found then
      raise exception 'That advertiser has no wallet to refund into.'
        using errcode = '42704';
    end if;

    if v_cur = 'USD' then
      update public.wallets
         set usd_balance = coalesce(usd_balance, 0) + v_fee,
             updated_at = now()
       where id = v_wallet.id;
    else
      update public.wallets
         set eur_balance = coalesce(eur_balance, 0) + v_fee,
             updated_at = now()
       where id = v_wallet.id;
    end if;
    v_refunded := v_fee;
  end if;

  -- ── Give the perk back ────────────────────────────────────────────
  -- The perk that was consumed was not recorded by id, so this restores
  -- to a free-request perk that is still live. If there is none left, the
  -- count is simply not restored — inventing one would be worse.
  if v_src = 'perk' and (v_req.metadata->>'request_fee_refunded_at') is null then
    select id into v_perk_id
      from public.advertiser_perks
     where advertiser_id = v_req.advertiser_id
       and kind = 'free_ad_account_requests'
       and active
       and (expires_at is null or expires_at > now())
     order by expires_at nulls last
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
                           'request_fee_refunded_by', v_admin.id
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

-- ═══ PART 2 of 2 ═══════════════════════════════════════════════════
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
