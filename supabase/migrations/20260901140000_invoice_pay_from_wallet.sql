-- =====================================================================
-- invoice_pay_from_wallet — collect an unpaid invoice from the wallet
-- =====================================================================
-- The COLLECTION side of billing (invoices themselves are generated
-- elsewhere — an external program / DB trigger — so we do NOT create
-- them here, we settle them). Debits the advertiser's wallet by the
-- invoice total and marks the invoice paid, atomically.
--
-- Used by:
--   * the customer's "Pay now" button (their own session), and
--   * later, the daily auto-debit cron (service-role → auth.uid() null).
--
-- Modeled on wallet_refund_approve (20260831220000): lock the wallet
-- FOR UPDATE, check the per-currency floor, then debit. Idempotent: a
-- paid invoice returns unchanged. One wallet per advertiser
-- (usd_balance / eur_balance). Insufficient balance raises a clear
-- 22000 error so the UI can prompt a top-up.
--
-- NOTE: invoices + wallets are hand-authored in the live DB. Column
-- names used here (invoices.total/currency/status/paid_at/advertiser_id
-- /tenant_id; wallets.advertiser_id/usd_balance/eur_balance) come from
-- the app's types + existing RPCs. If any differ live, adjust here.
-- =====================================================================

set search_path = public;

create or replace function public.invoice_pay_from_wallet(p_invoice_id uuid)
returns public.invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_inv     public.invoices%rowtype;
  v_wallet  public.wallets%rowtype;
  v_bal     numeric;
  v_cur     text;
  v_amt     numeric;
  v_allowed boolean;
begin
  select * into v_inv from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Invoice not found' using errcode = '42704';
  end if;

  -- Authz: service-role (cron, auth.uid() null) OR the invoice's own
  -- advertiser OR an admin of the invoice's tenant.
  if v_uid is null then
    v_allowed := true;
  else
    v_allowed := exists (
      select 1 from public.advertisers a
       where a.id = v_inv.advertiser_id and a.user_id = v_uid
    ) or exists (
      select 1 from public.user_profiles up
       where up.user_id = v_uid
         and up.tenant_id = v_inv.tenant_id
         and up.role = 'admin'
    );
  end if;
  if not v_allowed then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  -- Idempotent: already settled.
  if v_inv.status = 'paid' then
    return v_inv;
  end if;

  v_cur := upper(coalesce(v_inv.currency, 'EUR'));
  v_amt := coalesce(v_inv.total, 0);
  if v_amt <= 0 then
    raise exception 'Invoice has no payable amount' using errcode = '22000';
  end if;
  if v_cur not in ('USD', 'EUR') then
    raise exception 'Unsupported invoice currency %', v_cur using errcode = '22000';
  end if;

  -- One wallet per advertiser; lock it before debiting.
  select * into v_wallet
    from public.wallets
   where advertiser_id = v_inv.advertiser_id
   for update;
  if not found then
    raise exception 'No wallet for this advertiser' using errcode = '42704';
  end if;

  v_bal := case when v_cur = 'USD'
                then coalesce(v_wallet.usd_balance, 0)
                else coalesce(v_wallet.eur_balance, 0) end;
  if v_bal < v_amt then
    raise exception
      'Insufficient wallet balance (have %, need %). Please top up.',
      v_bal, v_amt using errcode = '22000';
  end if;

  if v_cur = 'USD' then
    update public.wallets set usd_balance = coalesce(usd_balance, 0) - v_amt,
           updated_at = now() where id = v_wallet.id;
  else
    update public.wallets set eur_balance = coalesce(eur_balance, 0) - v_amt,
           updated_at = now() where id = v_wallet.id;
  end if;

  update public.invoices
     set status = 'paid', paid_at = now(), updated_at = now()
   where id = p_invoice_id
  returning * into v_inv;
  return v_inv;
end;
$$;

revoke all on function public.invoice_pay_from_wallet(uuid) from public, anon;
grant execute on function public.invoice_pay_from_wallet(uuid) to authenticated;
