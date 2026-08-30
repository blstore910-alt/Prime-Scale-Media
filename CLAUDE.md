# CLAUDE.md — instructions for Claude Code in this repo

This file is loaded automatically at the start of every Claude Code
session in this project. Keep it short — long instructions are worse
than none. Update it when patterns change.

## Project shape

Multi-tenant financial dashboard on Next.js 15 (app router) +
Supabase. Advertisers hold EUR/USD wallets, top up via bank transfer,
spend on ad-account requests; admins verify payments; super-admin
owns the tenant.

Key tables: `wallets`, `wallet_topups`, `top_ups`, `invoices`,
`companies`, `subscriptions`, `advertisers`, `affiliates`,
`user_profiles`, `tenants`, `ad_accounts`, `ad_account_requests`,
`referral_links`, `referral_commissions`, `exchange_rates`,
`invitations`, `notifications`, `push_subscriptions`, `audit_events`,
`rate_limit_buckets`.

## Non-negotiable — how to write mutations

**Never** call `.from('BUSINESS_TABLE').insert/update/delete` from a
client component. Every mutation on a business table goes through
one of:

1. **SECURITY DEFINER RPC** in `supabase/migrations/` — for
   financial writes (wallets, wallet_topups).
2. **Server action** in `actions/*.ts` — for admin CRUD, with a
   column allowlist and tenant guard.
3. **Server action with owner-check** — for user self-service (own
   profile, own company).

See `docs/adr/0001-security-defender-rpcs-and-server-actions.md` for
the rationale. Reads may go direct — RLS covers them.

The auth guards are `apiRequireAdmin()`, `requireAdmin()`,
`requireSuperAdmin()`. Use them at the boundary; don't roll your
own.

## Non-negotiable — logging

Never `console.error(err)` where `err` is a raw Supabase error object.
Use `safeErrorMessage(err)` from `@/lib/pure-error` — Supabase's
`details`/`hint`/`row` fields leak PII.

## Non-negotiable — new financial tables

If you add a new financial table, extend the `_audit_row_change`
trigger's audited list in
`supabase/migrations/20260828130000_audit_events.sql` **and** the
`_touch_updated_at` list in
`supabase/migrations/20260829140000_updated_at_triggers.sql`. Every
business change should be reconstructable from `audit_events`, and
optimistic concurrency depends on `updated_at` being bumped.

## Non-negotiable — mutation actions

Every mutation server action:

1. Starts by calling `maintenanceGuard()` (or the `requireAdminCtx`
   helper it lives in) so `MAINTENANCE_MODE=true` freezes writes
   app-wide during an incident.
2. Column-allowlists the payload — never spread caller input into
   `.update({ ... })`.
3. Enforces tenant match by re-fetching the target row and
   comparing `tenant_id` server-side.
4. Accepts an optional `ifUpdatedAt` param and calls
   `versionMatches` before writing — protects against blind
   overwrite when two admins edit the same record. See
   `actions/_shared.ts`.

## UX — never lose typing

Long forms (company onboarding, ad-account form, ad-account
request, wallet-topup dialog) use `hooks/use-form-draft.ts` with
`profile.id` as the userScope. Combine with
`hooks/use-unsaved-changes-warning.ts` for a beforeunload dialog.
Clear the draft on successful submit.

## Style

Small commits with `fix(pX-*)` or `feat(...)` subject and a body
explaining why. Trailer: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.

## Local build

`.env.local` doesn't exist in the checkout — `npm run build` fails
locally on prerender. `npx tsc --noEmit`, `npx next lint`, and
`npm test` all work; use those to validate.

## Docs to know

- `docs/SECURITY_HARDENING_SUMMARY.md` — commit-by-commit rundown of
  the 2026-08 sweep and what's still needed for go-live.
- `docs/TEST_PLAN.md` — manual test suite.
- `docs/RUNBOOK.md` — ops for common incidents.
- `docs/BACKUP_AND_RECOVERY.md` — backup + DR playbook.
- `docs/PRIVACY_AND_DATA_LIFECYCLE.md` — GDPR / retention.
- `docs/adr/0001*.md`, `0002*.md` — architecture decisions.
- `supabase/migrations/README.md` — schema assumptions.
