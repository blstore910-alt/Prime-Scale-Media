# READ THIS FIRST — state of play, 2026-09-21

## THE NUMBER: 2 of 16 journeys closed (A2, A5).

| journey | state |
|---|---|
| A1 invite → signup → onboarding → dashboard | not started |
| **A2 wallet top-up** | **CLOSED.** €300 filed as PSM0005 after walking all four transfer currencies, verified as owner, balance 300.00 = sum of movements 300.00. Then €1,000 filed and rejected with a template reason — row Rejected, balance untouched, reason reached the bell |
| A3 ad-account request, €50 off the wallet | not started |
| A4 fund an ad account | walked, figures agree (€100 at 3% → €3 fee, €97 lands, €200 left, screen and server identical). NOT closed: design pass and the sweep's remaining findings |
| **A5 invoice → Pay now** | **CLOSED 2026-09-21.** Invoice 0005-124 (€5.00) paid from the wallet as PSM0005 in the pane. €200.00 → €195.00 on the customer screen AND on the owner's /wallets; statement row −€5.00 dated 21 Sep; invoice Paid; clock 20 Sep → 20 Oct on both sides. Reconciles: €305 credited − €110 spent = €195 |
| A6 … S3 | not started |

### 2026-09-21 — THE ONE THAT MATTERED

**A single unpaid invoice made the whole customer app unopenable.**

`invCurrency` was a `const` arrow function in `adv-app.tsx`, declared
twenty lines BELOW the `.reduce` in `unpaidSubByCurrency` that calls it.
A const is in its temporal dead zone until its own line runs, so the
call threw

    ReferenceError: Cannot access 'invCurrency' before initialization

and Next replaced the entire advertiser app with "Application error: a
client-side exception has occurred". Not the billing page — the WHOLE
app, because the views are CSS-toggled and all of them render.

It hid for days because **`.reduce` on an EMPTY array never calls its
callback.** Every advertiser with nothing outstanding was fine. PSM0005
got an open invoice from `PLAK-DIT-9` and could no longer sign in to
anything. `tsc` does not catch it: the reference is inside a callback,
so it cannot prove the callback runs immediately.

Fixed in `a4bd9c7`; the arithmetic then moved to `lib/pure-invoice-due.ts`
(`c5425ae`) where thirteen tests exercise the NON-empty path, which is
the only path that could ever have shown the fault.

`no-use-before-define` was tried and removed: sixteen hits, fifteen of
them the house pattern (a module-scope `CSS` const at the bottom of a
file, used from JSX — safe, the module has finished by then).

### 2026-09-21 — A5 sweep findings, FIXED

- The billing card showed the NEWEST open invoice. With two open, the
  customer saw yesterday's while last month's sat past due being dunned.
  Now oldest first, and the card says how many are open and the total
  per currency.
- `canExchangeToPay` asked only `other > 0`. €200 owed and one cent in
  USD rendered "Exchange to pay €200.00" — and because it is one button,
  that REMOVED the top-up route. Now the real rate, after the fee, via
  `lib/pure-exchange.ts`. An unread rate is not a "no".
- Whichever route is not primary now sits under it as a quiet link, so
  one control can never take the other away.
- The exchange dialog did not know what it had been opened for: an empty
  amount box under a button reading "Exchange to pay €5.00". It now
  takes `needAmount`/`needCurrency`/`needLabel`, prefills what lands
  after the fee (rounded UP), and shows whether the gap closes.
- "we'll take it from your wallet on the due date" printed directly
  above "Due date not set".
- A PAUSED plan gives `subscription = null`, so the card said "there is
  no plan on your account yet, so nothing is being charged" with a live
  Pay button below it. That branch now pays the open invoice.
- The View button is a `window.open` of the PDF route, so every refusal
  landed in a new tab as `{"error":"..."}`. Inline now gets a readable
  page, and the catch-all no longer leaks Supabase details.

### A5 — how it was walked

Owner in Chrome, PSM0005 in the built-in pane (one browser is one
Supabase session, so they cannot share one).

Both entry points opened the same confirmation with the same figures
(the card's "Pay €5.00 from wallet" and the invoice row's "Pay now"):
"Your EUR wallet €200.00 → €195.00", "Due 27 Sep 2026". "Go back"
changed nothing. Paying gave "Invoice paid from your wallet", the row
flipped to Paid and the Pay control disappeared.

Checked at both ends afterwards — customer screen, owner screen, and
the arithmetic:

| | |
|---|---|
| credited | €300 + €5 = €305 (matches "Wallet topups €305.00" on /users) |
| spent | €100 ad-account funding + €5 (0005-121) + €5 (0005-124) = €110 |
| balance | €195.00 on BOTH screens |
| clock | 20 Oct 2026 on both (period_start + 1 month) |

**NOT restored to 18 Oct**, contrary to what PLAK-9 promised. 20 Oct is
where the engine put it for the period that was actually paid; hand
-editing it back would bill the customer two days early over a date that
was computed correctly.

### Found and fixed while walking A5

- **"Renews 20 Sep 2026" on the 21st.** next_payment_date only moves
  when the invoice is PAID, so for up to the full seven days of grace
  the card printed a past date as something still to come. Now
  "Renewed … · invoice below", or "Due for renewal since …".
- **PRIME and Active on two lines** with a band of empty card between
  them. The pill was position:absolute in the corner; they are one
  statement and now share a row — which also removed the phone-width
  hack that pushed the name down to clear it.
- **The PDF said "Void" where every screen says "Cancelled".** An
  earlier pass fixed the pill colour and the "Nothing Due" line and left
  the word. Now one helper, customer wording, for both.
- **The auto-debit took money and said nothing.**
  `subscription_billing_run` only notifies on FAILURE
  (`subscription_past_due`); on success it counts and moves on. The fix
  is in the trigger on `invoices.status='paid'`, because that is the one
  place both routes pass — "Pay now" and the due-date collection.
  `PLAK-DIT-13` **needs pasting**; the app half is live.
- **Owner /subscriptions on a phone:** the status dots ran into the
  words beside them (a 1-line clamp on `.phead p` beat
  `.subcounts{display:flex}`), and the billing period ran under the
  Status badge (`white-space:nowrap` in a 160px card cell).

### Still OPEN

- **`PLAK-DIT-13-MELDING-BIJ-INCASSO.sql` needs pasting.** Until then no
  invoice payment notifies the customer, by either route.
- **`READONLY_SQL=on` is not set in Vercel**, so `/api/dev/ro` still
  refuses and every figure check still costs the owner a paste. The role
  itself is in place and proven: `_ro` is owned by `psm_readonly`,
  bypassrls is on, and it counted 9 wallets against 9 actual.
- PLAK-11b's write probe proved nothing: `42601 syntax error at or near
  "from"` came from the wrapper's own grammar (a DELETE cannot be a
  subquery), not from permissions. The write path IS closed — no write
  grants at all, plus the read-only transaction — but retest it through
  the endpoint with a writing CTE, which a subquery does allow.
- Two "Top-up Completed / Your top-up has been verified successfully."
  notifications sit side by side in PSM0005's bell with identical text,
  so the customer cannot tell which top-up each is about. Not on A5.
- `wallet_exchange`'s body is not in this repo, so nothing here can say
  whether its 0.6% fee comes off the FROM side or the TO side. The
  dialog's own preview is what the customer decides on, and it is
  internally consistent — but "exactly enough" is only proven against
  the screen, not the server. **Ask for the body.**
- Permissions findings from the sweep, unfixed:
  `grant_advertiser_perk`/`revoke_advertiser_perk` are admin-only with
  no `is_active`, no owner check and no 0–100 clamp; `invoices` and
  `subscriptions` are fully writable by any active admin through
  PostgREST; `_money_columns_are_the_owners` is UPDATE-only so INSERT
  walks past it; `createInvoiceAsAdmin` validates the parties but not
  the money.
- `PLAK-DIT-11B-LEESROL.sql` and `PLAK-DIT-12-KORTING-BIJ-WIJZIGING.sql`
  are sent and not yet confirmed applied.

---

# READ THIS FIRST — state of play, 2026-09-20 (evening)

This file is the handover. A new Claude session — same account or a
different one — starts with no memory of the last one; this file, the
repo, `CLAUDE.md` and the SQL under `supabase/checks/` are everything
that carries over. Keep it current: it is cheaper than re-deriving.

---

## 1. Where production is

`main == feat/redesign-advertiser`. Deploy is
`git push origin feat/redesign-advertiser:main` — straight to
app.primescalemedia.com, no staging.

Verify after every push:

```bash
curl -s https://app.primescalemedia.com/api/version
```

It returns the deployed short SHA. Gated routes answer 307,
`/auth/login` answers 200. All owner screens were walked by hand this
evening and every one of them rendered WITH DATA (see §5).

**The owner's session is signed in as the tenant OWNER in the built-in
browser pane.** That is what makes track A walkable — do not waste it.
If the pane is empty, ask for one login rather than guessing.

---

## 2. SQL that is APPLIED (confirmed by its own report table)

Everything below is on the live database. Do not re-derive, do not
re-paste unless a report says otherwise. All are idempotent.

| script | what it did |
|---|---|
| `20260920260000_one_click_one_charge` | twin-insert guards (90s) on ad_account_requests, wallet_precharges, wallet_refunds, wallet_adjustments. 0 historic twins |
| `20260920270000_switched_off_means_switched_off` | `_psm_admin_of` now tests is_active/status; one-profile-per-tenant trigger |
| `20260920290000_views_read_as_the_caller` | `security_invoker = on` on referral_commissions_with_details, referral_links_with_details, top_ups_view; revoked change_subscription_amount and wise_confirm_suggestion from `authenticated`; one-billable-plan index |
| `20260920300000_the_price_gate_actually_closed` | `_fee_is_the_owners()` on ad_accounts INSERT **and** UPDATE, reading OLD on update. 0 of 8 accounts mispriced |
| `20260920310000_a_type_is_a_price_too` | ad_account_types: read for every admin, write for the owner |
| `checks/PLAK-DIT-NU-20260920.sql` | **A** exchange_rates/plans/fee_defaults read-admin/write-owner + money-column trigger on subscriptions and referral_links · **B** `wallet_admin_adjust` is owner-only (by rewriting its OWN definition) · **C** dropped the second invoice-paid trigger · **D** withdrawal ceiling trigger · **E** notifications delete policy + column lock |
| `checks/PLAK-DIT-2-INCASSO.sql` | `subscription_billing_run`: a VOID invoice no longer blocks its month for ever. Added `payload` to the notifications column lock (that is the column name here, not `metadata`) |
| `checks/PLAK-DIT-3B-DE-FEE.sql` | `top_ups.fee` widened to numeric(6,3) (top_ups_view dropped + recreated with security_invoker); new `_effective_topup_fee_pct()`; `top_up_create_for_advertiser` now uses it |

**Nothing is pending.** If a new migration is written, hand it over
paste-ready with one report table at the end — the SQL editor shows
only the last result set — and use NAMED dollar tags (`$blk0$`).

---

## 3. Live function bodies I had to ask for (they are NOT in this repo)

The live database is hand-authored and out of step with
`supabase/migrations/`. Replacing a live RPC from the repo has taken
production down once. These bodies were read off the database this
evening; treat them as the truth until re-read.

- **`subscription_billing_run`** — the clock (`next_payment_date`)
  moves **only on payment**, via `_on_subscription_invoice_paid`, which
  sets it to `period_start + 1 month`. So while a month is unpaid, that
  month stays the current period and no new invoice is raised. That is
  a consequence of the design, not a bug — but see the open question in
  §6.
- **`top_up_create_for_advertiser`** — now calls
  `_effective_topup_fee_pct`. It does **not** enforce
  `ad_accounts.min_topup` (nothing does), which is why the `?? 300`
  floor was removed from the client.
- **`wallet_exchange`** — 0.6% of the GROSS destination amount, fee off
  the destination. Ownership is re-derived from `auth.uid()`. Correct.
- **`top_up_admin_reject`** — admin of the row's tenant, is_active and
  status checked, refuses anything not `pending`. Correct.
- **`invoice_pay_from_wallet`** — refuses `void`, allows the invoice's
  own advertiser or an active admin of its tenant, debits
  `invoices.total` in `invoices.currency`. Correct.
- **`handle_invoice_payment_update`** — inert (reads
  `items->0->>'subscription_id'`, which nothing writes) and its trigger
  has been dropped.

---

## 4. What was fixed today (about 8 pushes)

Grouped by what it would have cost.

**Money that could leave wrong**
- `wallet_admin_adjust` was callable straight from devtools by any
  employee admin, on any wallet, for any amount. Now a server action
  with an owner check, a tenant compare on the re-read row, a refusal
  when the balance moved, and no negative result — plus the SQL guard.
- `top_up_create_for_advertiser` charged `round(ad_accounts.fee)` and
  nothing else, while the dialog quoted perks, the Meta-EU-Premium two
  points, the plan rate and decimals. Latent today (0 perks, 0 premium
  accounts) — closed before the first waiver is granted.
- `rematchWiseDeposits` read pending claims unpaged, so a claim past
  PostgREST's silent 1,000-row cap looked *withdrawn* and the sweep
  un-matched a correct deposit.
- `syncSupplierPool` read the mirror unpaged and unordered, so rows
  past the cap were announced as new every 15 minutes **and** had their
  stored `fee_percentage` blanked by the upsert.
- A voided subscription invoice blocked its month for ever.

**Refusals that said nothing**
- `/withdrawals` Reject never collected a reason, so every refusal
  reached the customer as "no" with nothing after it. Now a reason box
  with templates, on withdrawals, refunds and adjustments.
- `top_up_admin_reject` went straight from the browser while verify
  went through a server action — no maintenance freeze, no tenant
  compare, no is-it-still-pending re-read.

**Doors**
- `/my-invites` and `/invite/list` served the whole tenant's
  invitations — **including `token`** — to any admin, in a client
  component's payload. Now: your own email, seven columns, no token,
  pending and unexpired only.
- `POST /api/send-invite` was admin-level behind an owner-only button.
- `cancelInvitation` was owner-checked only for admin-role invites.
- `approveAffiliate` / `rejectAffiliate` / `updateAffiliate` were
  admin-level on an owner-only screen.
- `listBankAccounts` returned beneficiary and account numbers at admin
  level.
- `GET /api/stats/batch` had no guard of its own and turned each
  delegate's 403 into HTTP 200.
- `/accounts` read "am I an admin" from ANY of the caller's profiles.

**Confident zeros** (the owner's rule: a confident 0 over a failed read
is a fault)
- wallet balance on the ad-account funding form, the whole Affiliate
  tab on the advertiser shell (`isLoading` was tested nowhere), "— of
  0" on the affiliate shell, "Funded to date" vanishing on error,
  "Available: EUR 0.00" under a red error panel.
- "Old read notifications cleaned" over a delete that RLS matched zero
  rows for — `notifications` had no DELETE policy at all.

**Regressions from the same evening, caught by an adversarial pass**
- `role="button"` on the ad-account card made "Top up" unreachable by
  keyboard.
- The "we have no reference — do NOT send the money yet" panel had a
  live "I have made the transfer" button three lines under it.
- Adding `clearTimeout` to the top-up dialog's close-reset also
  cancelled it on a reopen, so the dialog came back on the confirmation
  step with the previous currency's bank details and slip attached.
- My own `20260920310000` broke `ensureInitialAdAccountTypes` on a new
  tenant (the seed runs as the cookie-scoped client). Both seeds now
  write as the service role.

---

## 5. Journeys — the only number that counts

The headline is journeys closed, out of 16 (see CLAUDE.md for the list).
Screens opened and findings fixed are working notes.

**Closed: 1 of 16 — A2. In progress: A4 (numbers not yet checked
against SQL directly). A5 under way.**

### A2 — wallet top-up — **CLOSED 2026-09-20**, both roles

Filed EUR 300 as PSM0005 in the browser pane, verified it as the owner
in Chrome. Every step matched:

| | |
|---|---|
| dialog, all four transfer currencies | EUR 300 / USD 344 / GBP 258 minimum, right bank details per currency |
| reference | `0005-0176936715`, on the claim and on the queue card |
| customer, before verify | "EUR 300.00 awaiting verification", pending row in the activity table |
| admin queue | PSM0005, EUR 300.00, "No bank deposit matched this yet" |
| after verify | wallet EUR 300.00, activity row "Credited", queue empty |
| **against SQL** | balance 300.00, sum of every movement 300.00, `approved_by` set. **To the cent.** |

Both halves walked. The refusal: EUR 1,000 filed, refused with the
"No payment found" template, the customer's row reads Rejected, the
balance is untouched, and the reason reaches their bell in full.

**What closing it took:** a customer could read exactly ONE
notification type. `notifications` carried "User can do ALL on topup
completed" (that type only) and "Admin can do ALL" (everything else,
but only for `tenants.owner_id`). So every notification this app has
ever written to a customer was invisible to them — 17 unread at the
moment it was fixed: 6 subscription invoices, 7 subscription changes,
2 past-due warnings, 2 refusals. It went unnoticed because
topup_completed works, so the bell looked alive.
See `checks/PLAK-DIT-7-MELDINGEN-ZICHTBAAR.sql`.

### A4 — fund an ad account (walked 2026-09-20, both roles)

EUR 100 at 3% onto AA-PSM0005-EU-01. The customer's dialog and the
server agreed exactly: EUR 100 out, EUR 3 fee, EUR 97 on the account,
EUR 200 left. Verified through the new checklist; the card reads
Completed.

**Found and fixed while walking it:** the queue printed `$97.00` for
EUR 97 on a euro account; the customer's dialog headlined a dollar
conversion; every card in the queue was headed with the literal word
"Advertiser"; the statement booked the funding twice (movement +
receipt invoice); the customer was notified twice (a live trigger plus
the server action).

**Still open on A4:** the fixes above need one more look on production
after the deploy, and the numbers have not been checked against SQL.

### Two roles at once

The built-in browser pane and Chrome have SEPARATE cookie jars; two
tabs in one pane do NOT. Pane = the customer, Chrome = the owner. That
is what makes any of this walkable; ask for the Chrome login once.

## 6. Open questions for the owner — these change the work

1. **Clawback on an ad-account withdrawal.** An ad-account withdrawal
   moves money to the customer's own wallet; nothing leaves PSM. The
   clawback fires anyway, and it measures the share as
   `withdrawal / lifetime ad-account funding` while the commission it
   claws back was earned on **wallet top-ups**. So a customer who
   funded EUR 100,000 into their wallet, pushed USD 1,000 onto one ad
   account and pulled it back gives share = 1.0 and wipes the
   affiliate's entire lifetime commission. Either the clawback belongs
   on a real refund out of the wallet, or the denominator has to be the
   same base the commission was earned on. Not fixed — it needs the
   owner's rule first.
2. **An unpaid month stops billing.** See §3. Does a customer who
   misses October get a November invoice (debt accumulates) or not
   (billing pauses until they pay)? Changing it means the generator has
   to move the clock, and then `_on_subscription_invoice_paid` must
   stop moving it.
3. **The standalone `affiliate` role is inert end to end.**
   `ensure_advertiser_and_wallet` returns NULL for any role that is not
   `advertiser`, so an affiliate-role profile has no `advertisers` row
   — and `referral_links` keys both sides on `advertisers.id`. Result:
   no referral link (the screen literally says "Your link isn't set up
   yet"), four dead share buttons, and `affiliate_referral_stats`
   returning zero rows with no error, so the portal prints Referred 0 /
   Commission EUR 0.00 / tier Starter and then says "Share your link to
   start earning". The invite form offers "Affiliate", so every person
   invited that way lands here. Fixing it means giving affiliates an
   `advertisers` row **and** filtering them out of the ~10 advertiser
   pickers, or removing "Affiliate" from the invite form. Owner's call.

---

## 7. Biggest findings still OPEN (ranked)

Raised by the agent sweeps, verified in code, not yet fixed.

1. **Clawback arithmetic** — see §6.1. Also: `affiliate_referral_stats`
   subtracts LIFETIME clawbacks from DATE-FILTERED earnings, so "This
   month €0.00" appears for a month with real earnings.
2. **`/subscriptions` search box is never sent to the query** — it
   filters the 20 rows on screen while the pager still says "Page 1 of
   7". The owner concludes there is no plan, creates a second
   subscription, and `createSubscriptionAsAdmin` only blocks a
   duplicate when the existing row is active/past_due — a `paused` one
   lets it through. Two subscriptions, two invoices a month, two
   auto-debits from one wallet.
3. **`/settings/plans` and `/settings/ad-account-types` throw away
   unsaved edits on any refetch** (`useEffect(() => setRows(initial),
   [initial])`). Reproducible without leaving the screen. This is where
   customer prices are set.
4. **`/admins` — the row button, the dialog and the server use three
   different predicates.** A row with `status NULL, is_active true`
   shows "Deactivate", the dialog says "Give access back", and the
   server leaves the admin active while the toast says "Admin
   activated."
5. **`/users` Details → Status "Active" writes immediately**, with no
   confirmation, and reactivates a dormant subscription (restarting a
   monthly charge). The same action on the row asks first. The
   deactivate dialog also states the opposite of what the server does.
6. **Unpaged reads that produce a wrong figure**:
   `use-affiliate-earnings` (the column the owner pays affiliates
   from), `precharge-panel` (outstanding advances), `gdpr-actions`
   (a short Article-15 export), `commissions-table` (clawback banner),
   `withdraw-dialog` (the customer's own ceiling), `app/api/stats`
   (active advertisers). And `app/api/stats/wallet` passes up to 50,000
   uuids into a single `.in()`, which blows PostgREST's request-line
   limit at roughly 220 wallets.
7. **`bulk-ad-accounts-topup-dialog` swallows a refused fee quote** and
   falls back to `account.fee ?? 0` with Submit still live; `eur_value`
   and `eur_topup` are stored as sent while the USD columns are
   recomputed server-side, so one row can read $1,104.65 and €1,000.00
   side by side.
8. **`account-form.tsx` states "N% gets charged on this account's
   top-ups"** from the typed number alone, while the server applies
   perks and the premium points to it.
9. **`invite-form.tsx` has no `isError` anywhere** — a failed plan read
   renders an empty picker and the invite goes out with no plan and no
   referrer, silently.
10. **`ifUpdatedAt` accepted but never passed** at ~12 call sites,
    including `setAdvertiserCommission`, `changeSubscriptionAmount` and
    `toggleAdminStatus`. `versionMatches(x, undefined)` returns true,
    so those writes are blind overwrites.
11. **No customer can change their own name, email or phone** —
    `/profile` is the only mount of `ProfileForm` and
    `redirectCustomersToTheirShell` bounces every customer off it.
12. **`/auth/error` answers the most common failure** ("Email link is
    invalid or has expired") **with "An unspecified error occurred."**
13. **`mailto:` links are the only support and payout channel** — and
    this repo already documents that `location.href = "mailto:"` does
    nothing on a machine with no mail client. Includes the affiliate's
    "Request payout".
14. **A pending ad-account withdrawal vanishes after you request it**
    — the wallet activity query filters `.eq("status","approved")`.
15. **`MAINTENANCE_MODE` does not freeze any SQL money RPC.** It is a
    TypeScript env check in the server-action path only.
16. **Cross-tenant, small but real**: `rate_limit_buckets` and
    `audit_events_monthly_stats` are guarded by `_is_active_owner()`,
    which proves "owns *some* tenant"; `invitations.affiliate_id` is
    not tenant-verified on `/api/send-invite` while `plan_id` one
    hundred lines below is.

---

## 8. How to work here

Read `CLAUDE.md` — it is short and it is the contract. The parts people
forget:

- **Verify by exit code.** `npx tsc --noEmit && npx next lint
  --max-warnings 0 && npm test`, chained with `&&`. Piping `npm test`
  into `tail` or `grep` masks the failure — that happened tonight.
- **`npm run build` does not work locally** (no `.env.local`).
- **PostgREST negation is `column.not.operator.value`**, not
  `not.column.operator.value`. The wrong form 400s on the customer's
  screen and does not fail the build.
- **A CSS file here is a TS template literal**: a backtick inside a CSS
  comment ends the literal.
- **`maybeSingle()` returns null without an error** for a missing row
  AND for one RLS refused.
- **An UPDATE that matches nothing is not an error** — use
  `wroteSomething()`.
- Keep 4–6 read-only agents running, one fault class each. Findings get
  FIXED, not filed.
