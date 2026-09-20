# Corrections to the walkthrough — read this alongside it

`docs/WALKTHROUGH_J1_J8.md` was last edited before 53 commits landed.
Everything below was verified against the code on 2026-09-20 and is
ordered by how much real money the step moves. **Where this file and the
walkthrough disagree, this file is right.**

---

## Before you start: three things the app will not do for you

The walkthrough's §0.1c names two. There is a third, and it stops J4
dead.

### 1. The €300 floor makes "€1 in" and "€5 in" impossible

The walkthrough says "small amounts — €5 proves a path as well as €500",
and then J4.1 says **€1 in**. Neither works once a plan is paid.

- **Ad-account top-up:** `components/topups/account-topup-form.tsx:180`
  defaults `min_topup` to **300** and enforces it. Typing 1 gives
  "Minimum Amount: 300".
- **Wallet top-up:** `lib/min-topup.ts:53` returns 0 **only while the
  plan is inactive**. J1.4's €5 works for exactly that reason. The moment
  J2.2 pays that invoice, every later wallet top-up demands
  `wallets.min_topup`, whose column default is **300**.

**Do this first, for U2:**

- `/accounts` → the account row → **Min amount** → `1`
  (`components/account/accounts-table.tsx:399`)
- `/wallets` → the wallet row → **Min amount** → `1`
  (`components/wallets/psm-wallets.tsx:286`)

Both are admin-level, not owner-only.

### 2. Set "Included accts" ≥ 1 on the invite, or J3.1 charges €50

"Included in your plan — no fee" reads
`advertiser_plans.included_ad_accounts`, written from the invite's
**Included accts** field. Left null, the first request is charged.

The allowance is consumed at **request** time, not when the account is
created — so J3.2 is not a prerequisite for J3.3.

### 3. There is no owner among the five test users

U1 is defined as "a brand-new advertiser", and then J9, J10 and J11.2
say "U1 (the owner)". Those are different people. **Add U0 = the tenant
owner** (`tenants.owner_id`) and re-label J9.6, J10 and J11.2–4 to U0.

---

## Steps that are wrong and move money

### J4.3 — a withdrawal is ALWAYS in USD

The walkthrough says "the wallet is credited in the **account's**
currency". That is the exploit, not the behaviour.

`components/withdrawals/withdraw-dialog.tsx:51` hard-codes USD, with ten
lines explaining that an ad-account balance *is* `top_ups.topup_amount`,
a USD column, and that showing the funding currency "is how the 1:1
exploit survived the fix that was meant to close it". The server forces
it (`actions/withdrawal-actions.ts:270`) and so does a trigger
(`20260919100000:41`).

**Replace with:** the currency is shown, not chosen, and it is always
USD. A EUR-funded account returns USD; the customer exchanges it in the
wallet afterwards. **If you see anything but USD here, that is the bug.**

### J7 — the refund pill was deleted; this is two steps, not three

`change-subscription-amount-dialog.tsx:203` — the pill is gone, `refund`
is hard-false, and the action forces it false.

1. **Up.** `/subscriptions` → the row → **Amount**. The difference is
   invoiced as an adjustment, and the note on the dialog names the
   figure.
2. **Down.** Nothing is paid back. An invoice already issued stands at
   the old amount; the lower price starts next period.

Undocumented and worth a look while you are there: the same dialog
carries a **currency** selector, and the before/after notes only render
when the new currency equals the old. Changing currency is a silent path.

### J12 and J6.3 — a self-signup referral link is `pending` and earns nothing

`app/auth/confirm/route.ts:211` writes `status: "pending"`. The accrual
trigger requires `'active'` (`20260918100000:82`). The **invite** path
writes `'active'` directly, which is why J6 looks fine and J12 does not.

**Insert a step:** U0 → `/affiliates` → **Approve** the new link. A link
left pending accrues nothing and says nothing.

### J3.3 — the €50 request fee is still invisible

`20260920250000` adds five columns and an index. It deliberately does
**not** replace the two live function bodies that must write them, and it
ships a check that prints `NOT WRITING` until they do. The customer
statement already reads all five with a retry-without fallback, so
applying the migration alone changes nothing you can see.

---

## Screens that will look broken

| step | what the doc says | what is there |
|---|---|---|
| J1.6 | tab "Bank deposits (Wise)" | **"Bank deposits"** — three tabs: Wallet top-ups, Bank deposits, Precharge |
| J1.6 | "Match found" | **"Ready to credit"** |
| J1.6 | "Confirm & complete" | **"Confirm & credit"**, then a modal "Credit this wallet?" listing Bank says / They wrote / Customer / We asked for / They claimed |
| J1.6 | "No match" | **"Waiting to be matched"** → **Match** → a picker → **"Match & credit"** → a second confirm. Two steps |
| J1.7 | "Fetch details from Wise" | **"Sync with Wise"**. It auto-runs once per mount, only for rows with no reference, at most once per 10 minutes |
| J1.7 | "sits in Pending top-ups, press Verify" | no such queue. The tab is **Wallet top-ups** with the Status filter on Pending — and a Wise confirm already set the row `completed`, so it has left it |
| J9.3 | "the card names the ad account, the customer and the PSM number" | the ad account, yes. **No PSM number.** `#1234` is the top-up's own sequence. The customer name reads the nested object and falls back to the literal **"Advertiser"** — see the SQL below |
| J10.2 | "add a beneficiary → the customer sees the right bank" | the card itself says in bold it is **not wired** to the customer top-up screen. This step cannot pass |
| J13.6 | "try a GBP top-up as an admin" | GBP and HKD are commented out of `CURRENCIES`. There is no dropdown to pick them from — while customers are still shown GBP and HKD **transfer** instructions. That asymmetry is the finding |
| A6 | "/onboard — a user with no profile" | with no profile and no invite it redirects to **/organization/new**, a live tenant-creation form. Open it, do not submit |

---

## The migrations ledger is 38 short

Thirty-eight migrations dated 2026-09-13 or later exist in
`supabase/migrations/` and are not in the walkthrough's table.

**Three documents disagree about what is live.** The walkthrough says
`20260918250000` is pending; `RUN-NOW-bundle.sql` says it is already in.
Use **`supabase/checks/PLAK-DIT-NU.sql`** — it is the newest and says
exactly which three remain.

**The five to confirm before J1, by blast radius:**

| # | migration | if it is not applied |
|---|---|---|
| 1 | `20260920180000` audit log readable | `/audit` says "No audit events found" to everyone, including you. Kills J11.4 |
| 2 | `20260920210000` RPC grants | both accept-invite routes call those two RPCs. A grant mismatch **breaks J1.2 entirely** |
| 3 | `20260920220000` **and** `230000` | apply as a pair. 220000 alone stamped every live deposit onto the test tenant |
| 4 | `20260918280000` tax rates | the only one with no fallback — the dialog throws |
| 5 | `20260920150000` **and** `240000` | apply as a pair. 240000 fixes a regression 150000 introduced: a customer who withdrew everything left the affiliate holding 25% of the commission |

**Do not run `20260920120000`** — its own header says those columns
leaked the supplier's name to any tenant member. `20260920140000`
replaces it.

`20260920160000` rewrites a function nothing calls. Only its backfill
matters.

`20260917160000_invitation_expiry_timestamptz` is a J1 blocker and is in
no ledger: without it a zone-less `expires_at` kills every invite two
hours early in summer.

---

## Known limitations — strike two, amend three, add eleven

### Strike

- **"J7 — a refund has no line in Wallet activity"** — there is no
  refund any more.
- **"33 RLS policies still check a role without checking whether that
  person is still active"** — contradicted by the ledger's own line
  listing `20260918140000_policies_reject_deactivated_admin` as applied.

### Amend

- **J3 €50 fee** — add that `20260920250000` adds the columns and not
  the two function bodies that fill them.
- **J4 no customer-facing withdrawal screen** — **approved**
  withdrawals now appear in the customer's statement. Pending and
  rejected still appear nowhere, deliberately.
- **Two money RPCs only on live** — the list is longer:
  `referral_commissions`, `referral_links` and `top_ups_view` are also
  hand-authored and in no migration.

### Add — each of these will otherwise be reported as a new bug

| where | what |
|---|---|
| J1.4 / J4.1 | once the plan is active, both top-up kinds carry a **300** floor |
| J4.2 | a withdrawal always returns **USD** |
| J6 / J12 | a self-signup referral link is `pending` and accrues nothing until approved |
| J9.3 | `/top-ups` shows no PSM number, and the customer name may read "Advertiser" |
| J9.6 | wallet adjust takes a **delta** with no expected base and no idempotency token — two admins in the dialog at once both apply |
| J10.2 | the Banks page is not wired to the customer top-up screen |
| J11.4 | the audit CSV honours the table and action filters but hardcodes the last **30 days** and ignores the row-id filter |
| J13.5 | `MAINTENANCE_MODE` needs a redeploy each way, and the `app/api/*` routes do not check it — `POST /api/send-invite` still writes during a freeze |
| J13.6 | GBP/HKD cannot be selected anywhere, but GBP/HKD bank instructions are still shown |
| A4 | the affiliate app has **no `?view=` URLs at all** — every A4 row must be ticked by clicking, and it lands on Referrals, not Dashboard |
| A6 | `/onboard` with no profile redirects to a live tenant-creation form |

---

## What this walkthrough cannot test at all

State these at the end so nothing here is mistaken for "passed".

1. **A second tenant.** All five users are in one. Every tenant-match
   guard, the cross-tenant deposit fix and the referral-terms policy are
   untested by this script.
2. **A real bank transfer arriving.** Needs `WISE_WEBHOOK_SECRET` **or**
   `WISE_PUBLIC_KEY`, plus `WISE_API_TOKEN` and `WISE_API_PRIVATE_KEY`
   for references. **Add `WISE_AUTO_SETTLE` to §0.2**: default off, but
   if it is true on production a deposit self-credits and "Confirm &
   credit" never appears.
3. **The supplier API.** Preview-only, so the "Funded automatically"
   pill, auto-push and pool sync are unproven. `realWiseAdapter` is
   marked NOT WIRED YET.
4. **A cron firing.** Two, both needing `Authorization: Bearer
   $CRON_SECRET`. J2.4 and J13.8 need a real overnight or a curl with
   the secret — you cannot press them.
5. **An email arriving.** Needs `BREVO_SMTP_USER`, `BREVO_SMTP_PASS`,
   `FROM_EMAIL`. §0.2 names none of them. Without them J1.1→J1.2 and
   J12.3 both dead-end.
6. **Anything that lives only on the live database** — `wallet_exchange`,
   `top_up_create_for_advertiser`, `referral_commissions`,
   `referral_links`, `top_ups_view`, and the two functions
   `20260920250000` needs edited.

---

## Two SQL queries worth running before you start

```sql
-- Does /top-ups show a real customer name, or the literal "Advertiser"?
select column_name from information_schema.columns
 where table_name = 'top_ups_view' order by 1;

-- Is the Meta-EU-Premium 2-point discount alive? The money path compares
-- the slug EXACTLY to 'eu-meta-premium', and the settings screen
-- slugifies from the label, which would give 'meta-eu-premium'.
select slug, label from ad_account_types order by slug;
```

---

## Smaller corrections, pasteable

- "see A4 for its own tabs" → Settings is **A5**.
- "its own five tabs" over a six-row table → there are **six**, and
  General renders **first**.
- "Ad-account types" → the screen says **"Ad account types"**.
- "21 destinations" → an owner has **22** sidebar links, plus the bell
  and the avatar = 24.
- Promotions is **not** in the Owner group — it is unshifted onto the
  front of **More**, which renders before Owner. The first group is
  labelled **General**.
- "ledger stops at 100 rows" is stale — it pages to 50,000 and says
  "Too much history to check in one pass".
- The phone bar relabels two entries: **Accounts** and **Home**.
- The top-up dialog is **4 steps**, not 3, and the amount is on step 3.
- "Sign out all devices" → the button says **"Sign out everywhere"**.
- Request actions are **Review**, **I'm on it**, **Details** and a
  fourth the old correction missed, **Back to pending**. And the old
  correction is backwards: **Create Ad Account** stays visible on
  `in_progress`; it is **Create Invoice** that hides.
- "the rejection reason is shown on no admin screen" is **false** — it
  is in the details sheet reached by **Details** on `/wallet-topups`,
  and the customer sees it too.
- The zero-rate-rows correction is stale: the exchange-rates screen now
  renders "No rate is published yet…" and the form, so the first rate can
  be published from the UI.
- `/affiliates` has no "Affiliates" tab — assigning a referrer is
  `/users` → Details → **Set referrer**.
- The affiliate headline renders both currencies now. What is still
  EUR-only: the sumbar, Lifetime earned, Top-up volume and the
  recent-commission feed.
- For a **EUR** wallet the ad-account top-up modal states no landing
  figure at all — it prints the literal "in USD, converted at today's
  rate". J4.1 is unverifiable as written for EUR.
- On the exchange dialog only the **Rate** row says "Unavailable"; fee
  and receive show `-`. Exchange is correctly disabled.
- Delete the "apply `20260917140000`" instruction from J2 — that
  migration only shortens a due date that is already set.
- **A6 is incomplete.** Also reachable by URL with no menu entry:
  `/auth/forgot-password`, `/auth/update-password`,
  `/auth/sign-up-success`, `/organization/new`, `/my-invites`,
  `/invite/list`, `/pwa`, and four redirect-only routes old bookmarks
  point at: `/billing`, `/referrals`, `/my-subscription`, `/wallet`.

---

## Verified safe, so do not spend time on them

- **J13.2** — paying one invoice twice. `invoice_pay_from_wallet` takes
  `for update` and refuses an already-paid invoice.
- **J13.8** — the billing run firing twice in a day. The unique index on
  `(subscription_id, period_start)` plus the in-function check hold.
- **U5 cannot reach any of the eight owner routes.** All server-refused,
  verified route by route. The dashboard really does show 6 tiles to an
  employee admin and 8 to the owner. But **J9.6 is mis-scoped**:
  `/wallets` is admin-level, so U5 *can* open it — only **Edit** is
  owner-gated, and **Min amount** is not.
