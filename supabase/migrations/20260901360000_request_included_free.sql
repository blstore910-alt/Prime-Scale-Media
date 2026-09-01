-- =====================================================================
-- ad_account_request_create_paid — honour the plan's included accounts
--    (plan-model phase 4)
-- =====================================================================
-- Same RPC as 20260901160000, with one change: the first
-- advertiser_plans.included_ad_accounts requests are FREE; only requests
-- beyond the included count charge the €50 (or USD-equivalent) fee.
--
-- "used" = the advertiser's ad-account requests that weren't rejected or
-- cancelled (each such request is an account they're getting). The
-- advertiser_plans row is locked FOR UPDATE so two concurrent requests
-- can't both slip in under the same free slot. No plan row = 0 included
-- = today's behaviour (always charged).
--
-- The request row's metadata records the fee decision (request_fee,
-- request_fee_currency, request_fee_included) so the refund flow and the
-- admin UI can see whether anything was charged.
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
  v_uid      uuid := auth.uid();
  v_adv      public.advertisers%rowtype;
  v_wallet   public.wallets%rowtype;
  v_cur      text;
  v_fee      numeric;
  v_rate     numeric;
  v_bal      numeric;
  v_email    text;
  v_req      public.ad_account_requests%rowtype;
  v_included int;
  v_used     int;
  v_is_free  boolean;
begin
  if v_uid is null then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  select * into v_adv from public.advertisers where user_id = v_uid limit 1;
  if not found then
    raise exception 'No advertiser profile for this user' using errcode = '42501';
  end if;

  v_cur := upper(coalesce(p_currency, 'EUR'));
  if v_cur not in ('USD', 'EUR') then
    raise exception 'Unsupported currency %', v_cur using errcode = '22000';
  end if;

  -- How many free accounts does the plan include? Lock the plan row so
  -- concurrent requests serialise on the free-slot decision.
  select included_ad_accounts into v_included
    from public.advertiser_plans
   where advertiser_id = v_adv.id
   for update;
  v_included := coalesce(v_included, 0);

  select count(*) into v_used
    from public.ad_account_requests
   where advertiser_id = v_adv.id
     and coalesce(status, '') not in ('rejected', 'cancelled');

  v_is_free := v_used < v_included;

  if v_is_free then
    v_fee := 0;
  else
    -- Fee: €50 base; USD = round(50 / active usd->eur rate) whole dollars.
    if v_cur = 'EUR' then
      v_fee := 50;
    else
      select eur into v_rate
        from public.exchange_rates
       where tenant_id = v_adv.tenant_id and is_active = true
       limit 1;
      if v_rate is null or v_rate <= 0 then
        v_rate := 0.86;
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
  end if;

  select email into v_email
    from public.user_profiles where user_id = v_uid limit 1;

  insert into public.ad_account_requests
    (advertiser_id, tenant_id, email, platform, currency, timezone,
     website_url, notes, metadata, status)
  values
    (v_adv.id, v_adv.tenant_id, v_email, p_platform, v_cur, p_timezone,
     nullif(p_website_url, ''), nullif(p_notes, ''),
     coalesce(p_metadata, '{}'::jsonb)
       || jsonb_build_object(
            'request_fee', v_fee,
            'request_fee_currency', v_cur,
            'request_fee_included', v_is_free
          ),
     'pending')
  returning * into v_req;

  return v_req;
end;
$$;

revoke all on function public.ad_account_request_create_paid(text, text, text, text, text, jsonb) from public, anon;
grant execute on function public.ad_account_request_create_paid(text, text, text, text, text, jsonb) to authenticated;
