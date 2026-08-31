-- Structured refund payout details: the person raising a refund
-- records the customer's business name, address, bank/IBAN, and the
-- BANK currency (which can differ from the wallet debit currency —
-- e.g. wallet is EUR but the customer's account is HKD). The
-- super-admin uses these to make the manual bank payout.

alter table public.wallet_refunds
  add column if not exists payout_business_name text,
  add column if not exists payout_address text,
  add column if not exists payout_bank_currency text;

-- Recreate the request RPC with the new fields (drop the 5-arg version
-- first so we don't leave overloads).
drop function if exists public.wallet_refund_request(uuid, numeric, text, text, text);

create or replace function public.wallet_refund_request(
  p_advertiser_id uuid,
  p_amount numeric,
  p_currency text,
  p_reason text default null,
  p_payout_details text default null,
  p_business_name text default null,
  p_address text default null,
  p_bank_currency text default null
)
returns public.wallet_refunds
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin  record;
  v_wallet public.wallets%rowtype;
  v_ref    text;
  v_row    public.wallet_refunds%rowtype;
begin
  select * into v_admin from public._require_profile('admin');

  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be positive' using errcode = '22000';
  end if;
  if p_currency not in ('USD', 'EUR') then
    raise exception 'Unsupported currency' using errcode = '22000';
  end if;
  -- Bank currency is looser — the receiving account can be USD/EUR/HKD.
  if p_bank_currency is not null
     and p_bank_currency not in ('USD', 'EUR', 'HKD') then
    raise exception 'Unsupported bank currency' using errcode = '22000';
  end if;

  select * into v_wallet
    from public.wallets
   where advertiser_id = p_advertiser_id
   limit 1;
  if not found then
    raise exception 'Wallet not found' using errcode = '42704';
  end if;
  if v_wallet.tenant_id <> v_admin.tenant_id then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  v_ref := 'RF-' || lpad((floor(random() * 1000000)::int)::text, 6, '0');

  insert into public.wallet_refunds (
    tenant_id, advertiser_id, wallet_id,
    amount, currency, status, reference, reason,
    payout_details, payout_business_name, payout_address, payout_bank_currency,
    requested_by
  ) values (
    v_admin.tenant_id, p_advertiser_id, v_wallet.id,
    p_amount, p_currency, 'pending', v_ref, p_reason,
    p_payout_details, p_business_name, p_address, p_bank_currency,
    v_admin.profile_id
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.wallet_refund_request(uuid, numeric, text, text, text, text, text, text) from public;
grant execute on function public.wallet_refund_request(uuid, numeric, text, text, text, text, text, text) to authenticated;
