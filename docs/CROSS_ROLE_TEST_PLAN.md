# PSM Cross-Role Test Plan

Tests the 5 role scenarios **together**: who may see whose data, how an
action by one role flows to another (and never backwards), and whether
every amount/fee/commission is correct end-to-end. Run in the given
order — later steps depend on earlier ones. Live steps are done by the
operator (log in per role); the code-level checks are audited by agents
(RLS, accrual, fee math).

Roles: **SA** super-admin · **AD** admin · **A1**/**A2** two advertisers
(A1 referred by an affiliate, A2 not) · **AF** affiliate.

---

## Part 1 — Data isolation (nobody sees another's data)

Everything is scoped by `tenant_id` (RLS) + owner checks. Verify by
logging into each account and confirming the "must NOT see" rows are
absent (not just hidden in the UI — try direct URLs / IDs too).

| Actor | MUST see | MUST NOT see |
|---|---|---|
| **A1** (advertiser) | own wallet, own ad accounts, own top-ups, own invoices, own subscription, own referrals-as-affiliate (if any) | A2's wallet/accounts/invoices; any admin queue; any other tenant; the SeamX/supplier name anywhere |
| **A2** (advertiser) | own data only | A1's data; affiliate earnings; admin pages |
| **AF** (affiliate) | own referral book = **only the advertisers they referred** (A1), their spend/top-ups/commission; own payout wallet | A2 (not referred); A1's *wallet balance / invoices / ad-account internals*; any other affiliate's referrals; admin pages |
| **AD** (admin) | everything in **their tenant** (advertisers, wallets, top-ups, requests, withdrawals, subscriptions, promotions) | other tenants; super-admin surfaces (reconciliation, settings, refund/adjustment **approve**, audit, admins) |
| **SA** (super-admin) | everything in their tenant incl. profit, reconciliation, settings, approvals | other tenants |

- [ ] A1 cannot open A2's wallet/account/invoice by guessing the URL/ID (RLS blocks the read, not just the nav).
- [ ] AF's dashboard shows A1 (referred) but **not** A2; AF sees A1's *spend & commission* but **not** A1's wallet balance or invoices.
- [ ] AD on tenant T sees no data from another tenant.
- [ ] A plain AD hitting `/reconciliation`, `/settings/finance`, `/audit`, `/admins`, `/invites`, `/affiliates`, `/commissions` is redirected (super-admin only).
- [ ] The supplier/SeamX name never appears in A1/A2/AF-facing UI, emails, or invoices.

## Part 2 — Cross-role flow, in order (advertiser → affiliate, never reverse)

Do these as a sequence and confirm each downstream effect appears for the
right role and **not** for the wrong one.

1. **Referral link** — AF copies their link → sign up A1 through it.
   - [ ] A1 is created and **linked to AF** (AF sees A1 appear as a referral; A2, signed up without the link, does **not** appear for AF).
2. **Subscription at invite / signup** — A1 gets a plan (monthly fee + included accounts + top-up fee %).
   - [ ] A1 sees the plan + a monthly invoice; AD/SA see the subscription; AF does **not** see A1's subscription/invoice.
3. **Wallet top-up** — A1 requests a top-up (bank transfer + slip).
   - [ ] It appears **pending** to AD (Wallet Topups queue) and to A1 (pending). AF and A2 see nothing.
   - [ ] AD **Verifies** → A1's wallet balance increases by the amount. A1 sees it credited.
4. **Ad-account request** — A1 requests an ad account.
   - [ ] AD sees the request; AD creates it (via BM / invoice). A1 then sees the account live. AF/A2 unaffected.
5. **Ad-account top-up** — A1 moves budget onto an ad account (fee applies).
   - [ ] AD sees the ad-account top-up (with effective fee); on verify, budget moves. 
   - [ ] **Commission accrues to AF** (provisional) for A1's activity — AF's earnings go up; **A1 does NOT see AF's commission**; A2 causes no commission for AF.
6. **Withdrawal / clawback** — A1 withdraws unused ad-account balance (AD/SA-approved).
   - [ ] The related **affiliate commission is clawed back** for AF (earnings reduce accordingly). A1 does not see AF's clawback.
7. **Affiliate payout** — AF requests a payout of their commission.
   - [ ] AF's payout appears; SA/AD process it (manual). A1/A2 unaffected. AF cannot pay themselves.
8. **Direction guard** — confirm the reverse never happens:
   - [ ] An **affiliate** action (payout request, settings change) does **not** change any advertiser's wallet/billing.
   - [ ] An advertiser cannot grant themselves a perk, change their own fee, or see/alter commission.

## Part 3 — Prices & amounts correct at every step

Cross-check the same figure shows consistently across every screen it
appears on, and the math is right.

- [ ] **Subscription monthly fee** = the plan's `monthly_fee`; same value on A1 billing, AD/SA subscriptions, and the generated invoice.
- [ ] **Top-up fee** on an ad-account top-up = the account/plan `topup_fee_pct` of the amount; the "effective fee" AD sees on verify matches what A1 was shown.
- [ ] **Community fee** (if used): an advertiser tagged to a community (e.g. NSA 5%) uses that fee — *feature not built yet; skip until built.*
- [ ] **Perks**: a `topup_fee_waiver` → 0% fee; `topup_discount X%` → fee reduced by X%; `subscription_discount` → sub fee reduced; `free_ad_account_requests` → request cost €0 until used up. Each reflected in the actual charge.
- [ ] **Extra ad account** beyond the plan's `included_ad_accounts` = €50 from wallet (shows the wallet impact before confirm).
- [ ] **Exchange**: convert EUR↔USD → amount received = amount × rate − 0.6% fee; the "you'll receive" preview equals the settled result; balances move by exactly those figures.
- [ ] **Min top-up** = the wallet's `min_topup` (default €300, editable by admin); a lower amount is rejected.
- [ ] **Precharge**: advance-credit equals the pending top-up amount; on Verify it **settles** (no double credit).
- [ ] **Refund / adjustment**: the approved amount debits/credits the wallet by exactly that amount; sign (+/−) correct; audit_events records it.
- [ ] **Commission** (per referral terms): one-time bonus = agreed €; monthly = agreed %-or-flat of the monthly invoice; top-up share = agreed % (or ½-of-fee) of each ad-account top-up. AF's total = sum of accrued − clawed-back.
- [ ] **DST / location fee** (AT/TR 5%, FR/IT/ES 3%, UK 2%): *feature not built yet; skip until built.*
- [ ] Rounding: all money shows 2 decimals (or whole-euro where designed) and the sum of parts equals the total on every screen.

## Part 4 — How we actually run it

**Live (operator):** log into the preview in your Chrome as each account
in turn (SA → AD → A1 → A2 → AF). Tell Claude "logged in as X" and Claude
drives that session through the relevant parts above (Claude never types
a password). Re-login as the next account to check the other side of each
flow. Use the interactive checklist to record pass/fail.

**Code-level (agents, now):** agents audit — (a) RLS policies + tenant/
owner guards give the isolation in Part 1; (b) the referral-commission
accrual + clawback logic implements Part 2 steps 5–6 in the right
direction; (c) the fee/exchange/commission math in Part 3 is correct.
Findings get fixed, then the live pass confirms it.
