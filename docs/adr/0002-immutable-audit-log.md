# ADR 0002 — Immutable audit_events log for every financial write

**Date:** 2026-08-29
**Status:** Accepted

## Context

Two operational needs that neither Supabase PITR nor off-site snapshots
covered well:

1. **"Who changed this row, and when?"** — Supabase's own logs are
   query-level, not row-level, and rotate. If someone flips
   `wallet_topups.status` from `pending` to `completed` with a new
   `approved_by`, we need to know who did it 6 months later.
2. **"What did this row look like before the change?"** — PITR gives
   you the whole DB at a point in time. Restoring the whole thing to
   read one row is heavy-handed; often the row is deleted or updated
   and everything else has moved on legitimately.

The security audit (see `docs/SECURITY_HARDENING_SUMMARY.md`) also
flagged that any incident response would need a paper trail we could
trust.

## Decision

Add an `audit_events` table + trigger, populated by a
`SECURITY DEFINER` function on every INSERT/UPDATE/DELETE on the
financial tables:

- `wallets`, `wallet_topups`, `top_ups`, `topup_logs`, `invoices`,
  `companies`, `billings`, `subscriptions`, `exchange_rates`,
  `referral_commissions`, `referral_links`, `ad_accounts`,
  `ad_account_requests`, `advertisers`, `affiliates`, `user_profiles`,
  `tenants`, `invitations`.

Each event stores: actor (auth.uid + profile id), tenant_id, table,
action, row_id, `before_data`, `after_data` (both JSONB), timestamp.

The table is **append-only**. Policies deny UPDATE/DELETE; `REVOKE`
strips those grants from `anon` / `authenticated` / `public` even if
a permissive policy were added by mistake later. Only the trigger's
`SECURITY DEFINER` context can INSERT.

Admins of a tenant can SELECT their tenant's events. Nobody else can
read the log.

Migration: `supabase/migrations/20260828130000_audit_events.sql`.

## Consequences

- **Positive:** Forensics is fast. `select before_data, after_data
  from audit_events where table_name = 'wallets' and row_id = 'X'
  order by occurred_at desc` reconstructs the whole history of one
  wallet in one query.
- **Positive:** Deletes are recoverable. `insert into invoices select
  (before_data ->> ...) from audit_events where action = 'DELETE' and
  row_id = X` restores a lost row without a PITR.
- **Positive:** The log is trustworthy — a compromised admin can't
  cover their tracks by editing `audit_events`. Deleting the whole
  table is possible only with direct Postgres owner access.
- **Negative:** Storage. Each write on a financial table becomes at
  least one extra row. JSONB compresses well but 6 months of activity
  will be measurable.
- **Negative:** Small write-path latency (trigger overhead, ~1-2ms per
  write). Acceptable.
- **Rejected alternative:** External log aggregator (Datadog / Papertrail).
  Rejected because it would ship rows off-platform, adding a
  compliance surface, and would still require this Postgres trigger
  as the source of truth.
- **Rejected alternative:** WAL replay. Rejected because it's Supabase
  ops-team territory, not something the app team can query.

## References

- Migration: `supabase/migrations/20260828130000_audit_events.sql`
- Docs: `docs/BACKUP_AND_RECOVERY.md` (layer 1)
- Runbook: `docs/RUNBOOK.md` — queries for common incident types
