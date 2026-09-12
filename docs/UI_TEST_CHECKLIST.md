# PSM UI Test Checklist (redesign — branch `feat/redesign-advertiser`)

Full click-through / code-audit checklist for the mockup redesign, per
role. Live click-testing is done by the operator on the Vercel preview;
the audit agents verify the same items **in the code** (does the flow
exist, is it wired to the right hook/dialog, does every mutation go
through a SECURITY DEFINER RPC or a server action per `CLAUDE.md`,
nothing dropped vs. the old UI).

**5 role scenarios**
1. **Super-admin** — owner; everything admin + Owner nav (reconciliation, settings, logs, audit, invites, admins, referrals) + profit stats.
2. **Admin** — ops; no profit; verify/approve queues.
3. **Advertiser** — single-page app at `/dashboard` (adv-app).
4. **Affiliate** (standalone) — single-page app at `/my-referrals` (aff-app).
5. **Advertiser-as-affiliate** — advertiser role **with** an approved referral link → sees "Affiliate program" in the advertiser nav → `/my-referrals` renders the inline referral content (NOT the standalone aff-app).

Legend: ☐ not tested · ✅ pass · ❌ fail · ⚠️ issue/note

---

## 0. Cross-cutting (every role)

- ☐ Login (`/auth/login`): split-screen brand panel (desktop ≥860px) + form; gradient "Sign in"; wrong password shows error; magic-link `#access_token` redirect works.
- ☐ Favicon is the PSM rocket.
- ☐ Shell: sidebar logo + role label; active nav item highlighted; sign-out works (→ `/auth/login`).
- ☐ Mobile (<900px): sidebar collapses to hamburger + scrim; bottom bar shows with Home centred; tables/lists become scrollable/cards.
- ☐ Theme: light renders correctly (app forces light).
- ☐ No console errors on each screen load.
- ☐ Maintenance mode (`MAINTENANCE_MODE=true`) freezes mutations (banner shown).

---

## 1. Advertiser (single-page `adv-app`, `/dashboard`)

**Shell** — sidebar: Dashboard, Wallet, Ad accounts, Topups, My subscription, Invoices + Account (Notifications, Settings, Get help); topbar wallet €-pill + subscription pill + alerts + avatar + sign-out; bottom bar.

- ☐ **Dashboard**: welcome name; fee alert appears only when a subscription is due (real `subscriptions.next_payment_date`); 4 stat tiles (active accounts, EUR, USD, plan) from real data; "Your ad accounts" preview (max 3, real `ad_accounts`); "Your wallets" EUR/USD gradient cards (real balances). Tile click navigates to the right view.
- ☐ **Wallet view**: EUR/USD cards; **Top up** opens `WalletTopupDialog` (real bank-transfer + slip flow, min-topup); **Exchange** opens `WalletExchangeDialog`; pending top-ups list (real `wallet_topups` status≠completed); activity table (real `wallet_topups`); no fake "reserved" line.
- ☐ **Ad accounts view**: grid of accounts (real, screen icon, status badge, fee, currency); **Request ad account** opens `RequestAdAccountDialog`; per-card **Top up** opens `CreateTopupDialog` for that account; card/Details opens `AccountDetailsSheet` (carries withdraw). Locked/banned/paused accounts show lock note, no actions.
- ☐ **Requests view**: "Request ad account" / "New request" open the request dialog.
- ☐ **Billing view**: subscription card (real amount/status/renewal); "This month" fee due (real); invoices table (real `invoices`).
- ☐ **Notifications view**: renders (empty state honest — no fake rows).
- ☐ **Settings view**: Company form (save = toast); Notification prefs toggles; **Become an affiliate** (apply = toast). **No "Download my data"** lump export.
- ☐ **Get help**: FAQ + "Message your manager".
- ☐ Deep-link guard: `/wallet`, `/accounts`, `/top-ups`, `/my-subscription`, `/invoices` redirect an advertiser → `/dashboard`.

## 2. Affiliate (standalone single-page `aff-app`, `/my-referrals`)

**Shell** — sidebar "Affiliate portal": Dashboard, My Referrals, Wallet, Notifications, Settings, Get Help; topbar "This month €X" earn-pill + tier pill + alerts + avatar; bottom bar.

- ☐ **Dashboard**: jackpot hero shows real lifetime earnings (EUR); Referred / Active tiles (real counts); "Share your link" (real referral link from tenant slug + client code); Copy works; WhatsApp/Email/QR = toast.
- ☐ **My Referrals**: summary bar (referrals, active, top-up volume, commission — real); tier card (tier from real lifetime earnings, progress to next); referral rows (real per-referral spend/topups/earnings). Stat-tile shadow is soft (not heavy).
- ☐ **Wallet**: commission balance EUR/USD (real earnings totals); **Request payout** modal (currency seg) → toast (payouts are manual); "How payouts work"; recent commission (real rows).
- ☐ **Notifications**: renders (honest empty state).
- ☐ **Settings**: profile (name real, email disabled); show-earnings-in seg; notif-pref toggles; **Payout details** form (soft mockup inputs — verify inputs look right, IBAN/BIC etc.); save = toast. No "download all".
- ☐ **Get Help**: FAQ + contact manager.
- ☐ Login as affiliate lands on `/my-referrals` (`/dashboard` redirects affiliate → `/my-referrals`).

## 3. Advertiser-as-affiliate (hybrid)

- ☐ Advertiser (adv-app) shows **"Affiliate program"** nav item → `/my-referrals`.
- ☐ `/my-referrals` for an **advertiser** renders the inline `ReferralLinkBox` + `AffiliateDashboard` (NOT the standalone aff-app shell — it stays inside the advertiser shell).
- ☐ Referral link box (real link or "not set up yet" if no client code).
- ☐ Earnings/referrals shown; CSV export; commission clawback semantics intact (data-level).

## 4. Admin (mockup shell + route pages)

**Shell** — grouped sidebar (General: Dashboard; Customers: Advertisers, Ad Accounts, Account Requests; Money: Wallet Topups, Withdrawals, Ad-account Topups, Wallets, Invoices, Subscriptions; More: Promotions, Get Help). Live pending badges on Account Requests / Wallet Topups / Ad-account Topups. Topbar role chip "Admin". **No Owner group. No profit.**

- ☐ **Dashboard (ops)**: "Needs your action" hero = sum of real pending counts; 3 sub-metrics real; queue cards link to routes; **New invite** opens the invite dialog; throughput stats below (real `/api/stats`); admin sees **no profit**.
- ☐ **Advertisers** (`/users`): mockup list; search + sort + active filter; CSV export; row → details sheet; **Subscription** create; **Commission** setup; **Activate/Deactivate** (via `updateUserProfile`). Sorted 1→9999 by name (verify).
- ☐ **Ad Accounts** (`/accounts`): admin table (create/edit/status Active-Paused-Banned; set min-topup). *(Still shadcn inside the shell — flag if it must be mockup.)*
- ☐ **Account Requests** (`/ad-account-requests`): mockup card grid; **Review** opens review dialog → Create invoice / Create ad account / Reject (reason); Details sheet. Badge count matches queue.
- ☐ **Wallet Topups** (`/wallet-topups`): mockup verify queue; **Verify** opens approve dialog (`wallet_topup_admin_verify`); **Reject** with reason (`wallet_topup_admin_reject`); Details sheet; Wise review panel present.
- ☐ **Ad-account Topups** (`/top-ups`): mockup verify queue with effective fee; Verify / Reject; details.
- ☐ **Withdrawals** (`/withdrawals`): segmented tabs Withdrawals / Refunds / Adjustments / Precharge. Withdrawal Approve/Reject; Refund request (→ super-admin approve; "awaiting owner" shown for admin); Adjustment +/- request (→ super-admin); Precharge create + settle; outstanding banner. **Admin cannot approve refunds/adjustments (super-admin only) — verify gating.**
- ☐ **Wallets** (`/wallets`): mockup list; Edit balances (`wallet_admin_adjust`); Min amount (`wallet_admin_set_min_topup`); Details. No fabricated status column.
- ☐ **Invoices** (`/invoices`): admin table (advertiser/company columns, Create invoice, Pay/mark-paid).
- ☐ **Subscriptions** (`/subscriptions`): mockup list; Create; Change amount; Activate/Pause/Disable/Unpause. Admin can only change from next cycle / request amount change (super-admin sets) — verify.
- ☐ **Promotions** (`/promotions`): grant perk (5 kinds + count/discount/expiry/note); revoke; list with status.
- ☐ **Suspend advertiser**: admin max 1×/month, else super-admin approval (data-level — verify rule exists).

## 5. Super-admin (admin + Owner group + profit)

Everything in §4 **plus**:

- ☐ Sidebar shows **Owner** group: Reconciliation, Referral Links, Commissions, Settings, Activity Logs, Audit Log, Invites, Admins. Role chip "Super admin".
- ☐ **Dashboard**: profit stats visible (ProfitStatsCard) + SystemStatusPanel + RateLimitsView (super-admin only).
- ☐ **Reconciliation** (`/reconciliation`): per-currency + ledger + Wise (super-admin only — admin cannot reach). *(Still shadcn — flag if must be mockup.)*
- ☐ **Referral Links** (`/affiliates`): approve affiliate applications; open affiliate detail.
- ☐ **Commissions** (`/commissions`): list + filters + export.
- ☐ **Settings** (`/settings/finance`): exchange rates, ad-account types (per-type fee), banks (double-confirm), communities, notif prefs. Plan settings read-only for admin, editable for super-admin.
- ☐ **Activity Logs / Audit Log**: render + filter.
- ☐ **Invites** (`/invites`): full invite (advertiser plan/community/referrer + admin); **block duplicate pending invite email**.
- ☐ **Admins** (`/admins`): manage admins.
- ☐ Refund / Adjustment **approve** works for super-admin (the "awaiting owner" items).
- ☐ Subscription amount change / plan change is super-admin-settable immediately.

---

## Wiring / compliance checks (agents, per `CLAUDE.md`)

- ☐ No client component calls `.from('BUSINESS_TABLE').insert/update/delete` — every mutation via SECURITY DEFINER RPC or server action.
- ☐ Auth guards at boundaries: `requireAdmin` / `requireSuperAdmin` / `apiRequireAdmin`.
- ☐ No raw Supabase error logged (`safeErrorMessage`).
- ☐ Mockup ports dropped no column / filter / action vs. the old UI.
- ☐ No fabricated data (balances, counts, notifications) — real or honest empty state.
- ☐ `npx tsc --noEmit`, `npx next lint --max-warnings 0`, `npm test`, `next build` all green.

## Known interim (not yet mockup — functional inside the shell)

- Admin **Ad Accounts** table (`accounts-table` monolith).
- Admin **Invoices** table.
- Super-admin **Reconciliation / Settings / Activity Logs / Audit / Invites / Admins / Commissions / Referral Links**.
