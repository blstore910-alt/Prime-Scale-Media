# The walkthrough — J1 to J8, A to Z

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
