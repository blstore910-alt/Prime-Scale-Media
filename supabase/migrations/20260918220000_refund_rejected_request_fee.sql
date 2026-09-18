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
