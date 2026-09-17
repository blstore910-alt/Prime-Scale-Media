# Do this first, next session

Work that is understood, scoped and ready to execute — parked only because
something more urgent was in front of it. Start here rather than re-deriving
it.

---

## 1. The silent-write sweep — DONE 2026-09-17

All 18 remaining sites now `.select("id")` and count the rows through
`wroteSomething()` in `actions/_shared.ts`:

  ad-account-actions      updateAdAccountAsAdmin, rejectAdAccountRequest,
                          setAdAccountRequestStatus, createAdAccountFromRequest
                          (the last one ROLLS BACK the created account when the
                          request could not be marked completed — a zero-row
                          write there left the request open beside a live
                          account, which is how the next admin creates a second)
  ad-account-type-actions upsertAdAccountType
  admin-actions           toggleAdminStatus, updateAffiliate, approveAffiliate,
                          rejectAffiliate, setAffiliateCommission,
                          updateAdvertiser, setAdvertiserCommission
  bank-account-actions    upsertBankAccount
  company-actions         the companies update
  invite-actions          cancelInvitation
  plan-actions            upsertPlan
  supplier-pool-actions   both writes now log when they match nothing
  tenant-actions          createTenantForCurrentUser

Three are deliberately NOT guarded, and now say so in a comment where they
are: the bulk subscription deactivation (`.in(...)` over an advertiser who
may have none), the exchange-rate "stand down whatever is active" (nothing is
active on a first save), and the pool release, which logs instead because it
is already inside a failure path.

Re-run the detector below after touching `actions/`; it reports 8 hits, all
either comments or the three intentional ones above.

---

## 2. Verify on the live database

Two read-only checks written but never run. Paste into the Supabase SQL
editor (one statement at a time — the editor only shows the last result).

- `supabase/checks/zero-amount-topups.sql` — did the broken bulk dialog
  actually write any $0 rows before it was fixed? A `pending` one can simply
  be corrected; a `verified` one means an ad account was credited nothing
  while the advertiser was charged, and needs a wallet adjustment.
- `supabase/checks/integration-jobs-insert.sql` — can `enqueue.ts` insert at
  all? It uses the CALLER's RLS-bound client, so if `integration_jobs` has RLS
  on with no INSERT policy, auto-push can never queue anything and simply goes
  quiet. Worth knowing before pushing one top-up live, not after.
- `supabase/checks/invite-expiry.sql` — an invite created 21:07 displayed an
  expiry of 19:07. Two hours is exactly the Amsterdam summer offset, which is
  the signature of one column being `timestamp` and the other `timestamptz`.
  `accept-invite` decides validity by comparing those, so a zone-less value
  kills every invitation two hours early in summer.

---

## 3. Still open from Wave 3/4

- An existing user can never accept an **affiliate** invite: a trigger rejects
  `role='affiliate'` *after* the invitation has already been consumed, so the
  link is burned and the account is not created. Live-schema dependent — the
  affiliate leg of J1 settles it.
- `subscription_waiver` perk rolls the period forward, but the same cron run
  still auto-debits the invoice already issued for that period
  (`supabase/migrations/20260901400000_advertiser_perks.sql:426`).
- Never answered: is the **−€270,85 DST reserve** normal or new?
- Deferred: an `advertiser_topup_totals` view. The admin advertiser list
  embeds every advertiser's whole `wallet_topups` collection to sum it in the
  browser.

---

## 4. Definition of done for the sweeps

Two consecutive waves with no surviving finding above medium. Not yet reached:
every wave so far has found real faults in the same day's work, including in
the fixes themselves.

---

## First subscription invoice due in 3 days — READY TO APPLY

`supabase/migrations/20260917140000_first_invoice_due_in_3_days.sql`.

A BEFORE INSERT trigger rather than an edit to the billing functions,
because five separate inserts hard-code `now() + interval '7 days'` across
four migrations and the live database carries hand-authored functions that
appear in no migration at all. A trigger covers the paths we cannot see.

The file ends in a read-only check: whether `invoices.due_date` exists and is
a timestamp, how many functions set a due date, how many subscription
invoices exist today, and whether the trigger is installed. Run the SELECT
first; it is safe on its own.

It deliberately does not retro-date an invoice that already exists, does not
touch `subscription_adjustment`, and does not change `next_payment_date` —
the plan still renews monthly.

