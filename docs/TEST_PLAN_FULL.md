# PSM full test plan

Written 2026-09-15. Covers every screen, every button and every cross-role
journey in the app as it stands today: 33 routes, 87 mutation actions, 27
money RPCs.

`docs/TEST_PLAN.md` is the older, narrower suite. This one replaces it for
the go-live pass.

---

## 0. Ground rules — read this before touching anything

**app.primescalemedia.com is production.** There is no preview environment.
Every deploy goes straight there. So a test that sends an invitation sends a
real email, a test ad account is a real row a real advertiser can see, and a
test top-up moves real money.

Every step below is tagged with who runs it:

| tag | meaning |
|---|---|
| **A** | Claude runs it alone. Read-only, or reversible with no outside effect. |
| **B** | Claude runs it and cleans up after. Creates rows; no email leaves, no money moves. |
| **C** | **You** run it. Email leaves the building, money moves, or it cannot be undone. |
| **D** | Nobody runs it on production. Needs a scratch tenant. |

Two standing constraints that override anything below:

1. **The auto-push gate stays shut.** `SUPPLIER1_AUTOPUSH` must not be armed
   during testing. Every step that would push money to the supplier is
   written to assume the gate is shut and to *verify that nothing was sent*.
2. **The supplier is never named to a customer.** Any screen reached as an
   advertiser or affiliate fails this plan if the word SeamX, a supplier
   account id, a cost or a margin appears anywhere in it — including in the
   JSON behind the page, not just in what renders.

### Cleaning up

Anything created under **B** is removed in the same session. If a step cannot
be undone through the UI, it is not a **B**, it is a **C** or a **D**.

---

## 1. The button contract

This is the spine of the plan. Every interactive control in the app is
checked against the same four questions, and a control that fails any of them
is a defect regardless of what it does:

1. **Does it fire?** Something observable happens. A control that looks
   clickable and does nothing is worse than no control.
2. **Does it hold?** While the work is in flight it is disabled or clearly
   busy. Clicking twice must not do the thing twice. On a money path this is
   not a nicety — it is a double charge.
3. **Does it change?** After success the screen reflects the new state
   without a manual reload. If the row still looks the same, the user clicks
   again.
4. **Does it admit failure?** On error there is a message naming what went
   wrong. A failed action must never look like a successful one.

Record each control as PASS or the number of the question it failed.

---

## 2. Per screen — admin and super-admin

Each row: what to do, and what must be true afterwards.

### 2.1 Dashboard `/dashboard`

| # | tag | step | expected |
|---|---|---|---|
| D1 | A | Load the page | Header on ONE row: title, one-line subtitle, New invite. No horizontal scroll at 375px. |
| D2 | A | Read the queue cards | Every queue with a count shows a number, including 0. A queue whose count could not be read shows `—`, never a 0 and never a missing badge. |
| D3 | A | Kill the network, reload | Banner says the queues could not be loaded, and does NOT say "You're all caught up". |
| D4 | A | Restore network | Banner recovers without a manual reload within 60s. |
| D5 | A | Profit & activity | Figures load from ONE `/api/stats/batch` request. Check the network panel: no `/api/stats/topups`, `/subscriptions`, etc. |
| D6 | A | Change the period | Cards refetch together, still one request. |
| D7 | C | New invite → send | See journey J1. Sends a real email. |

### 2.2 Advertisers `/users`

| # | tag | step | expected |
|---|---|---|---|
| U1 | A | Load | Header 48px, filter bar one row, list cells show FIRST name only. |
| U2 | A | Sort & filter → each sort | Order actually changes. Numeric sorts sort numerically (9% below 10%, not above). |
| U3 | A | Apply a filter, close the panel | Button shows a count badge. A narrowed list can never look unfiltered. |
| U4 | A | Reset | Count clears, full list returns. |
| U5 | A | Search then page 3, then change the filter | Page resets to 1. You can never land on a page that does not exist. |
| U6 | A | Details | Sheet opens; company details and email are click-to-copy. |
| U7 | A | Details → check the JSON | No `commission_*` fields reach the browser for a non-admin. (Admin may see them; that is the point of the screen.) |
| U8 | B | Commission setup → save → reopen | Value persisted. Revert it afterwards. |
| U9 | B | Deactivate → reactivate | Status flips both ways; the row updates without reload. |
| U10 | A | Download CSV | File downloads, opens, columns match the screen. No supplier or cost column. |

### 2.3 Ad Accounts `/accounts`

| # | tag | step | expected |
|---|---|---|---|
| A1 | A | Load | Two-up record cards. Roughly 220px per account, not 430. |
| A2 | A | Sort by fee, both directions | Numeric order. |
| A3 | A | Click the Fee cell | An input appears, Save/Cancel appear in the actions cell. |
| A4 | B | Change the fee → Save | Value persists; reopen to confirm. Set it back. |
| A5 | A | Click Fee → Escape | Reverts, leaves edit mode. |
| A6 | A | Row actions | Exactly two, equal width, one row: Edit and View. |
| A7 | A | View → Set topup limit | Present in the sheet for admins, absent for advertisers. |
| A8 | B | Create New → double-click Submit | ONE account created, not two. The button disables on the first click. |
| A9 | A | Delete the test account | Gone from the list without reload. |
| A10 | A | Details → Top-up History | "Topup Amount (USD)" is labelled USD and shows `$`. The Amount Paid column shows the payment currency. |
| A11 | A | Break the top-ups query, reopen | Says the history could not be loaded — NOT "No Topups yet". |

### 2.4 Account Pool `/account-pool`

| # | tag | step | expected |
|---|---|---|---|
| P1 | A | Load | Defaults to Unassigned. The filter button counts anything else as narrowing. |
| P2 | A | Source filter | Works. (Supplier names are fine here — admin-only screen.) |
| P3 | B | Allocate one to an advertiser | Ad account created. **Then check as that advertiser that `ad_accounts.metadata` carries NO `source`, `supplier_external_id` or `allocated_from_pool_id`.** |
| P4 | A | Reconciliation → supplier fee | Recorded in `ad_account_costs`, never on the ad account row. |
| P5 | B | Release an inactive allocation | Returns to the pool. |
| P6 | A | Release an ACTIVE allocation | **Refused**, with a reason. |
| P7 | A | Sync | Runs, reports counts, does not duplicate rows on a second run. |

### 2.5 Account Requests `/ad-account-requests`

| # | tag | step | expected |
|---|---|---|---|
| R1 | A | Load, filter each status | Counts match the list. |
| R2 | B | Move one to In progress | Status changes, advertiser sees it. |
| R3 | B | Approve | Ad account appears for the advertiser. |
| R4 | B | Reject with a reason | Reason reaches the advertiser. |
| R5 | A | Approve twice fast | Second click blocked; no duplicate account. |

### 2.6 Wallet Topups `/wallet-topups`

| # | tag | step | expected |
|---|---|---|---|
| W1 | A | Load | Opens on Pending. Filter button counts anything else as narrowing; Reset returns to Pending. |
| W2 | A | Open one | Slip viewable; amounts in the paid currency. |
| W3 | C | Verify a real pending top-up | Wallet credited EXACTLY once. Re-verify must not credit again. |
| W4 | C | Precharge, then verify | Settles; balance does not double. |
| W5 | A | Reject | Reason recorded; no credit. |
| W6 | A | Break the query | "Couldn't load" — not an empty queue. |

### 2.7 Ad-account Topups `/top-ups`

| # | tag | step | expected |
|---|---|---|---|
| T1 | A | Load and filter | As above. |
| T2 | C | Verify one | **With the gate shut**: check `integration_jobs` — NO `push_topup` row is created, or it is created and held. Nothing reaches the supplier. |
| T3 | A | Check the figures | `topup_amount` is USD and labelled USD. `fee_amount` matches the fee percentage. |
| T4 | A | Edit a completed top-up | Guarded; re-saving does not re-fund. |

### 2.8 Wallets `/wallets`

| # | tag | step | expected |
|---|---|---|---|
| L1 | A | Load | Three row actions on ONE line, equal width. |
| L2 | A | Edit balance | Visible to super-admin only. |
| L3 | C | Adjust a balance | Change is exact, and appears in `audit_events`. |
| L4 | B | Set minimum topup | Persists; the advertiser sees the floor enforced. |
| L5 | A | Details | Transactions listed; a failed read says so. |

### 2.9 Invoices `/invoices`

| # | tag | step | expected |
|---|---|---|---|
| I1 | A | Load | Header one row. |
| I2 | A | Download a PDF | Opens, correct figures, correct issuer. |
| I3 | **A — security** | As advertiser A, request advertiser B's invoice PDF by UUID | **404.** This was open until today. |
| I4 | A | Mark a PAID subscription invoice unpaid | **Refused**, with the reason. |
| I5 | A | Same for a `subscription_adjustment` | **Also refused.** This was the gap. |
| I6 | B | Create an invoice | Appears; delete afterwards. |

### 2.10 Subscriptions `/subscriptions`

| # | tag | step | expected |
|---|---|---|---|
| S1 | A | Load | Row actions on one line. Date filter lives inside the filter panel. |
| S2 | A | Price shown | Matches the plan currency. A USD plan does not say €. |
| S3 | **C — money** | Lower a price (100 → 60) | Wallet credited 40 once. |
| S4 | **C — money** | Raise it back (60 → 100), then lower again | **Wallet must NOT be credited a second time.** This was unbounded until today. |
| S5 | A | Check `wallet_adjustments` | One row per payout, referenced to the invoice. |
| S6 | B | Pause / Resume / Disable / Enable | Each flips state and the row updates. |

### 2.11 Withdrawals `/withdrawals`

| # | tag | step | expected |
|---|---|---|---|
| H1 | A | All three sections | Each shows its own empty/error state. A failed read never says "No requests yet". |
| H2 | C | Approve a withdrawal | Balance moves once. |
| H3 | A | Reject | Reason recorded. |

### 2.12 Promotions `/promotions`

| # | tag | step | expected |
|---|---|---|---|
| M1 | A | Grant a discount with a BLANK amount | **Refused.** It used to grant 0% and say "Perk granted." |
| M2 | A | Grant > 100% | Refused. |
| M3 | B | Grant a real perk | Advertiser's fee preview reflects it immediately. |
| M4 | B | Revoke it | Preview returns to the plan fee. |

### 2.13 Owner-only surfaces

| # | tag | step | expected |
|---|---|---|---|
| O1 | A | `/reconciliation` as a PLAIN admin | Redirected away. |
| O2 | **A — security** | As a plain admin, from devtools: `supabase.from('bank_accounts').update({account_no:'X'})` | **Refused by RLS.** This was open until today. |
| O3 | **A — security** | Same against `bank_ledger_entries` | **Refused.** |
| O4 | A | Reconciliation totals | With > 1000 top-ups the figures must not truncate. Compare to a SQL `sum()`. |
| O5 | A | `/settings/finance` — all six tabs | Each loads, saves, and reloads with the saved value. |
| O6 | A | Save exchange rates TWICE | Exactly one row stays `is_active`. Then confirm the top-up calculator still works — this broke every conversion until today. |
| O7 | A | `/audit`, `/activity-logs` | Paginate; entries readable; no PII leak in the payloads. |
| O8 | A | `/admins` | Deactivating an admin actually locks them out. |

---

## 3. Cross-role journeys

These are what the per-screen checks cannot catch: state handed from one role
to another.

### J1 — Invitation to first login  *(tag C for the send, A for the rest)*

1. Admin invites an advertiser, setting the plan at invite time: monthly fee,
   included accounts, top-up fee, referrer, community.
2. Email arrives. Link works. Expired/duplicate links refuse.
3. Signup creates the profile, the advertiser row, the wallet and the
   subscription.
4. **A user who already has a profile in another tenant must not be locked
   out.** They get two `user_profiles` rows — the onboarding page must handle
   that instead of redirect-looping. This was a hard lockout until today.
5. Advertiser lands on onboarding, completes the company, reaches the
   dashboard.

### J2 — Ad account request and payment  *(B/C)*

1. Advertiser requests an account within their included allowance → free.
2. Advertiser requests one beyond it → €50 shown, wallet impact shown.
3. **Break the wallet read** → the form must not claim "not enough balance"
   on a funded wallet, and must not claim the request is free.
4. Pay from wallet → balance moves once.
5. Admin sees the request, moves it to In progress, approves.
6. Advertiser sees the account.

### J3 — Wallet top-up  *(C)*

1. Advertiser requests a top-up, uploads a slip, picks the bank.
2. Admin sees it pending; the count on the dashboard and the sidebar agree.
3. Admin verifies → wallet credited once.
4. Re-verify → no second credit.
5. Advertiser sees the new balance without a reload.

### J4 — Ad-account top-up with the gate SHUT  *(C)*

1. Advertiser tops up an ad account.
2. Admin verifies through the normal dialog.
3. **Check `integration_jobs`.** A `push_topup` row may exist but must be
   held, never dispatched. The supplier balance must not change.
4. Kill the worker mid-run (or wait past the lease) → the job returns to
   `pending` and is retried, rather than sitting in `processing` forever.

### J5 — Withdrawal  *(C)*

1. Advertiser requests a withdrawal FROM AN AD ACCOUNT. There is no customer
   wallet withdrawal — confirm that surface does not exist anywhere.
2. Admin approves → balance moves once.
3. Any affiliate commission tied to that spend is clawed back.

### J6 — Subscription billing  *(C)*

1. Run the billing cron manually.
2. Invoice issued, notification sent.
3. Pay from wallet → balance moves once, invoice paid.
4. Low balance → dunning, then auto-debit after the grace period.
5. An unpaid invoice past due is collected once, not repeatedly.

### J7 — Affiliate  *(A/B)*

1. Affiliate's referral link registers a new advertiser.
2. Affiliate dashboard shows the referral, their spend, the commission.
3. **Break the stats read** → the hero shows `—`, not €0, and Request payout
   is disabled. It must never tell an affiliate they earned nothing because a
   query failed.
4. USD-funded referrals appear in the figures, not just EUR.
5. Commission states: provisional → confirmed → clawed back.

### J8 — Role isolation matrix  *(A — the most important table here)*

For each of advertiser / affiliate / plain admin / super-admin, confirm what
they can reach. Test by URL and by devtools query, not only by what the nav
offers — a hidden link is not a permission.

| target | advertiser | affiliate | admin | owner |
|---|---|---|---|---|
| another advertiser's invoice PDF | ✗ | ✗ | ✓ | ✓ |
| another advertiser's ad account | ✗ | ✗ | ✓ | ✓ |
| `ad_account_costs` (our cost) | ✗ | ✗ | ✓ | ✓ |
| `commission_*` on their own row | ✗ | ✗ | ✓ | ✓ |
| supplier identity anywhere | ✗ | ✗ | ✓ | ✓ |
| staff name/email on their own top-up | ✗ | ✗ | ✓ | ✓ |
| `bank_accounts` write | ✗ | ✗ | **✗** | ✓ |
| `bank_ledger_entries` | ✗ | ✗ | **✗** | ✓ |
| `/reconciliation` | ✗ | ✗ | ✗ | ✓ |
| wallet withdrawal | ✗ | ✗ | ✗ | ✗ |

The four bold cells are the ones that were wrong today.

---

## 3b. The one live supplier push

The point of this test is narrow: prove that ONE real top-up reaches SeamX,
that the figures match on both sides, and that SeamX's own portal still shows
what it should afterwards. Nothing more goes out.

### What the app does to SeamX when nobody is testing

Measured from the code, not assumed:

| path | frequency |
|---|---|
| `/api/cron/integration-jobs` | every minute, but it only claims QUEUED jobs. An empty queue means zero calls to SeamX. |
| supplier balance check | once an hour, on the hour only (`getUTCMinutes() !== 0` returns early), and only when `SUPPLIER1_MODE=live`. |
| ad-account pool sync | every 15 minutes (4 calls/hour) when `SUPPLIER1_MODE=live`, plus on demand from the Sync button. A READ, so it is not behind the auto-push gate. |

So with the gate shut and nobody clicking, live traffic is one balance read
an hour plus four inventory reads an hour. No writes. SeamX's portal sees
nothing else from us.

### The trap

Arming `SUPPLIER1_AUTOPUSH` does not open the gate for one job. It opens it
for **every held money job at once**, and the cron will pick them up within
60 seconds. Every top-up verified while the gate was shut may still be
sitting in `integration_jobs` as `pending`. That is exactly the situation the
two-switch gate exists to prevent, so do not defeat it by accident.

### Procedure

1. **Count what is waiting.** Gate still shut:

   ```sql
   select id, operation, status, attempts,
          payload->>'external_ad_account_id' as acct,
          payload->>'amount_cents' as cents,
          payload->>'currency' as cur, created_at
     from public.integration_jobs
    where provider = 'supplier1'
      and operation in ('push_topup','push_withdraw')
      and status in ('pending','processing')
    order by created_at;
   ```

   Anything in that list that is not the test top-up gets `status='cancelled'`
   BEFORE the gate opens. Write down what you cancelled.

2. **Create the test top-up.** Smallest amount that the supplier accepts, on
   a USD ad account. USD matters: `topup_amount` is stored in USD by
   construction, and the enqueue refuses any account whose currency is not
   USD rather than pushing a converted figure.

3. **Verify it** through the normal admin dialog. Confirm exactly one
   `push_topup` row now exists, held.

4. **Record the before state**: SeamX wallet balance, and the ad account's
   balance in their portal.

5. **Open the gate**: `SUPPLIER1_MODE=live`, `SUPPLIER1_AUTOPUSH=on`. Note
   both values are trimmed and lowercased identically now — a trailing space
   used to arm the gate while routing the job to the MOCK adapter, which
   reports success without sending anything.

6. **Wait one minute.** The cron claims it, calls SeamX once, and writes the
   result onto the job row.

7. **Shut the gate immediately.** `SUPPLIER1_AUTOPUSH` off. Do this before
   checking anything else.

8. **Check three things agree**, in this order:
   - `integration_jobs.status = 'succeeded'`, with the supplier's response in
     `result`.
   - SeamX's portal: the ad account's balance rose by the pushed amount, and
     the wallet fell by that amount plus their fee.
   - Our side: the ad account's recorded balance and the top-up row.
   Any disagreement stops the test. A push that half-happened is worse than
   one that did not.

9. **Push the same top-up again** (re-verify) with the gate still shut, then
   open it once more. The enqueue is idempotent on `topup:<id>`, so **no
   second job may be created and no second push may leave.** If money moves
   twice here, the gate is not the problem — the idempotency key is, and
   nothing goes live until it holds.

10. **Confirm SeamX's own portal still behaves**: log into it directly, load
    the account list, the wallet, the top-up history. Our push must appear as
    an ordinary entry, not as something that put their side into a strange
    state.

11. Leave `SUPPLIER1_MODE=live` if you want the read paths (balance, sync,
    pool) — that is safe. Leave `SUPPLIER1_AUTOPUSH` off.

---

## 4. What only SQL can prove

Run these after a testing session. They check invariants no screen shows.

```sql
-- 1. Exactly one active exchange-rate row per tenant.
select tenant_id, count(*) from public.exchange_rates
 where is_active group by tenant_id having count(*) <> 1;

-- 2. No supplier provenance on a customer-readable row.
select count(*) as must_be_0 from public.ad_accounts
 where metadata ?| array['source','supplier_external_id','allocated_from_pool_id'];

-- 3. No staff PII on customer-readable top-ups.
select count(*) as must_be_0 from public.top_ups
 where author ? 'email' or author ? 'name';

-- 4. Subscription refunds never exceed what was collected.
select subscription_id, sum(delta) as refunded
  from public.wallet_adjustments
 where reference like 'subscription_change_refund:%'
 group by subscription_id;
-- compare each against the period invoice total.

-- 5. No job stuck in processing.
select count(*) from public.integration_jobs
 where status = 'processing' and updated_at < now() - interval '15 minutes';

-- 6. Owner-only RLS is actually attached.
select tablename, policyname, cmd from pg_policies
 where schemaname='public'
   and tablename in ('bank_accounts','bank_ledger_entries')
 order by 1,2;
```

---

## 5. Order of work

1. **Section 1 + 2, tag A only.** Claude alone, no side effects. This is the
   bulk of it and needs nobody.
2. **Tag B**, with cleanup, still Claude.
3. **J8, the isolation matrix.** Needs one login per role from you; Claude
   drives once logged in.
4. **Tag C**, you, with Claude reading the result out of the database.
5. **Section 4** after every session.

Anything that fails becomes a fix, and the fix gets its own line in this
plan so the next pass re-checks it.
