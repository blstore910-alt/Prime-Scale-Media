-- =====================================================================
-- A deactivated admin could still spend a customer's wallet
-- =====================================================================
-- ⚠️ APPLY ON SUPABASE MANUALLY. One predicate.
--
-- 20260918110000 closed _require_profile, which covers about twenty money
-- RPCs. Its read-back then reported 8 SECURITY DEFINER functions that
-- still mention a role without testing is_active — and going through them
-- by hand, seven use a role to DECIDE something rather than to authorise
-- it: which recipients get an integration-failure notification, whether a
-- fresh signup needs an advertiser row, whether a profile may change its
-- own role. Those are branches, not gates.
--
-- This is the eighth, and it is a gate on money:
--
--     v_allowed := exists (… a.user_id = v_uid)        -- the customer
--                  or exists (… up.role = 'admin');     -- the desk
--
-- invoice_pay_from_wallet debits a wallet and marks an invoice paid. The
-- admin branch checked the role and nothing else, so an admin whose
-- access had been removed could still spend a customer's balance.
--
-- Note the `if v_uid is null then v_allowed := true` above it: that is the
-- service-role path the billing cron uses, and it stays. This changes only
-- the branch that runs for a logged-in person.
--
-- Generated from 20260901440000 by script; the body is otherwise
-- byte-for-byte what is live, including the `for update` lock and the
-- per-currency balance branches.
--
-- ROLLBACK: re-apply 20260901440000_invoices_no_updated_at.sql.
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
         -- Deactivated keeps the role and loses the access. This branch
         -- checked the role alone, so somebody whose access had been taken
         -- away could still pay a customer's invoice out of that
         -- customer's wallet. coalesce on both sides because "never set"
         -- means active.
         and coalesce(up.is_active, true) = true
         and coalesce(up.status, 'active') <> 'inactive'
    );
  end if;
  if not v_allowed then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

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
     set status = 'paid', paid_at = now()
   where id = p_invoice_id
  returning * into v_inv;
  return v_inv;
end;
$$;
revoke all on function public.invoice_pay_from_wallet(uuid) from public;
grant execute on function public.invoice_pay_from_wallet(uuid) to authenticated;

-- ── Read it back ─────────────────────────────────────────────────────
-- guarded must be true, and the count is the same one 20260918110000
-- printed — it should now be one lower. Whatever remains is a branch
-- rather than a gate; supabase/checks/WHICH-8-ARE-ROLE-ONLY.sql names
-- them so that stays a judgement and not an assumption.
select
  (select p.prosrc ilike '%is_active%'
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'invoice_pay_from_wallet')  as pay_invoice_guarded,
  (select count(*)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef and p.prosrc ilike '%role%'
      and p.prosrc not ilike '%is_active%'
      and p.prosrc not ilike '%_require_profile%'
      and p.prosrc not ilike '%_is_admin_of%'
      and p.prosrc not ilike '%_is_super_admin_of%'
      and p.prosrc not ilike '%is_tenant_admin%')                          as functions_still_role_only;
