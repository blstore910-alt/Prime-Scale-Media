-- ═══════════════════════════════════════════════════════════════════
-- P0 fixes uncovered by the E2E audit — paste in Supabase SQL Editor.
--
--   1. ensure_advertiser_and_wallet(profile_id): idempotent bootstrap
--      of the advertisers + wallets rows a new advertiser needs. Called
--      from both accept-invite paths.
--   2. Enables the wallet-balance-crediting trigger on wallet_topups
--      that was left commented out — admin verify now actually credits
--      the wallet.
--
-- Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.ensure_advertiser_and_wallet(
  p_profile_id uuid
)
returns table (advertiser_id uuid, wallet_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile     public.user_profiles%rowtype;
  v_advertiser  public.advertisers%rowtype;
  v_wallet      public.wallets%rowtype;
  v_ref         text;
begin
  select * into v_profile
    from public.user_profiles
   where id = p_profile_id;
  if not found then
    raise exception 'Profile not found' using errcode = '42704';
  end if;

  if v_profile.role <> 'advertiser' then
    return query select null::uuid, null::uuid;
    return;
  end if;

  select * into v_advertiser
    from public.advertisers
   where profile_id = v_profile.id;
  if not found then
    insert into public.advertisers (
      profile_id,
      user_id,
      tenant_id,
      startup_fee,
      fee_status,
      airtable
    ) values (
      v_profile.id,
      v_profile.user_id,
      v_profile.tenant_id,
      0,
      'pending',
      false
    )
    returning * into v_advertiser;
  end if;

  select * into v_wallet
    from public.wallets
   where advertiser_id = v_advertiser.id;
  if not found then
    v_ref := lpad(
      (floor(random() * 10000000000)::bigint)::text,
      10,
      '0'
    );
    insert into public.wallets (
      advertiser_id,
      tenant_id,
      reference_no
    ) values (
      v_advertiser.id,
      v_profile.tenant_id,
      v_ref
    )
    returning * into v_wallet;
  end if;

  return query select v_advertiser.id, v_wallet.id;
end;
$$;

revoke all on function public.ensure_advertiser_and_wallet(uuid) from public;
grant execute on function public.ensure_advertiser_and_wallet(uuid)
  to authenticated;


create or replace function public._apply_wallet_topup_balance()
returns trigger
language plpgsql
as $$
declare
  v_delta numeric;
begin
  if tg_op = 'UPDATE'
     and new.status = 'completed'
     and old.status is distinct from 'completed' then
    v_delta := new.amount;
  elsif tg_op = 'UPDATE'
        and old.status = 'completed'
        and new.status is distinct from 'completed' then
    v_delta := -old.amount;
  else
    return new;
  end if;

  if new.currency = 'USD' then
    update public.wallets
       set usd_balance = coalesce(usd_balance, 0) + v_delta,
           updated_at = now()
     where id = new.wallet_id;
  elsif new.currency = 'EUR' then
    update public.wallets
       set eur_balance = coalesce(eur_balance, 0) + v_delta,
           updated_at = now()
     where id = new.wallet_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_apply_wallet_topup_balance on public.wallet_topups;
create trigger trg_apply_wallet_topup_balance
  after update of status on public.wallet_topups
  for each row execute function public._apply_wallet_topup_balance();


-- Sanity check
select
  proname as function_name,
  pronargs as arg_count
from pg_proc
where proname in ('ensure_advertiser_and_wallet', '_apply_wallet_topup_balance');
