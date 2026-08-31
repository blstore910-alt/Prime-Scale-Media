-- 1. Refund payout details — the app knows WHO to refund (advertiser)
--    but stores no bank/IBAN, so the person raising the refund records
--    where to send it. Shows in the super-admin task list.
--
-- 2. Wallet adjustments — an admin can REQUEST a balance correction
--    (+/-) and the super-admin (tenant owner) approves it. Direct
--    wallet-balance changes are owner-only + audited; this gives
--    employee admins a way to flag a correction without touching the
--    balance themselves.

-- ─── 1. payout details on refunds ───
alter table public.wallet_refunds
  add column if not exists payout_details text;

-- Recreate the request RPC to capture payout_details (where to send
-- the money — the app stores no IBAN). Drop the old 4-arg version
-- first so we don't leave two overloads.
drop function if exists public.wallet_refund_request(uuid, numeric, text, text);

create or replace function public.wallet_refund_request(
  p_advertiser_id uuid,
  p_amount numeric,
  p_currency text,
  p_reason text default null,
  p_payout_details text default null
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
    amount, currency, status, reference, reason, payout_details, requested_by
  ) values (
    v_admin.tenant_id, p_advertiser_id, v_wallet.id,
    p_amount, p_currency, 'pending', v_ref, p_reason, p_payout_details,
    v_admin.profile_id
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.wallet_refund_request(uuid, numeric, text, text, text) from public;
grant execute on function public.wallet_refund_request(uuid, numeric, text, text, text) to authenticated;

-- ─── 2. wallet_adjustments ───
create table if not exists public.wallet_adjustments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  advertiser_id uuid not null references public.advertisers(id) on delete cascade,
  wallet_id uuid not null references public.wallets(id) on delete cascade,

  -- Signed delta: +50 adds, -50 removes. Not zero.
  delta numeric not null check (delta <> 0),
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

create index if not exists wallet_adjustments_tenant_idx
  on public.wallet_adjustments (tenant_id, status);

alter table public.wallet_adjustments enable row level security;

drop policy if exists adjustments_admin_read on public.wallet_adjustments;
create policy adjustments_admin_read on public.wallet_adjustments
  for select to authenticated
  using (
    exists (
      select 1 from public.user_profiles up
       where up.user_id = auth.uid()
         and up.tenant_id = wallet_adjustments.tenant_id
         and up.role = 'admin'
    )
  );

-- request: admin raises a pending adjustment.
create or replace function public.wallet_adjustment_request(
  p_advertiser_id uuid,
  p_delta numeric,
  p_currency text,
  p_reason text default null
)
returns public.wallet_adjustments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin  record;
  v_wallet public.wallets%rowtype;
  v_ref    text;
  v_row    public.wallet_adjustments%rowtype;
begin
  select * into v_admin from public._require_profile('admin');

  if p_delta is null or p_delta = 0 then
    raise exception 'Delta must be non-zero' using errcode = '22000';
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

  v_ref := 'ADJ-' || lpad((floor(random() * 1000000)::int)::text, 6, '0');

  insert into public.wallet_adjustments (
    tenant_id, advertiser_id, wallet_id,
    delta, currency, status, reference, reason, requested_by
  ) values (
    v_admin.tenant_id, p_advertiser_id, v_wallet.id,
    p_delta, p_currency, 'pending', v_ref, p_reason, v_admin.profile_id
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.wallet_adjustment_request(uuid, numeric, text, text) from public;
grant execute on function public.wallet_adjustment_request(uuid, numeric, text, text) to authenticated;

-- approve: SUPER-ADMIN only. Applies the signed delta to the wallet.
create or replace function public.wallet_adjustment_approve(
  p_adjustment_id uuid
)
returns public.wallet_adjustments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin record;
  v_owner boolean;
  v_adj   public.wallet_adjustments%rowtype;
  v_row   public.wallet_adjustments%rowtype;
begin
  select * into v_admin from public._require_profile('admin');

  select exists (
    select 1 from public.tenants
     where id = v_admin.tenant_id and owner_id = auth.uid()
  ) into v_owner;
  if not v_owner then
    raise exception 'Only the tenant owner can approve adjustments'
      using errcode = '42501';
  end if;

  select * into v_adj
    from public.wallet_adjustments
   where id = p_adjustment_id
   for update;
  if not found then
    raise exception 'Adjustment not found' using errcode = '42704';
  end if;
  if v_adj.tenant_id <> v_admin.tenant_id then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if v_adj.status <> 'pending' then
    raise exception 'Adjustment is not pending' using errcode = '22000';
  end if;

  if v_adj.currency = 'USD' then
    update public.wallets
       set usd_balance = coalesce(usd_balance, 0) + v_adj.delta,
           updated_at = now()
     where id = v_adj.wallet_id;
  else
    update public.wallets
       set eur_balance = coalesce(eur_balance, 0) + v_adj.delta,
           updated_at = now()
     where id = v_adj.wallet_id;
  end if;

  update public.wallet_adjustments
     set status = 'approved',
         reviewed_by = v_admin.profile_id,
         reviewed_at = now(),
         updated_at = now()
   where id = p_adjustment_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.wallet_adjustment_approve(uuid) from public;
grant execute on function public.wallet_adjustment_approve(uuid) to authenticated;

-- reject: SUPER-ADMIN only.
create or replace function public.wallet_adjustment_reject(
  p_adjustment_id uuid,
  p_reason text default null
)
returns public.wallet_adjustments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin record;
  v_owner boolean;
  v_adj   public.wallet_adjustments%rowtype;
  v_row   public.wallet_adjustments%rowtype;
begin
  select * into v_admin from public._require_profile('admin');

  select exists (
    select 1 from public.tenants
     where id = v_admin.tenant_id and owner_id = auth.uid()
  ) into v_owner;
  if not v_owner then
    raise exception 'Only the tenant owner can reject adjustments'
      using errcode = '42501';
  end if;

  select * into v_adj
    from public.wallet_adjustments
   where id = p_adjustment_id
   for update;
  if not found then
    raise exception 'Adjustment not found' using errcode = '42704';
  end if;
  if v_adj.tenant_id <> v_admin.tenant_id then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if v_adj.status <> 'pending' then
    raise exception 'Adjustment is not pending' using errcode = '22000';
  end if;

  update public.wallet_adjustments
     set status = 'rejected',
         reason = coalesce(p_reason, reason),
         reviewed_by = v_admin.profile_id,
         reviewed_at = now(),
         updated_at = now()
   where id = p_adjustment_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.wallet_adjustment_reject(uuid, text) from public;
grant execute on function public.wallet_adjustment_reject(uuid, text) to authenticated;

drop trigger if exists trg_touch_wallet_adjustments on public.wallet_adjustments;
create trigger trg_touch_wallet_adjustments
  before update on public.wallet_adjustments
  for each row execute function public._touch_updated_at();

drop trigger if exists trg_audit_wallet_adjustments on public.wallet_adjustments;
create trigger trg_audit_wallet_adjustments
  after insert or update or delete on public.wallet_adjustments
  for each row execute function public._audit_row_change();
