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
