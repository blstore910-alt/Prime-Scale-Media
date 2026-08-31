-- Wallet precharge (admin advance).
--
-- Sometimes a customer has sent money that hasn't cleared yet. An
-- admin can advance them credit so they can keep spending — the
-- customer is effectively "in the minus" until their payment lands.
-- When it does, the admin settles the precharge and the repaid
-- portion comes off the wallet again.
--
-- Model:
--   create  — admin credits the wallet by an admin-chosen amount and
--             records an OUTSTANDING precharge of the same amount.
--             wallet - sum(outstanding precharge) = the customer's
--             real position (can be negative = "in the minus").
--   settle  — admin, when the real payment has arrived, settles some
--             or all of the outstanding amount: the wallet is reduced
--             by the settled amount (that money repaid the advance)
--             and the outstanding drops. Fully settled → status
--             'settled'.
--
-- All admin-gated, manual — no automation, matching how the rest of
-- the money flow is controlled. Amount is set by us, not the customer.

create table if not exists public.wallet_precharges (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  advertiser_id uuid not null references public.advertisers(id) on delete cascade,
  wallet_id uuid not null references public.wallets(id) on delete cascade,

  amount numeric not null check (amount > 0),          -- original advance
  outstanding numeric not null check (outstanding >= 0), -- remaining to settle
  currency text not null check (currency in ('USD', 'EUR')),

  status text not null default 'outstanding'
    check (status in ('outstanding', 'settled', 'cancelled')),

  reference text,
  reason text,
  created_by uuid references public.user_profiles(id),
  settled_by uuid references public.user_profiles(id),
  settled_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wallet_precharges_tenant_idx
  on public.wallet_precharges (tenant_id, status);
create index if not exists wallet_precharges_advertiser_idx
  on public.wallet_precharges (advertiser_id, created_at desc);

alter table public.wallet_precharges enable row level security;

drop policy if exists precharge_read on public.wallet_precharges;
create policy precharge_read on public.wallet_precharges
  for select to authenticated
  using (
    exists (
      select 1 from public.advertisers a
       where a.id = wallet_precharges.advertiser_id
         and a.user_id = auth.uid()
    )
    or exists (
      select 1 from public.user_profiles up
       where up.user_id = auth.uid()
         and up.tenant_id = wallet_precharges.tenant_id
         and up.role = 'admin'
    )
  );

-- ─────────────────────────────────────────────────────────────────
-- create: admin advances credit. Credits the wallet + records the
-- outstanding advance.
-- ─────────────────────────────────────────────────────────────────
create or replace function public.wallet_precharge_create(
  p_advertiser_id uuid,
  p_amount numeric,
  p_currency text,
  p_reason text default null
)
returns public.wallet_precharges
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin  record;
  v_wallet public.wallets%rowtype;
  v_ref    text;
  v_row    public.wallet_precharges%rowtype;
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

  -- Credit the wallet so the customer can spend the advance now.
  if p_currency = 'USD' then
    update public.wallets
       set usd_balance = coalesce(usd_balance, 0) + p_amount,
           updated_at = now()
     where id = v_wallet.id;
  else
    update public.wallets
       set eur_balance = coalesce(eur_balance, 0) + p_amount,
           updated_at = now()
     where id = v_wallet.id;
  end if;

  v_ref := 'PC-' || lpad((floor(random() * 1000000)::int)::text, 6, '0');

  insert into public.wallet_precharges (
    tenant_id, advertiser_id, wallet_id,
    amount, outstanding, currency, status, reference, reason, created_by
  ) values (
    v_admin.tenant_id, p_advertiser_id, v_wallet.id,
    p_amount, p_amount, p_currency, 'outstanding', v_ref, p_reason,
    v_admin.profile_id
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.wallet_precharge_create(uuid, numeric, text, text) from public;
grant execute on function public.wallet_precharge_create(uuid, numeric, text, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────
-- settle: admin settles some/all of an outstanding precharge once the
-- real payment has arrived. Reduces the wallet by the settled amount
-- (that money repaid the advance) and the outstanding.
-- ─────────────────────────────────────────────────────────────────
create or replace function public.wallet_precharge_settle(
  p_precharge_id uuid,
  p_amount numeric default null   -- null = settle the full outstanding
)
returns public.wallet_precharges
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin  record;
  v_pc     public.wallet_precharges%rowtype;
  v_settle numeric;
  v_row    public.wallet_precharges%rowtype;
begin
  select * into v_admin from public._require_profile('admin');

  select * into v_pc
    from public.wallet_precharges
   where id = p_precharge_id
   for update;
  if not found then
    raise exception 'Precharge not found' using errcode = '42704';
  end if;
  if v_pc.tenant_id <> v_admin.tenant_id then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if v_pc.status <> 'outstanding' then
    raise exception 'Precharge is not outstanding' using errcode = '22000';
  end if;

  v_settle := coalesce(p_amount, v_pc.outstanding);
  if v_settle <= 0 then
    raise exception 'Settle amount must be positive' using errcode = '22000';
  end if;
  if v_settle > v_pc.outstanding then
    v_settle := v_pc.outstanding;
  end if;

  -- The repaid portion comes back off the wallet.
  if v_pc.currency = 'USD' then
    update public.wallets
       set usd_balance = coalesce(usd_balance, 0) - v_settle,
           updated_at = now()
     where id = v_pc.wallet_id;
  else
    update public.wallets
       set eur_balance = coalesce(eur_balance, 0) - v_settle,
           updated_at = now()
     where id = v_pc.wallet_id;
  end if;

  update public.wallet_precharges
     set outstanding = outstanding - v_settle,
         status = case when outstanding - v_settle <= 0 then 'settled'
                       else 'outstanding' end,
         settled_by = v_admin.profile_id,
         settled_at = case when outstanding - v_settle <= 0 then now()
                           else settled_at end,
         updated_at = now()
   where id = p_precharge_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.wallet_precharge_settle(uuid, numeric) from public;
grant execute on function public.wallet_precharge_settle(uuid, numeric) to authenticated;

drop trigger if exists trg_touch_wallet_precharges on public.wallet_precharges;
create trigger trg_touch_wallet_precharges
  before update on public.wallet_precharges
  for each row execute function public._touch_updated_at();

drop trigger if exists trg_audit_wallet_precharges on public.wallet_precharges;
create trigger trg_audit_wallet_precharges
  after insert or update or delete on public.wallet_precharges
  for each row execute function public._audit_row_change();
