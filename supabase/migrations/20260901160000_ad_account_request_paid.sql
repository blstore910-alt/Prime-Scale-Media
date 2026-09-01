-- =====================================================================
-- ad_account_request_create_paid — charge the €50 fee, then create the
-- ad-account request. SERVER-SIDE (fixes the raw client insert that
-- violated the mutations-via-RPC rule) + collects the fee from the
-- wallet atomically.
-- =====================================================================
-- Fee (decided 2026-09-01):
--   EUR request → €50.
--   USD request → 50 EUR converted via the active exchange rate,
--                 rounded to a whole dollar (e.g. €50 ≈ $58), from the
--                 USD balance.
-- Charged DIRECTLY on request. Insufficient balance → clear 22000 error
-- so the UI can prompt a top-up. If the admin later rejects the request,
-- the €50 is refunded manually via the existing refund flow.
--
-- Modeled on the wallet_refund_approve debit pattern: lock the wallet
-- FOR UPDATE, check the per-currency floor, debit. advertiser + tenant
-- are derived from the caller (never client-supplied). Every field is
-- allowlisted (fixed param list).
-- =====================================================================

set search_path = public;

create or replace function public.ad_account_request_create_paid(
  p_platform    text,
  p_currency    text,
  p_timezone    text,
  p_website_url text default null,
  p_notes       text default null,
  p_metadata    jsonb default '{}'::jsonb
)
returns public.ad_account_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_adv    public.advertisers%rowtype;
  v_wallet public.wallets%rowtype;
  v_cur    text;
  v_fee    numeric;
  v_rate   numeric;
  v_bal    numeric;
  v_email  text;
  v_req    public.ad_account_requests%rowtype;
begin
  if v_uid is null then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  -- Caller's own advertiser (never trust a client-supplied id).
  select * into v_adv from public.advertisers where user_id = v_uid limit 1;
  if not found then
    raise exception 'No advertiser profile for this user' using errcode = '42501';
  end if;

  v_cur := upper(coalesce(p_currency, 'EUR'));
  if v_cur not in ('USD', 'EUR') then
    raise exception 'Unsupported currency %', v_cur using errcode = '22000';
  end if;

  -- Fee: €50 base; USD = round(50 / active usd->eur rate) whole dollars.
  if v_cur = 'EUR' then
    v_fee := 50;
  else
    select eur into v_rate
      from public.exchange_rates
     where tenant_id = v_adv.tenant_id and is_active = true
     limit 1;
    if v_rate is null or v_rate <= 0 then
      v_rate := 0.86; -- safety fallback ≈ current rate (≈ $58)
    end if;
    v_fee := round(50 / v_rate, 0);
  end if;

  -- Lock the wallet, check the floor, debit.
  select * into v_wallet from public.wallets
   where advertiser_id = v_adv.id for update;
  if not found then
    raise exception 'No wallet for this advertiser' using errcode = '42704';
  end if;

  v_bal := case when v_cur = 'USD'
                then coalesce(v_wallet.usd_balance, 0)
                else coalesce(v_wallet.eur_balance, 0) end;
  if v_bal < v_fee then
    raise exception
      'Insufficient wallet balance for the % ad-account request fee (have %, need %). Please top up.',
      v_cur, v_bal, v_fee using errcode = '22000';
  end if;

  if v_cur = 'USD' then
    update public.wallets set usd_balance = coalesce(usd_balance, 0) - v_fee,
           updated_at = now() where id = v_wallet.id;
  else
    update public.wallets set eur_balance = coalesce(eur_balance, 0) - v_fee,
           updated_at = now() where id = v_wallet.id;
  end if;

  select email into v_email
    from public.user_profiles where user_id = v_uid limit 1;

  insert into public.ad_account_requests
    (advertiser_id, tenant_id, email, platform, currency, timezone,
     website_url, notes, metadata, status)
  values
    (v_adv.id, v_adv.tenant_id, v_email, p_platform, v_cur, p_timezone,
     nullif(p_website_url, ''), nullif(p_notes, ''),
     coalesce(p_metadata, '{}'::jsonb), 'pending')
  returning * into v_req;

  return v_req;
end;
$$;

revoke all on function public.ad_account_request_create_paid(text, text, text, text, text, jsonb) from public, anon;
grant execute on function public.ad_account_request_create_paid(text, text, text, text, text, jsonb) to authenticated;
