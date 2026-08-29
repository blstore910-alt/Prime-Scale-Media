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
