# CLAUDE.md — instructions for Claude Code in this repo

This file is loaded automatically at the start of every Claude Code
session in this project. Keep it short — long instructions are worse
than none. Update it when patterns change.

## The plan — do not ask, this is settled

Three tracks, running together until the app is ready for real customers.
The owner has had to restate this many times; it is written here so nobody
has to again.

1. **Agents sweep.** Read-only agents in parallel, hunting a class of
   fault at a time — money arithmetic, client/server rule mismatches,
   permissions, dead ends per journey, empty/error states, regressions in
   the day's own diff. Findings get fixed, not filed.
2. **UI round.** Claude works through the screens; the owner is in the
   browser and says what looks wrong. Claude fixes and deploys; the owner
   reloads and looks again.
3. **The real J1–J8 walkthrough,** together, on production, with real
   money. The script is `docs/WALKTHROUGH_J1_J8.md`: five test users, the
   whole test plan A–Z, and a Known-limitations table so a known gap is
   not reported as a new bug.

**The goal is to go live cleanly after that** — real customers, nothing
embarrassing, nothing that quietly takes the wrong money.

### How to run it, without being asked again

The owner should not have to re-send this. Default behaviour in this
repo, every session:

- **Keep 4–6 read-only agents running**, each on one class of fault, and
  start the next round as soon as one reports. Order: the controls used
  most (advertiser, affiliate, admin, super-admin), then the routes,
  then the combinations. Findings get FIXED. Keep sweeping until a round
  comes back near-empty.
- **Work `docs/WALKTHROUGH_J1_J8.md`** — all four passes. A (every menu
  item × every role) and C (every figure against SQL) are the exhaustive
  ones; D (J1–J13) is the scenarios. Walk what you can in the built-in
  browser yourself; say plainly when a signed-in session is needed.
- **Production must keep working.** After each fix: gate, push to main,
  then open the screen on app.primescalemedia.com and check it renders
  WITH DATA. A broken production blocks everything else.
- **Numbers must agree at both ends** — screen against database, to the
  cent. A confident 0 over a failed read is a fault, not a zero.
- **No "probably".** Read the code, or ask for one SQL query. Say
  immediately what could NOT be verified.
- **Migrations**: hand them over paste-ready, with a report table at the
  end that tests what the migration actually did.
- **Do not stop to ask permission to continue.** Ask only when the
  answer changes the work.
- **Report after each round**: what was fixed, what is open, what is
  needed from the owner — **and a percentage**.

### The percentage

Every round ends with "we are at N%". It is not a feeling. Count it,
and show the four numbers it came from, so the owner can see which
track is behind:

| track | how it is counted |
|---|---|
| **A. Screens** | destinations verified by ACTUALLY OPENING them and seeing data, over 46 (21 owner + 9 advertiser + 6 affiliate + 6 settings tabs + 10 with no menu entry, minus overlap) |
| **B. Findings** | agent findings fixed, over findings raised. Known limitations count as raised-and-accepted, not as fixed |
| **C. Numbers** | of the 8 SQL checks in the walkthrough, how many have been run against live and matched the screen |
| **D. Journeys** | J1–J13, counted as walked only when walked end to end on production |

The headline is the LOWEST of the four, not the average. Three tracks
at 90% and one at 10% is not 70% — it is a product with a whole side
nobody has looked at, and that is what the number has to say. Round
down, and never round up to make it look better.

## Deploying — branch, then production, then test live

`git push origin feat/redesign-advertiser:main` publishes to
app.primescalemedia.com immediately. **That is production. There is no
staging in front of it.**

The rhythm:

```
git push origin feat/redesign-advertiser:main   # straight to production
```

**Straight to main by default.** The branch push used to be a build gate,
and it no longer earns its keep: `scripts/gate.sh` runs tsc, lint and the
tests locally first, and a build that fails on main does NOT take
production down — Vercel only promotes a successful build, so the
previous deployment keeps serving and the change simply does not land.
The cost of a failure is identical either way, and the preview doubles
every wait.

Use the branch first ONLY for a change `next build` alone can catch:
a new page or route, a new `useSearchParams` (Suspense boundary), a CSS
template literal, JSX restructuring. Then sequentially, never both at
once — together they double the Vercel queue.

The owner does **not** want preview URLs and does not test on them.

Testing happens on the real URL, after promoting. Preview talks to the
**same Supabase database**, so a write there is a write on live data — it
proves the build and the render and nothing else.

Before any push: `npx tsc --noEmit && npm test` chained with `&&`. A grep
over test output silently matches nothing and reads as success.

Migrations do not deploy with git. They are pasted by hand into the SQL
editor, and every dollar-quoted block needs a NAMED tag (`$blk0$`, not
`$$`) or the editor can refuse a file whose quotes are balanced.

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

## Non-negotiable — a column a migration has not added yet

Code reaches production in minutes; migrations are pasted by hand into
the SQL editor whenever somebody gets to it. **They are never in step.**

A `select` naming a column that does not exist yet does not degrade — it
throws, and PostgREST's message ("column plans_1.features does not
exist") lands on whatever screen asked for it. A customer read that
across their own dashboard.

So anything reading a column added by a pending migration must hold when
it is absent: ask for it, and on error retry without it. The feature
stays dark until the migration lands, instead of the screen breaking.

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

- `docs/WALKTHROUGH_J1_J8.md` — **the script for going through the app by
  hand on production.** Five test users, J1-J8 step by step, the
  migrations that must be applied first, and a Known-limitations table so
  a known gap is not reported as a new bug.
- `docs/ROUTE_MAP.md` — **which file actually renders each screen.**
  Check it before editing a view: several ported `psm-*` components are
  on no route at all, and fixes have landed in them twice.
- `docs/WISE_SETUP.md` — the deposit feed is OFF on production: no
  webhook secret, no read token. Three env vars and a URL.
- `docs/UNREACHABLE.md` — components nothing imports, and the one
  FEATURE (precharge) that lost its UI in a port. Four fixes have
  already landed in files no route renders.
- `docs/NEXT_SESSION_FIRST.md` — **read this at the start of a new
  session.** Scoped, ready-to-execute work parked behind something more
  urgent; currently the 29-site silent-write sweep.
- `docs/SECURITY_HARDENING_SUMMARY.md` — commit-by-commit rundown of
  the 2026-08 sweep and what's still needed for go-live.
- `docs/TEST_PLAN.md` — manual test suite.
- `docs/RUNBOOK.md` — ops for common incidents.
- `docs/BACKUP_AND_RECOVERY.md` — backup + DR playbook.
- `docs/PRIVACY_AND_DATA_LIFECYCLE.md` — GDPR / retention.
- `docs/adr/0001*.md`, `0002*.md` — architecture decisions.
- `supabase/migrations/README.md` — schema assumptions.
