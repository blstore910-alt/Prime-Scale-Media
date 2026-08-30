-- Two P0 fixes surfaced by the E2E audit:
--
--   1. Every advertiser needs an advertisers row and a wallets row.
--      Nothing in the migration set created either — the current app
--      code SELECTs advertisers by profile_id right after creating a
--      user_profiles row and blows up if no matching row exists.
--      Introduce ensure_advertiser_and_wallet() so the accept-invite
--      routes and the signup route stop depending on a hidden trigger.
--
--   2. wallet_topup_admin_verify() only flipped status to 'completed';
--      the balance-crediting trigger stub was left commented out. Enable
--      it as a plain AFTER UPDATE trigger. Idempotent-safe because the
--      RPC guards against verifying a topup that is not pending.
--
-- Both changes rely only on columns that already exist on wallets,
-- wallet_topups, advertisers, user_profiles. No schema shape change.


-- ─────────────────────────────────────────────────────────────────
-- 1. ensure_advertiser_and_wallet
-- ─────────────────────────────────────────────────────────────────
-- OUT columns named out_* to avoid a PL/pgSQL name collision with
-- the wallets.advertiser_id column reference below — the previous
-- version named the OUT `advertiser_id` and raised 42702 at call
-- time because plpgsql couldn't tell which one the WHERE meant.
create or replace function public.ensure_advertiser_and_wallet(
  p_profile_id uuid
)
returns table (out_advertiser_id uuid, out_wallet_id uuid)
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

  -- Only advertiser-role profiles get an advertiser + wallet. Admins
  -- return NULL, NULL.
  if v_profile.role <> 'advertiser' then
    return query select null::uuid, null::uuid;
    return;
  end if;

  -- 1a. Advertiser row — one per profile, keyed on profile_id.
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

  -- 1b. Wallet row — one per advertiser, unique reference_no per
  -- tenant. Cheap random 10-digit ref, matches the format the app
  -- already generates elsewhere. Qualify the column reference with
  -- the `w` alias so it can't collide with the OUT parameter shape.
  select * into v_wallet
    from public.wallets w
   where w.advertiser_id = v_advertiser.id;
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


-- ─────────────────────────────────────────────────────────────────
-- 2. Balance-crediting trigger for wallet_topups
--
-- Reads the topup's own amount and currency — never a caller-supplied
-- value. Handles four transitions:
--   pending   -> completed  =>  +amount
--   completed -> pending    =>  -amount   (undo)
--   pending   -> rejected   =>  no-op
--   rejected  -> pending    =>  no-op
-- ─────────────────────────────────────────────────────────────────
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
