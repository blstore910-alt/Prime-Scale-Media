-- ═══════════════════════════════════════════════════════════════════
-- MASTER: run everything outstanding, in order. Paste all, run once.
-- Idempotent + safe. Sanity checks at the end of each section.
-- ═══════════════════════════════════════════════════════════════════

-- ─── SECTION A: dedup duplicate super-admin profile ───
-- Remove the duplicate "E2E Super Admin" profile in the test tenant.
--
-- The stray profile is also referenced by public.admins (FK
-- admins_profile_id_fkey), so delete the admins row first, then the
-- profile. Targets ONLY E2E-tenant "E2E Super Admin" rows whose id is
-- NOT the canonical fixed id — cannot touch your real account.
-- Safe to re-run.

-- 1. Show the strays that will go
select id, user_id, full_name, created_at
  from public.user_profiles
 where tenant_id = '11111111-1111-1111-1111-111111111111'
   and full_name = 'E2E Super Admin'
   and id <> 'a2222222-2222-2222-2222-222222222222';

-- 2. Drop dependent admins rows first
delete from public.admins
 where profile_id in (
   select id from public.user_profiles
    where tenant_id = '11111111-1111-1111-1111-111111111111'
      and full_name = 'E2E Super Admin'
      and id <> 'a2222222-2222-2222-2222-222222222222'
 );

-- 3. Now the profiles
delete from public.user_profiles
 where tenant_id = '11111111-1111-1111-1111-111111111111'
   and full_name = 'E2E Super Admin'
   and id <> 'a2222222-2222-2222-2222-222222222222';

-- 4. Confirm 4 remain
select id, full_name, role, status, is_active
  from public.user_profiles
 where tenant_id = '11111111-1111-1111-1111-111111111111'
 order by role, full_name;

-- ─── SECTION B: private payment-slip bucket ───
-- Private storage bucket for wallet-topup payment slips.
--
-- Payment slips are bank receipts — they carry PII (account holder,
-- IBAN, transaction detail). They must NOT sit in a public bucket
-- where anyone with the URL can read them. This creates the bucket
-- as private and restricts access via RLS on storage.objects:
--
--   - An advertiser may upload into their own wallet's folder
--     (path prefix `wallet-topups/<wallet_id>/…`).
--   - Admins of the tenant may read any slip in their tenant.
--   - Nobody gets a public URL — reads go through short-lived signed
--     URLs minted server-side (see actions/payment-slip-actions.ts).
--
-- Safe to re-run.

insert into storage.buckets (id, name, public)
values ('wallet_payment_slips', 'wallet_payment_slips', false)
on conflict (id) do update set public = false;

-- Advertiser can INSERT into a folder named after a wallet they own.
-- Path shape: wallet-topups/<wallet_id>/<timestamp>-<name>
drop policy if exists slip_advertiser_insert on storage.objects;
create policy slip_advertiser_insert on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'wallet_payment_slips'
    and (storage.foldername(name))[1] = 'wallet-topups'
    and exists (
      select 1
        from public.wallets w
        join public.advertisers a on a.id = w.advertiser_id
       where a.user_id = auth.uid()
         and w.id::text = (storage.foldername(name))[2]
    )
  );

-- Advertiser can READ their own slips (e.g. to preview before submit).
drop policy if exists slip_advertiser_read on storage.objects;
create policy slip_advertiser_read on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'wallet_payment_slips'
    and (storage.foldername(name))[1] = 'wallet-topups'
    and exists (
      select 1
        from public.wallets w
        join public.advertisers a on a.id = w.advertiser_id
       where a.user_id = auth.uid()
         and w.id::text = (storage.foldername(name))[2]
    )
  );

-- Admins of the tenant can READ any slip belonging to a wallet in
-- their tenant.
drop policy if exists slip_admin_read on storage.objects;
create policy slip_admin_read on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'wallet_payment_slips'
    and (storage.foldername(name))[1] = 'wallet-topups'
    and exists (
      select 1
        from public.wallets w
        join public.user_profiles up on up.tenant_id = w.tenant_id
       where up.user_id = auth.uid()
         and up.role = 'admin'
         and w.id::text = (storage.foldername(name))[2]
    )
  );

-- ─── SECTION C: referral commission accrual ───
-- Referral commission accrual.
--
-- When a wallet top-up completes for a referred advertiser, the
-- advertiser who referred them (their affiliate) earns commission.
-- Until now nothing wrote to referral_commissions, so /my-referrals
-- and /commissions were always empty in real use. This adds a
-- trigger that accrues on the same pending→completed transition the
-- balance trigger already fires on.
--
-- DESIGN — SAFETY FIRST
--   Accrual runs in its own BEGIN/EXCEPTION block. If ANYTHING goes
--   wrong (missing column on the hand-authored referral_* tables, a
--   bad rate, etc.) the exception is swallowed and the top-up
--   approval + balance credit still succeed. A missed commission is
--   recoverable; a topup approval that hard-fails on every click is
--   not. Errors are surfaced via RAISE WARNING for the server logs.
--
-- CONVENTIONS
--   commission_pct is a WHOLE percent (UI input min 0 / max 100), so
--   percentage commission = amount * commission_pct / 100.
--   referral_commissions.status uses 'unpaid' | 'paid'; new rows are
--   'unpaid'. topup_id is left NULL — its FK target is ambiguous on
--   the un-versioned schema, and NULL keeps the insert safe.
--
-- Only 'percentage' commissions accrue per-topup here. 'monthly' /
-- 'onetime' / 'fixed' are subscription-shaped and handled elsewhere
-- (or manually) — accruing them per wallet-topup would over-pay.

create or replace function public._accrue_referral_commission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_advertiser_id uuid;
  v_link          record;
  v_amount        numeric;
begin
  -- Only on the clean credit transition.
  if not (tg_op = 'UPDATE'
          and new.status = 'completed'
          and old.status is distinct from 'completed') then
    return new;
  end if;

  begin
    -- Which advertiser topped up? wallet_topups links via wallet_id.
    select w.advertiser_id into v_advertiser_id
      from public.wallets w
     where w.id = new.wallet_id;
    if v_advertiser_id is null then
      return new;
    end if;

    -- Is this advertiser referred by an affiliate?
    select rl.id,
           rl.tenant_id,
           rl.commission_type,
           rl.commission_pct,
           rl.commission_currency
      into v_link
      from public.referral_links rl
     where rl.referred_advertiser_id = v_advertiser_id
     limit 1;
    if not found then
      return new;
    end if;

    -- Only percentage commissions accrue per top-up.
    if coalesce(v_link.commission_type, '') <> 'percentage' then
      return new;
    end if;
    if coalesce(v_link.commission_pct, 0) <= 0 then
      return new;
    end if;

    v_amount := round(new.amount * v_link.commission_pct / 100.0, 2);
    if v_amount <= 0 then
      return new;
    end if;

    -- Record the commission (unpaid — admin pays out manually).
    insert into public.referral_commissions (
      referral_link_id,
      tenant_id,
      type,
      amount,
      currency,
      status,
      topup_id
    ) values (
      v_link.id,
      v_link.tenant_id,
      'percentage',
      v_amount,
      coalesce(new.currency, v_link.commission_currency),
      'unpaid',
      null
    );

    -- Keep the running earnings on the link in sync so the
    -- /my-referrals hero reflects it without a re-aggregate.
    if new.currency = 'USD' then
      update public.referral_links
         set earnings_usd = coalesce(earnings_usd, 0) + v_amount
       where id = v_link.id;
    elsif new.currency = 'EUR' then
      update public.referral_links
         set earnings_eur = coalesce(earnings_eur, 0) + v_amount
       where id = v_link.id;
    end if;

  exception when others then
    -- Never block the topup on an accrual problem.
    raise warning 'referral accrual skipped for wallet_topup %: %',
      new.id, sqlerrm;
  end;

  return new;
end;
$$;

drop trigger if exists trg_accrue_referral_commission on public.wallet_topups;
create trigger trg_accrue_referral_commission
  after update of status on public.wallet_topups
  for each row execute function public._accrue_referral_commission();
