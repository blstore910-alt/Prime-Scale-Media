# CLAUDE.md — instructions for Claude Code in this repo

This file is loaded automatically at the start of every Claude Code
session in this project. Keep it short — long instructions are worse
than none. Update it when patterns change.

## The plan — do not ask, this is settled

**Journeys first. Fault-class sweeps are the backlog, not the plan.**

We spent days sweeping by fault class and it did not converge, because
"find every fault of kind X across the app" has no end condition. Every
round found something, and none of it was what kept us off live. So the
order is inverted:

Close these EIGHT journeys, end to end, on production, with the test
users. A journey is binary — it works or it does not.

| # | journey | roles |
|---|---|---|
| 1 | invite -> signup -> onboarding -> dashboard | advertiser |
| 2 | wallet top-up: amount, reference, slip, admin verifies, balance right | advertiser + admin |
| 3 | request an ad account, EUR 50 off the wallet, request visible | advertiser |
| 4 | fund an ad account from the wallet, fee right, admin verifies | advertiser + admin |
| 5 | monthly invoice -> Pay now from wallet -> balance and status right | advertiser |
| 6 | ask money back off an ad account -> admin approves -> wallet | advertiser + admin |
| 7 | affiliate: link, referral, commission, request a payout | affiliate |
| 8 | admin queues: verify, reject WITH a reason, everything logged | admin/owner |

**Anything not on one of those eight goes to
`docs/NEXT_SESSION_FIRST.md` and is NOT fixed before go-live.** Perks
and promotions, the reconciliation ledger, the GDPR export, bulk
top-up, precharge, Wise auto-matching and the standalone affiliate role
are all out of scope for day one unless the owner says otherwise.

**Sweeps are per JOURNEY, not per fault class.** That is the whole
difference: "every fault of kind X in the app" has no end condition,
but "everything wrong with the wallet top-up journey" does — it is the
files that journey touches and nothing else. So for each journey, run
three or four agents at once, each with a different lens (money
arithmetic, dead ends, loading/empty/error states, permissions), and
every one of them SCOPED to that journey's screens, actions, hooks and
RPCs. Then walk it, fix what they found, close it, move on.

### What a journey being "closed" means

Walked in the built-in browser, by Claude, on app.primescalemedia.com,
with a signed-in session for EACH role the journey needs — not read off
the code. Every figure it produces checked against the database to the
cent. The result written into `docs/NEXT_SESSION_FIRST.md`.

**Open every branch of a dialog, not just the happy path.** A modal
with a currency picker, a bank choice, a type or a set of steps gets
walked through EVERY option: pick each one, press Next, press Back,
and check what changed — the bank details, the minimum, the labels, the
figures. Only then do one of them for real. Half the faults in this app
live in the branch nobody opened. The wallet top-up dialog is four
transfer currencies times two wallets; the ad-account funding dialog,
the exchange dialog, the withdraw dialog, the invite form and the
verify/reject dialogs are all the same shape.

**Two browser tabs, two roles.** Tab one is the owner; tab two is the
test advertiser or affiliate. Without the second tab Claude can only
read, and reading is what did not work. Ask for the login once, by
name, and then drive the whole loop without asking again.

### How to run it

- **Work one journey at a time until it is closed.** Do not start the
  next one to avoid a hard step in this one.
- **Say immediately what could not be verified** and why. No
  "probably" — read the code or ask for one SQL query.
- **Migrations** are handed over paste-ready with ONE report table at
  the end (the SQL editor shows only the last result set) and NAMED
  dollar tags (`$blk0$`).
- **Numbers must agree at both ends** — screen against database, to the
  cent. A confident 0 over a failed read is a fault, not a zero.
- **Do not stop to ask permission to continue.** Ask only when the
  answer changes the work.
- **Report per journey**, not per round: closed / blocked on what /
  what is needed from the owner.

### The percentage

The headline is **journeys closed, out of 8**. Nothing else. Screens
opened, findings fixed and SQL checks are working notes, not the
number: three of them at 90% while no journey is closed still means no
customer can get through the app.

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
