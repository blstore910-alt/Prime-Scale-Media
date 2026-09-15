-- =====================================================================
-- Close two RLS holes that let a PLAIN admin bypass owner-only guards
-- =====================================================================
-- Both of these tables are owner-only in the server actions:
--
--   actions/bank-ledger-actions.ts   resolveOwnerContext()  — "Only the
--     tenant owner can do this", with a comment explaining exactly why:
--     a plain admin could otherwise inject fake "received" deposits that
--     hide a rogue admin from the reconciliation view.
--   actions/bank-account-actions.ts  same check, plus a double-confirm in
--     the UI, because these rows are the beneficiary bank details we tell
--     customers to pay into.
--
-- But RLS granted `for all` to ANY user_profiles row with role='admin' in
-- the tenant. A server action is not a boundary when the table underneath
-- it is open: a plain admin only has to open devtools and use the browser's
-- own Supabase client to do the exact thing the action refuses.
--
--   supabase.from('bank_accounts').update({ account_no: '<attacker IBAN>' })
--     .eq('tenant_id', '<tenant>').eq('currency','EUR')
--
-- That is the single highest-value write in the product: it redirects every
-- future customer transfer. And on the ledger side it lets the person being
-- reconciled edit the books they are being reconciled against.
--
-- After this, the database enforces what the actions always claimed.
--
-- The predicate is "role='admin' AND tenants.owner_id is this user".
-- 20260828140000_rls_templates.sql defines _is_super_admin_of(uuid) for
-- exactly this, but the live database is hand-authored and that helper is
-- NOT there — applying this migration failed on it. So it is (re)defined
-- below rather than assumed. `create or replace` leaves an existing one
-- with the same signature working exactly as before.
--
-- ⚠️ APPLY ON SUPABASE MANUALLY (git push ships only the frontend).
-- Safe to re-run.
-- =====================================================================

set search_path = public;

-- ---------------------------------------------------------------------
-- The owner predicate, defined here so this migration has no prerequisite.
-- SECURITY DEFINER because it reads tenants and user_profiles, which the
-- calling user may not be able to read directly; STABLE so the planner can
-- cache it within a statement.
-- ---------------------------------------------------------------------
create or replace function public._is_super_admin_of(tenant uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $fn$
  select exists (
    select 1
      from public.tenants t
      join public.user_profiles up on up.tenant_id = t.id
     where t.id = tenant
       and t.owner_id = auth.uid()
       and up.user_id = auth.uid()
       and up.role = 'admin'
  );
$fn$;
revoke all on function public._is_super_admin_of(uuid) from public;
grant execute on function public._is_super_admin_of(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- bank_ledger_entries — owner only, read AND write.
-- The entire surface (listLedgerEntries, the reconciliation view) is
-- owner-only in the app, so there is no admin read to preserve.
-- ---------------------------------------------------------------------
alter table public.bank_ledger_entries enable row level security;

drop policy if exists bank_ledger_admin_all on public.bank_ledger_entries;
drop policy if exists bank_ledger_owner_all on public.bank_ledger_entries;
create policy bank_ledger_owner_all on public.bank_ledger_entries
  for all
  to authenticated
  using (public._is_super_admin_of(bank_ledger_entries.tenant_id))
  with check (public._is_super_admin_of(bank_ledger_entries.tenant_id));

-- ---------------------------------------------------------------------
-- bank_accounts — reading stays open to the tenant (customers are shown
-- the beneficiary details they must pay into). Writing becomes owner-only.
--
-- Note that permissive policies combine with OR, so the old
-- bank_accounts_admin_write must be DROPPED, not merely joined by a
-- stricter one: leaving it in place would keep granting everything it
-- granted before.
-- ---------------------------------------------------------------------
alter table public.bank_accounts enable row level security;

drop policy if exists bank_accounts_admin_write on public.bank_accounts;
drop policy if exists bank_accounts_owner_write on public.bank_accounts;

create policy bank_accounts_owner_insert on public.bank_accounts
  for insert to authenticated
  with check (public._is_super_admin_of(bank_accounts.tenant_id));

create policy bank_accounts_owner_update on public.bank_accounts
  for update to authenticated
  using (public._is_super_admin_of(bank_accounts.tenant_id))
  with check (public._is_super_admin_of(bank_accounts.tenant_id));

create policy bank_accounts_owner_delete on public.bank_accounts
  for delete to authenticated
  using (public._is_super_admin_of(bank_accounts.tenant_id));

-- bank_accounts_read (select, any tenant member) is left exactly as it was.

-- ---------------------------------------------------------------------
-- Verify: list what is now attached to each table. In the Supabase SQL
-- editor only the LAST statement's result is shown, so this is the last
-- statement on purpose.
--
-- Expect:
--   bank_accounts        bank_accounts_read           SELECT
--   bank_accounts        bank_accounts_owner_insert   INSERT
--   bank_accounts        bank_accounts_owner_update   UPDATE
--   bank_accounts        bank_accounts_owner_delete   DELETE
--   bank_ledger_entries  bank_ledger_owner_all        ALL
--
-- If you still see bank_accounts_admin_write or bank_ledger_admin_all,
-- the drop did not take and the hole is still open.
-- ---------------------------------------------------------------------
select tablename, policyname, cmd, qual
  from pg_policies
 where schemaname = 'public'
   and tablename in ('bank_accounts', 'bank_ledger_entries')
 order by tablename, policyname;
