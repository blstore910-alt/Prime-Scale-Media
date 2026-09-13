-- =====================================================================
-- Restrict the supplier pool to admins (it was readable tenant-wide)
-- =====================================================================
-- 20260913200000 created supplier_ad_accounts_read granting SELECT to ANY
-- authenticated user with a user_profiles row in the same tenant. The write
-- policy correctly required `up.role = 'admin'`; the read policy did not.
--
-- The comment justified it with "the pool page is admin-only in the UI" —
-- which is not a boundary. The browser gets a Supabase client with the anon
-- key plus the user's own JWT (lib/supabase/client.ts), so any advertiser or
-- affiliate in the tenant could query the table directly and read, per row:
--
--   fee_percentage        our margin on that ad account
--   balance_cents         what's sitting on accounts we hold
--   external_id / bm_id   the supplier's own identifiers
--   advertiser_id         which customer holds which account
--   raw                   the complete supplier payload
--
-- That last one also breaks the standing rule that the supplier's identity
-- must never be visible to customers.
--
-- Safe to tighten: the only readers are actions/supplier-pool-actions.ts
-- (admin-gated by requireAdminCtx) and lib/integrations/enqueue.ts, which is
-- always handed an admin-scoped client from the top-up verify path.
--
-- ⚠️ APPLY ON SUPABASE MANUALLY (git push ships only the frontend).
-- Rollback: re-create the policy from 20260913200000 without the role test.
-- =====================================================================

set search_path = public;

drop policy if exists supplier_ad_accounts_read on public.supplier_ad_accounts;

create policy supplier_ad_accounts_read on public.supplier_ad_accounts
  for select
  to authenticated
  using (
    exists (
      select 1
        from public.user_profiles up
       where up.user_id = auth.uid()
         and up.tenant_id = supplier_ad_accounts.tenant_id
         and up.role = 'admin'
    )
  );

-- Verify (run as a non-admin member of the tenant — expect 0 rows):
--   select count(*) from public.supplier_ad_accounts;

-- ---------------------------------------------------------------------
-- Stop every sync from filling the append-only audit log
-- ---------------------------------------------------------------------
-- The sync upsert writes a fresh synced_at on every row on every run, so each
-- row always differs and _audit_row_change inserted an audit_events row
-- carrying to_jsonb(OLD) AND to_jsonb(NEW) — both including the full `raw`
-- supplier blob. With ~569 accounts and a cron-able sync that is a large,
-- permanent write amplification into a table that is INSERT-only by design
-- and has no retention job.
--
-- What we actually want audited on this table is the ALLOCATION history — who
-- got which account, when, by whom. A refresh of mirrored supplier fields is
-- not a business event. `update of <cols>` fires only when one of those
-- columns appears in the UPDATE's SET list, which is exactly the allocate /
-- release path.
drop trigger if exists trg_audit_supplier_ad_accounts on public.supplier_ad_accounts;
create trigger trg_audit_supplier_ad_accounts
  after insert or delete
     or update of advertiser_id, ad_account_id, assigned_at, assigned_by
  on public.supplier_ad_accounts
  for each row execute function public._audit_row_change();
