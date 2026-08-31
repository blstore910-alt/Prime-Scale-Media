-- Ad-account withdrawals.
--
-- An advertiser pulls balance from one of their ad accounts back into
-- their wallet. Until SeamX is wired, PSM does not know an ad
-- account's true spend, so it cannot auto-validate "available to
-- withdraw". Instead the admin is the gate: they review the request
-- against what they actually see, then approve or reject. On approve
-- the amount is credited to the advertiser's wallet.
--
-- This is deliberately supplier-agnostic — when SeamX lands, the
-- approve step will additionally push the withdrawal to SeamX; the
-- table + flow stay the same.
--
-- Wallet→bank withdrawal is NOT modelled here — that is admin-only and
-- out of the customer flow entirely.

create table if not exists public.ad_account_withdrawals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  advertiser_id uuid not null references public.advertisers(id) on delete cascade,
  ad_account_id uuid not null references public.ad_accounts(id) on delete cascade,
  wallet_id uuid not null references public.wallets(id) on delete cascade,

  amount numeric not null check (amount > 0),
  currency text not null check (currency in ('USD', 'EUR')),

  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),

  -- Human-readable reference for the advertiser + admin, format WD-<n>.
  reference text,
  reason text,                 -- advertiser note or admin rejection reason
  requested_by uuid references auth.users(id),
  reviewed_by uuid references public.user_profiles(id),
  reviewed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ad_account_withdrawals_tenant_idx
  on public.ad_account_withdrawals (tenant_id, status);
create index if not exists ad_account_withdrawals_advertiser_idx
  on public.ad_account_withdrawals (advertiser_id, created_at desc);

alter table public.ad_account_withdrawals enable row level security;

-- Advertiser reads their own withdrawals; admins read the tenant's.
drop policy if exists withdrawals_read on public.ad_account_withdrawals;
create policy withdrawals_read on public.ad_account_withdrawals
  for select to authenticated
  using (
    exists (
      select 1 from public.advertisers a
       where a.id = ad_account_withdrawals.advertiser_id
         and a.user_id = auth.uid()
    )
    or exists (
      select 1 from public.user_profiles up
       where up.user_id = auth.uid()
         and up.tenant_id = ad_account_withdrawals.tenant_id
         and up.role = 'admin'
    )
  );

-- Writes go through SECURITY DEFINER RPCs only — no direct
-- insert/update policy.

-- ─────────────────────────────────────────────────────────────────
-- request: advertiser creates a pending withdrawal from their own
-- ad account. Amount + account ownership validated; no balance check
-- (admin gate). Returns the new row.
-- ─────────────────────────────────────────────────────────────────
create or replace function public.ad_account_withdrawal_request(
  p_ad_account_id uuid,
  p_amount numeric,
  p_currency text,
  p_reason text default null
)
returns public.ad_account_withdrawals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_advertiser public.advertisers%rowtype;
  v_account    public.ad_accounts%rowtype;
  v_wallet     public.wallets%rowtype;
  v_ref        text;
  v_row        public.ad_account_withdrawals%rowtype;
begin
  if v_uid is null then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be positive' using errcode = '22000';
  end if;
  if p_currency not in ('USD', 'EUR') then
    raise exception 'Unsupported currency' using errcode = '22000';
  end if;

  -- Caller must own the ad account (via advertiser).
  select * into v_advertiser
    from public.advertisers
   where user_id = v_uid
   limit 1;
  if not found then
    raise exception 'No advertiser for caller' using errcode = '42501';
  end if;

  select * into v_account
    from public.ad_accounts
   where id = p_ad_account_id;
  if not found then
    raise exception 'Ad account not found' using errcode = '42704';
  end if;
  if v_account.advertiser_id <> v_advertiser.id then
    raise exception 'Not your ad account' using errcode = '42501';
  end if;

  select * into v_wallet
    from public.wallets
   where advertiser_id = v_advertiser.id
   limit 1;
  if not found then
    raise exception 'No wallet for advertiser' using errcode = '42704';
  end if;

  v_ref := 'WD-' || lpad((floor(random() * 1000000)::int)::text, 6, '0');

  insert into public.ad_account_withdrawals (
    tenant_id, advertiser_id, ad_account_id, wallet_id,
    amount, currency, status, reference, reason, requested_by
  ) values (
    v_advertiser.tenant_id, v_advertiser.id, v_account.id, v_wallet.id,
    p_amount, p_currency, 'pending', v_ref, p_reason, v_uid
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.ad_account_withdrawal_request(uuid, numeric, text, text) from public;
grant execute on function public.ad_account_withdrawal_request(uuid, numeric, text, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────
-- approve: admin approves a pending withdrawal → credit the wallet.
-- ─────────────────────────────────────────────────────────────────
create or replace function public.ad_account_withdrawal_approve(
  p_withdrawal_id uuid
)
returns public.ad_account_withdrawals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin  record;
  v_wd     public.ad_account_withdrawals%rowtype;
  v_row    public.ad_account_withdrawals%rowtype;
begin
  select * into v_admin from public._require_profile('admin');

  select * into v_wd
    from public.ad_account_withdrawals
   where id = p_withdrawal_id
   for update;
  if not found then
    raise exception 'Withdrawal not found' using errcode = '42704';
  end if;
  if v_wd.tenant_id <> v_admin.tenant_id then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if v_wd.status <> 'pending' then
    raise exception 'Withdrawal is not pending' using errcode = '22000';
  end if;

  -- Credit the wallet in the withdrawal's currency.
  if v_wd.currency = 'USD' then
    update public.wallets
       set usd_balance = coalesce(usd_balance, 0) + v_wd.amount,
           updated_at = now()
     where id = v_wd.wallet_id;
  elsif v_wd.currency = 'EUR' then
    update public.wallets
       set eur_balance = coalesce(eur_balance, 0) + v_wd.amount,
           updated_at = now()
     where id = v_wd.wallet_id;
  end if;

  update public.ad_account_withdrawals
     set status = 'approved',
         reviewed_by = v_admin.profile_id,
         reviewed_at = now(),
         updated_at = now()
   where id = p_withdrawal_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.ad_account_withdrawal_approve(uuid) from public;
grant execute on function public.ad_account_withdrawal_approve(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────
-- reject: admin rejects a pending withdrawal (no wallet change).
-- ─────────────────────────────────────────────────────────────────
create or replace function public.ad_account_withdrawal_reject(
  p_withdrawal_id uuid,
  p_reason text default null
)
returns public.ad_account_withdrawals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin record;
  v_wd    public.ad_account_withdrawals%rowtype;
  v_row   public.ad_account_withdrawals%rowtype;
begin
  select * into v_admin from public._require_profile('admin');

  select * into v_wd
    from public.ad_account_withdrawals
   where id = p_withdrawal_id
   for update;
  if not found then
    raise exception 'Withdrawal not found' using errcode = '42704';
  end if;
  if v_wd.tenant_id <> v_admin.tenant_id then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if v_wd.status <> 'pending' then
    raise exception 'Withdrawal is not pending' using errcode = '22000';
  end if;

  update public.ad_account_withdrawals
     set status = 'rejected',
         reason = coalesce(p_reason, reason),
         reviewed_by = v_admin.profile_id,
         reviewed_at = now(),
         updated_at = now()
   where id = p_withdrawal_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.ad_account_withdrawal_reject(uuid, text) from public;
grant execute on function public.ad_account_withdrawal_reject(uuid, text) to authenticated;

-- updated_at + audit triggers
drop trigger if exists trg_touch_ad_account_withdrawals on public.ad_account_withdrawals;
create trigger trg_touch_ad_account_withdrawals
  before update on public.ad_account_withdrawals
  for each row execute function public._touch_updated_at();

drop trigger if exists trg_audit_ad_account_withdrawals on public.ad_account_withdrawals;
create trigger trg_audit_ad_account_withdrawals
  after insert or update or delete on public.ad_account_withdrawals
  for each row execute function public._audit_row_change();
