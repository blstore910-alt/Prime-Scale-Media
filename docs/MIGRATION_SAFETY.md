# Migration & deploy safety

Once real daily data is flowing — wallet top-ups, ad-account top-ups,
commissions, refunds — an update must never lose or corrupt it. This
is the playbook that keeps deploys safe.

## The golden rules (already how every migration here is written)

1. **Additive only.** Add tables, columns, indexes, functions,
   triggers. Never `DROP TABLE`, `DROP COLUMN`, `TRUNCATE`, or
   `DELETE FROM` a business table in a migration.
2. **Idempotent.** Every statement is safe to run twice:
   `create table if not exists`, `add column if not exists`,
   `create or replace function`, `drop trigger/policy if exists`
   before `create`. Re-running a migration is a no-op, never a
   failure.
3. **New columns are nullable or defaulted.** A column added to a
   table that already has rows must have a default or allow NULL, so
   the existing rows stay valid. (e.g. `status text not null default
   'active'` — old referral_links kept working.)
4. **Money logic lives in the DB, atomically.** Balance changes run
   inside `SECURITY DEFINER` functions with `for update` row locks and
   `WHERE status = 'pending'` guards, so two concurrent requests can
   never double-credit or double-complete.
5. **Everything financial is audited.** The `_audit_row_change`
   trigger records every insert/update/delete on business tables into
   `audit_events`, so any change is reconstructable.
6. **`updated_at` on every business row.** Server actions pass
   `ifUpdatedAt` and call `versionMatches` before writing — two admins
   editing the same record can't blind-overwrite each other.

## Changing a function signature safely

Adding a parameter to an RPC creates a second overload rather than
replacing it. When a param changes, **`drop function if exists` the
old signature first**, then `create or replace` the new one — see
`wallet_refund_request` in the refund-payout migration. Never leave
two overloads: the app would call an ambiguous function.

## Never rename or retype a column with data

If a column must change type or name, do it in three deploys, not one:
1. Add the new column, backfill it from the old one.
2. Ship code that writes both, reads the new.
3. Once confident, stop writing the old (drop it in a much later
   migration, or never).

## The safe-deploy checklist

**Before**
- [ ] Confirm the migration is additive + idempotent (grep for
      `drop table|drop column|truncate|delete from` — should only hit
      comments or the rate-limit cleanup).
- [ ] `npx tsc --noEmit`, `npx next lint --max-warnings 0`, `npm test`
      all green.
- [ ] Confirm the Supabase daily backup + PITR window covers now
      (Dashboard → Database → Backups).

**Deploy**
- [ ] Paste the consolidated SQL into the Supabase SQL editor and run
      it. It ends with a sanity `select` — check the counts.
- [ ] Push code; Vercel builds. Env changes need a redeploy to take
      effect.

**After**
- [ ] Open the affected page as super-admin — no console errors, the
      numbers still add up.
- [ ] If anything looks wrong, the data is intact (additive
      migrations don't touch it) — fix forward with another migration,
      don't roll the DB back.

## Freezing writes during an incident

Set `MAINTENANCE_MODE=true` in Vercel env + redeploy. Every mutation
server action then refuses with a clear message; reads keep working.
Flip it back when done. Use this if you ever need to run a data fix
while the app is live.

## Backups & recovery

- Supabase Pro keeps daily physical backups (retention shown in the
  dashboard) plus Point-in-Time Recovery if enabled on the plan.
- The `audit_events` table is a second line of defence: even without a
  restore, a wrong financial change can be traced and reversed by
  hand.
- See `docs/BACKUP_AND_RECOVERY.md` for the full DR playbook.

## Why data loss is very unlikely here

Every schema change this project ships is additive and idempotent, all
money moves through audited atomic DB functions, and the balance is
reconstructable from `audit_events`. A bad deploy can break a *screen*
(fix forward), but it does not delete *data*.
