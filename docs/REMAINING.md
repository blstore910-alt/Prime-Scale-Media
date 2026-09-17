# What is left, and what it costs

Written 2026-09-17 because "5–7 hours" was quoted and then quoted back at me.
Correcting that first, because the number was right about the wrong thing.

## The 5–7 hours was YOUR time, not the total

The earlier estimate was **35–50 h of my time + 5–7 h of yours**. Your 5–7 h is
the part nobody else can do: the tag-C steps of the journeys — sending real
payments, approving them, logging in once per role. It never included the UI
round, and it never included anything either of us has thought of since.

Since that estimate we have also ADDED scope, on purpose:

- team accounts for advertisers (new feature, ~12 tables of RLS)
- no-sideways-scroll on every settings grid, "overal"
- the Banks page actually holding the destinations
- everything found today that nobody knew was broken

So the honest answer to "kan dit in 5–7 uur, inclusief al onze UI bewerkingen"
is **no** — not for the whole plan. What CAN fit in 5–7 h of your time is the
journey walkthrough, once my side of it is ready.

## Today (2026-09-17)

Not polish. These were found, not guessed:

| what | why it mattered |
|---|---|
| Deactivate / Activate wrote nothing | Live had no admin UPDATE policy on `user_profiles`, only a self-update one. Fixed in the database. |
| Total profit overstated | USD top-up fees counted as euros (~16%) **and** paid `subscription_adjustment` invoices dropped. Reads €0.00 on an unpaid tenant now, which is correct. |
| Bank routing matched nothing | The slug table was written against the seed spelling; all eight live types use the other one. Auto-routing had never fired for anybody. |
| Bulk top-ups ignored plans and perks | A granted fee waiver was charged anyway, and a tampered payload could understate the fee on 200 rows at once. |
| "Source" shown to customers | `top_ups.source` is provenance and was rendered to advertisers in two places. |
| /wallet put a 300 floor on the first top-up | `min_topup` is 300 by column DEFAULT; the rule that exists for this was being bypassed. |
| Sort & filter unreachable | Opened ~1100px below the fold on every admin list. |
| `bg-muted` dark-on-dark | The shells redefined Tailwind's `--muted` as a text colour: 88 usages, 57 files. |
| Exchange-rate inputs rounded a live rate | `step="0.01"` on six-decimal rates; the spinner snapped 0.872361 to 0.87, a 0.27% error on every conversion. |
| Reference rates fetched by the browser | From an unauthenticated CDN, on the admin's own device. Now server-side. |
| The CSP would have broken flags on enforcement | 223 report-only violations from the country dropdown. |
| Six dead views, 12 dead components | Four fixes had landed in files no route renders. |
| 18 silent writes | All now count their rows. |
| Precharge had no UI | Built, then lost in a port. Back as a fourth tab on /withdrawals. |
| Wallet exchanges shown nowhere | A customer could exchange EUR→USD and see no record of it. |
| Customer lists read failure as emptiness | The advertiser app told someone with ten accounts they had none. |
| Reconciliation claimed balance with no data | "All balanced ✓" in green, and still green for "3 to investigate". |
| No confirmation on an ad-account request | Straight from Submit to a €50 wallet charge. |
| Sideways scrolling | Three settings grids, the period strip, the tab bar, two admin tables, the bulk dialog. |
| The backtick that broke the build four times | Now caught by a test that was itself verified by seeding the bug. |

## What is left

### 1. Agents sweep — ~2–3 h (mine)
Wave 6 has not run. Wave 5 found 16 surviving issues, 2 critical, both mine.
"Clean" means two consecutive waves with nothing above medium; we are not
close, and today added a lot of new code.

### 2. UI round — ~14–20 h (mine, you in the browser)
Admin screens **done**: dashboard, advertisers, ad accounts, account pool,
wallets, invoices, withdrawals, wallet topups, settings/banks,
settings/ad-account-types.

Admin screens **not yet visited**: top-ups, subscriptions, promotions,
ad-account requests, admins, affiliates, commissions, invites, activity logs,
audit, reconciliation, settings/{general,finance,plans,integrations}, manual,
notifications, profile. (~16 screens)

**The advertiser app and the affiliate app have barely been touched this
session** — and the advertiser app is the one customers see. That is the
largest single block left.

### 3. The journey walkthrough J1–J8 — ~6–9 h mine + 5–7 h yours
J1 is at step 7 (your transfer is sent; the top-up request still has to be
submitted and verified). J2–J8 not started. This is the part your 5–7 h
covers, and it is the last thing to do, not the first — a journey run over
screens that are still changing has to be run again.

### 4. Parked, each with a reason — ~10–14 h (mine)
- 18 silent-write sites still unguarded (`docs/NEXT_SESSION_FIRST.md`)
- ~~5 SQL checks written and never run~~ — run 2026-09-17, one FAIL
  (invitations.expires_at not timestamptz) found and fixed on live
- remaining wave-5 findings: dialog width overrides, bulk path skipping the
  plan/perk fee resolution
- first invoice due 3 days after signup, 7 days after that (a DB function)
- affiliate earnings wallet separate from the ad wallet (clawback risk)
- wiring the Banks table to the advertiser top-up screen — **money routing,
  wants its own session**
- `WISE_API_TOKEN` so deposit references can be read at all (yours: one env
  var in Vercel)

### 5. Team accounts — ~10–16 h (mine), own session
`docs/TEAM_ACCOUNTS.md`. Twelve tables of policy work on a live database
holding real balances, where a mistake is a lockout or a leak.

## Total

**Roughly 42–62 h of mine, 5–7 h of yours**, to a state where the whole plan
is walked and the sweeps are quiet. Not one sitting, and not the same number
as before — today closed a lot and opened some.

If a date matters more than completeness, the order that gets you to
"real clients can use this" soonest is: **2 (advertiser app first) → 3 → 1**,
with 4 and 5 after go-live. That is ~20–29 h of mine and your 5–7.
