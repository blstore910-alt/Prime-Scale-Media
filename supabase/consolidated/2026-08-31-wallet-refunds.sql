-- Wallet refunds (customer leaves → money back to their bank).
--
-- When a customer quits, an admin first pulls their ad-account
-- balance back to the wallet (ad-account withdrawal), then requests a
-- REFUND of the wallet balance to the customer's bank. Two-tier:
--   request  — an admin raises it (pending)
--   approve  — the super-admin (tenant owner) approves: the wallet is
--              debited and the request marked approved. The super-admin
--              then does the actual bank payout by hand.
--   reject   — super-admin declines (no wallet change).
--
-- This is the ONLY wallet→bank path, and it never reaches the
-- customer UI — it's an internal admin/super-admin task list.

create table if not exists public.wallet_refunds (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  advertiser_id uuid not null references public.advertisers(id) on delete cascade,
  wallet_id uuid not null references public.wallets(id) on delete cascade,

  amount numeric not null check (amount > 0),
  currency text not null check (currency in ('USD', 'EUR')),

  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),

  reference text,
  reason text,
  requested_by uuid references public.user_profiles(id),
  reviewed_by uuid references public.user_profiles(id),
  reviewed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wallet_refunds_tenant_idx
  on public.wallet_refunds (tenant_id, status);
create index if not exists wallet_refunds_advertiser_idx
  on public.wallet_refunds (advertiser_id, created_at desc);

alter table public.wallet_refunds enable row level security;

-- Admins of the tenant read them (both tiers see the queue). No client
-- writes — RPCs only.
drop policy if exists refunds_admin_read on public.wallet_refunds;
create policy refunds_admin_read on public.wallet_refunds
  for select to authenticated
  using (
    exists (
      select 1 from public.user_profiles up
       where up.user_id = auth.uid()
         and up.tenant_id = wallet_refunds.tenant_id
         and up.role = 'admin'
    )
  );

-- ─────────────────────────────────────────────────────────────────
-- request: an admin raises a refund for a customer's wallet balance.
-- ─────────────────────────────────────────────────────────────────
create or replace function public.wallet_refund_request(
  p_advertiser_id uuid,
  p_amount numeric,
  p_currency text,
  p_reason text default null
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
    amount, currency, status, reference, reason, requested_by
  ) values (
    v_admin.tenant_id, p_advertiser_id, v_wallet.id,
    p_amount, p_currency, 'pending', v_ref, p_reason, v_admin.profile_id
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.wallet_refund_request(uuid, numeric, text, text) from public;
grant execute on function public.wallet_refund_request(uuid, numeric, text, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────
-- approve: SUPER-ADMIN (tenant owner) only. Debits the wallet.
-- ─────────────────────────────────────────────────────────────────
create or replace function public.wallet_refund_approve(
  p_refund_id uuid
)
returns public.wallet_refunds
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin  record;
  v_owner  boolean;
  v_rf     public.wallet_refunds%rowtype;
  v_row    public.wallet_refunds%rowtype;
begin
  select * into v_admin from public._require_profile('admin');

  -- Super-admin gate: caller must own the tenant.
  select exists (
    select 1 from public.tenants
     where id = v_admin.tenant_id and owner_id = auth.uid()
  ) into v_owner;
  if not v_owner then
    raise exception 'Only the tenant owner can approve refunds'
      using errcode = '42501';
  end if;

  select * into v_rf
    from public.wallet_refunds
   where id = p_refund_id
   for update;
  if not found then
    raise exception 'Refund not found' using errcode = '42704';
  end if;
  if v_rf.tenant_id <> v_admin.tenant_id then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if v_rf.status <> 'pending' then
    raise exception 'Refund is not pending' using errcode = '22000';
  end if;

  -- Debit the wallet — the money is leaving to the customer's bank.
  if v_rf.currency = 'USD' then
    update public.wallets
       set usd_balance = coalesce(usd_balance, 0) - v_rf.amount,
           updated_at = now()
     where id = v_rf.wallet_id;
  else
    update public.wallets
       set eur_balance = coalesce(eur_balance, 0) - v_rf.amount,
           updated_at = now()
     where id = v_rf.wallet_id;
  end if;

  update public.wallet_refunds
     set status = 'approved',
         reviewed_by = v_admin.profile_id,
         reviewed_at = now(),
         updated_at = now()
   where id = p_refund_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.wallet_refund_approve(uuid) from public;
grant execute on function public.wallet_refund_approve(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────
-- reject: SUPER-ADMIN only. No wallet change.
-- ─────────────────────────────────────────────────────────────────
create or replace function public.wallet_refund_reject(
  p_refund_id uuid,
  p_reason text default null
)
returns public.wallet_refunds
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin record;
  v_owner boolean;
  v_rf    public.wallet_refunds%rowtype;
  v_row   public.wallet_refunds%rowtype;
begin
  select * into v_admin from public._require_profile('admin');

  select exists (
    select 1 from public.tenants
     where id = v_admin.tenant_id and owner_id = auth.uid()
  ) into v_owner;
  if not v_owner then
    raise exception 'Only the tenant owner can reject refunds'
      using errcode = '42501';
  end if;

  select * into v_rf
    from public.wallet_refunds
   where id = p_refund_id
   for update;
  if not found then
    raise exception 'Refund not found' using errcode = '42704';
  end if;
  if v_rf.tenant_id <> v_admin.tenant_id then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if v_rf.status <> 'pending' then
    raise exception 'Refund is not pending' using errcode = '22000';
  end if;

  update public.wallet_refunds
     set status = 'rejected',
         reason = coalesce(p_reason, reason),
         reviewed_by = v_admin.profile_id,
         reviewed_at = now(),
         updated_at = now()
   where id = p_refund_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.wallet_refund_reject(uuid, text) from public;
grant execute on function public.wallet_refund_reject(uuid, text) to authenticated;

drop trigger if exists trg_touch_wallet_refunds on public.wallet_refunds;
create trigger trg_touch_wallet_refunds
  before update on public.wallet_refunds
  for each row execute function public._touch_updated_at();

drop trigger if exists trg_audit_wallet_refunds on public.wallet_refunds;
create trigger trg_audit_wallet_refunds
  after insert or update or delete on public.wallet_refunds
  for each row execute function public._audit_row_change();
