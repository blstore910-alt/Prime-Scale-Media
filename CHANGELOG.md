# Changelog

Notable changes to the Prime Scale Media App. Reverse chronological.
Groups match the `SECURITY_HARDENING_SUMMARY.md` waves for
cross-reference.

## Unreleased (2026-08 sweep) — 95 commits, 97 tests

### Security — data & mutation model

- Every business-table write now goes through a SECURITY DEFINER RPC
  (wallets, wallet_topups) or a server action with a column allowlist
  and tenant guard (top_ups, invoices, tenants, companies, billings,
  subscriptions, exchange_rates, referral_commissions, referral_links,
  ad_accounts, ad_account_requests, advertisers, affiliates,
  user_profiles, invitations).
- Optimistic concurrency guards on admin updates via
  `ifUpdatedAt` param + `versionMatches` helper.
- Auto-touch `updated_at` BEFORE UPDATE trigger on 17 business tables
  so the concurrency check never gets false negatives.
- Immutable `audit_events` table + trigger on every business table.
  Rows are non-updateable, non-deleteable via RLS + REVOKE. Admins
  see their own tenant only.

### Security — auth & session

- Password minimum: 12 characters (server-enforced).
- Password strength meter on signup / invite-signup / update-password.
- Cookies: `HttpOnly` + `Secure` + `SameSite=lax` + `Path=/` on every
  `profile_id` set. Dropped the unused `role` cookie.
- 30-minute idle-timeout auto-signout with 2-minute warning dialog.
- "Sign out of all devices" self-service on /profile.
- Session activity heartbeat: `mark_session_seen()` RPC updates
  `last_seen_at` at most once per 5 minutes per user. Consumed by
  the admins table "Last seen" column and the dashboard status panel.

### Security — public API

- Rate limiter: `send-invite` 20/h/tenant, `accept-invite` 10/h/ip,
  `signup` 5/h/ip, `push-subscribe` 20/h/ip, `heartbeat` 60/h/ip,
  `client-error-log` 60/h/ip, `gdpr-export` 10/h/ip.
- Zod-validated bodies on all public POST endpoints.
- PII-scrubbed error logs via `safeErrorMessage()`.
- CSP report-only header.
- Global security headers: HSTS, X-Content-Type-Options, X-Frame-Options,
  Permissions-Policy, Referrer-Policy, X-DNS-Prefetch-Control.
- X-Request-Id middleware for log correlation.
- Payment slip upload: 10 MB cap + SVG blocked.
- Send-invite: `sender_profile_id` derived server-side; `role`
  restricted to non-admin values; tenant re-fetched from DB.
- `/api/accept-invite/*`: server-side invite validation, no body trust.

### Reliability & UX

- IndexedDB form drafts + beforeunload warning on 4 long forms
  (company onboarding, ad-account form, ad-account request,
  wallet-topup dialog).
- Root-level React error boundary that reports to
  `/api/log/client-error` via `navigator.sendBeacon`.
- `/api/health` uptime probe + `/api/version` deploy identifier.
- Deploy-detection banner ("new version available") polls
  `/api/version` every minute; user chooses when to reload.
- Read-only `MAINTENANCE_MODE` feature flag with full-width banner.

### GDPR

- `GET /api/me/export` — user downloads their own data as JSON.
- Two-step erasure: user requests, super-admin executes on the
  anniversary. Both wired into /profile.
- Retention policy documented (hot 0-2y / warm 2-7y / cold >7y).

### Admin UX

- `/wallet-topups` defaults to "Pending" status filter for admins so
  they land on the actionable queue. Advertisers unaffected.
- `/top-ups` defaults to "Pending" status filter for admins.
  Advertisers land on "All" (their own history).
- `/notifications` "Clean up" button removes read notifications
  older than 30 days.
- "waiting Xh" amber indicator on pending wallet-topup rows
  (desktop + mobile) so stale requests are visible at a glance.

### Operations

- Super-admin dashboard panel: pending queues, active admins,
  audit throughput, version, maintenance flag.
- Rate-limit bucket viewer for super-admins (top 25 active buckets
  with ceiling-percentage badges).
- `/audit` super-admin viewer with table/action/row filters, CSV
  export (RFC 4180-compliant), a deep-linkable `?row=<uuid>` filter
  for per-record history, a "since" quick-filter (15m / 1h / 24h /
  7d / all time), a copy-to-clipboard button on row_ids, and a
  manual refresh button that spins while a fetch is in flight.
- Sidebar badges: live pending counts on Wallet Topups, Top-ups,
  Ad-account Requests.
- `/api/wallet-recovery?wallet=<uuid>` — read-only balance-drift
  check that replays `audit_events` and reports the delta vs the
  live wallet balance. Dialog wrapper on the dashboard.
- pg_cron jobs: daily `rate_limit_prune`, monthly
  `audit_events_capture_monthly_stats`.
- 15 composite/partial indexes on hot filter paths.
- Post-deploy smoke script (`npm run smoke`).
- Release-notes generator (`npm run release-notes`) grouping
  commits by conventional-commits prefix since a tag or date.
- Env preflight (`npm run check-env`).
- /help page filled with actual FAQ.
- /auth/error page: friendly copy for known error slugs, sanitised
  against reflected-XSS.
- /profile "My recent activity" self-service audit view (last 20
  events where the caller was the actor).

### Testing / CI

- 97 unit tests via `node:test`. Coverage includes: pure-error,
  ilike search sanitize, http body parse, form-draft debounce,
  last-seen formatter, password strength scorer, callerIp header
  priority, versionMatches, maintenance guard, tenant slug regex,
  CSV escape rule, wallet balance replay, since-cutoff.
- GitHub Actions CI: typecheck, lint (strict `--max-warnings 0`),
  unit tests, optional build on PR.
- Strict lint gate; 0 warnings across the codebase.
- `.gitattributes` pins LF for source files so Windows checkouts
  stop printing autocrlf warnings on commit.

### Docs

- `SECURITY_HARDENING_SUMMARY.md` — commit-by-commit rundown.
- `TEST_PLAN.md` — manual pre-launch suite.
- `RUNBOOK.md` — incident procedures.
- `BACKUP_AND_RECOVERY.md` — three-layer backup + drill playbook.
- `PRIVACY_AND_DATA_LIFECYCLE.md` — GDPR + retention.
- `DEPLOYMENT.md` — 12-step first-deploy guide.
- `DATA_INTEGRITY_LESSONS.md` — bol-app cross-reference.
- `CLAUDE_CODE_MOBILE.md` — how to drive Claude Code from a phone.
- 3 ADRs: SECURITY DEFINER RPCs / audit log / optimistic concurrency.
- `docs/README.md` — role-based index.
- Root README developer quick-start section.
- CLAUDE.md non-negotiable patterns.
- SECURITY.md vulnerability-reporting policy.
- CHANGELOG.md — this file.

### Supabase migrations shipped

1. `20260828120000_wallet_rpcs.sql` — wallet_create_for_advertiser,
   wallet_topup_advertiser_create, wallet_topup_admin_verify/reject/
   undo, wallet_admin_set_min_topup.
2. `20260828130000_audit_events.sql` — audit_events table + trigger.
3. `20260828140000_rls_templates.sql` — RLS baseline for every
   audited table (review before deploy).
4. `20260828150000_rate_limits.sql` — rate_limit_buckets +
   rate_limit_check RPC.
5. `20260829120000_scheduled_maintenance.sql` — pg_cron jobs +
   audit_events_monthly_stats.
6. `20260829130000_session_activity.sql` — user_profiles.last_seen_at
   + mark_session_seen RPC.
7. `20260829140000_updated_at_triggers.sql` — auto-touch BEFORE
   UPDATE trigger.
8. `20260830120000_perf_indexes.sql` — 15 composite/partial indexes.

## Before the 2026-08 sweep

See `docs/SECURITY_HARDENING_SUMMARY.md` for the earlier P0/P1
security commits (wallet exchange RPC, top-up admin verify, invite
validation, etc.).
