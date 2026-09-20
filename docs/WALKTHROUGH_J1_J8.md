# The walkthrough — every screen, every button, then J1 to J13

**Three passes, and only the first one is exhaustive.**

| pass | what it is | how complete |
|---|---|---|
| **A. Every menu item** | each navigation entry × each role, ticked off | **exhaustive** — generated from the navigation code, so nothing can be missing from the list |
| **B. Every button** | per screen, what each control should do | exhaustive per screen |
| **C. Every number** | each figure on screen, against the SQL that produces it | **exhaustive per figure** |
| **D. J1–J13** | the journeys: what happens when those controls are used in sequence | the scenarios, not everything |

Pass A answers "did we look at all of it". Pass C answers "is it true".
Pass D answers "does it work together". Doing D without A is how a
screen nobody opened reaches a customer; doing D without C is how a
confident, wrong number does.

This is the script for going through the whole app by hand, on
production, with real money. It is written to be *worked*: every step says
what to press, what must happen, and what to look at if it doesn't.

Two rules while we run it:

- **If a step does not do what this page says, stop and write it down.**
  Do not work around it. A workaround found at 2am becomes a thing a
  customer does at 2pm.
- **Small amounts.** €5 proves a path as well as €500 does. The only
  thing a bigger number buys is a bigger mistake.

Claude does not press the buttons that move money. You do. Claude reads
the result, says what it means, and fixes what breaks.

---

## 0. Before you start

### 0.1 Migrations that must be applied

Paste each into the Supabase SQL editor and check its read-back before
moving on. Every dollar-quoted block carries a NAMED tag (`$blk0$`) — the
editor refuses a bare `$$` in some files whose quotes are balanced.

| File | What it fixes | State |
|---|---|---|
| `20260917200000_downgrade_refund_is_a_choice.sql` | a downgrade only refunds if you ask | applied |
| `20260917220000_void_orphan_subscription_invoices.sql` | one unpaid monthly invoice, ever | applied |
| `20260917230000_first_topup_has_no_minimum.sql` | server and screen share the minimum | applied |
| `20260917240000_wise_deposit_description.sql` | keep what Wise says about a deposit | applied |
| `20260917250000_wise_deposit_archive.sql` | archive a deposit, reversibly | applied |
| `20260918100000_commission_type_vocabulary.sql` | percentage commission had never accrued | applied |
| `20260918110000_require_profile_rejects_deactivated.sql` | a deactivated admin loses ~20 money RPCs | applied |
| `20260918120000_pay_invoice_rejects_deactivated.sql` | …and cannot pay an invoice from a wallet | applied |
| `20260918130000_two_more_role_only_gates.sql` | two more role-only gates | applied |
| `20260918140000_policies_reject_deactivated_admin.sql` | 33 RLS policies stop trusting a role alone | applied |
| `20260918160000_affiliate_unpaid_split.sql` | payout stops asking for money already paid | applied |
| `20260918170000_restore_orphan_void.sql` | undoes a revert 20260918130000 caused | applied |
| `20260918180000_first_invoice_on_signup.sql` | **the first invoice exists at all** | applied |
| `20260918190000_deactivated_stay_deactivated.sql` | a switched-off customer stays off | applied |
| `20260918210000_one_unpaid_subscription_invoice.sql` | never two bills for one month | applied |
| `20260918230000_commission_clawback.sql` | money back takes its commission with it | applied |
| `20260918220000_refund_rejected_request_fee.sql` | **rejecting returns the 50 EUR** | **pending** |
| `20260918240000_scalar_not_record.sql` | fixes a runtime fault in the two above | **pending** |
| `20260918250000_reprice_is_owner_only.sql` | **only the owner may change what a customer pays** | **pending** |
| `20260918200000_money_to_numeric.sql` | money stops being a float — **BACK UP FIRST** | **pending** |
| `20260917180000_team_accounts_phase1.sql` | membership tables (no behaviour change) | not needed |

`supabase/checks/RUN-NOW-bundle.sql` holds the two pending non-destructive
ones in order, plus the wallet integrity check.

### 0.1b Run the integrity check first, and again afterwards

`supabase/checks/WALLET-INTEGRITY.sql`. Read-only. Its first question is
the one that matters: does every wallet balance agree with its own audit
history. Run it **before** this walkthrough and **after**, so you can tell
what the session did to the books rather than guessing later.

### 0.1c Two things the app will not do for you

**A company must exist before anybody can be invoiced.** The billing run
skips an advertiser with no `companies` row and notifies the admins
instead — there is no invoice, so J2 and J3 cannot start. Filling the
company in is a step of J1; do not skip it.

**The subscription must be active and due.** A plan that was deactivated
and reactivated can sit at `inactive`, and the run only looks at `active`
rows whose `next_payment_date` has arrived. If J2 has nothing to pay:

```sql
select a.tenant_client_code, s.status, s.amount, s.next_payment_date,
       (c.id is not null) as has_company
  from public.subscriptions s
  join public.advertisers a on a.id = s.advertiser_id
  left join public.companies c on c.advertiser_id = a.id
 where a.tenant_client_code = 'PSM0005';
```

Do NOT fix it by setting `next_payment_date = now()` while an unpaid
invoice already exists — that used to mint a second bill for the same
month. `20260918210000` now refuses it, but activating from the
Subscriptions screen is the honest route.

### 0.2 Environment

On Vercel **Production** (not Preview):

- `WISE_WEBHOOK_SECRET` — set. Without it no deposit can arrive.
- `WISE_API_TOKEN` — set. Without it, references stay blank.
- `WISE_API_PRIVATE_KEY` — set, with its `-----BEGIN/END-----` lines.
  Wise demands SCA for statement reads on this account; the app signs the
  challenge with this key.
- `SUPPLIER1_*` and `WISE_MODE` are on **Preview only** — so the SeamX
  adapter is not configured on production. J3's automation half is out of
  scope for this walkthrough; the manual half is what we are testing.

### 0.3 The five test users

Five, because each one proves something the others cannot.

| # | Who | Proves |
|---|---|---|
| **U1** | A brand-new advertiser, invited **with a plan** | J1, J2, J3 — the ordinary customer, start to finish |
| **U2** | An advertiser **already running**, with a paid plan and an ad account | J4, J5, J7 — the things that only happen after month one |
| **U3** | A **standalone affiliate** (role affiliate, no advertiser row) | J6 — and the one whose screens are emptiest |
| **U4** | An advertiser who is **also an affiliate** (approved referral link) | J6 from the other side; the two must not interfere |
| **U5** | An **employee admin** (role admin, not the tenant owner) | that the desk can work, and cannot reprice |

U5 is the one people skip. Do not skip U5: four capabilities were
owner-only in the UI and admin-level on the server until today, and the
only way to be sure is to sit in that seat.

---

## A. Every menu item, every role

Generated from the navigation code on 2026-09-20
(`components/admin/adm-shell.tsx`, `components/advertiser/adv-app.tsx`,
`components/affiliate/aff-app.tsx`). If a screen is not on this list, no
role can reach it from a menu — check `docs/UNREACHABLE.md`.

**How to use it:** open each one, as that role, and tick it when the page
has RENDERED WITH DATA. Not "it loaded" — a screen showing "Failed to
load" or a confident 0 over a failed read counts as a fail, and that is
most of what these passes have found.

### A1. Super-admin / owner — 21 destinations

| # | Menu group | Item | Route | Opened | Notes |
|---|---|---|---|---|---|
| 1 | (top) | Dashboard | `/dashboard` | ☐ | hero + Activity grid, 8 tiles |
| 2 | Customers | Advertisers | `/users` | ☐ | list, details sheet, Affiliates tab |
| 3 | Customers | Ad Accounts | `/accounts` | ☐ | |
| 4 | Customers | Account Pool | `/account-pool` | ☐ | owner sees the margin strip |
| 5 | Customers | Account Requests | `/ad-account-requests` | ☐ | |
| 6 | Money | Wallet Topups | `/wallet-topups` | ☐ | + the Wise panel (feed is OFF) |
| 7 | Money | Withdrawals | `/withdrawals` | ☐ | |
| 8 | Money | Ad-account Topups | `/top-ups` | ☐ | supplier pill lives here |
| 9 | Money | Wallets | `/wallets` | ☐ | balance edit is owner-only |
| 10 | Money | Invoices | `/invoices` | ☐ | |
| 11 | Money | Subscriptions | `/subscriptions` | ☐ | |
| 12 | Owner | Promotions | `/promotions` | ☐ | owner-only since 2026-09-20 |
| 13 | Owner | Reconciliation | `/reconciliation` | ☐ | ledger stops at 100 rows |
| 14 | Owner | Referral Links | `/affiliates` | ☐ | |
| 15 | Owner | Commissions | `/commissions` | ☐ | |
| 16 | Owner | Settings | `/settings/finance` | ☐ | see A4 for its own tabs |
| 17 | Owner | Activity Logs | `/activity-logs` | ☐ | |
| 18 | Owner | Audit Log | `/audit` | ☐ | export ignores the filters |
| 19 | Owner | Invites | `/invites` | ☐ | |
| 20 | Owner | Admins | `/admins` | ☐ | |
| 21 | More | Manual / Get Help | `/manual`, `/help` | ☐ | |

### A2. Employee admin (U5) — the same list, minus the Owner group

Everything in A1 EXCEPT items 12–20. Two things to check, not one:

- ☐ the Owner group and Promotions are **not in their sidebar**
- ☐ typing `/settings/finance`, `/promotions`, `/audit`, `/affiliates`,
  `/commissions`, `/invites`, `/admins`, `/reconciliation` directly is
  **refused**, not merely unlinked
- ☐ their Dashboard shows **6** Activity tiles, not 8 — Fees and
  Commissions are owner-only at the source and were showing two
  permanent "Failed to load"s until 2026-09-20

### A3. Advertiser — 9 destinations

Sidebar (`NAV`), then the second group (`NAV2`). The phone bar
(`BOTTOM`) is five of the same nine; open it on a phone too.

| # | Item | View | Opened | Notes |
|---|---|---|---|---|
| 1 | Dashboard | `?view=dash` | ☐ | onboarding checklist, plan card |
| 2 | Wallet | `?view=wallet` | ☐ | both currency cards, activity table |
| 3 | Ad accounts | `?view=accounts` | ☐ | |
| 4 | Requests | `?view=requests` | ☐ | |
| 5 | Billing | `?view=billing` | ☐ | Pay now / Exchange to pay |
| 6 | Financial report | `?view=report` | ☐ | |
| 7 | Notifications | `?view=notif` | ☐ | |
| 8 | Settings | `?view=settings` | ☐ | company, Your data (GDPR), affiliate join |
| 9 | Get help | `?view=help` | ☐ | |
| + | Affiliate program | `?view=referrals` | ☐ | only once they are an affiliate |

Also: ☐ `/profile`, `/notifications`, `/help` typed directly all bounce
into the shell rather than rendering without navigation.

### A4. Affiliate (standalone) — 6 destinations

| # | Item | View | Opened | Notes |
|---|---|---|---|---|
| 1 | Dashboard | `?view=dash` | ☐ | jackpot headline shows BOTH currencies |
| 2 | My Referrals | `?view=refs` | ☐ | range filter, CSV export |
| 3 | Wallet | `?view=pay` | ☐ | payout request |
| 4 | Notifications | `?view=notif` | ☐ | nothing writes affiliate notifications yet |
| 5 | Settings | `?view=set` | ☐ | payout details are NOT stored anywhere |
| 6 | Get Help | `?view=help` | ☐ | |

### A5. Settings — its own five tabs (owner only)

| # | Tab | Route | Opened |
|---|---|---|---|
| 1 | Finance | `/settings/finance` | ☐ |
| 2 | Banks | `/settings/banks` | ☐ |
| 3 | Ad-account types | `/settings/ad-account-types` | ☐ |
| 4 | Plans | `/settings/plans` | ☐ |
| 5 | Integrations | `/settings/integrations` | ☐ |
| 6 | General | `/settings/general` | ☐ |

### A6. Screens with no menu entry at all

Reachable only by URL or by being sent there. Each one is somebody's
worst day, so each one gets opened deliberately:

| # | Screen | How you get there | Opened |
|---|---|---|---|
| 1 | `/auth/login` | signed out | ☐ |
| 2 | `/auth/sign-up?t=…&ref=…` | a referral link | ☐ |
| 3 | `/invite/accept?token=…` | an invite email | ☐ |
| 4 | `/auth/confirm?…` | the confirmation email | ☐ |
| 5 | `/auth/error` | a broken link | ☐ |
| 6 | `/complete-profile` | company details missing | ☐ |
| 7 | `/inactive` | after being deactivated | ☐ |
| 8 | `/onboard` | a user with no profile | ☐ |
| 9 | the 404 page | any wrong URL | ☐ |
| 10 | the error boundary | force one, see it is not a blank page | ☐ |

---

## B. Every button, per screen

The rule for each: press it, and check the THREE things that have
actually gone wrong on this project.

1. **Did it do what the label says?** Not "did a toast appear".
2. **Could it have said success while writing nothing?** A toast fired
   without reading the answer; an UPDATE that matched no rows; a
   `mailto:` that opens nothing.
3. **Is the money right, in the right currency?** `top_ups.topup_amount`,
   `amount_usd` and `fee_amount` are ALWAYS USD; `currency` is what the
   customer paid in.

And one more for every list: **an empty result must say whether it is
empty or unread.** "No rows" over a failed read is the single most
common fault found in these sweeps.

Work the screens in the A-list order. For each, write down every control
you can see before you press anything -- that list is the test, and it is
shorter than it looks on most screens.

---

## C. The numbers -- screen against database, both ends

"The button works" and "the number is right" are two different tests,
and only this one catches a figure that is confidently wrong. Every
sweep on this project has found more faults here than anywhere else:
a landed figure stated in the wallet's currency, a lifetime total that
dropped dollars, a month that moved after the fact, a struck-out top-up
still counted as funding.

**How to run it:** put the screen and the SQL side by side. Not "roughly
right" -- to the cent. Where they differ, the SQL is the truth and the
screen is the bug.

### C1. The wallet

```sql
select a.tenant_client_code, w.eur_balance, w.usd_balance
  from public.wallets w
  join public.advertisers a on a.id = w.advertiser_id
 order by a.tenant_client_code;
```

- [ ] The customer's own wallet cards match, both currencies.
- [ ] `/wallets` (admin) matches, same rows.
- [ ] The wallet statement NETS to the balance: credits minus debits.
      This is the one that has been wrong twice -- ad-account funding had
      no line at all, and a paid invoice was drawn as a wallet debit
      whether or not the wallet paid it.

### C2. Money in

```sql
select upper(coalesce(currency,'EUR')) as cur,
       count(*) as aantal, sum(amount) as totaal
  from public.wallet_topups
 where status = 'completed'
 group by 1;
```

- [ ] Dashboard "Wallet in" for the same period.
- [ ] `/wallet-topups` list count.
- [ ] The customer's own statement.

### C3. Money onto ad accounts, and the fee

```sql
select count(*) as aantal,
       sum(topup_amount) as landde_usd,
       sum(fee_amount)   as fee_usd,
       sum(amount_usd)   as uit_wallet_usd
  from public.top_ups
 where status = 'completed'
   and coalesce(is_deleted,false) = false;
```

- [ ] Dashboard "Ad topups" and "Fees" for the same period.
- [ ] Every one of those three is USD on screen. `amount_received` is
      the only figure in the customer's own currency.
- [ ] A struck-out (`is_deleted`) top-up counts in NONE of them.

### C4. Invoices

```sql
select type, status, upper(coalesce(currency,'EUR')) as cur,
       count(*) as aantal, sum(total) as totaal
  from public.invoices
 group by 1,2,3 order by 1,2,3;
```

- [ ] `/invoices` totals per status.
- [ ] The customer's Billing list shows the same rows with the same
      currency symbol -- the symbol comes from `invoices.currency`, not
      from the plan.
- [ ] The PDF of one invoice matches its row to the cent, including tax.

### C5. Subscriptions

```sql
select s.status, upper(coalesce(s.currency,'EUR')) as cur,
       count(*) as aantal, sum(s.amount) as per_maand
  from public.subscriptions s group by 1,2;
```

- [ ] Dashboard hero "Subscriptions - billing now" = active + past_due.
- [ ] `/subscriptions` list, and each row's next payment date.
- [ ] The customer's plan card shows what they will be charged NEXT,
      not what they were charged last.

### C6. Commissions

```sql
select upper(coalesce(currency,'EUR')) as cur, status,
       count(*) as aantal, sum(amount) as totaal
  from public.referral_commissions group by 1,2;

select count(*) as clawbacks, sum(amount) as teruggehaald
  from public.referral_clawbacks;
```

- [ ] The affiliate's lifetime headline = commissions minus clawbacks,
      BOTH currencies.
- [ ] `/commissions` and `/affiliates` agree with each other and with
      the affiliate's own screen. These three have disagreed before.
- [ ] "Still owed" = commissions minus clawbacks minus paid.

### C7. The period boundary

```sql
select to_char(coalesce(paid_at, created_at),'YYYY-MM') as maand,
       count(*), sum(total)
  from public.invoices where status='paid' group by 1 order by 1;
```

- [ ] A card for "this month" changes when you change the period, and
      NOT when an old invoice is settled. A figure that moves
      retroactively is the bug that was fixed on 2026-09-20 -- check it
      stayed fixed.

### C8. Does the whole thing add up

```sql
select
  (select coalesce(sum(amount),0) from public.wallet_topups
    where status='completed' and upper(coalesce(currency,'EUR'))='EUR') as in_eur,
  (select coalesce(sum(amount_usd),0) from public.top_ups
    where status='completed' and coalesce(is_deleted,false)=false) as uit_usd,
  (select coalesce(sum(total),0) from public.invoices
    where status='paid') as gefactureerd,
  (select coalesce(sum(eur_balance),0) from public.wallets) as saldo_eur,
  (select coalesce(sum(usd_balance),0) from public.wallets) as saldo_usd;
```

- [ ] `/reconciliation` shows the same picture and says so in words.
- [ ] Nothing is negative. A negative wallet is money we gave away.

---

## J1 — invited, signed up, company filled in, wallet topped up

**U1.** The whole point of this journey is that a customer can get from an
email to money in their wallet without asking us anything.

1. **Invite.** `/invites` → New invite. Set a monthly fee (use **€5**),
   included ad accounts, top-up fee %, and a community if you want one.
   - ✅ The invite appears as `pending` with an expiry.
   - ⚠️ Do **not** pick the seeded **NSA** community for U1: it is a €0
     plan, and a €0 plan creates no subscription at all — which blocks
     J1.5 and J3 entirely. Use a normal plan. (Noted under Known
     limitations.)
2. **Accept.** Open the link in a private window, set a password, sign in.
   - ✅ Lands on the dashboard. The plan pill reads **Inactive** until the
     first invoice is paid — that is correct, not a fault.
3. **Company.** The dashboard shows "Add your company details to top up or
   request an account". Follow it (it goes to `/complete-profile`).
   - ✅ Fill every field. Tick "not VAT registered" if that is true.
   - ✅ The red chip disappears and "Get started" ticks the company step.
   - ❌ If the chip stays while the tick appears, the two gates disagree —
     tell Claude.
4. **Top up.** Wallet → Top up → EUR → **5**.
   - ✅ No minimum is demanded (the plan is not paid yet — by design).
   - ✅ Step 2 shows the beneficiary and a reference like `0005-6164655424`.
   - ✅ Step 3 takes a payment slip and submits.
   - ✅ The wallet shows a **Pending wallet top-up** card with a moving bar.
5. **Transfer.** Send exactly €5.00, **with that reference in the
   description.** The reference is what lets the match happen by itself.
6. **The deposit arrives.** Admin → `/wallet-topups` → *Bank deposits
   (Wise)*.
   - ✅ Within minutes to a few hours the row appears.
   - ✅ With the reference: status **Match found**, with the customer's PSM
     code, name and reference beside it. Press **Confirm & complete**.
   - ✅ Without one: **No match** → **Match** → pick the top-up by eye.
     (Matching on the amount alone is refused on purpose — ten people can
     send €5.)
   - ✅ If the row says "no reference", press **Fetch details from Wise**
     first.
7. **Verify.** The claim also sits in *Pending top-ups*. Press **Verify**,
   check the amount against the slip, confirm.
   - ✅ Wallet: **€5.00**. The pending card is gone.
   - ✅ The customer's Wallet activity shows the top-up with its reference.

---

## J2 — the monthly invoice, auto-debit, dunning

**U1, straight after J1.**

1. **Billing.** The card shows the monthly fee, a due date and one
   **Pay €5.00 from wallet** button.
   - ✅ Exactly ONE unpaid monthly invoice. If there are two, the void
     migration did not run.
   - ❌ "Due date not set" means this customer's first invoice has no
     `due_date` — auto-debit and dunning cannot run for it. Apply
     `20260917140000`.
2. **Pay.** Press it. The confirmation names the invoice type, the amount,
   the wallet it leaves and the due date.
   - ✅ Wallet €0.00, invoice **Paid**, plan pill **Active**.
   - ✅ Download the invoice PDF. The currency on it must match what was
     taken from the wallet.
3. **The other invoice types.** An adjustment shows no Pay button; a
   one-off charge and an ad-account fee do. That is deliberate.
4. **Dunning** (optional, slow): leave a monthly invoice unpaid with an
   empty wallet and let the cron run. The customer should be told before
   anything is taken.

---

## J3 — ad accounts: the included one, then a paid one

**U1.**

1. **Request the first.** Ad accounts → Request.
   - ✅ The form says **Included in your plan — no fee**.
   - ✅ Sending it asks first, in a modal, and says what it costs.
   - ✅ The toast does **not** claim a charge.
2. **Admin creates it.** `/ad-account-requests` → open → Create Ad Account.
   - ✅ Approve and Reject are both reachable on a phone.
   - ✅ The account appears in the customer's list.
3. **Request a second.** Now the plan allowance is used.
   - ✅ The form shows the €50 fee and the wallet impact before and after.
   - ✅ With too little balance, submit is refused *before* anything moves.
   - ⚠️ The €50 is debited at request time and produces **no invoice and
     no wallet line**. Known gap — see Known limitations.

---

## J4 — money onto an ad account, and back off it

**U2.**

1. **Top up the account.** Accounts → the account → Top up.
   - ✅ The confirmation shows: out of your wallet, the fee, what lands,
     and what the wallet holds afterwards.
   - ✅ "Top up this account" is visible without scrolling a nested box.
   - ✅ **Check the maths against reality once**: €1 in, and confirm the
     figure that lands matches what the modal promised.
2. **Withdraw.** The account sheet → Withdraw to wallet.
   - ✅ The currency is shown, not chosen. It comes from the account.
   - ✅ Two-step: the figures, then confirm.
3. **Approve.** Admin → `/withdrawals`.
   - ✅ Approve and Reject both ask first, naming the customer, the
     account and the amount.
   - ✅ The wallet is credited in the **account's** currency.
   - ⚠️ The customer has no screen showing a pending or rejected
     withdrawal. Known gap.

---

## J5 — EUR ↔ USD in the wallet

**U2.**

1. Wallet → Exchange. Enter an amount.
   - ✅ Rate, fee and "you'll receive" are shown before anything happens.
   - ✅ Confirming asks again, with the same four figures.
2. **Check the result against the promise.** The wallet history row must
   match what the confirmation said, to the cent.
   - ⚠️ The 0.6% fee is computed in the browser and the RPC is not in this
     repo. If the two disagree, that is the finding — write down both
     numbers.
3. With no active exchange rate the panel says "Unavailable" and Exchange
   is disabled. An admin publishes one at `/settings/finance`.

---

## J6 — referrals and commission

**Needs `20260918100000` applied.** Until then nothing here can pass.

**U4 (advertiser-as-affiliate) then U3 (standalone).**

1. **Set the terms.** `/users` → U4 → Commission → **Percentage**, e.g. 5.
   - ✅ Saving is owner-only and bounded 0–100. A figure outside that is
     refused, not stored.
2. **Refer.** Invite U1' (a fresh advertiser) naming U4 as the referrer, or
   assign the link at `/affiliates`.
   - ✅ The link shows as `active`.
3. **Earn.** Have the referred advertiser complete a top-up (J1 steps 4-7).
   - ✅ U4's dashboard shows the commission, in the currency it was earned
     in.
   - ❌ €0 after a completed top-up means the vocabulary migration is not
     applied, or the link is not active.
4. **Payout.** Request a payout.
   - ⚠️ This opens an email. It writes no record and does not reduce the
     balance shown. Known gap.
5. **U3, the standalone affiliate.** Log in.
   - ⚠️ Expect an empty screen and "your link isn't set up yet": a
     standalone affiliate has no advertiser row, so there is no code to
     build a link from. Known gap — this is the one to decide about.

---

## J7 — changing the plan, up and down

**U2.**

1. **Up.** `/subscriptions` → Amount → raise it.
   - ✅ The difference is invoiced as an adjustment.
2. **Down, without a refund.** Lower it, keep the default pill.
   - ✅ No money moves. The new price applies from here.
   - ✅ Exactly one unpaid monthly invoice remains.
3. **Down, with a refund.** Lower it again and pick the refund pill.
   - ✅ The wallet goes up by the stated amount.
   - ⚠️ The refund may legitimately be €0 (it is bounded by what was
     actually collected). The toast does not say which — check the wallet.
   - ⚠️ The refund lands with no line in the customer's Wallet activity and
     no credit note. Known gap.

---

## J8 — switching things off

**U2 and U5.**

1. **Disable an ad account.** Admin → Accounts → Edit → Status **Disabled**.
   - ✅ The customer sees it red, reading "Switched off", with **no Top up
     button**.
2. **Release a pool account.** `/account-pool` → Release.
   - ✅ Refused while the linked account is running; it names what to do.
   - ✅ After disabling, the release is allowed and asks first.
3. **Deactivate an advertiser.** `/users` → Deactivate.
   - ✅ The confirmation says plainly that their subscriptions stop too,
     and that activating them again does not bring those back.
4. **U5, the employee admin.** Log in as an admin who is not the owner.
   - ✅ Can work the desk: verify top-ups, create ad accounts, approve
     withdrawals.
   - ✅ **Cannot** open `/settings/*`, and cannot change a plan, a fee, an
     exchange rate or an ad-account type even by trying.
   - ✅ Cannot see profit, margin or commission figures.
5. **Deactivate U5**, then have them try an action with a session still
   open.
   - ✅ Refused. (This is what `20260918110000` and `20260918120000` are
     for.)

---

## J9 — the admin desk, a full day of it

**U5 (employee admin), then U1 (owner).**

1. **Verify a wallet top-up against a slip.** `/wallet-topups` → open
   one → read the amount and the reference against the slip → Verify.
   - ✅ The wallet goes up by the amount on the slip, in the currency on
     the slip.
   - ✅ A receipt invoice is raised, and it does NOT appear as a debit in
     the customer's wallet activity.
2. **Reject one**, with a reason.
   - ⚠️ The reason is stored and shown on no admin screen. Known.
3. **Verify an ad-account top-up.** `/top-ups` → the card names the
   ad account, the customer and the PSM number.
   - ✅ The supplier pill says where to do it by hand, or "Funded
     automatically" for the API type.
   - ✅ The headline figure is USD; "paid" is in the customer's currency.
4. **Search the queue** for an advertiser's name.
   - ⚠️ Only the client code and the account name are searched. A miss
     says so and offers to clear the filters.
5. **Approve a withdrawal** from an ad account.
   - ✅ Refused when the account never held that much — the message
     names what is available.
6. **Adjust a wallet** (`/wallets`, owner only).
   - ⚠️ No version guard: two admins correcting the same wallet at once
     both apply their delta. Known.

## J10 — settings, and what they change downstream

**U1 only. Every one of these is a price.**

1. **Ad-account types** → change a default fee → create an ad account of
   that type.
   - ✅ The new account's fee is pre-filled from the type.
   - ✅ The supplier name and dashboard are on the ADMIN screen only —
     check the customer's JSON, not just their screen.
2. **Banks** → add a beneficiary → open the wallet top-up dialog as a
   customer.
   - ✅ The right bank for that ad-account family, in the right currency.
   - ⚠️ A beneficiary cannot be removed from the UI. Known.
3. **Exchange rates** → save a new rate → check the before/after diff.
   - ⚠️ On the second save in one session the "before" is stale. Known.
4. **Plans** → change a plan → invite someone on it (J1).
5. **Integrations** → the supplier feed.
   - ✅ Nothing is pushed to the supplier while testing.

## J11 — privacy, audit and the paper trail

**U2 (customer), then U1.**

1. **Download my data.** Customer → Settings → Your data → Download.
   - ✅ A file arrives, and it contains no commission terms, no supplier
     name, no margin.
2. **Request deletion.**
   - ✅ Registered, and the account is marked rather than deleted.
   - ✅ The OWNER cannot do this to themselves — the tenant would be
     left with nobody.
3. **Sign out all devices.**
4. **Audit log** (`/audit`) → filter to that customer → Export CSV.
   - ⚠️ The export ignores the row filter and the time range. Known.
   - ✅ A cell starting with `=` is not a live formula when opened.
5. **Activity logs** → the same events, in customer-readable words.

## J12 — the affiliate program, end to end

**U4 (advertiser who is also an affiliate) and U3 (standalone affiliate).**

This is the track that has never completed on production: there were
**0 referral links on file** on 2026-09-20 because every referral was
silently discarded before a row was written.

1. **Apply.** U4 → Settings → Join the affiliate program.
   - ✅ The OWNER gets a notification. (Needs migration 20260920130000.)
2. **Approve.** U1 → set their commission terms.
   - ✅ U4 can now see their referral link — without needing an existing
     referral first.
3. **Refer someone.** Open the link in a clean browser → sign up →
   confirm the email.
   - ✅ A `referral_links` row exists. This is the step that was silently
     failing; if it still does, nothing downstream can work.
4. **That customer tops up.**
   - ✅ Commission accrues, in the currency of the top-up.
   - ✅ Both the affiliate's screen and the owner's `/affiliates` show
     the same figure.
5. **Withdraw from an ad account** → the clawback fires.
   - ✅ It fires for a EUR customer too. (Needs 20260920150000.)
6. **Request a payout.**
   - ⚠️ No payout record is written and no bank details are stored.
     Known — the owner pays by hand and marks the rows paid.

## J13 — the days nothing goes right

**Every one of these has produced a wrong screen at least once.**

1. **A failed read.** Block the Supabase host in dev tools, then open
   each dashboard.
   - ✅ Every tile says it could not load. None of them says 0.
2. **Two tabs.** Pay an invoice in one; press Pay in the other.
   - ✅ No second debit, and the second tab does not claim it paid.
3. **A deactivated customer with a tab still open.**
   - ✅ They cannot top up, cannot pay, cannot request an account.
4. **A deactivated admin with a cookie still valid.**
   - ✅ Refused everywhere, including the invoice PDF route.
5. **Maintenance mode on.**
   - ✅ Reads still work; every write says so plainly.
6. **A currency we cannot convert.** Try a GBP top-up as an admin.
   - ✅ Refused before anything is written — it used to be stored as
     $0.00.
7. **An unknown currency code on an existing row.**
   - ✅ The screen prints the code beside the number instead of throwing.
8. **The cron runs twice.**
   - ✅ No second invoice, no second debit.

---

## Where this script and the app disagree

Found by walking the script through the code on 2026-09-18. The APP is
right and the wording below was written before the screens were renamed.
Read this before J1 so a renamed button is not reported as a missing one.

| Step | The script says | What is actually there |
|---|---|---|
| J1.2 | the plan pill reads **Inactive** | it reads **Active · Renews \<date\>** from the first minute — there is no inactive-until-paid state |
| J1.4 | reference like `0005-6164655424` | client codes pad to six: `000005-6164655424` |
| J1.6 | "Bank deposits (Wise)" | the **Bank deposits** tab on /wallet-topups |
| J1.6 | "Match found" | **Ready to credit** |
| J1.6 | "Confirm & complete" | **Confirm & credit**, and it now asks first — the modal carries the bank's figures, the customer's, both references and the slip |
| J1.6 | "Fetch details from Wise" | **Sync with Wise**. It also re-matches, and the panel runs it by itself on arrival |
| J1.7 | then press **Verify** in Pending top-ups | impossible, and not a fault: confirming the deposit already completed the top-up, so it has left that queue |
| J2.1b | apply `20260917140000` if the due date is missing | that trigger only shortens a date already set; the missing-invoice cause is 0.1c above |
| J3.2 | "Approve" and "Reject" | **Review**, **I'm on it**, **Details**. Create Ad Account lives inside Review — and pressing "I'm on it" hides it until you set the request back to pending |
| J5.2 | the 0.6% fee is applied | it is computed in the browser only; the server recomputes from `p_amount` |
| J5.3 | an admin publishes a rate at /settings/finance | with zero rate rows that card renders nothing at all — there is no way to publish the first one from the UI |
| J6.2 | assign the link at /affiliates | that screen only approves and rejects. Assigning is /users → Details → Affiliates |
| J6.3 | commission in the currency it was earned in | the affiliate view is EUR-only; `earnings_usd` accrues and is not rendered |

## Known limitations — do not report these as new

These are understood, written down, and not fixed yet. Seeing them is not
a surprise; seeing something *else* is.

| Where | What | Why it is parked |
|---|---|---|
| J1 | The seeded **NSA** community plan is €0/month, and a €0 plan creates no subscription — so its one included ad account can never be requested | It is a pricing decision, not a bug: either give NSA a fee or let a €0 plan create a subscription |
| J3 | The self-service €50 request fee has no invoice and no wallet line | Needs a ledger entry; the money is correct, the receipt is missing |
| J4 | No customer-facing screen for a withdrawal request | Needs a small list in the account sheet |
| J6 | Payout request writes no record | Needs a request table, or an invoice |
| J6 | A standalone affiliate has no referral link | Needs a decision: give affiliates a code of their own, or make them advertisers |
| J7 | A refund has no line in Wallet activity and no credit note | Needs the adjustments feed in the customer's history |
| J5 / J4 | Two money RPCs (`wallet_exchange`, `top_up_create_for_advertiser`) exist only on the live database | Nothing in the repo can verify them; that is why both steps say "check the result against the promise" |
| everywhere | 33 RLS policies still check a role without checking whether that person is still active | The migration is being written from the live policy list |

---

## Real-clients-ready — the checklist before the first paying customer

Not "does it work" but "will it behave when nobody is watching".

- [ ] All pending migrations applied, each read-back checked
- [ ] J1 completed end to end by a person who did not build it
- [ ] One real bank transfer matched **by reference**, not by hand
- [ ] One invoice PDF opened, read, and its currency checked
- [ ] Exchange result matched against the confirmation, to the cent
- [ ] Commission earned and visible on the affiliate's own screen
- [ ] An employee admin seat tested for what it must NOT reach
- [ ] A deactivated admin's still-open session tested
- [ ] `MAINTENANCE_MODE=true` tried once: UI read-only, crons skip, and
      the banner explains itself
- [ ] Every screen checked on a phone, with no sideways scroll
- [ ] Backups confirmed running, and a restore tried at least once
- [ ] The support email on the affiliate payout screen is one somebody
      actually reads
