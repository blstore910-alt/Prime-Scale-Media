-- Precharge a PENDING wallet top-up.
--
-- Flow the user wants: an advertiser submits a wallet top-up, the money
-- hasn't arrived yet, the admin sees it pending and can "precharge" it —
-- advance the credit now so the customer can spend, before the bank
-- transfer clears. When the real money arrives and the admin verifies
-- the top-up, the advance is settled automatically (no double credit).
--
-- Ledger walk-through (amount 100):
--   precharge: wallet +100, precharge.outstanding = 100  (customer can
--              spend; real position wallet-outstanding = 0)
--   verify   : balance trigger credits +100  → wallet 200
--              settle trigger debits  -100  → wallet 100, outstanding 0
--   net verify effect = 0, because the advance already delivered the 100.
--
-- Links a wallet_precharge to its source top-up so verification knows
-- what to settle.

alter table public.wallet_precharges
  add column if not exists source_wallet_topup_id uuid
    references public.wallet_topups(id) on delete set null;

create unique index if not exists wallet_precharges_source_topup_uq
  on public.wallet_precharges (source_wallet_topup_id)
  where source_wallet_topup_id is not null;

-- Admin precharges a specific pending top-up.
create or replace function public.wallet_precharge_from_topup(
  p_topup_id uuid
)
returns public.wallet_precharges
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin   record;
  v_topup   public.wallet_topups%rowtype;
  v_wallet  public.wallets%rowtype;
  v_adv     uuid;
  v_ref     text;
  v_row     public.wallet_precharges%rowtype;
begin
  select * into v_admin from public._require_profile('admin');

  select * into v_topup
    from public.wallet_topups
   where id = p_topup_id
   for update;
  if not found then
    raise exception 'Top-up not found' using errcode = '42704';
  end if;
  if v_topup.tenant_id <> v_admin.tenant_id then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if v_topup.status <> 'pending' then
    raise exception 'Top-up is not pending' using errcode = '22000';
  end if;

  -- Already precharged?
  if exists (
    select 1 from public.wallet_precharges
     where source_wallet_topup_id = p_topup_id
       and status = 'outstanding'
  ) then
    raise exception 'This top-up is already precharged' using errcode = '22000';
  end if;

  select * into v_wallet from public.wallets where id = v_topup.wallet_id for update;
  v_adv := v_wallet.advertiser_id;

  -- Credit the wallet with the advance.
  if v_topup.currency = 'USD' then
    update public.wallets set usd_balance = coalesce(usd_balance,0) + v_topup.amount,
           updated_at = now() where id = v_wallet.id;
  else
    update public.wallets set eur_balance = coalesce(eur_balance,0) + v_topup.amount,
           updated_at = now() where id = v_wallet.id;
  end if;

  v_ref := 'PC-' || lpad((floor(random() * 1000000)::int)::text, 6, '0');

  insert into public.wallet_precharges (
    tenant_id, advertiser_id, wallet_id, amount, outstanding, currency,
    status, reference, reason, created_by, source_wallet_topup_id
  ) values (
    v_topup.tenant_id, v_adv, v_wallet.id, v_topup.amount, v_topup.amount,
    v_topup.currency, 'outstanding', v_ref,
    'Advance on pending top-up ' || coalesce(v_topup.reference_no::text, ''),
    v_admin.profile_id, p_topup_id
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.wallet_precharge_from_topup(uuid) from public;
grant execute on function public.wallet_precharge_from_topup(uuid) to authenticated;

-- On top-up completion, settle a linked outstanding precharge so the
-- arriving money repays the advance instead of double-crediting.
create or replace function public._settle_precharge_on_topup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pc public.wallet_precharges%rowtype;
begin
  if not (tg_op = 'UPDATE'
          and new.status = 'completed'
          and old.status is distinct from 'completed') then
    return new;
  end if;

  select * into v_pc
    from public.wallet_precharges
   where source_wallet_topup_id = new.id
     and status = 'outstanding'
   for update;
  if not found then
    return new;
  end if;

  -- Debit the settled portion back off the wallet (balance trigger
  -- already credited the full topup amount just now).
  if v_pc.currency = 'USD' then
    update public.wallets set usd_balance = coalesce(usd_balance,0) - v_pc.outstanding,
           updated_at = now() where id = v_pc.wallet_id;
  else
    update public.wallets set eur_balance = coalesce(eur_balance,0) - v_pc.outstanding,
           updated_at = now() where id = v_pc.wallet_id;
  end if;

  update public.wallet_precharges
     set outstanding = 0, status = 'settled', settled_at = now(), updated_at = now()
   where id = v_pc.id;

  return new;
end;
$$;

drop trigger if exists trg_settle_precharge_on_topup on public.wallet_topups;
create trigger trg_settle_precharge_on_topup
  after update of status on public.wallet_topups
  for each row execute function public._settle_precharge_on_topup();
