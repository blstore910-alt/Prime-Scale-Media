# Docs index — Prime Scale Media App

Where to start, by role.

## New to this repo?

Read in this order:

1. [SECURITY_HARDENING_SUMMARY.md](SECURITY_HARDENING_SUMMARY.md) — one-page
   overview of everything that shipped in the 2026-08 hardening sweep,
   with commit table and what's left for you (SQL deploy, RLS
   verification, test plan, backup infra).
2. [TEST_PLAN.md](TEST_PLAN.md) — the manual test suite you run before
   go-live. Includes pre-flight (SQL deploy + RLS matrix) and a
   sign-off checklist.
3. [RUNBOOK.md](RUNBOOK.md) — ops for common incidents. Look here
   when something breaks in production.
4. [BACKUP_AND_RECOVERY.md](BACKUP_AND_RECOVERY.md) — three-layer
   backup strategy + restore drill + incident playbook.
5. [PRIVACY_AND_DATA_LIFECYCLE.md](PRIVACY_AND_DATA_LIFECYCLE.md) —
   GDPR / retention.

## Architecture decisions (why things are the way they are)

- [ADR 0001 — SECURITY DEFINER RPCs + server actions](adr/0001-security-defender-rpcs-and-server-actions.md)
- [ADR 0002 — Immutable audit log](adr/0002-immutable-audit-log.md)
- [ADR 0003 — Optimistic concurrency + local form drafts](adr/0003-optimistic-concurrency-and-drafts.md)

## Cross-references

- [DATA_INTEGRITY_LESSONS.md](DATA_INTEGRITY_LESSONS.md) — what we
  learned from the bol-app snapshot and how our patterns compare.
- [CLAUDE_CODE_MOBILE.md](CLAUDE_CODE_MOBILE.md) — running Claude
  Code from your phone (three options, setup steps).

## Root-level docs

- [../CLAUDE.md](../CLAUDE.md) — non-negotiable patterns for Claude
  sessions in this repo. Read this before making changes with the
  agent.
- [../SECURITY.md](../SECURITY.md) — how to report a vulnerability
  and what's in / out of scope.
- [../supabase/migrations/README.md](../supabase/migrations/README.md)
  — schema assumptions + migration deployment order.

## By role

**Super-admin (tenant owner)**
- TEST_PLAN sections 0 + 1 to set up.
- BACKUP_AND_RECOVERY to enable PITR + off-site snapshots.
- /audit and /dashboard system-status panel for day-to-day.

**Regular admin**
- No pre-flight — you're onboarded by the super-admin via /admins.
- Sidebar pending-badges tell you when there's work.

**Developer (future you)**
- CLAUDE.md for patterns.
- ADR 0001-0003 for why.
- RUNBOOK "wallet balance klopt niet" section for how to debug
  money bugs.

**External security researcher**
- SECURITY.md.
