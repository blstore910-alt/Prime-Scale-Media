# Do this first, next session

Work that is understood, scoped and ready to execute — parked only because
something more urgent was in front of it. Start here rather than re-deriving
it.

---

## 0. State as of 2026-09-20, end of the night sweep

Fifty commits went straight to production and every one was verified to
render afterwards. Six read-only agents swept in parallel; about 60 of
~130 confirmed findings are fixed. **What is left is written down below
rather than left in a transcript.**

### 0a. SQL that is waiting for a person

Migrations are pasted by hand, so these are not applied until somebody
does it. Two files, both with a report table:

- **`supabase/checks/PLAK-DIT-NU.sql`** — three migrations in order:
  the deposit-tenant guard (a no-op as things stand), the clawback
  measuring against lifetime earnings again, and the columns that let an
  ad-account request fee appear on a customer's statement.
- **`supabase/checks/WAT-STAAT-ER-LIVE.sql`** — fifteen yes/no answers
  that close most of the remaining "I cannot tell from the repo" items,
  including whether one customer can hold two billable subscriptions.

### 0b. Two questions only the owner can answer

1. **Where does `PSM1996` come from?** 258 real bank deposits worth
   €499,399 sit `unmatched`, every one carrying a reference of the form
   `PSM` + four digits. The app generates `0005-6164655424` and nothing
   in the repo produces the other shape. Until that is answered, the
   matcher cannot be extended and the deposit desk is manual.
2. **The mock accounts in the production pool** — allocatable to a real
   customer today.

### 0c. Read these before touching the walkthrough

- **`docs/WALKTHROUGH_CORRECTIONS.md`** — the walkthrough is 53 commits
  stale and four of its steps are wrong in ways that move money.
- **`docs/UNREACHABLE.md`** — a transitive reachability walk counts **47**
  dead components, not 31. A real fee-display fault was found in one and
  deliberately not fixed.
- **`docs/ROUTE_MAP.md`** — regenerated, with guards collected from
  layouts as well as pages.

---

## 1. Known-open findings, in the order I would take them

Each was verified by reading the code. None is fixed.

### 1a. Money

| what | where | why it is parked |
|---|---|---|
| **A USD subscription is debited in euros, 1:1** | the live billing engine sets no `currency`, so every subscription invoice carries NULL and `invoice_pay_from_wallet` coalesces to EUR | Needs the live `subscription_billing_run()` body read out before replacing it. A $500 plan takes €500 — about $81 a month too much, recurring |
| **`wallet_admin_adjust` moves money with no line on any customer screen** | live-only function; writes to `audit_events` and nothing else | Needs a decision: a `wallet_adjustments` row, or a ledger |
| **Any admin can raise the top-up fee at verification, with no ceiling** | `actions/topup-actions.ts:1020` says so explicitly | A product decision: cap it, or require the owner |
| **An unpaid `subscription_adjustment` may stop monthly invoicing for ever** | depends on whether the live duplicate guard filters by `type` | One SQL settles it — it is in `WAT-STAAT-ER-LIVE.sql` |
| **A partial payment cannot be credited at all** | tolerance is one cent everywhere; an intermediary bank taking €12 off €630 leaves a deposit nothing can match | `adjustWalletTopupAmount` is written in `actions/wise-actions.ts` and has **no UI yet** — that is the next thing to build |
| **The Meta-EU-Premium 2-point discount may be dead** | the money path compares the slug exactly to `eu-meta-premium`; the settings screen slugifies from the label and would give `meta-eu-premium` | `select slug, label from ad_account_types;` decides it |

### 1b. Things that are open by design and should be written down

- **No wallet ledger.** Seventeen functions write `wallets.eur_balance`
  / `usd_balance`; the customer's statement can see six of them and the
  financial report thirteen. `/reconciliation` sees **one**. A genuine
  difference and a blind spot look identical there, and its subtitle
  says "Banks against wallets", which is not what it does.
- **An integration job that throws is retried for ever.** The catch puts
  it back to `pending` with a backoff and never consults `max_attempts`.
  There is no dead-letter state.
- **A supplier reply of 200 with an empty body is recorded as success.**
  `mapMovementStatus(undefined)` returns `queued`, the job is stamped
  succeeded with an empty external id, and nothing compares our figure to
  theirs.
- **`MAINTENANCE_MODE` does not freeze the Wise webhook**, which runs on
  the service role. `FREEZE-MONEY.sql` cannot close it either, and its
  revoke list omits `ad_account_request_create_paid` — a €50 wallet debit
  that still works during a freeze.
- **"Yearly % off" on `/settings/plans` writes a column nothing reads.**
  The screen says it "turns on a yearly term"; the migration's own header
  says applying it alone changes nothing.
- **`/settings/banks` is inert** — the IBANs customers actually wire to
  come from `lib/bank-beneficiaries.ts`, which makes no database read.
  The card discloses it; the walkthrough does not.
- **`/settings/integrations` shows a green "Connected" in mock mode.**
  The action that actually answers "is Wise on" is rendered on
  `/wallet-topups`, not there.

### 1c. Small, mechanical, and each worth ten minutes

- `/accounts` for an advertiser renders a **blank page** before a
  client-side redirect, and lands on Dashboard rather than
  `?view=accounts`. `/my-referrals` already solved this server-side.
- `/my-invites`, `/invite/list`, `/organization/new` and `/onboard` sit
  **outside the `(app)` group**, so they get no role check, no inactive
  check and no shell. Each is a dead end reachable by URL by any role.
- The **affiliate app reads no `?view=` at all**, so Help, Notifications
  and Profile all land on My Referrals. Three views are unreachable by
  link.
- `/account-pool` has no entry in the topbar `TITLES` map, so it reads
  **"Dashboard"**.
- An employee admin has a **New invite** button on the dashboard with no
  `isSuperAdmin` gate, while `/invites` is owner-only and hidden from
  their sidebar — so they can send an invitation they can then never
  see, cancel or resend.

---

## 2. Two lessons from tonight, written down because they each cost an hour

**A heuristic that picks between a production tenant and a test tenant
picks whichever ran more tests.** A migration chose the deposit tenant by
"who has taken the most money, measured by wallet_topups" — and the e2e
tenant had more, because e2e runs create top-ups and real customers do
not. It stamped 257 real deposits onto the test tenant. Measuring by
activity is exactly backwards for telling those two apart.

**Read the live policy or function before replacing it.** An inline
`exists (select 1 from advertisers …)` inside a `referral_links` policy
produced infinite recursion, because `advertisers`' own policy reads
`referral_links`. Every screen in the app died. The repo's copy of a
policy is not evidence about live.

---

## 3. Done and verified, so do not redo it

- **The silent-write sweep (2026-09-17).** All 18 sites now
  `.select("id")` and count rows through `wroteSomething()`.
- **Three SECURITY DEFINER RPCs closed to `authenticated`** —
  `ensure_advertiser_and_wallet`, `create_subscription_from_invite`,
  `subscription_resume_skips_paused_months`. Confirmed on live.
- **The audit log is readable again** — 983 rows, verified on the screen.
- **244 bank deposits moved off the test tenant** and the policy no
  longer says "any tenant owner".
- **The top-up columns reconcile** — `amount_usd = fee_amount +
  topup_amount` now holds, with a test that walks 6,500 amounts.
