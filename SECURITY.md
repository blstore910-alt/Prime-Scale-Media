# Security policy

## Reporting a vulnerability

If you've found a security issue in this app, **please do not open a
public GitHub issue**. Instead, email the maintainer directly with:

- A description of the vulnerability
- Steps to reproduce
- The impact you believe it has
- (Optional) a suggested fix

We commit to:
- Acknowledging your report within 3 business days
- Providing a timeline for remediation within 7 business days
- Crediting you in the fix commit / release notes (unless you prefer to
  stay anonymous)

## Scope

In scope:
- The Next.js application code in this repository
- The Supabase migrations under `supabase/migrations/`
- The auth/authorization boundary between roles (advertiser, admin,
  super-admin) and between tenants

Out of scope:
- Supabase's own infrastructure (report those to Supabase directly)
- Third-party dependencies where the vulnerability is in the upstream
  package — please report those to the upstream project first
- Rate-limit bypasses that require access to more IPs than a typical
  attacker would have (the limiter is defense-in-depth, not a hard
  wall)

## What we've already hardened

The `docs/SECURITY_HARDENING_SUMMARY.md` and
`docs/adr/0001-security-defender-rpcs-and-server-actions.md` documents
describe the current mutation model: every financial write goes
through a SECURITY DEFINER RPC or a server action with a column
allowlist, and every business-table change is logged in the
append-only `audit_events` table.

If you find a mutation path that bypasses this model, that's a
priority-1 report.

## Backup + recovery

`docs/BACKUP_AND_RECOVERY.md` describes the three-layer backup:
immutable audit log, Supabase PITR, and off-site daily snapshots.

If you find a way to modify or delete `audit_events` rows outside the
trigger path, that's a priority-1 report too — the log is meant to be
append-only.

## GDPR / data subject rights

- `GET /api/me/export` — signed-in user downloads their own data as
  JSON (right to portability).
- `actions/gdpr-actions.ts:requestOwnErasure` — user-triggered soft
  delete (sets `pending_erasure`, blocks login).
- `actions/gdpr-actions.ts:hardDeleteUser` — super-admin-only hard
  delete after the fiscal retention window.

Report if any of these leak another user's data or accept a target
outside the caller's tenant.

## Operational endpoints (public, no auth)

- `/api/health` — uptime probe, reports Supabase reachability +
  env presence + `maintenance` flag. No secrets in payload.
- `/api/version` — deploy identifier. Used by the client-side
  "new version available" banner.
- `/api/log/client-error` — accepts an error report (message,
  stack, url, userAgent, extra). Zod-validated, bounded lengths.
  Structured-logs server-side; nothing sensitive returned.
- `/api/push/notify` — Supabase webhook, gated by
  `PUSH_WEBHOOK_SECRET` header.

Report if any of these:
- Return secrets or PII beyond what's documented above
- Accept unbounded input
- Can be used as an oracle for detecting user existence

## Incident-response feature flags

- `MAINTENANCE_MODE=true` freezes all writes app-wide. Every server
  action calling `maintenanceGuard()` returns `code: "forbidden"`.
  Reads keep working. See `actions/_shared.ts`.

Report if you find a write path that ignores the guard.

## Session activity

- `/api/heartbeat` (POST, auth required) records a `last_seen_at`
  on the caller's profile at most once every 5 minutes (throttled
  server-side).
- The value is written by `mark_session_seen()`, a SECURITY DEFINER
  RPC that touches ONLY the `last_seen_at` column of the caller's
  own profile.

Report if `mark_session_seen()` can be called to write ANY other
column or update a profile the caller does not own.
