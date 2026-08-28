-- =====================================================================
-- P0 security: wallet + wallet_topups SECURITY DEFINER RPCs
-- =====================================================================
-- These RPCs replace direct client-side inserts/updates on `wallets`
-- and `wallet_topups`. Every function does its OWN auth + tenant check
-- (SECURITY DEFINER bypasses RLS, so the function body is the only
--  place where authorization is enforced).
--
-- See supabase/migrations/README.md for column assumptions.
-- =====================================================================

set search_path = public;

-- ---------------------------------------------------------------------
-- helper: identify the caller's active profile
-- ---------------------------------------------------------------------
-- Returns the profile_id, user_id, tenant_id and role of the caller.
-- If the caller has multiple profiles we return the first one for their
-- current tenant; callers that need per-request profile selection should
-- pass a specific profile via `p_profile_id`.
create or replace function public._require_profile(
  p_expected_role text default null
)
returns table (
  profile_id uuid,
  user_id    uuid,
  tenant_id  uuid,
  role       text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Unauthorized' using errcode = '28000';
  end if;

  return query
  select up.id, up.user_id, up.tenant_id, up.role
    from public.user_profiles up
   where up.user_id = v_uid
     and (p_expected_role is null or up.role = p_expected_role)
   order by up.created_at asc
   limit 1;

  if not found then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public._require_profile(text) from public;
grant execute on function public._require_profile(text) to authenticated;

-- =====================================================================
-- wallet_create_for_advertiser()
-- Advertiser calls this once, with no args, to create their own wallet.
-- Server derives advertiser_id, tenant_id, reference_no.
-- =====================================================================
create or replace function public.wallet_create_for_advertiser()
returns public.wallets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid          uuid := auth.uid();
  v_adv          public.advertisers%rowtype;
  v_existing     public.wallets%rowtype;
  v_new          public.wallets%rowtype;
  v_ref_no       text;
begin
  if v_uid is null then
    raise exception 'Unauthorized' using errcode = '28000';
  end if;

  select * into v_adv
    from public.advertisers
   where user_id = v_uid
   limit 1;

  if not found then
    raise exception 'No advertiser profile for caller' using errcode = '42501';
  end if;

  -- Idempotent: if wallet already exists, return it.
  select * into v_existing
    from public.wallets
   where advertiser_id = v_adv.id
   limit 1;
  if found then
    return v_existing;
  end if;

  v_ref_no := lpad((floor(random() * 1000000000)::bigint)::text, 10, '0');

  insert into public.wallets (advertiser_id, tenant_id, reference_no)
       values (v_adv.id, v_adv.tenant_id, v_ref_no)
    returning * into v_new;

  return v_new;
end;
$$;

revoke all on function public.wallet_create_for_advertiser() from public;
grant execute on function public.wallet_create_for_advertiser() to authenticated;

-- =====================================================================
-- wallet_topup_advertiser_create(p_amount, p_currency, p_payment_slip)
-- Advertiser submits a pending bank-transfer topup for THEIR wallet.
-- Server picks wallet_id / advertiser_id / tenant_id / created_by from
-- the caller — the client cannot spoof any of them.
-- =====================================================================
create or replace function public.wallet_topup_advertiser_create(
  p_amount        numeric,
  p_currency      text,
  p_payment_slip  text default null
)
returns public.wallet_topups
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_profile   record;
  v_adv       public.advertisers%rowtype;
  v_wallet    public.wallets%rowtype;
  v_new       public.wallet_topups%rowtype;
  v_new_ref   text;
begin
  if v_uid is null then
    raise exception 'Unauthorized' using errcode = '28000';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be positive' using errcode = '22000';
  end if;
  if p_currency is null or p_currency not in ('USD', 'EUR') then
    raise exception 'Invalid currency' using errcode = '22000';
  end if;

  select id, user_id, tenant_id, role
    into v_profile
    from public.user_profiles
   where user_id = v_uid
   order by created_at asc
   limit 1;
  if not found then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  select * into v_adv
    from public.advertisers
   where user_id = v_uid
     and tenant_id = v_profile.tenant_id
   limit 1;
  if not found then
    raise exception 'No advertiser profile' using errcode = '42501';
  end if;

  select * into v_wallet
    from public.wallets
   where advertiser_id = v_adv.id
     and tenant_id = v_profile.tenant_id
   limit 1;
  if not found then
    raise exception 'Wallet not found' using errcode = '42704';
  end if;

  if v_wallet.min_topup is not null and p_amount < v_wallet.min_topup then
    raise exception 'Amount below minimum' using errcode = '22000';
  end if;

  insert into public.wallet_topups (
    wallet_id,
    advertiser_id,
    tenant_id,
    currency,
    amount,
    status,
    created_by,
    reference_no,
    payment_slip
  ) values (
    v_wallet.id,
    v_adv.id,
    v_wallet.tenant_id,
    p_currency,
    p_amount,
    'pending',
    v_profile.id,
    v_wallet.reference_no,
    p_payment_slip
  )
  returning * into v_new;

  -- Rotate the wallet's reference_no so the next topup gets a fresh code.
  v_new_ref := lpad((floor(random() * 1000000000)::bigint)::text, 10, '0');
  update public.wallets
     set reference_no = v_new_ref,
         updated_at = now()
   where id = v_wallet.id;

  return v_new;
end;
$$;

revoke all on function public.wallet_topup_advertiser_create(numeric, text, text) from public;
grant execute on function public.wallet_topup_advertiser_create(numeric, text, text) to authenticated;

-- =====================================================================
-- Admin approve / reject / undo for wallet_topups
-- Uses the TOPUP's own amount (never a caller-supplied one).
-- =====================================================================
create or replace function public.wallet_topup_admin_verify(
  p_topup_id uuid
)
returns public.wallet_topups
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin   record;
  v_topup   public.wallet_topups%rowtype;
  v_updated public.wallet_topups%rowtype;
begin
  select * into v_admin from public._require_profile('admin');

  select * into v_topup
    from public.wallet_topups
   where id = p_topup_id
   for update;
  if not found then
    raise exception 'Topup not found' using errcode = '42704';
  end if;
  if v_topup.tenant_id <> v_admin.tenant_id then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if v_topup.status <> 'pending' then
    raise exception 'Topup is not pending' using errcode = '22000';
  end if;

  update public.wallet_topups
     set status = 'completed',
         approved_by = v_admin.profile_id,
         rejection_reason = null,
         updated_at = now()
   where id = p_topup_id
  returning * into v_updated;

  -- NB: wallet balance is expected to be updated by an existing trigger
  -- on wallet_topups.status. If none exists, add one (see README).

  return v_updated;
end;
$$;

revoke all on function public.wallet_topup_admin_verify(uuid) from public;
grant execute on function public.wallet_topup_admin_verify(uuid) to authenticated;

create or replace function public.wallet_topup_admin_reject(
  p_topup_id uuid,
  p_reason   text default null
)
returns public.wallet_topups
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin   record;
  v_topup   public.wallet_topups%rowtype;
  v_updated public.wallet_topups%rowtype;
begin
  select * into v_admin from public._require_profile('admin');

  select * into v_topup
    from public.wallet_topups
   where id = p_topup_id
   for update;
  if not found then
    raise exception 'Topup not found' using errcode = '42704';
  end if;
  if v_topup.tenant_id <> v_admin.tenant_id then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if v_topup.status <> 'pending' then
    raise exception 'Topup is not pending' using errcode = '22000';
  end if;

  update public.wallet_topups
     set status = 'rejected',
         approved_by = v_admin.profile_id,
         rejection_reason = coalesce(nullif(trim(p_reason), ''), null),
         updated_at = now()
   where id = p_topup_id
  returning * into v_updated;

  return v_updated;
end;
$$;

revoke all on function public.wallet_topup_admin_reject(uuid, text) from public;
grant execute on function public.wallet_topup_admin_reject(uuid, text) to authenticated;

create or replace function public.wallet_topup_admin_undo(
  p_topup_id uuid
)
returns public.wallet_topups
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin   record;
  v_topup   public.wallet_topups%rowtype;
  v_updated public.wallet_topups%rowtype;
begin
  select * into v_admin from public._require_profile('admin');

  select * into v_topup
    from public.wallet_topups
   where id = p_topup_id
   for update;
  if not found then
    raise exception 'Topup not found' using errcode = '42704';
  end if;
  if v_topup.tenant_id <> v_admin.tenant_id then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if v_topup.status not in ('completed', 'rejected') then
    raise exception 'Only completed or rejected topups can be undone' using errcode = '22000';
  end if;

  update public.wallet_topups
     set status = 'pending',
         approved_by = null,
         rejection_reason = null,
         updated_at = now()
   where id = p_topup_id
  returning * into v_updated;

  -- Trigger is expected to reverse the balance change on the status
  -- transition out of 'completed'. If no such trigger exists, add one.

  return v_updated;
end;
$$;

revoke all on function public.wallet_topup_admin_undo(uuid) from public;
grant execute on function public.wallet_topup_admin_undo(uuid) to authenticated;

-- =====================================================================
-- wallet_admin_set_min_topup(p_wallet_id, p_min_topup)
-- Replaces the client-side wallet.min_topup update.
-- =====================================================================
create or replace function public.wallet_admin_set_min_topup(
  p_wallet_id uuid,
  p_min_topup numeric
)
returns public.wallets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin  record;
  v_wallet public.wallets%rowtype;
  v_updated public.wallets%rowtype;
begin
  select * into v_admin from public._require_profile('admin');

  if p_min_topup is null or p_min_topup < 0 then
    raise exception 'min_topup must be non-negative' using errcode = '22000';
  end if;

  select * into v_wallet
    from public.wallets
   where id = p_wallet_id
   for update;
  if not found then
    raise exception 'Wallet not found' using errcode = '42704';
  end if;
  if v_wallet.tenant_id <> v_admin.tenant_id then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  update public.wallets
     set min_topup = p_min_topup,
         updated_at = now()
   where id = p_wallet_id
  returning * into v_updated;

  return v_updated;
end;
$$;

revoke all on function public.wallet_admin_set_min_topup(uuid, numeric) from public;
grant execute on function public.wallet_admin_set_min_topup(uuid, numeric) to authenticated;

-- =====================================================================
-- OPTIONAL: balance-crediting trigger stub
-- =====================================================================
-- Enable only if there isn't already a trigger on wallet_topups that
-- updates wallets.usd_balance / wallets.eur_balance on status changes.
-- Uncomment carefully — this touches money.
--
-- create or replace function public._apply_wallet_topup_balance()
-- returns trigger
-- language plpgsql
-- as $$
-- declare
--   v_delta numeric;
-- begin
--   -- pending -> completed  : credit
--   -- completed -> pending  : debit (undo)
--   -- pending -> rejected   : no-op
--   -- rejected -> pending   : no-op
--   if tg_op = 'UPDATE'
--      and new.status = 'completed'
--      and old.status <> 'completed' then
--     v_delta := new.amount;
--   elsif tg_op = 'UPDATE'
--        and old.status = 'completed'
--        and new.status <> 'completed' then
--     v_delta := -old.amount;
--   else
--     return new;
--   end if;
--
--   if new.currency = 'USD' then
--     update public.wallets
--        set usd_balance = coalesce(usd_balance, 0) + v_delta,
--            updated_at = now()
--      where id = new.wallet_id;
--   elsif new.currency = 'EUR' then
--     update public.wallets
--        set eur_balance = coalesce(eur_balance, 0) + v_delta,
--            updated_at = now()
--      where id = new.wallet_id;
--   end if;
--
--   return new;
-- end;
-- $$;
--
-- drop trigger if exists trg_apply_wallet_topup_balance on public.wallet_topups;
-- create trigger trg_apply_wallet_topup_balance
--   after update of status on public.wallet_topups
--   for each row execute function public._apply_wallet_topup_balance();
