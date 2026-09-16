# Journey log — J1 to J8 on production

A running record of the real walkthrough: every step taken, every amount,
every request created, and every fault it turned up. Written as it happens,
not reconstructed afterwards, because the point of walking it is what you
find on the way.

**This is production.** Nothing in here is a simulation. Where a step would
move real money it is marked ⛔ and left for the account owner.

---

## J1 — a new advertiser, invitation to first ad account

| # | Step | Result | Date |
|---|---|---|---|
| 1 | Invitation sent to `xifape4500@jobscai.com`, role advertiser, no referrer | ✅ Row created, Pending | 16 Sep |
| 2 | Email delivered | ✅ Arrived at the mailbox with a working link | 16 Sep |
| 3 | Link followed while signed out | ✅ Redirects to `/auth/sign-up?token=…` | 16 Sep |
| 4 | Account created — **the owner typed the password** | ✅ Signed in, landed on `/complete-profile` | 16 Sep |
| 5 | Company profile saved | ✅ Test Advertiser BV · NL123456789B01 · Keizersgracht 123, Amsterdam 1015CJ | 16 Sep |
| 6 | Dashboard reached | ✅ Get started 1/4, plan €200/month | 16 Sep |
| 7 | Wallet top-up request | ⏸ Needs a real transfer + slip — owner's call | — |
| 8 | Admin verifies the top-up | ⏸ Needs super-admin | — |
| 9 | Ad-account request | ⏸ Blocked by design until the plan is paid | — |

### Amounts touched in J1

| What | Amount | Status |
|---|---|---|
| Plan on the invitation | €200 / month | Unpaid — first invoice outstanding |
| Wallet EUR | €0 | — |
| Wallet USD | $0 | — |
| Invoices raised | 1 (`000005-117`, €200.00) | Due |

### What J1 found

Faults, in the order they surfaced. Every one of these was live.

1. **Bulk top-up stored $0** — a fix from the day before retyped a parameter
   from a rate row to a rate array and left the only caller passing a row.
   Every non-USD bulk top-up was written with `amount_usd`, `topup_amount`,
   `fee_amount` and `eur_topup` all zero. Fixed, and `useExchangeRates` now
   declares its return type so the same mistake is a compile error.
2. **No customer could withdraw** — the deactivated-admin hardening put an
   admin-only guard on `requestAdAccountWithdrawal`, the advertiser's own
   action. Fixed with `resolveUserContext()`, and the withdrawal is now a
   two-step request with a confirmation.
3. **"Apply Latest Rates" stored every rate inverted** — €1000 would have
   credited $860 instead of $1162.79.
4. **Total profit counted unpaid subscriptions** — registering this test
   account raised the owner's profit figure by €200 before anything was paid.
   Now reads paid subscription invoices.
5. **"Deactivate user" reported success and changed nothing** — an UPDATE
   matching no rows is not an error in PostgREST. 29 more sites carry the
   same shape; see `NEXT_SESSION_FIRST.md`.
6. **Any advertiser was silently an affiliate** — the referral link was
   derived from the client code, so every account had a working one from day
   one and `auth/confirm` attributed signups through it.
7. **The reference format would have broken payment matching** — the matcher
   took the longest digit run, so a six-digit client code would have beaten
   the reference. It understands `000005-4839` now, with tests.
8. **`subscriptions.included_ad_accounts` does not exist** — mine, found
   within seconds because the query surfaces failure instead of rendering
   zeros.

### UI fixed during J1

Sign-up: invisible fields (dark-shell input styles on a white card), a
strength meter that read as full when empty, no email shown, an off-brand
logo at 176px, the form below the fold on a phone.
Onboarding: same off-brand logo, a truncated header line, US phone default.
Dashboard: rebuilt around one balance panel instead of the same number three
times; tiles aligned; fee notice quietened; bell toggles.
Wallet: three Top-up buttons became one per card; the "€0 available" line now
reports money awaiting verification; cards match the dashboard.
Lists: mobile cards lead with the row instead of a labelled field.
Everything: one refinement layer over buttons, cards, modals and menus;
modals are bottom sheets on a phone; focus is visible; view switching went
from 300ms to 130ms.

---

## J2 – J8

Not started. Each will get the same treatment: the table above, the amounts,
what broke, what was fixed.

| | Journey | State |
|---|---|---|
| J2 | Advertiser funds a wallet and an admin verifies it | ⏸ |
| J3 | Ad-account request → approval → account live | ⏸ |
| J4 | Ad-account top-up, including the one live supplier push | ⏸ |
| J5 | Withdrawal request → admin approval → wallet credit | ⏸ |
| J6 | Subscription billing: invoice, pay from wallet, dunning | ⏸ |
| J7 | Affiliate: approved link → referral → commission → payout | ⏸ |
| J8 | Second admin, deactivation, and what a deactivated admin can still do | ⏸ |

---

## Standing rules for this walkthrough

- The account owner types every password and presses the button that creates
  an account. Nothing else is delegated.
- Exactly ONE top-up is pushed live to the supplier, and their own portal
  must still work afterwards.
- No test data that looks like real data: names are `Test`, references are
  visibly ours.
- A step that would move money and cannot be undone waits for the owner.
