# THE NUMBER: 13 of 16 journeys closed (A1-A7, F1-F4, D1, D2) - 2026-09-24

> **D2 CLOSED 2026-09-24.** Its last open step landed: the invitation was
> accepted, PSM0012 exists, and `create_subscription_from_invite` attached
> Prime by itself - EUR 200,00 active, and `advertiser_plans` reads
> 200.00 / 2 incl / 3.00%, exactly what the invite carried. The client code
> came out **PSM0012**, which is what the form now promises.
>
> **D3 is walked but not closed.** Its three queues are read and every
> figure held against the database; the clawback is PROVEN on production
> (see its block). What is missing is a withdrawal walked end to end,
> because only a customer can file one and no test customer has a funded
> ad account they can reach.

> **D1 CLOSED 2026-09-23.** Walked end to end on production with two roles at
> once - the owner in Chrome, a brand-new advertiser (PSM0011, Gers padoel)
> in the built-in pane. Verified EUR 250, refused EUR 999 and EUR 10 with a
> reason, undid the EUR 10 refusal and then credited it. The wallet closed at
> EUR 260.00 on the screen and 260 in `wallets.eur_balance`. Every decision
> carries an `audit_events` pair with an actor, and every one reached the
> customer's bell with the figure or the sentence in it. See its block below.

> **D1 is NOT closed, and the reason is a login.** Its customer half is walked and verified on screen and against the database; the admin half needs an owner session and I have none. Chrome holds PSM0005 (advertiser) and the built-in pane holds PSM0008 (affiliate) — two customer sessions. Creating accounts and typing passwords are the owner's, by their own instruction. Sign in as the owner anywhere and D1, D2, D3 and S1-S3 can all be walked.

## D3 - walked 2026-09-24. The clawback had never fired, and now it has

**The one that mattered.** `20260918230000_commission_clawback.sql` creates
two functions and two triggers. On production the functions were there,
`referral_clawbacks` was there, and **neither trigger existed** - only the
two `create trigger` statements had failed to land, and no later migration
drops them. So every approved withdrawal and every approved refund left the
affiliate holding commission on money that had come back. Two approved
withdrawals and one approved refund were already sitting on live.

Plak 85 placed them, and then I walked it rather than reading it, netting to
zero: a EUR 20 adjustment onto PSM0007's wallet, approved; a EUR 20 refund
off it, approved; wallet back to EUR 0.

| | |
|---|---|
| returned | EUR 20.00 of EUR 100.00 lifetime top-up volume |
| share | 0.2000 |
| PSM0005's commission on PSM0007 | 4.85 + 0.11 + 5.00 = EUR 9.96 |
| **clawback written** | **EUR 1.99** |

20% of 9.96 is 1.992. Before plak 85 it would have been nothing.

### The three queues, held against the database

| screen | database |
|---|---|
| WD-379727 EUR 20.00 approved, WD-081494 EUR 50.00 approved | same, same |
| WD-927138 $50.00 rejected, with BOTH sentences - "They said: A6 walkthrough" and "We said: This was filed in the wrong currency..." | `reason` and `decision_reason`, both stored |
| RF-951740 EUR 5.00 approved | same |
| ADJ-783784 +EUR 10.00 approved | `delta` 10, EUR |
| AA-PSM0007-EU-01: funded EUR 100.00, on the account EUR 97.00, fees EUR 3.00, two top-ups of 50 -> 48.50 at 3% | 2 x 48.50 = 97.00 and 2 x 1.50 = 3.00 |

### What the sweep found, worst first

1. **A failed read of the ad-account types handed back the SEED.** The
   fallback tested `data && data.length > 0`, and `undefined` - which is
   what a refused read leaves - went the same way as a fresh tenant with no
   types. The seed is 5% for everything and 6% for TikTok; this tenant
   charges 3, 3, 4, 3, 3. So a failed read filled the fee box with FIVE
   where the answer was three, under six Meta options instead of three
   (including the three that are switched off), and that number is written
   onto the ad account and is what we earn on every top-up for the life of
   it. It also defeated the warning written for exactly this: that warning
   fires when the slug is not in the map, and with the seed in place it
   always was.
2. **A request in `payment_pending` was stuck, and voiding its invoice gave
   the account away.** No control could move it - "I'm on it" wants
   pending, "Back to pending" wanted in_progress, and Review hides Create
   Invoice outside the fee stage - so an invoice raised for the wrong
   amount could not be replaced. Void it on /invoices and the unpaid-fee
   guard, which asked only for status `unpaid`, found nothing: Create Ad
   Account then succeeded with the fee neither paid nor outstanding, and no
   way left to raise one.
3. **Refusing a request refunds EUR 50 and the dialog never said so.** A
   reason box and one button; the figure appeared only in the toast
   afterwards, and the act is irreversible three ways over.
4. **Neither request dialog read the wallet balance, and both RPCs refuse on
   it.** An admin could pick a customer holding EUR 300, type 5000, and get
   a green "awaiting owner approval" - then the owner's approve dialog
   showed Customer and Amount and nothing else, and failed. There is no
   update path on `wallet_refunds` anywhere in the app, so that row can only
   be refused with a reason and raised again from scratch.
5. **A refusal wiped the reason it was asked for.** `wallet_refund_reject`
   and `wallet_adjustment_reject` do `reason = coalesce(p_reason, reason)` -
   the owner's refusal over the admin's own justification, in the database.
   Withdrawals got a separate `decision_reason` in plak 71; these two never
   did. Plak 86 adds it and points both RPCs at it.
6. **An employee admin could mark a request completed from the console.**
   `ad_account_requests` is the one table on this journey that
   `authenticated` may UPDATE, and the session guard stops `-> rejected`
   but not `-> completed`: no ad account created, the EUR 50 kept, the
   fee check skipped. Closed in plak 85.
7. **The withdrawal ceiling was summed unpaged** while the server pages the
   identical expression, with a comment saying why: missing top-ups
   under-count (safe), missing WITHDRAWALS inflate the balance (not safe).
8. **The withdrawal request dialog closed mid-write** and there is no
   duplicate guard on the RPC - its own comment says the natural next step
   is to file it again, and then both pending rows count against the
   ceiling and the customer cannot reach their own money.
9. **Three more that hid failures**: "Ad account created from request."
   swallowed the warning that the customer was never told;
   `rejectAdAccountWithdrawal` was the only refusal of four with no
   server-side reason check; and the approve path's single warning slot was
   already taken by the supplier message, so the two would have overwritten
   each other.
10. Smaller, all fixed: the cover check could hang on "Asking the platform
    what it holds..." for ever on a rejected promise while the tick box
    still released Confirm; the confirm modal went `busy` for a DIFFERENT
    row and locked with Escape and the backdrop dead; the three tab badges
    all cried "we couldn't read this queue" on every hard load; nothing
    invalidated `pending-counts`, so a badge and the header beneath it
    disagreed for up to a minute; the invoice dialog reset the form twice
    and read the rate without a tenant filter (0.86317 vs 0.872361, i.e.
    58 or 57 dollars); "Pending Requests" on /accounts answered "none"
    every time because it filtered on the admin's own advertiser row, which
    does not exist; `MAINTENANCE_MODE` froze two READS, including the live
    balance on the screen where an account is released; and the withdrawals
    queue printed `Eu-Meta-Psm` - the slug run through text-transform -
    where the tenant's own label is Meta-EU-PSM-RA.

### Still open on D3

- **No withdrawal walked end to end.** Filing one is the customer's action
  and there is no admin path to it; the only funded ad account belongs to
  PSM0007, whose login I do not have. Approve and reject are read and their
  guards checked, but not pressed on a live row.
- **Plak 86 is not applied yet** - `decision_reason`, the two empty
  wallets, and `wallets.tenant_id NOT NULL`.
- **`trg_withdrawal_takes_the_account_currency` is BEFORE INSERT OR
  UPDATE.** If an admin corrects an ad account's currency between filing
  and approval, the wallet is credited in the currency read before the
  update and the row records the one after. Narrow, and it fails closed for
  anything that is not USD or EUR. Worth an `on insert` narrowing in the
  next plak.
- **The "Create Invoice" branch of the request journey is dead code.**
  `ad_account_request_create_paid` always stamps `request_fee` or
  `request_fee_included`, and the button only appears when both are absent.
  All nine live requests carry one.

## D2 - walked 2026-09-24, ONE step open: nobody has accepted the invitation yet

Three of its four steps are walked on production as the owner and checked
against the database to the cent. The fourth - a customer accepting the
invitation - needs somebody to set a password, which is the owner's to do.

| step | what was done | database |
|---|---|---|
| **invite** | created for `d2walk2409@robustq.com`, Prime, **without emailing anybody** | `invitations`: advertiser, pending, plan attached, 200.00 / 2 incl / 3.00%, expires exactly 7 days out |
| **plan** | subscription added to PSM0011 from the dialog, Launch EUR 150 | `subscriptions`: 150.00 EUR, `inactive`, and the toast says so - "created, not billing yet" |
| **ad account** | created for PSM0011, Meta-EU-PSM-RA, then corrected through Edit | `ad_accounts`: D2-0011-WALK, eu-meta-psm, **EUR**, fee 3.00, active |
| **deactivate** | PSM0002 switched off and back on | `user_profiles`: back to `active` / `is_active = true` |

**All the branches of the invite dialog were walked**, not just the happy
one: Role -> Affiliate collapses the whole plan block (an affiliate buys
nothing); each tier fills its own figures (Launch 150 / Prime 200 / Flex 75
/ NSA 0); and picking the NSA community overrides Prime 200-2-3% with
0-1-5%, which is exactly what `plans` holds for it.

### What the sweep found, and what it would have cost

1. **A new ad account came out in DOLLARS when the admin picked euro.** The
   form has a currency picker, a default of EUR, a zod enum and a line of
   help text saying the customer's wallet is matched on it - and `currency`
   was not in the payload. So it arrived undefined and the server, which
   normalises anything that is not EUR or USD to USD on purpose so an
   account is never left unfundable, wrote USD. Walked: picked "EUR - euro
   account", pressed Create, row came back USD. Every funding of that
   account then debits the dollar wallet. The UPDATE form beside it had
   been sending it correctly all along.
2. **A referral can be approved that earns the affiliate nothing, and the
   dialog said the opposite.** `_accrue_referral_commission` reads
   `referral_links.commission_pct` and stops at `<= 0`, while the
   confirmation read "The affiliate earns from this customer from now on".
   PSM0010 -> PSM0005, created through the current RPC, carried no rate at
   all. The rate is now a fact in that dialog, and with no rate the lead
   says approving earns them NOTHING and where to set it first.
3. **The plan badge stated the TEMPLATE's terms, not the customer's.**
   `advertiser_plans` carries a copy per customer and three of the five
   live rows disagree with the plan they are named after. PSM0004 wore a
   plain "Prime" badge - which means 2 included at 3% - over a row that
   says 1 included at 5%. That is the badge an admin reads to answer "does
   their next ad account cost EUR 50?", and `advertiser_plans.topup_fee_pct`
   is second in precedence for what is actually charged. It reads
   "Prime · 1 incl · 5%" now.
4. **An empty read rendered as an empty answer, on five screens.**
   react-query pauses a query when the browser reports no connection, and
   v5 computes `isLoading` as `isPending && isFetching` - so it is FALSE
   while nothing has been read, `isError` is false too, and every screen
   falls through to its empty state. Measured: "No advertisers yet." over
   11 advertisers, "No ad accounts found" over 10 accounts, "You've not
   sent any invites yet." over 13 invitations, "this customer has no
   referrer AND there is nobody to set as one", and "No user selected" on a
   drawer the admin had just opened by clicking that customer. One line -
   `networkMode: "always"` - turns all of it into the error branch those
   screens already have.
5. **An invitation the table itself drew as Expired still handed over a
   link**, under a toast promising "it works until it expires or is
   cancelled" - and /invite/accept then told the customer it could not be
   used. Nothing ever writes the status 'expired'; it is a date, compared
   when the link is opened. A replacement invite to that address was
   refused by that same dead row, with no hint that cancelling was the way
   through.
6. **An account closed on the customer's own deletion request got a plain
   Activate button** whose confirmation talks about subscriptions and never
   mentions the erasure. One press signed them back in and restarted the
   monthly charge.
7. **The second Save on /settings/plans was always refused as somebody
   else's edit.** `dirty` was never cleared after a successful save and the
   adopt-effect refuses fresh server rows while anything is dirty, so the
   row kept the `updated_at` from before the save and failed its own
   version check. That is the screen that prices every new customer.
8. **The deactivate confirmation closed before its write.** Measured on
   production: dialog gone at 675ms, write landed at 2675ms - two seconds
   in which the only sign of life was a spinner in one cell. It now holds
   with "Saving…" until the write lands; re-measured at six seconds open,
   then closed.
9. Smaller, all fixed: the client code read PSM000012 for somebody who will
   be PSM0012 (the trigger pads to four, the form padded to six - and that
   string is the first half of every payment reference); three lines of
   preamble pushed the invite form below the fold; the helper line under
   every commission type was never drawn, though three of the seven types
   accrue nothing at all; a self-invite walked past the guard with one
   capital letter; Copy link was not disabled while it ran; "Only the
   account owner can cancel an invitation" was the refusal shown on a COPY
   press; Review on a finished request opened a grey bar with no buttons
   under "choose the next action"; and `send_email` had a branch in the
   route, a field in the schema and no control anywhere - so "create the
   link without mailing anyone" was unreachable. It has a checkbox now,
   which is how the invitation above was created.

### Still open on D2

- **Nobody has accepted the invitation.** Until somebody does, the
  invite-with-plan chain (`create_subscription_from_invite`) is not proven
  end to end. PSM0011 came in through a referral link with no plan, so A1
  does not cover it.
- **`npm run check` fell over mid-session and it was not the settings.**
  Supabase now publishes the direct host `db.<ref>.supabase.co` over IPv6
  only; this machine has no IPv6 route, so node could not resolve it at
  all. The pooler is dual-stack - `aws-1-eu-west-1.pooler.supabase.com`,
  port 5432, user `psm_check.<projectref>`. The script now says this
  itself instead of reading as a typo.

## D1 - CLOSED 2026-09-23. Admin queues: verify, refuse with a reason, tell the customer

**Walked, not read.** Owner in Chrome, PSM0011 in the built-in pane, both
signed in, on app.primescalemedia.com.

| step | screen | database |
|---|---|---|
| filed EUR 250, slip attached, ref 0011-2366666829 | pending, queue 0 -> 1 | `wallet_topups` pending |
| verified it | "Payment approved" | `completed`, `approved_by` set, wallet 0 -> 250 |
| filed EUR 999, refused it, reason from a template | "Rejected" | `rejected`, reason stored, wallet UNMOVED at 250 |
| filed EUR 10, refused it ("Slip unreadable") | "Rejected" | `rejected`, wallet still 250 |
| **undid** that refusal | "Transaction undone" | back to `pending`, reason cleared, wallet still 250 |
| verified the EUR 10 | "Payment approved" | `completed`, wallet 250 -> **260** |
| the customer's own wallet | **EUR 260.00** | `wallets.eur_balance` = **260** |

Every one of those six writes has an `audit_events` row with a before, an
after and an actor. Every decision produced a notification within two
seconds, and the refusals carry the admin's own sentence verbatim.

**All the branches of the reject dialog were walked**, not just the happy
one: the empty-reason branch (the button is genuinely disabled -
`disabled:opacity-50`, `pointer-events:none`, confirmed in the computed
style rather than by eye), each of the six templates (all six carry a real
customer-facing sentence), and picking a second template REPLACES the first
instead of appending to it.

### What the sweep found, and what it would have cost

Four agents, one journey. Ranked by what it would have done to a customer.

1. **A bank deposit that did NOT match its claim rendered green.** The strip
   drew the bank's figure, the card drew the customer's, two lines apart,
   and nothing ever subtracted them: EUR 618 arrived against a EUR 630 claim
   and the card said "Matched" with a tick. Verify credits the CLAIM. A
   currency mismatch read "Matched" too. The Wise panel on the tab BESIDE it
   has done that sum since it was written.
2. **And the repair for it had never once worked.** "Set the claim to EUR
   618.00" read a `description` column that does not exist on
   `wallet_topups` - in no migration, not on live. PostgREST answers 42703,
   the error was destructured away, and the button replied "Top-up not
   found" every time. That left two options in front of an operator: credit
   630 for money that never arrived, or refuse a payment that did.
3. **`wise_confirm_suggestion` was not executable by `authenticated`** while
   both call sites use the admin's own session - which they must, because it
   resolves `auth.uid()`. So "Confirm & credit" on the Bank deposits tab
   answered `42501 permission denied`. The grant had been stripped by a
   `create or replace`, exactly as CLAUDE.md warns. Restored in plak 81.
4. **The tenant guard in all four wallet-topup RPCs was blind to NULL.**
   `v_topup.tenant_id <> v_admin.tenant_id` is NULL, not FALSE, when the
   left side is NULL, so the `if` never fired. Four such rows existed, one a
   pending USD 100 - and they appeared in no queue and on no badge either,
   because every screen filters with `.eq()`, which excludes NULL. Backfilled
   and the column is `not null` now (plak 81), which closes all four at once.
5. **An active admin could move their OWN profile into another tenant** and
   inherit its money-in queue. Tightened in plak 81: never yourself, and
   only between tenants you already administer.
6. **A failed Verify left the card forever.** Only `onSuccess` invalidated
   anything, and the refusal that matters is "Topup is not pending" - which
   means somebody else already decided it. The queue does not refetch on
   focus, does not poll and has no refresh control, so the card kept saying
   Pending with all three actions live and every further click failed the
   same way until the browser was reloaded.
7. **The reject dialog closed under its own write.** Cancel was blocked,
   Escape and the backdrop were not - and this screen has ONE mutation and
   ONE dialog for every card. Escape on card A, then Reject on card B, and
   B's dialog comes up fully disabled reading "Rejecting..." for a refusal
   nobody submitted; when A lands, B's dialog closes itself under a green
   "Payment rejected". B was never touched.
8. **Undo existed everywhere except on a screen.** The RPC, the server
   action and the hook branch have been there for months, granted and
   guarded; the only Undo button in the repo is commented out in a file no
   route renders. Verifying the wrong top-up put real money in a wallet and
   then the card offered nothing at all. It has a button now, behind a
   confirmation that says what will happen - including that the balance may
   go negative, which the balance trigger allows on purpose ("a visible
   receivable, not a reason to abort the correction").
9. Smaller, all fixed: a net movement of -200 printed as 0.00; Reject and
   Precharge armed while it was still unknown whether a top-up carried an
   advance; "check the slip" on a card with no slip and no way to tell;
   the slip dialog saying "Couldn't load this slip" before anything was
   asked, and navigating the admin out of the app when a download failed;
   two detail sheets with no branch for "the read came back with nothing";
   the community pill reading a failed read as "in no community"; a raw
   PostgREST sentence in a toast; and `wallet_create_for_advertiser` open
   to `anon`.

### Customer-side, same journey

The refusal reason reached the bell and stopped there. The dialog an admin
fills in says twice that the customer reads it, and the customer's own
statement said "Rejected" and nothing else - on the row they come back to a
month later asking why EUR 999 never arrived. It is a paragraph, so it opens
in a window of its own: the amount, the reference, the date, the admin's
sentence, and the line nobody was saying - nothing was taken from your
wallet - with a button that opens a fresh top-up on the right currency.

And **"Money is in your wallet" went out without the figure in it.** The
payload writes `{"amount": 250}` as a JSON number and the bell read it with
a string-only helper, so every credit notice fell back to "We confirmed your
transfer and credited it to your wallet." Over the one event a customer is
waiting for. Same bug on the invoice paid from a wallet, and on the invoice
number.

### What could NOT be verified, and why

- **The mismatch strip has not been seen against real data.** No bank
  deposit is matched to any of PSM0011's top-ups, and the Wise feed is OFF
  on production (`docs/WISE_SETUP.md`: no webhook secret, no read token).
  The comparison is driven by its inputs and mirrors the sibling panel that
  has used the same arithmetic for months, but the red strip itself has not
  rendered against a live deposit.
- **"Confirm & credit" still has not been pressed.** Plak 81 restored the
  grant; with no deposit feed there is nothing on that tab to press it on.
- The slow first reject (~15 s from click to toast) was a cold Vercel
  lambda, not a fault: the same action ran in 1.3 s warm and the card left
  the list immediately. The button reads "Rejecting..." and both buttons are
  disabled throughout.
- **82 functions are still executable by `anon`**, but 76 of them return
  `trigger` and cannot be invoked through PostgREST at all. The six that can
  are `get_invite_by_token` (deliberate - the signup page reads an invite
  before an account exists), `current_advertiser_id`, `get_my_advertiser_id`
  and `get_current_profile_id` (used INSIDE RLS policies, which run as the
  reader, so revoking them would break RLS), `mark_session_seen` and
  `generate_wallet_reference_no`. Nothing open that matters.

## NOT BEFORE GO-LIVE — a referrer's own discount for the people they bring in (owner, 2026-09-23)

**What the owner asked for, in their words:** "sommige referrers moeten dus standaard een kortingscode hebben voor advertisers die via hun signen, bijv 20%, maar admin moet altijd melding krijgen bij die plan en approven etc."

So: a referrer carries a standing discount; anybody signing up through THEIR link gets it applied to their plan automatically; and the owner is told and approves before it is real.

**This is not on any of the sixteen journeys, so it is not built before go-live** — the rule in CLAUDE.md. Written down here with the design because most of the machinery already exists and it is a short job when it comes up.

**What already exists and should be reused, not rebuilt:**

- `advertiser_perks` plus `_effective_subscription_amount(advertiser, amount)` and `_effective_topup_fee_pct(advertiser, account)` — the discount engine is live and already applies per-customer discounts for a period. A referral discount is a perk with a different REASON for existing, not a different mechanism.
- `advertiser_plans` and the invite-with-plan flow — a plan is already chosen and attached at invite; this is the same field set arriving from a link instead of from a form.
- `referral_links` already records who referred whom, with `status` pending/active and an owner decision on it. That decision is the natural place to hang the approval the owner is asking for: approving the referral is already an owner action with a screen.

**The shape it should take:**

1. A column on the REFERRER (`advertisers.referral_discount_pct`, or a small `referral_offers` table if it ever needs more than one figure). The owner sets it on `/affiliates` — that screen already has a "Default rules" editor and per-affiliate rules, so it belongs beside them.
2. On signup through a link, the discount is recorded on the new customer as a perk in `pending` — NOT applied. Nothing about somebody's price changes without the owner.
3. The existing "Waiting for you" block on `/affiliates` gains that row: "PSM0011 signed up through PSM0008 — their link carries 20% off the monthly plan. Approve?" Approving flips the perk to active and the existing engine does the rest.
4. A notification to the owner on arrival, using the catalogue that already exists.

**Two things to get right when it is built:**

- **The customer must be told what they are getting, and only once it is real.** A discount shown before approval and then withdrawn is worse than never showing it.
- **It must not reach the affiliate's own screens as a margin figure.** "You give your referrals 20% off" is theirs to know; what that costs us is not, and the same rule as everywhere else applies.

## 2026-09-23 (late) — every plak from 69 to 80 is applied

Nothing is outstanding. What they did, in one line each:

| plak | what it closed |
|---|---|
| 69 | affiliate money: commission already inside an open request still counted as owed (€1,200 of claim on €700), lifetime kept losing a clawback that was already settled, and the per-link floor dropped money between the sentence and the button |
| 70 | every commission row says what it is ON (`on €48.50`) — without the profit, the percentage or the supplier's cut |
| 71 | `decision_reason` on withdrawals, and four tables now demand a reason to refuse (was two) |
| 72 | **the big one.** anon could wipe the whole rate limiter, had full CRUD on `public.admins` (which holds a Google refresh token), could write into every admin's notification bell, read every tenant, and ask any customer's fee percentage — all with the publishable key that sits in the page bundle |
| 73 | all 8 top-up invoices carried `currency` NULL, and the screen prints NULL as EUR; plus the amount went through `::real` |
| 74 | `affiliate_commission_list` named `i.amount`, a column that does not exist — the Every-commission card was dark on both portals |
| 75 / 76 | superseded by 77; 76 earned its keep by REPORTING the error 75 swallowed |
| 77 | the `::text` cast on `audit_events.row_id`, and a WHEN clause on the currency trigger instead of surgery in its body |
| 78 | `advertisers.payout_details` — so payout details are kept instead of retyped |
| 79 | 38 tables where anon could INSERT/UPDATE/DELETE/TRUNCATE → zero |
| 80 | 46 tables + 1 view where anon could SELECT → one (`tenants`, deliberately). **Our supplier cost is no longer queryable without an account**: `ad_account_costs`, `commission_rules`, `ad_account_type_suppliers`, `supplier_ad_accounts` |

### D1 — the customer half, walked and verified 2026-09-23

| what the screen says | what the database says |
|---|---|
| PSM0005 wallet EUR 70.00 / USD 56.98 | same, to the cent |
| 8 wallet-activity lines with their reference numbers | 8 rows in `wallet_topups` + `top_ups`, every amount and status matching |
| `21 Sep · Return refused · This was filed in the wrong currency… · $50.00 · Refused` | `ad_account_withdrawals`: rejected, 50 USD, `reason` = the customer's "A6 walkthrough", `decision_reason` = ours |
| affiliate: €0.11 on a €48.50 top-up | `referral_commissions`: 0.11 EUR, base_amount 0.53, pct 20 — and neither the 0.53 nor the 20% is on the customer's screen |

**Found by adding it up, not by looking at it:** every line on PSM0005's Wallet activity came to EUR 65.00 against a wallet of EUR 70.00. The difference was an approved +10.00 correction and a -5.00 refund, both real, and NEITHER had a line anywhere on the customer's screens. Their balance moved for a reason only we could see. Both are in the statement now, with the reason under them, and the seventh source is named in the "we couldn't load all of it" banner.

### Fixed today, code side

- **Every toast on `/auth/*` and `/invite/*` was drawn by nobody.** The three app shells each mount a `Toaster`; the auth shell never did. So "This email already has an account", "Sign up failed" and every invitation error were called and rendered by no one — on the first screen a new customer sees. The owner hit it live: pressing Create my account did nothing, because the address was already PSM0010's.
- **`isLoading` read as "no answer yet" in eight places.** react-query v5 reports it FALSE for a disabled query and a paused one. An admin read "No wallet topups to show" over eight waiting top-ups; an affiliate read "You're all caught up" over alerts carrying a rejected payout.
- **Six decision paths threw away `notifyAdvertiser`'s answer.** Measured: a EUR 10 adjustment went through on 23-09, audited, on a row with a sign-in behind it, with no notification row and a green tick on the admin's screen.
- **MAINTENANCE_MODE could not freeze the money-in queue** — two doors, both now behind a server action.
- **Approving an ad-account request told the customer nothing.** There was no notice type for it at all; we announced ourselves only when we said no.
- **An admin funding a EUR account was instructed in dollars.** `calculateTopupAmount` always divides by the rate; every real ad account here is EUR. Following the verify dialog would have handed over EUR 153.76 per funding.
- **Four of six queues could refuse without a word**, and a withdrawal's refusal overwrote the customer's own sentence.
- **Every euro sign in the affiliate app was double-encoded** by one of my own perl runs — the `eur` helper itself, so every euro figure in that app.

### The affiliate side, rebuilt on the owner's word

"deze is mooi van advertiser dit ook toepassen bij affiliate": the advertiser's Referrals tab had a round of work the portal never got, and its 400 lines of CSS lived in one shell. They are in `components/advertiser/earnings-cabinet-css.ts` now and both shells include them. The affiliate gets the dark earnings card, one period picker everything below obeys, four corner-lit stats, the quiet link, one line per referral, the Every-commission card, and `PayoutCard` on the Wallet. The tier is its own card with a conic progress ring and a four-rung ladder (Starter → Riser €1,000 → Scaler €3,000 → Legend €10,000). The Wallet has a lit head showing what is actually in it. The Settings WhatsApp button is a real Save.



> F4 closed 2026-09-23: all three kinds of commission booked and checked against the database to the cent. One rule is set but not yet walked (see its block).

> F1 CLOSED 2026-09-23: the standalone-affiliate portal was the last unwalked half, and it is walked — signed in as PSM0008 in the built-in browser, every screen, every figure against the database. See its block.

## F1 — CLOSED 2026-09-23: invitation / link -> signup -> portal with a working link

**The last half, walked 23-09 as PSM0008 (`xewama9321@robustq.com`) in the built-in browser, on app.primescalemedia.com, at phone width.** Every screen of the standalone affiliate portal: Referrals, Wallet, Home, Alerts, Settings.

| what the screen said | what the database says (`npm run check`, read-only) |
|---|---|
| Referrals: Earned €0.00, Awaiting payout €0.00, Paid out €0.00, Spend driven €0.00, "Your referrals 0", "Every commission · 0 commissions" | PSM0008: **0** referral_links, **0** referral_commissions, **0** affiliate_payouts. Same for PSM0009. Every zero on that screen is a genuine zero, not a failed read |
| Home: "Your total earnings €0.00", 0 referred / 0 active, "+€0.00 this month" | same |
| Wallet: "Getting paid", Request payout DISABLED with the reason stated — "as soon as you have €200 or $200 in commission, the button below opens" | `affiliate_payout_request_multi` enforces the same 200 floor server-side |
| the link, `…/auth/sign-up?t=prime-scale-media&ref=PSM0008` | opened it: the signup page renders **"INVITED BY A PARTNER · Referral code PSM0008"** — the referral is attached before a single field is typed |

**NOT verified, and it cannot be by me:** completing that signup. Creating accounts and typing passwords are the owner's, by their own instruction. The form renders with the referrer attached, and the code path behind it is the one already proven end to end on 22-09 with Piet Hendrik (PSM0010) through PSM0005's link — same route, same `findReferrer`, same approval flow.

**The whole affiliate side rebuilt on this journey (23-09), on the owner's word.** "deze is mooi van advertiser dit ook toepassen bij affiliate, heel affiliate design check": the advertiser's Referrals tab had a round of work this portal never got, and those 400 lines of CSS lived in one shell. They are in `components/advertiser/earnings-cabinet-css.ts` now and both shells include them. The affiliate gets the dark earnings card, one period picker every figure below obeys, four corner-lit stats, the quiet link, one line per referral, and the Every-commission card. The Wallet is `PayoutCard` — the same card the advertiser has, which carries what the old blue one never did: both currencies, a conversion preview, the 200 floor stated before the button is pressed, every earlier payout with its reference, a rejection reason, and a way to withdraw a request nobody has answered yet. The tier card is its own screen with a conic progress ring and a four-rung ladder (Starter → Riser €1,000 → Scaler €3,000 → Legend €10,000, the owner's numbers).

**Eight silent lies found by the four scoped agents and fixed (`02a2844`):** the portal OPENS on My Referrals and the link lived only under Dashboard, so both real affiliates read "share your link to start earning" with nothing on screen to share; `isLoading` was read as "no answer yet" in five places, and react-query reports it FALSE for a switched-off or paused query (the export said "nothing to export", the notification list said "you're all caught up" over alerts that carry a rejected payout, the bell badge vanished, the rate note claimed the tenant has no rate set, and "Advertise with us too" disappeared entirely); approving that upgrade looked exactly like never having asked, because `affiliate_upgrade_decide` clears both fields the card read; the invite signup toasted GREEN "Account created" on the failure path; the owner's invite dialog closed and reset itself mid-POST (invitation commits, link never shown, re-inviting refused); accepting during a maintenance freeze toasted "Error: undefined"; `openWhatsapp` returned void so callers reported success over a blocked popup; the payout invoice route answered 404/403 and so told a caller which ids are real; and the erasure read turned every failure into "you never asked".

**SQL waiting (plak 69, not yet applied):** four money faults and two gates on this journey, none of them visible today because both affiliates have zero commissions. (A) "still owed to you" counted commission already frozen into an open request — €1,200 of claim on €700 of commission. (B) lifetime earnings kept subtracting a clawback already settled in a PAID payout, so the portal and the owner's book disagreed by that amount and the tier was pushed. (C) the per-link floor `greatest(…,0)` dropped a clawback larger than that link's remaining unpaid, while the RPC nets across the whole book — €100 vanishing between the sentence and the button beside it. (D) "your payout is on its way" named the requested amount, not what was actually settled. (E) `ad_account_types_read` let any tenant member, including an affiliate and a deactivated account, read every `default_fee_pct` and `api_topup_enabled`. (F) `affiliate_payout_cancel` checked ownership on one row and updated a whole group without that predicate.

### The earlier half (22-09), for the record

**The owner's three decisions (22-09):** (1) a signup through a link waits for approval, and approving books everything since the signup with the rules of that moment ("dan moeten alle verdiensten meetellen, ook voor ik goedkeurde"); (2) an affiliate account is the affiliate portal only, with an "also advertise" upgrade the owner switches on; (3) an advertiser applying as affiliate: approve = link on, default rules, detail overview.

**Built + live:** `6477e81` .. `30ea6ce`. **SQL applied:** plak 42 (approve counts back: `referral_link_decide` / `referral_link_assign`; application status on advertisers + `affiliate_application_decide`; pending-link notifications; stats return pending links; locks: `invitations.token` unreadable by sessions, advertisers session guard, user_profiles insert without the invitee branch, referral_links status only via the RPCs) and plak 43 (standalone affiliates PSM0008/PSM0009 got a code + wallet + approved; `affiliate_upgrade_request/decide`). **Waiting:** plak 44 (drop the policy that let an affiliate read the full advertisers row of their referred customers — note, fees).

**Screens:** owner /affiliates "Waiting for you" (applications, upgrade requests, pending referrals — approve shows what was booked); advertiser Referrals redesigned on the owner's word (casino card first, period picker that drives stats + rows + commission list, compact rows with the Meta mark, chips that fit 360px, dollars as their own line); referral signup page rebuilt in the auth-shell style (fields were white on white); affiliate portal "Advertise with us too".

**Verified on production:** PSM0005 Referrals: all time €4.96 earned = €4.85 + €0.11, €4.96 to be paid, spend €97.00; This month (1–22 Sep) the same; Last month (Aug) €0.00 everywhere and an empty list; chip counts 2/2/0/0. Owner /affiliates: 1 affiliate, €4.96 earned/owed.

**Plak 44 applied:** the policy that let an affiliate read the full advertisers row of their referred customers is gone (advertisers select: admins + self; user_profiles select: admin + own).

**Plak 45 — approve counts back, PROVEN on real data (rolled back):** PSM0005 referred by PSM0008 with a link dated just before their first funding, approved as the owner: fundings #000002 and #000003 each fee 3.00 − supplier 2% of 97.00 (1.94) = profit 1.06 × 20% = **0.21**; invoice 124 (EUR 5.00, paid 21 Sep) × 20% = **1.00**; invoice 121 (18 Sep) correctly NOT booked (before the link). Booked 1.42 = 0.21 + 0.21 + 1.00, exactly what the RPC reported. Nothing left behind.

**Found on the walk and fixed (`459aaa2`):** the confirmation link reached /auth/confirm with no code (token already used — scanner / second click / other browser). The address was confirmed but the profile, wallet and referral are only made there, so signing in led to "create an organisation". Now `lib/auth/finalize-signup.ts` finishes the account from /auth/confirm, the sign-in action and /onboard. **Also fixed:** password reset always demanded the current password (read `user.amr`, which does not exist) — a dead end for exactly the people who need it.

**Waiting on the owner:** paste the six auth mails from `supabase/email-templates/` (token_hash links that work in any browser), sender name "Prime Scale Media", and make sure Redirect URLs include `https://app.primescalemedia.com/**`.

**Emails (owner, 22-09: "meer pro, alle emails" + "email reminder voor subscription"):** one layout (`lib/pure-email-layout.ts`: starfield hero `public/email/hero-bg.jpg`, real logo `public/email/psm-logo-dark.png`, glowing button, 1-2-3 steps, WhatsApp footer). Supabase auth mails generated to `supabase/email-templates/` (token_hash links -> /auth/confirm, work in any browser) — the owner pastes them. Subscription mails (`lib/pure-billing-email.ts`, sent from the notification webhook by `lib/billing-emails.ts`, at most once per notification via `notification_emails` = **plak 47, applied**): new invoice, **due soon** (new, created by the 03:00 UTC billing cron for invoices due tomorrow..+3 days, one per invoice), past due. **CHECK AFTER 23-09 03:00 UTC:** plak 47 row 2 listed E2E0001 #120 EUR 500 due 25-09 and PSM0006 #125 EUR 200 due 24-09 — both should have a `subscription_invoice_due_soon` notification and a `notification_emails` row; ask the owner for one SQL to confirm and whether the mail arrived.

**WALKED 22-09, both sides, and checked against the database (plak 48, read-only):** a real signup through PSM0005's link — Piet Hendrik, `najid72976@omanarts.com`, PSM0010 — confirmed by mail, finished by `finalizeSignup`, then approved by me in the owner's session (application first, then the pending link).

| what the screen said | what plak 48 read back |
|---|---|
| Piet's portal: cabinet €0.00, 0 referred / 0 active, wallets EUR 0,00 / USD 0,00, his link `…/auth/sign-up?t=prime-scale-media&ref=PSM0010` | advertiser PSM0010 exists in tenant `8bd8ff1e…`, wallet EUR 0.00 · USD 0.00, `affiliate_status=approved` (applied 16:19:03, decided 16:35:43) |
| owner /affiliates: "Waiting for you (2)" = the application + the pending link; dashboard tile said 2 | link PSM0005 → Piet `status=active`, `decided_at` 16:36:21, created 16:16:26, referrer PSM0005 correct |
| PSM0005's portal: "2 referred · 1 active", Piet listed with 0 top-ups / €0.00, earnings unchanged €4.96 | 2 links under PSM0005, both active; commissions EUR 4.96 over 2 rows; **zero** commission rows on Piet's link |
| PSM0005's commission list (1–22 Sep): €0.11 + €4.85 = Earned €4.96, To be paid €4.96, Paid €0.00 | same two rows, same cents |
| bell rang for every step | notifications last 24 h: `referral_pending`, `referral_joined`, `referral_approved`, `affiliate_application`, `affiliate_approved` — one each |

"Active" in the cabinet means *has funded at least once*, which is why Piet counts as referred but not active. A newly approved affiliate has **no row of their own** in `referral_links` (rows are per referred customer); the link works off `tenant_client_code`, and `findReferrer` accepts him because his status is `approved`.

**Still to walk (needs the owner — account creation and passwords are theirs):** a signup through **Piet's** link (proves a freshly approved affiliate's link, same code path as the one just proven); a standalone affiliate (PSM0008/9) signing in -> portal with a working link; "Advertise with us too" -> owner approves -> role advertiser.

## F4 — CLOSED 2026-09-23: every kind of commission

**The owner's rules, set on the walk (22-09, 22:29):** top-ups 20% of profit per ad-account type, **subscriptions 50%** of every paid invoice, **the first top-up of a new customer is ours** (0%), and **no one-time bonus by default** ("geen one time bonus default, first top ups is voor ons").

**Walked on production, both sides:**

| kind | what was done | what came out |
|---|---|---|
| subscription | new EUR 10 plan for PSM0007 (referred by PSM0005), activated → invoice 0007-130, marked paid | +EUR 5.00 — the book says "50% of €10.00 invoice"; earned 4.96 → 9.96 |
| subscription | same for Piet (PSM0010, also referred by PSM0005) → invoice 0010-131, marked paid | +EUR 5.00; earned 9.96 → **14.96**, still owed 10.00, and the affiliate's own screen agrees to the cent (4 commissions, Earned 14.96 / To be paid 10.00 / Paid 4.96) |
| top-up | proven in F2 (EUR 0.11 = 20% of EUR 0.53 profit) and still explained on the row | unchanged |
| one-time bonus | set EUR 10 for PSM0005 only (not the default), then paid Piet's invoice | did not book at first — **a unique index swallowed it**, see below. After plak 60: +EUR 10.00, and the affiliate's screen reads Earned 24.96 / To be paid 20.00 / Paid out 4.96, which is what the database says to the cent |

**Fixed in the database for this journey (plak 55, applied):** a bulk top-up made EVERY row count as "the first" (they share one `created_at`), so a 0% first-top-up rule wiped the commission on all of them — now the comparison is on (moment, id); the welcome bonus could only ever fall on a first top-up, never came back after a reversal and could not be given retroactively — it is one function now, called from the top-up AND the paid invoice; a reversed commission blocked the re-booking of a re-verified top-up; VAT would have been paid out the day an invoice carries any; and a 0% rule raised a false "commission on hold" alarm.

**Fixed in the database for this journey (plak 56, applied):** an employee admin could mint commission from nothing — write a paid invoice or a completed top-up with their own amount, set our supplier cost to 0% or 100%, or rename a type's slug so the supplier cost hangs on nothing. Money columns are the owner's now; verifying and marking paid stays their work.

**Found on the walk, fixed (plak 57, applied):** changing a subscription amount did nothing and said `permission denied for function change_subscription_amount` — the grant line of migration `20260917200000` was never pasted. The same plak read every money RPC: only `wise_confirm_suggestion` is still un-callable (the Wise feed is off anyway) and the emergency brake has never run here.

**Screens fixed on this journey:** the commission card printed EUR 0,00 for a read that never ran; the three sums excluded rows the list shows (now said out loud); subscription commissions could not be filtered for at all; `on_hold` and `reversed` wore the same amber "awaiting payment" badge with a green amount in the owner's ledger; the clawback banner said nothing while it was still loading; the per-customer column was gross under netted totals; a failed identity read rendered a full page of zeroes.

**The bonus bug, and how it was found (2026-09-23, plak 60, applied).** The first use of the new read-only connection (`npm run check`, see CLAUDE.md) — four minutes instead of four plaks. What happened to Piet:

1. his EUR 10.00 subscription invoice was paid at 20:43:15;
2. the engine booked the monthly commission, 50% = EUR 5.00, carrying `subscription_invoice_id` = that invoice;
3. the same engine then called the welcome bonus (plak 55), which writes EUR 10.00 — with the **same** `subscription_invoice_id`, because that is where it came from;
4. `referral_commissions_invoice_uq` was UNIQUE on `(subscription_invoice_id)`. One commission per invoice. The bonus was the second;
5. the insert ends in `on conflict do nothing`, so there was no error. The bonus vanished without a trace.

Ruled out along the way, each with one read: the rule did apply (own rule EUR 10.00 from 20:37, invoice paid at 20:43), the link is active, the affiliate is active, tenant and affiliate id match, and both functions are the plak-55 version. At PSM0007 the bonus rightly did not fall — his invoice was paid at 20:34:58, two minutes before the rule existed.

The top-up side never had the bug: its index already carries the kind, `(topup_id, coalesce(source,'topup'))`. That is why the bonus fell on a first top-up and not on a first invoice. Plak 60 gives the invoice index the same shape, unhooks the legacy `trg_create_commission_from_invoice` (previous commission model; it fires alphabetically BEFORE the real engine and would block it the moment a link gets `commission_type = 'monthly'`), and books the missed bonuses with the rule as it stood when the invoice was paid — not today's.

**Proven, screen against database, 2026-09-23:**

| | screen | database |
|---|---|---|
| Earned | EUR 24.96 | 24.96 |
| To be paid | EUR 20.00 | 20.00 |
| Paid out | EUR 4.96 | 4.96 |
| commissions | 5 | 5 |
| per referral | PSM0007 9.96 · PSM0010 15.00 | 4.85+0.11+5.00 · 5.00+10.00 |
| payout bar | EUR 20.00, "EUR 180.00 to go" | floor is 200 |

**Set but NOT walked:** "the first top-up of a new customer is ours". The rule is in the database (`first_topup`, 0%, for everyone, from 22-09 20:29:35) and `_topup_commission_calc` asks for it before the type rule on a customer's first completed top-up — read at the source, not walked, because it needs a brand-new referred customer's first funding. PSM0007's two top-ups were both before 20:29 and correctly paid the ordinary 20%. Walk it on the next new customer that comes through A1.

## F3 — CLOSED 2026-09-22: payout request -> owner sees it -> settled

**Walked on production with two sessions** (owner in Chrome, PSM0005 in the pane), after plaks 50, 51, 52 and 53 were applied. Every figure checked against the database with plak 54:

| what the screen said | what plak 54 read back |
|---|---|
| PSM0005 asks for €4.96, card flips to "Waiting for us", 2 commissions | payout **#1** EUR 4.96 `requested` 19:23 |
| owner's /affiliates shows "Payouts waiting (1)" with the bank details, marks it paid with a reference | `paid` 19:47, reference "TEST-WALKTHROUGH-2209 (geen echte overboeking)", commission_count 2 |
| affiliate: To be paid €0.00, Paid out €4.96, both rows "Paid", history "Payout #1" | EUR 4.85 + EUR 0.11 both `paid`, `paid_at` 19:47, both hanging on payout #1 — 4.85 + 0.11 = 4.96 to the cent |
| owner's book: Still owed €0.00 | 0 unpaid commission rows left for PSM0005 |
| both bells rang | `affiliate_payout_requested` ×1, `affiliate_payout_paid` ×1 |
| "Self-billed invoice · Payout #1" opens with their company, IBAN and partner code | generated from the payout row itself (`/api/payouts/<id>/invoice`) |

**Built for this journey, on the owner's word:** pick which balance to be paid (EUR, USD or both) and how to receive it — two banks (only offered to somebody who actually earned in both) or everything converted to one currency at the tenant's rate minus 0.6%; a floor of **200 per currency received** (EUR 150 + USD 150 passes when converted into one, not as two transfers); the request button stays put and says how much is still missing; last time's bank details are prefilled per affiliate; "View request" shows exactly what was submitted; **Payout #n** per tenant, one number per request even when it covers two currencies; and a self-billed invoice per payout.

**Not verified, and why:** the USD leg and the conversion were only seen as a preview in the dialog (€4.96 → $5.69 − 0.6% = $5.66) — no dollar payout has been run, because no test affiliate holds USD commission; the EUR 200 floor could not be exercised upward (this payout was EUR 4.96 and predates the rule); and the standalone affiliate portal (`aff-app`) is unwalked, like F1's last step, until there is a login for PSM0008/0009.

**One thing for the owner:** the self-billed invoice names **TURLIT LLC, 30 N Gould St** as our company — that is the tenant company row on /settings/general, the same one your customer invoices use. Change it there and the payout invoice follows. (The two active exchange rates turned out to be one per tenant — Prime Scale Media 0.87236, the E2E test tenant 0.86317 — so nothing to fix.)

## F3 — the sweeps behind it

**What it was.** "Request payout" opened WhatsApp with a sentence in it. Nothing was recorded — no amount, no date, no status. The owner had no queue, the affiliate could not see anything, the IBAN they typed under Settings was never stored, and the only control that marks a commission paid (`CommissionStatusAction` → `setCommissionStatus`) is mounted on **no route at all**: `commission-row.tsx` and `commission-card.tsx` are imported by nothing. So no commission in this database could ever become `paid`, `unpaid_*` stayed equal to lifetime earnings for ever, and the affiliate's wallet kept asking for money that may already have been transferred.

**What is built (live `e7f2ad2`, dark until plak 50 is pasted).** One request per affiliate per currency, covering everything owed in it. `affiliate_payout_request` freezes the amount by hanging the exact commission rows on the payout (`referral_commissions.payout_id`), so it cannot drift while it waits and the same commission can never be in two payouts; unsettled clawbacks come off once and are then marked settled. The owner gets "Payouts waiting" on /affiliates with the bank details attached, and either marks it paid (with their own reference — this records a transfer, it does not move money) or sends it back with a reason. Both sides get a notification (`affiliate_payout_requested` / `_paid` / `_rejected`). The affiliate sees the request, its state, and can withdraw it while nobody has answered. Screens: `components/advertiser/payout-card.tsx` (advertiser-affiliate), the Wallet card in `aff-app.tsx` (standalone affiliate), `components/affiliate/payout-queue.tsx` (owner).

**Fixed on this journey, from the four sweeps:** the owner's "Still owed" ignored clawbacks and counted commissions on rejected links — hundreds of euros above what the affiliate's own screen showed, on the screen the owner pays from; the queue read 50 rows before filtering, so a waiting request could fall out of the owner's list; the payouts cache key carried no identity; the portal offered a live Request button and "ask for one" copy while the read was still running; loading was rendered as failure ("pull down to retry", which does not exist anywhere); the book's status and clawback reads were unpaged (PostgREST stops at 1,000 rows silently); `?page=` past the end claimed "No commissions yet".

**In plak 50 before it is pasted, from the money sweep:** it now resolves the affiliate the same way the wallet does (newest advertiser row, not "largest unpaid"), leaves rejected links out, notes it on the payout when a commission is reversed between request and payment, stops a settled clawback being subtracted for ever (`affiliate_referral_stats` rebuilt with one extra condition), closes direct writes to `referral_commissions` / `referral_clawbacks` (any employee admin could mark money paid — or un-pay it — over PostgREST), and takes our margin columns out of what an affiliate can read from the table.

**Still open on F3:** walk it on production once plak 50 is in (request as PSM0005, settle as owner, check the figures against the database); `?real` storage of `referral_commissions.amount` (floats, cents drift — needs its own careful migration); the orphaned `commission-status-action.tsx` / `commission-row.tsx` / `commission-card.tsx` should be deleted, they contradict the payout model; the standalone portal's Settings payout form still only WhatsApps (the request modal now carries the details instead); R12's open question — pay to their bank or credit their wallet — is still the owner's to answer, and the table has a `method` column ready for both.

## F2 — CLOSED 2026-09-22: referral in -> commission arises -> matches the database

**Walked on production with three sessions:** owner in Chrome, PSM0007 (referred customer) and PSM0005 (affiliate) in the pane.

| check | result |
|---|---|
| rules | supplier fee per type set in Settings (Meta-EU-PSM-RA 2%, -GH 2.5%, rest 0%); default rules saved in /affiliates (20% of profit per type, 20% per paid subscription invoice, no one-time) from 22-09 11:31 |
| the funding | PSM0007 funds EUR 50 on AA-PSM0007-EU-01 (fee 3%), owner verifies (#000005) |
| database, plak 38 | commission **EUR 0.11**, source topup, unpaid: profit 0.53 = fee 1.50 − supplier 2% of 48.50 (0.97), × 20% (default-type rule). Same figure the tested TS twin predicts. earnings_eur on the link 4.96 = sum of rows 4.96. PSM0007 wallet 0.00 |
| owner screens | /affiliates: EUR 4.96 earned/owed; the row reads "20% of profit €0.53 (fee €1.50 − supplier 2% = €0.97) €0.11"; /commissions lists 0.11 and 4.85 unpaid; Verify showed "Supplier 2% = €0.97 · Our margin €0.53" before verifying |
| customer PSM0007 | wallet 100 − 50 − 50 = **0.00**; Funded to date **97.00**; no commission data anywhere on their screens |
| affiliate PSM0005 | notification "You earned a commission — €0.11 from a top-up by PSM0007"; Commission €4.96, Spend driven €97.00; Every commission: two rows "Top-up · Meta" 0.11 / 4.85 "To be paid", totals Earned 4.96 / To be paid 4.96 / Paid 0.00; sort (largest / oldest), filters (Subscriptions → nothing, Paid → nothing) and click-a-referral focus all verified |

**The old EUR 4.85** (booked 21-09 under the old rule, 10% of what landed) stays, per the owner: "wat hij tot nu toe verdiende blijft".

**Fixed on this journey (4-agent sweep + walk):** commission on PROFIT with versioned rules (plak 35, `lib/pure-commission-rules.ts` 13 tests) incl. subscriptions and one-time; tenant filter on the accrual; accrual on INSERT-as-completed; reversal when a completed funding is undone; old clawbacks off; stats RPC on active links + landed spend + clawbacks in range; commission screens refresh after verify / mark paid / on focus; "Percentage" filter; labels; loading ≠ error; /affiliates = one row per affiliate + detail page; affiliate sees every commission (plak 39) but never our margin, the type or the % (plak 39/40); notifications earned / on hold / failed. **Security found and closed on the way:** customer could complete their own top_ups (plak 34) and their own WALLET top-ups = free money (plak 37); invitee could edit their invitation; customer could write their advertisers row; ad-account request without fee/plan; affiliate could read our margin (plak 39).

**Carried, not F2:** `?ref=` signup ordering + pending-link notification (F1); `paid_at` for "commissions paid" by payment date, Mark Paid naming the affiliate (F3); "Spend driven" is shown to affiliates — the owner has not said whether that reveals too much (ask at F3).

# OWNER REQUESTS, 2026-09-21 (late) — the build list, in the owner's words

Asked during the F2 walk. None of these is optional; the order is mine.

| # | request | state |
|---|---|---|
| R0 | **SECURITY, found by plak 33: a logged-in CUSTOMER could insert/update their own `top_ups` rows** (policies "Enable insert for advertiser" / "Enable update advertisers" + grants), e.g. mark a funding `completed` without paying — which then counts toward the withdrawal ceiling. Same class: an invitee could edit their own invitation; a customer could write their whole `advertisers` row. | **plak 34** (`PLAK-DIT-34-KLANT-SCHRIJFT-GEEN-GELD.sql`) — the owner's first run returned "No rows" (partial run); must be re-run whole. Its row 7 unblocks the last step: admin top-up inserts via the service key (`actions/topup-actions.ts`, staged locally, NOT pushed) + revoke INSERT |
| R1 | **Commission rules.** Per affiliate (and a default for all), set what they earn FROM NOW ON — what is already earned stays. Top-ups: % of **our PROFIT only** ("supplier fee moet er af"), settable per ad-account type. Subscriptions: % of every paid invoice. A new rule applies to ALL their referred customers from that moment. | **built + live** (`00bf6ed`, `a4114a7`): rules editor (default + per affiliate, per type, subscription %, one-time bonus), 13 tests; DB = **plak 35** (not yet pasted). After it: set the default rules, then walk one new top-up to prove profit × % to the cent |
| R2 | **/affiliates = list of affiliates** → click → all their referrals, their rules per account type / subscription, every commission with its calculation, detailed. | **live** `00bf6ed`; walked as owner: overview shows PSM0005, 1 referral, EUR 4.85 earned/owed = plak 32 |
| R3 | **Account deletion is a REQUEST to the admin**, not an immediate lock. Remove "Blocks your login right away. Financial records are kept for 7 years by law." Only after the admin approves is the account closed. | **live** `d3f321b` (request + owner approve/decline on the user sheet); DB = **plak 36** |
| R4 | **"Push to supplier" must say it succeeded**, and then we check in Rockads ourselves. Found: the button can never succeed today — it pushes to the `supplier1` channel (not Rockads), the gate is off, EUR accounts are refused by design, and the enqueue requires `completed` while the dialog only opens for `pending`. The RockAds deposit call is deliberately NOT implemented (`lib/integrations/rockads-api.ts`). The step text "there is no dashboard to log into" is wrong — they check in Rockads. | needs owner decision: build the real Rockads deposit, or drop the button |
| R5 | **Sub-users**: several people (e.g. two partners) on ONE advertiser or affiliate account. "Dat zijn er heel veel." | backlog — big: auth, roles, RLS, every `advertisers.user_id` read |
| R6 | **Change email**: a user can change their own login email, or an admin does it for them. | backlog |
| R7 | Customers must NEVER see the ad-account TYPE (e.g. "Meta-EU-PSM"). | **DONE `38f293b`** — `customerPlatformName` |
| R8 | **No plan → the customer picks one themselves**: the 3 standard plans + a yearly option, then pay. BUT a customer with a discount, in a community, or whose plan the owner already chose at onboarding gets NO choice — straight to that plan and paying. Affiliates are not advertisers: no plan choice for them, only once the owner switches on "advertiser mode" for that affiliate. | backlog — needs a start-subscription RPC (subscription + first invoice + pay from wallet) |
| R12 | **Payout is BULK per affiliate, not Mark Paid per commission** (owner, 22-09: "hoef geen mark paid, dat moeten we in bulk doen, eigenlijk de wallet uitbetalen van een advertiser/affiliate, en dan moet alles kloppen"). Per-row Mark Paid removed from /commissions and /affiliates. F3 builds: one payout record per affiliate covering exactly the owed commissions, amount = their sum. Open question for F3: paid to their bank, or credited to their advertiser wallet? | F3 |
| R13 | **Slash API for the Zanel bank account (GH)** (owner, 22-09, with the docs: https://docs.slash.com/introduction). Facts from the docs: base `https://api.slash.com`, auth `X-API-Key`, resources accounts / transactions / cards / transfers / virtual accounts, `X-Idempotency-Key` on money movement, API still in beta. First use = READ: match incoming/outgoing transactions to GH top-ups (reconciliation). Advised the owner: create the key **Read-only** for now (the dialog had Scope All + write), never paste it in chat; it goes in Vercel as an env var when this is built. Writing (paying the supplier) only on the owner's explicit say, same rule as the Rockads deposit (R4). | backlog — NOT on a journey; after go-live |
| R14 | **Employee tracker** (owner, 22-09: "a built-in tracker to see how many top-ups an admin processed, ad-account requests, in-app activity, so I can measure employees"). Today: /audit (every change with its actor, filter per admin) and /activity-logs exist — you can look up what one person did, but there is no summary. Build: per admin per period — wallet top-ups verified / rejected, ad-account top-ups verified, requests handled, withdrawals decided, median handling time (created → decided), from audit_events; each figure opens the list of rows behind it (CLAUDE.md: a number must be verifiable against its list). | backlog — belongs to S3 (audit); after go-live unless the owner says otherwise |
| R15 | **DST (digital services tax) from RockAds, charged on to the customer** (owner, 22-09: "we hebben ook DST van RockAds, kunnen we dit misschien via API krijgen, dan moeten klanten gecharged worden via hun wallet en topups en reserven, en ook chargen wanneer het echt charged is… misschien moeten ze daar een menu voor hebben met alle details, en anders wat niet via API is moeten admins per week bij iedereen invullen"; and: "als er iets reserved is, heel klein en subtiel onder de wallet-bedragen laten zien, en als je erop klikt ga je naar DST, alle info detailed en transparant, goed design"). So: (a) pull DST per ad account from RockAds where the API gives it, (b) admins type it in per customer per week where it does not, (c) **reserve** it against the wallet the moment it is known and **charge** it when it is really charged, (d) a DST screen with every line: period, account, base, rate, reserved, charged, what is left, (e) on the wallet cards a very small, subtle "reserved" line under the balance that opens that screen. Note `lib/integrations/rockads-api.ts` exists but the deposit call is deliberately not implemented (see R4), so the API side has to be looked at first. | backlog — NOT on one of the 16 journeys, so not before go-live unless the owner says otherwise; touches the wallet, so it needs its own money-arithmetic sweep |
| R11 | **Ad-account fees work like the commission rules**: change a customer's fee (e.g. 4% → 3%) and it applies FROM a moment the owner sets, with a history; and wherever a fee is edited, the SUPPLIER fee of that account type shows beside it (admin-only), so the margin is visible while deciding. Already true today: each top-up stores its own fee, so past top-ups never change. | backlog — belongs to S1 (prices) / D2 (manage customer) |
| R9 | Every "message us" button is WhatsApp to +31 6 15300300. | **DONE `ebc1933`** — `lib/whatsapp.ts` |
| R10 | "Prime" shown with no subscription; ad accounts requestable without a plan. | **DONE `1ffdeb4`** (screen); the server check in `ad_account_request_create_paid` waits on plak 33 row 16 |

Also fixed on the owner's word this session: verify-dialog header alignment (`1c1607c`), the "You're all set" strip (`81b761b`), every red button in the app was invisible (`fae43d2`).

# READ THIS FIRST — state of play, 2026-09-21 (evening)

> **HANDOVER.** A NEW Claude session, possibly on a different account,
> picks this up. Everything that carries over is in this repo and pushed
> to `main`.
>
> **The prompt to paste into that fresh session is
> `docs/HANDOVER_PROMPT.md`.** It is self-contained: the standing
> instruction, the state of play, the test accounts, the exact next
> step, what the owner still has to decide, and the five traps that cost
> this session the most time. Paste it, then read this file, then
> `CLAUDE.md`.

## THE NUMBER: 10 of 16 journeys closed (A1-A7, F2, F3, F4).

**A7 closed 2026-09-21.** PLAK-23 landed and the first successful
exchange in this app's history was walked end to end; every figure
agrees with the database to the cent. See the A7 block below.

## How to start, in order

1. `git pull`. `main == feat/redesign-advertiser`; deploy is
   `git push origin feat/redesign-advertiser:main`, straight to
   app.primescalemedia.com. Verify with
   `curl -s https://app.primescalemedia.com/api/version` — it returns
   the deployed short SHA.
2. Gate before EVERY push:
   `npx tsc --noEmit && npx next lint --max-warnings 0 && npm test`,
   chained with `&&`, never piped through `tail` or `grep` (that masks
   the exit code). 469 tests, all green as of this handover.
3. **Two browsers, one session each.** One Chrome = one Supabase
   session, so the owner and a customer CANNOT share a browser —
   signing in as one signs the other out. Owner in Chrome
   (`mcp__claude-in-chrome__*`), customer in the built-in pane
   (`mcp__Claude_Browser__*`). Ask the owner to sign in; never type a
   password and never create an account — that is theirs.
4. **Paste-ready SQL lives in `supabase/checks/PLAK-DIT-*.sql`**, one
   report table at the end (the editor shows only the last result set)
   and NAMED dollar tags. The owner pastes them by hand and sends the
   table back.

## Test accounts

| code | who | login | state |
|---|---|---|---|
| PSM0005 | Test Advertiser | `xifape4500@jobscai.com` | €195.00 wallet, Prime €5/mo, next 20 Oct, 1 ad account |
| PSM0006 | John Doe (Trackbee) | `a1walk2609@robustq.com` | signed up 21 Sep, €0 wallet, Prime €200/mo, invoice 0006-125 open, due 24 Sep |
| owner | Bart | the owner's own | super-admin |

## SQL: what is applied and what is waiting

**Applied and confirmed** (report table came back): PLAK-NU, 2, 3B, 4,
5, 6, 7, 9, 10, 11b, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24
(trigger only), 24b, 25, 26, 27, 28, 29, 30, 31.

**NOTHING IS WAITING ON THE OWNER RIGHT NOW.** Every plak written this
session has come back with its report. The next one will be written when
a walk needs it.

**Still to set, not SQL:** `READONLY_SQL=on` in Vercel. The read-only
role is in place and proven (`_ro` owned by `psm_readonly`, bypassrls
on, 9 wallets counted against 9 actual). `/api/dev/ro` is owner-only and
refuses until that env var is set. Until then every figure check costs
the owner a paste.


## The open question that blocks A1

`create_subscription_from_invite` (live body captured 21 Sep, in the
PLAK-15 header) creates the subscription with `next_payment_date =
now()` and **creates no invoice**. The cron runs at 03:00
(`vercel.json`). Yet PSM0006 signed up at 10:15 and had invoice
0006-125 immediately. **Something on the live database raises it, and
nothing in this repo does.**

Why it matters: PLAK-10 made the clock advance only for an invoice with
a real `period_start`. If that first invoice has none, paying it will
not move `next_payment_date`, it stays at today, and tomorrow's run
sees the same subscription as due again. PLAK-15 rows 3–7 answer it.

## Live-vs-repo drift found today (read this before trusting any migration)

- **`get_invite_by_token` on live is NARROWED.** It returns
  `affiliate_id, email, expires_at, id, role, status, tenant_id,
  tenant_name` — no `token`. The repo still has `to_jsonb(i)`. That
  difference broke EVERY invite signup with a 400 until it was fixed
  app-side (the token now comes from the URL).
- **`create_subscription_from_invite` on live** has a tenant filter on
  the `auth.uid()` branch that the repo copy lacks, and does
  `coalesce(v_inv.topup_fee_pct, 0)` — so a blank fee box became a
  permanent 0%.
- The lesson both times: **read the live body before reasoning about
  behaviour.** Ask for one `pg_get_functiondef`.

# READ THIS FIRST — state of play, 2026-09-21 (earlier)

## THE NUMBER: 10 of 16 journeys closed (A1-A7, F2, F3, F4).

| journey | state |
|---|---|
| A1 invite → signup → onboarding → dashboard | **CLOSED 2026-09-21.** Invite created as owner (every branch of the dialog opened first), link copied, signed up as PSM0006 in the pane, onboarding and dashboard walked. Figures agree: EUR 0 wallet, Prime EUR 200/mo, invoice 0006-125 EUR 200 open. The first-invoice question is answered: `trg_create_invoice_on_subscription_created` raises it, and it was raising ORPHANS — see below. PLAK 14/15/16/17 all applied |
| **A2 wallet top-up** | **CLOSED.** €300 filed as PSM0005 after walking all four transfer currencies, verified as owner, balance 300.00 = sum of movements 300.00. Then €1,000 filed and rejected with a template reason — row Rejected, balance untouched, reason reached the bell |
| A3 ad-account request, €50 off the wallet | **CLOSED 2026-09-21.** Every dialog branch opened; the INCLUDED path proved end to end (wallet stayed €195, request reached both queues without a reload); and the €50 leg EXECUTED: €195.00 → €145.00 on the customer screen AND the owner's /wallets, with the statement line "Ad-account request fee −€50.00 Charged" appearing for the first time ever. Eight faults fixed; what is left is listed below and none of it is on this journey's money |
| A4 fund an ad account | **CLOSED 2026-09-21.** €100 at 3% → €3 fee, €97 lands, wallet €145 → €45 on BOTH screens; verified as owner; Funded to date €97 → €194; statement row On its way → On the account. Six faults fixed, nine open — see below |
| **A5 invoice → Pay now** | **CLOSED 2026-09-21.** Invoice 0005-124 (€5.00) paid from the wallet as PSM0005 in the pane. €200.00 → €195.00 on the customer screen AND on the owner's /wallets; statement row −€5.00 dated 21 Sep; invoice Paid; clock 20 Sep → 20 Oct on both sides. Reconciles: €305 credited − €110 spent = €195 |
| A6 money back off an ad account | **CLOSED 2026-09-21.** Both branches walked: rejected with a reason (no money moved, ceiling restored), then approved — wallet €45.00 → **€95.00** in EUR, USD wallet untouched, owner /wallets agrees. Nine faults fixed, six open — see below |

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

### A1 — found by WALKING it, all fixed and live

Not one of these came out of reading the code. They needed the browser.

- **Nobody could sign up.** Every invite gave 400 `invite.token:
  expected string, received undefined`. See the live-vs-repo note at the
  top. Fixed: the token comes from the URL (`d6afa0a`).
- **The sign-out button on the wrong-address invite card signed nobody
  out** and rendered `{"ok":true}` in the tab. It was a form POST to
  `/api/auth/sign-out`, which only clears the httpOnly `profile_id`
  cookie — not the Supabase session. Open the link again, same card,
  for ever. This is the FIRST screen a new customer sees when they open
  their invite on a machine where somebody else is signed in
  (`2d3cb3e`).
- **"1 step left", permanently, on every set-up advertiser.** "Earn as
  an affiliate" has `auto: false` for ever and was counted, so the meter
  sat at 75% and "You're all set" was unreachable. The offer stays, the
  count drops it (`d6afa0a`).
- **The invite token was in every employee admin's browser**
  (`select("*")` over an `_is_admin_of` policy). Token + the invitee's
  own address IS that account, because the signup route passes
  `email_confirm: true`. Named columns now; Copy-link asks per row
  behind the owner guard (`6b0099a`).
- **Three ways an invitation carried the wrong price**, each permanent
  once the customer signs up: "Create another" sent an invite with NO
  plan (free for ever, and EUR 50 per "included" ad account); the
  currency choice survived the reset invisibly (USD 200 on a EUR 200
  intention); and a CONVERTED price was stored as the agreed one
  (`aaab1de`).
- **A blank fee box meant 0, not "as the plan says".** The RPC stores
  `coalesce(topup_fee_pct, 0)` into a NOT NULL DEFAULT 0 column, and 0
  beats the ad-account type's default — every funding at 0% for ever
  (`aaab1de`).
- **A failed bootstrap burned the invitation** (accepted, no advertiser
  row, nobody reissues) and a failed `create_subscription_from_invite`
  was reported as "Welcome! Your account is ready." (`96aae51`).
- **The first invoice had no due date**, so the collect loop
  (`due_date is not null`) would never take it and dunning never fires.
  Trigger fixed + backfilled by PLAK-14, applied.
- **The signup form's "How did you hear about us?" list was white on
  white** — a required field on the first screen a customer fills in
  (`b606f55`).
- UI, on the owner's own eye: PRIME/Active on two lines, "EUR 200.00 /
  month" where "EUR 200 / month" reads as a price, a four-line pro-rata
  essay on the card carrying the most expensive figure, status dots
  glued to their words on mobile, a date pair split across two rows, and
  empty-state sentences rendered in value typography.
- **The affiliate promise named a model that is not always the deal.**
  "a percentage of every wallet top-up" appeared on four surfaces;
  commission is sometimes on spend, sometimes monthly, sometimes a
  one-off. Rewritten to the terms being per referral (`12a8918`).

### D1 — admin queues — walked 2026-09-21, NOT CLOSED

Walked as the owner in Chrome. The reject-with-a-reason requirement
**works end to end** on the ad-account-request queue; the blockers are
elsewhere.

#### Walked, on production

| step | result |
|---|---|
| reject a request | Reject dialog offers five reason templates AND a free field, "This is shown to the customer. Say what was wrong and what they can do about it." Confirm is dead on an empty reason (`!trimmedReason`). |
| the reason | reaches the customer **verbatim**: "Your request fee is back — We couldn't set this account up, so the fee is back in your wallet. &lt;the admin's words&gt;" |
| the money | EUR 50 refunded: wallet **45.00 -> 95.00**, statement line `Ad-account request refunded +EUR 50.00 Returned` |
| the queue | row flipped to Rejected, bell 7 -> 8 |

#### Found by walking it, fixed and live

- **Eight bank deposits under "Nothing waiting on you."** `/wallet-topups`
  -> Deposits showed eight cards badged "Waiting to be matched" — EUR
  500, 500, 618, 630, 500, 250, 250, 250 — above a header reading
  "Nothing waiting on you", a tile reading 0 and a tab badge reading 0.
  Over EUR 3,100 of real bank money nobody has claimed, on the screen an
  admin scans to decide whether there is work. `suggestedCount` counted
  only `suggested`; `unmatched` and `ambiguous` both need a human and
  neither has a suggestion to count (`7686241`).
- **"Received money from Handy Products with reference"** — end of
  sentence, because that payment has none. It escaped the filter because
  the SENDER is also missing, so there was no name to strip (`7686241`).
- **A euro with a dollar sign, twice.** The funding details sheet printed
  `Top-up Amount` with a hard `CURRENCY_SYMBOLS["USD"]` while the card
  behind it printed EUR — two currencies for one number, one click apart.
  And `withdrawal-actions` had a `usd()` helper with a literal `$` in
  both refusal messages, in the file whose own header explains the
  ceiling is in the account's currency (`c25f813`).
- **An ad-account name could be used twice.** Nothing stopped it, and
  every screen identifies an account by that string — including the
  requests queue, which GUESSES which account a pending request means by
  looking up the newest one for that advertiser and platform. Refused
  now, and refused too when the check itself cannot be read (`ece13d1`).

#### D1 — the one that matters most, NOT yet fixed

**An employee admin can credit any wallet with two lines from the
browser console.** `wallet_topups` carries
`for all to authenticated using (_is_admin_of(tenant_id))` with a
`with check` that tests WHO and never WHAT, no table-level revoke, and a
trigger that credits the wallet on entering `completed`:

```js
insert into wallet_topups (…, status:'pending') ; update … set status='completed'
```

No function is called, so every check in `wallet_topup_admin_verify` is
skipped and `approved_by` stays NULL — no screen shows who did it. Same
shape on `top_ups` (defeats the owner-only fee gate) and on
`ad_account_requests` (a rejection without the EUR 50 refund, which then
can never be refunded because the RPC refuses an already-rejected row).

**Measured first, not patched blind — `PLAK-DIT-28-D1-METEN.sql`.** Two
earlier plakken (4 and 21) touch these same tables and nothing in the
repo says whether either was ever pasted. If plak 21 IS applied, `insert`
on `top_ups` is already revoked and admin top-up creation is already
dead, because `createTopupAsAdmin` writes with the caller's session.
Rows 14-15 return the two function bodies I need, because EXECUTE cannot
be revoked on either (the wrapper calls them with the caller's session
and they read `auth.uid()` themselves) — the gate belongs INSIDE.

#### D1 — still OPEN

1. `MAINTENANCE_MODE=true` does not freeze the wallet top-up queue:
   `hooks/use-update-transaction.ts` calls the verify/reject/undo RPCs
   straight from a client component, so no `maintenanceGuard()`. The
   ad-account queue freezes and the larger money-in event does not.
2. `ad_account_withdrawal_approve`'s balance ceiling is TypeScript only.
   `_withdrawal_within_the_account` already computes it for the REQUEST;
   lifting that into the approve path is mechanical.
3. Rejecting a withdrawal overwrites the customer's own reason — one
   `reason` column for two authors — and `/withdrawals` never shows it.
4. The three `/withdrawals` lists are unpaged, so past 1000 rows the
   OLDEST request disappears first, under "No withdrawal requests yet."
5. `wallet_topup_admin_reject` accepts a NULL reason; only the dialog
   enforces one.
6. The Review dialog shows "Request Fee" with no amount, and dumps raw
   metadata (`meta-ads`, `false`, "Request Fee Free Source").

### F1 — affiliate loop — walked 2026-09-21, NOT CLOSEABLE YET

Walked on production: PSM0005 applied, the owner received it in Chrome,
and the trail stops there. Four agents swept the journey (money, dead
ends, states, permissions). The conclusion is not a list of bugs — **the
journey is structurally incomplete**, and finishing it needs owner
decisions, not fixes.

#### Walked, and what happened

| step | result |
|---|---|
| apply | works. Toast "Application sent. We'll set your commission and come back to you.", button goes dead, sub-line says what happens next. No fake success. |
| owner receives it | works. Notification: "Test Advertiser (PSM0005) wants to join the affiliate program. Set their commission and approve or refuse it." |
| owner answers it | **nowhere to.** Clicking the notification opened a sheet whose only control is **Close**. `/affiliates` (Referral Links) has a search box and nothing else. There is no approve and no refuse anywhere in the app. Routed to the applicant's row on `/users` (`b5124b2`) — that is where the terms live. |
| set the commission | works. Commission Setup: type, percent, monthly, one-time, currency. Set PSM0005 to Percentage 10% EUR, "Commission setup updated." |
| become an affiliate | **setting a commission does not do it.** An `active` `referral_links` row is what makes somebody an affiliate, and the ONLY way one is created is as a side effect of inviting SOMEBODY ELSE with them named as Referrer on the invite form. |
| referral, commission, payout | could not be reached. |

#### The three that stop the journey

1. **The payout step has no surface for either role.** The string
   "payout" does not occur anywhere in the 6,216-line advertiser shell,
   and an advertiser-as-affiliate is redirected away from the affiliate
   app (`my-referrals/page.tsx` sends `role === "advertiser"` to
   `/dashboard?view=referrals`). The only Request-payout button is in
   `aff-app.tsx`, rendered only for `role === "affiliate"` — and that
   role has no `advertisers` row, so `affiliate_referral_stats` returns
   zero rows and the button is permanently disabled with "Nothing
   outstanding to request yet".
2. **There is no payout record anywhere in the schema.** The button's
   whole effect is `window.location.href = "mailto:…"`, followed by an
   unconditional green toast. On a machine with no mail handler that is
   silent. Nothing is written, no clock starts, and the only exit is the
   owner happening to press Mark Paid on `/commissions`.
3. **An application can be filed and never answered.** "Refuse" does not
   exist anywhere in the repo, and nothing ever notifies the applicant
   either way. Their own screen forgets they applied on reload —
   `affiliateApplied` is local `useState`.

#### Fixed and live (`b5124b2`)

- The application notification now routes to the applicant's row on
  `/users`, where Commission Setup is.
- **The "This month" pill dropped the USD leg** and printed a euro sign
  over it — on all six views. `twoLeg` exists for exactly this and this
  one site did not use it.
- **The payout mail asked for one currency** while the button enables on
  either, defaulting to EUR: a dollar-only affiliate sent "I'd like to
  request a payout of €0.00 in EUR".
- **"You're all caught up" was printed during the in-flight read.**
- **The tier was guessed off the rate too.** `statsUnavailable` guarded
  every tier surface and watched only the stats query; `useUsdToEur`
  returns null while loading AND when no rate exists, so a dollar-earning
  affiliate was demoted to "Starter" on five surfaces at once.
- **The admin Earnings column was capped at 1000 rows** with no
  `order by`, so the same affiliate's figure moved between refreshes.
- The Referrer help text said "earns commission on their topups"; four
  of the seven commission types have nothing to do with a top-up.

#### F1 — what the owner has to decide

1. **What does "approve an affiliate" mean?** A link needs a referred
   advertiser, so an applicant with no referrals cannot have one. Either
   approval creates something else, or the answer to an application is
   "you are approved, you get a link, and a link row appears when
   somebody signs up through it".
2. **Is a payout a record or an email?** Today it is an email with no
   trace. If it should be a record, that is a table, a status and an
   admin queue.
3. **One Time, Monthly Fixed and the two combinations pay nothing.**
   Only a percentage accrues. Four of the seven types are configurable
   money that no code computes.

#### F1 — MEASURED 2026-09-21 (plak 26 came back)

| | |
|---|---|
| `wallet_topups.amount` | **numeric** — the accrual does NOT throw. The worst theory is dead. |
| `referral_commissions.amount` | numeric(14,2) |
| the three views | **all `security_invoker=on`** — the cross-tenant read is NOT live |
| client codes | 8 of 8 uppercase, 0 duplicates — attribution is not broken |
| `create_subscription_from_invite` | already revoked from `authenticated` |
| **referral links** | **0. None, ever.** |
| commission rows | 0 |
| owed | 0.00 / 0.00 |
| role-`affiliate` profiles with no advertiser row | **2** |
| live clawback body | **20260920240000** — share x LIFETIME |
| applications filed | 1 (mine) |

**Nobody has been hurt by any of this**: there is no referral, no
commission and no money on this journey. That makes now the cheapest
possible moment to fix it.

#### F1 — the two that are live and wrong

1. **All four tables grant DELETE, INSERT and UPDATE to
   `authenticated`**, under `for all ... using (_is_admin_of(tenant_id))`
   policies that test WHO owns the row and nothing about WHAT is
   written. From an employee admin's console: approve yourself at 90%,
   point a real customer's referral at your own advertiser row, reopen a
   settled commission, invent one, or delete the evidence.
   **PLAK-27** revokes every verb no caller session uses
   (`referral_clawbacks` entirely, `referral_commissions` insert+delete,
   `referral_links` delete, `affiliates` insert+delete). The UPDATE
   holes need a column guard — the shape of `_guard_user_profile_role` —
   and that is a separate plak that must land before an affiliate earns.
2. **The live clawback multiplies a EUR commission pot by a USD ratio.**
   `v_share = p_amount / v_volume` where both are ad-account figures in
   dollars, and `v_gross` is the commission pot, which for a EUR-funding
   customer is the EUR pot. Worked example from the sweep: EUR 100,000
   topped up at 2% = EUR 2,000 commission; USD 5,000 of ad-account
   funding, USD 5,000 withdrawn -> share 1.0000 -> **EUR 2,000 clawed
   back** where the proportional answer is EUR 92. The denominator is
   also `sum(top_ups.topup_amount)` raw, which is the dual-meaning column
   `lib/pure-topup-landed.ts` exists for, so it adds euros to dollars
   before it starts.
   **NOT rewritten.** The right formula depends on what a clawback means
   in this business — see the owner questions above. Nothing is at risk
   today (0 commissions), but it must be settled before the first
   accrual.

#### F1 — fixed since (`ceaee9f`)

**The two role-`affiliate` users were shown a portal that can never
answer.** Their profile has no `advertisers` row, so
`affiliate_referral_stats` returns zero rows with no error, and every
guard read that as a successful empty: EUR 0 lifetime, 0 referred, "No
referrals yet", "No commission yet", payout disabled with "Nothing
outstanding to request yet". `portalInert` now folds into
`statsUnavailable`, so those become dashes, with one line at the top
saying the account is not finished.

#### F1 — measured by PLAK-26, then fixed

`supabase/checks/PLAK-DIT-26-F1-METEN.sql` — read-only, one report,
sixteen rows. It settles, in order of consequence:

1. **`wallet_topups.amount`'s type.** If it is a float, the accrual does
   `round(double precision, int)`, which does not exist in Postgres, and
   the whole trigger sits inside `exception when others then raise
   warning`. Then **no commission has ever accrued, for anybody, in
   silence** — which would explain both existing affiliates reading
   €0.00.
2. Whether `referral_links_with_details` is `security_invoker`. If not,
   every referral link in every tenant — both parties' names, emails,
   commission terms and earnings — is readable by any session, and the
   policy written to stop a referred customer reading their referrer's
   terms is decorative.
3. Whether `create_subscription_from_invite` is still granted to
   `authenticated`. Both callers use the service client, so it can be
   revoked outright; while it is granted, any invitation id sets the
   caller's own plan and writes an `active` referral link with no
   approval.
4. Whether client codes are uppercase and unique — the referral link is
   built from the raw code and matched upper-cased, so a lowercase code
   drops the referral silently and a duplicate breaks the referred
   person's email confirmation outright.
5. Which of the three clawback bodies is live. One of them multiplies a
   EUR commission by a USD ratio and can take 100% of an affiliate's
   lifetime earnings on one withdrawal.

### A7 — CLOSED 2026-09-21

Walked as PSM0005 in the pane, both branches of the dialog, and every
figure checked against the database.

| | |
|---|---|
| USD branch | 10 USD at 0.872361 -> fee 0.05 -> **8.67 EUR**, Exchange button dead (balance is 0.00 USD) |
| EUR branch | 50 EUR -> fee **0.34 USD** -> **56.98 USD**; confirmation repeated the same four lines |
| after | EUR **45.00** / USD **56.98** on screen |
| database | `45.00 EUR / 56.98 USD` — same |
| the row | `50 EUR -> 56.98 USD, rate 0.872361, fee 0.34, created_by filled` |
| reconciles | gross 57.3157, fee + net = 57.32 = the rounded gross |
| audit | 1 row written by the trigger this plak attached |

#### The blocker that had to be cleared first: nobody had EVER exchanged

**`wallet_exchanges` held 0 rows.** Not "it broke today" — it had never
once worked, for anybody, in the life of this app.

Pressing "Yes, exchange it" on 50 EUR gave, in a toast, on the
customer's own wallet:

```
insert or update on table "wallet_exchanges" violates foreign key
constraint "wallet_exchanges_created_by_fkey"
```

The wallet was untouched afterwards (EUR 95.00 / USD 0.00) — the whole
transaction rolls back, so **no money has ever been lost to this**. But
the read off live settles what it is:

| | |
|---|---|
| the constraint | `created_by` -> `user_profiles(id)` |
| what the RPC writes | `v_user_id`, i.e. `auth.uid()` |

`user_profiles.id` is its own key with a separate `user_id` pointing at
the auth user, so those two are never equal and the insert can never
succeed. `wallet_topup_advertiser_create` and `wallet_precharge_create`
both resolve the profile id first; only `wallet_exchange` skips it.
**PLAK-23** is that one line. Re-walk 50 EUR -> USD after pasting and
check the credited figure against the quoted 56.98.

#### The cent that sent customers down a route they could not walk

`wallet_exchange` (read off live) computes:

```
gross := p_amount * rate
fee   := round(gross * 0.006, 2)
net   := round(gross - fee, 2)
```

`lib/pure-exchange.ts` computed `round(gross * 0.994, 2)`, which is a
DIFFERENT number — rounding the fee to the cent first and subtracting
the rounded fee lands a cent higher about half the time. On 50 EUR at
0.872361 the server credits 56.98 and the old helper said 56.97.

That cent decided things. `otherWalletCovers` used the helper and the
dialog used its own pre-rounded copy, so with USD 100.60 against a
EUR 92.00 invoice the dashboard offered "Exchange to pay EUR 92.00"
while the dialog disabled the Exchange button — a route that refuses
you, on an invoice going past due. Everything now goes through
`exchangeQuote`, which reproduces the server's three steps including
Postgres-style rounding. Tests cover the divergence, the sum of the
three displayed lines, and that `neededFromAmount` is the SMALLEST
covering amount (`9442c29`).

#### Also found by walking it, fixed and live

- **The dialog read the rate with the ADMIN query.**
  `useExchangeRates` selects `"*, profile:user_profiles(*)"` — every
  column of `exchange_rates` into the customer's browser — and the
  dialog is mounted unconditionally on the dashboard, so it ran on
  every page load with the dialog shut. The dashboard card had been
  moved to `useUsdToEur` for exactly this reason; the dialog was
  missed (`9442c29`).
- **The confirmation showed live figures and sent captured ones.** If
  the rate went unreadable while the modal sat open it printed
  "1 USD = 0.000000 EUR", fee 0.00 and "Added to your wallet 0.00"
  over a live button that still sent the real amount. The rate is
  captured with the amount now, and if it moves the confirmation is
  withdrawn with a line saying so (`9442c29`).
- **"Your recent activity" could never hold anything.** It reads
  `audit_events`, whose only SELECT policy is the tenant OWNER, and it
  was mounted in the customer AND affiliate shells. RLS filters rather
  than refuses, so it came back `[]` with no error and printed
  "Nothing here yet. Your changes will show up as you use the app." to
  people with plenty of history — on the screen somebody opens when a
  figure has surprised them (`0d923d1`).
- **The GDPR export was rate-limited by IP**, 10/hour, so one office
  NAT shared a budget and the eleventh art. 20 request refused
  somebody who had made none. Keyed on the person now, IP only as the
  fallback for a caller with no session (`0d923d1`).
- **The company save was a blind overwrite.** An admin and the
  customer may both write that row, and the form posts all ten fields
  from the state it loaded on mount — so an admin's VAT correction was
  silently reverted by the customer's next Save, on the row printed on
  every invoice. `ifUpdatedAt` + `checkVersion` now, per CLAUDE.md
  rule 4, with `companies.updated_at` read soft-missing because that
  migration is hand-pasted (`32d22b0`).
- **"Profile" in the avatar menu landed on the COMPANY form.** There
  was no personal profile anywhere in the customer shell: a name typed
  wrong at signup could never be corrected, and the only route to a new
  password was "forgot password" for a password nobody had forgotten.
  There is a "You" card now — name, sign-in email (read-only on
  purpose: that column is a mirror, the login lives in Supabase auth)
  and a button to `/auth/update-password`, which already asks for the
  current password on a normal session (`f21b16f`).

#### A7 — walked and CONFIRMED working

- Company form loads populated, Save gives "Company saved", persists.
- Notification preferences: toggling "Top-up completed" off survived a
  full page reload. The catalogue drives the list, all 11 customer
  types have a control, and the write is an owner-checked server action.
- Wallet figures on the dashboard agree with the database: EUR 95.00 /
  USD 0.00, plan Prime "Active · renews 20 Oct", 1 ad account.

#### Found AFTER the exchange finally worked

- **The statement row did not reconcile with itself.** The first
  successful exchange printed `Exchanged EUR 50.00 to USD at 0.8724`
  beside `USD 56.98`, and 50 x 0.8724 is 43.62.
  `wallet_exchanges.exchange_rate` stores "1 USD = N EUR" whichever way
  the money went, and the row printed it raw — so an EUR -> USD
  conversion showed the rate for the other direction. `rateForDirection`
  now prints it the way it went, with both currencies named. And
  `fee_amount` was not even in the select while the ADMIN table has
  always shown it: the customer got the only version of their own
  record that does not add up (`275bb26`).
- **The amount box started on a literal `0`** you have to delete first —
  type 10 over it and you get 010, with the figures below following
  along (`275bb26`).

#### A7 — still OPEN

1. **A customer can file a wallet exchange that never happened —
   PLAK-25.** `wallet_exchanges` grants DELETE, INSERT, UPDATE to
   `authenticated`, and the insert policy checks only that the wallet is
   yours, never the AMOUNTS. No money moves (only the RPC touches
   balances) but the row lands on the customer's statement, the admin
   table, the financial report and `/api/stats/wallet`. This is the
   OPPOSITE of plak 21: every caller-session touch of this table is a
   SELECT and the only writer is SECURITY DEFINER, so it can be shut
   completely.
2. **`user_profiles` / `companies` column locks — PLAK-24.** A
   deactivated customer can re-activate themselves; rows can be walked
   out of the tenant.
3. **The affiliate shell has the same "Profile" dead end.** The "You"
   card was added to the advertiser shell only; `aff-app.tsx` still
   sends "Profile" to a screen without one. Belongs to F1-F3.
4. **Changing the sign-in email is a support job.** The box is
   read-only and says so; doing it properly means touching Supabase
   auth and re-verifying the address.
5. **A customer-facing account history does not exist.** The removed
   panel was the fake version. A real one needs its own narrowed view
   because `audit_events` carries `old_data`/`new_data`, and those hold
   supplier figures.
6. `exchange_rates` ships every column to any profile in the tenant
   (policy `exchange_rates_select`). `useUsdToEur` now asks for `eur`
   only, so nothing leaks through the app — but a hand-written
   PostgREST call still reads the whole row. Row 5 of the A7 agent's
   block says whether a cost/margin column is on that table.

### A6 — CLOSED 2026-09-21

Walked as PSM0005 in the pane with the owner in Chrome, both branches.

| | |
|---|---|
| request | €50.00 off AA-PSM0005-EU-01, confirmation in euros |
| reject branch | WD-927138 rejected with a written reason; no money moved; the ceiling went back to €194.00 (a rejected request correctly stops counting) |
| approve branch | cover check read honestly ("not read — the supplier is in mock mode"), tick required, confirm dead until ticked |
| customer wallet | €45.00 → **€95.00** |
| USD wallet | **$0.00** — nothing landed in the wrong one |
| statement | `Returned from an ad account · €50.00 · Credited` |
| owner /wallets | **95.00** |

Whole-session arithmetic for PSM0005: €305 credited − €100 funding − €5
− €5 subscription − €50 request fee − €100 funding + €50 withdrawal =
**€95**. Agrees at both ends.

#### The one that took two layers to fix

**A euro account gave euros back as dollars** — €194 in, "$194" out,
about €25 a round trip. It sat on TWO layers and fixing either alone
did nothing:

1. **The app** assumed an ad-account balance is always USD.
   `withdraw-dialog.tsx` said so in its own comment, and
   `withdrawal-actions.ts` had `const accountCurrency = "USD"`. The
   ceiling summed `top_ups.topup_amount` raw and called it dollars —
   but that column is USD only on the ADMIN paths; the customer's RPC
   stores the landed amount in the PAYMENT currency and puts the dollar
   figure in `topup_usd`. Measured: 194.00 against 222.38 on the same
   account (`64bdf83`).
2. **A database trigger.** `trg_withdrawal_is_always_usd` did
   `new.currency := 'USD'` unconditionally on insert AND on update of
   that column, so the app's corrected EUR was overwritten on the way
   in. It had been added for a real exploit — the RPC took `p_currency`
   from the caller, so $1,000 of balance requested as EUR 1,000
   credited `eur_balance` by 1,000 — but on the same false premise,
   written into its own comment: *"an ad account is funded in USD by
   construction"*. PLAK-22 keeps the currency out of the caller's hands
   AND reads it off the ad account, and refuses an account in a
   currency no wallet exists for (approve branches only on USD/EUR and
   would otherwise succeed without moving money).

**Nobody was ever hurt:** `asked_back` was 0 before this, and the
report confirmed no approved withdrawal has ever carried a currency
that did not match its account.

#### Also found and fixed

- **The ceiling was never a balance.** It is "funded minus already
  asked back" and subtracts nothing for what the account has SPENT —
  and the approve guard used the same expression. Labelled "Max", which
  reads as available. The honest sentence existed but was shown only
  for USD-funded accounts (`d32b5a0`).
- **Now the approval states whether it is covered.**
  `readAdAccountLiveBalance` asks the platform, and refuses rather than
  invents: in mock mode the adapter answers with a made-up figure, so a
  balance is returned only when the supplier is genuinely `live`. The
  modal prints "Covered — X of Y" or "SHORT by X", and the confirm stays
  dead until an admin ticks that they checked it themselves. Per the
  owner: with an API we read it AND the admin approves; without one the
  admin checks and approves (`f09e1f0`).
- **Every approval fired a false alarm.** The "Take it off the ad
  account by hand" warning fired whenever the push did not queue,
  without asking why — and the gate is shut on production by design, so
  it fired on every single approval. All three top-up call sites
  already test `heldByGate`; this one was missed (`c79e5d9`).
- **A reject template for a product that does not exist** — it asked for
  bank details before money "can be returned", but an ad-account
  withdrawal goes to the WALLET and there is no wallet-to-bank payout
  here. It went out verbatim as the notification body (`c79e5d9`).
- **`topup_usd` missing from two selects**, so `landedOnAccount` read
  every row as an admin row and printed dollars over a euro account —
  on the account details sheet and in the withdrawal ceiling
  (`b8748ed`, `64bdf83`).

#### A6 — still OPEN

1. **`ad_account_withdrawal_approve` is callable at `/rest/v1/rpc/`** and
   the balance check exists only in the TypeScript wrapper. Any active
   admin can credit a wallet with whatever `amount` says. Same shape as
   `top_up_admin_verify` (PLAK-21 row 6).
2. **`ad_account_withdrawals` has no table-level REVOKE.** Not
   exploitable as the repo stands — the only policy is `for select` —
   but `top_ups` and `wallet_topups` both carry an `"Enable ALL for
   admins" for all to authenticated` that the repo never wrote, so the
   day one is added here the GRANT is already in place. Revoking
   insert/update/delete would break nothing: both writers are SECURITY
   DEFINER RPCs and every caller-session touch is a SELECT. This is the
   opposite of `top_ups`, where UPDATE had to stay.
3. **`reason` is one column for two authors.** The RPC does
   `reason = coalesce(p_reason, reason)`, so an admin's rejection
   overwrites the note the customer wrote — and the customer can read
   the row.
4. **Nothing ever writes `cancelled`**, and there is no customer-side
   cancel, so one mistaken request freezes the account's balance until
   an admin rejects it.
5. **A rejected withdrawal disappears from the customer's statement**
   entirely — walked and confirmed: after WD-927138 was rejected, no
   trace of it remained on their side.
6. `components/withdrawals/withdrawals-table.tsx` is imported by
   nothing and still drops the rejection reason. Belongs in
   `docs/UNREACHABLE.md`.

### A4 — CLOSED 2026-09-21

Walked as PSM0005 in the pane with the owner in Chrome, both halves.

| | |
|---|---|
| dialog quote | Out €100.00 · fee (3%, included) −€3.00 · lands €97.00 · wallet €145 → €45 |
| confirm | "It leaves your wallet now. Money on an ad account can only come back through a withdrawal request, which we have to approve." |
| after sending | wallet **€45.00**, statement `#000003 · Funded AA-PSM0005-EU-01 · −€100.00 · On its way` |
| admin queue | `#3 · Pending · €97.00 · paid €100.00 · fee €3.00` |
| verify dialog | Amount Received €100.00 · Fee 3% −€3.00 · Net Credit €97.00 |
| after verifying | statement row → **On the account**, Funded to date €97 → **€194.00**, bell 4 → 5 |
| owner /wallets | **45.00** |

Arithmetic across the whole session for this advertiser: €195 − €50
(request fee) − €100 (funding) = **€45**, and €97 + €97 = **€194**
funded. Both screens agree at every step.

#### Found by walking it, fixed and live

- **A dollar figure on a euro account, twice.** The funding dialog
  printed "about $111.19 at 0.872361 EUR per USD" under "Lands on the
  account €97.00", on a card that says Currency EUR two rows up. The
  figure existed because the SUPPLIER settles in dollars — the one thing
  a customer must never be shown, by name or by settlement currency —
  and it is unverifiable anyway because rates move. Removed from the
  summary and the confirmation; the rate guard stays (`7304d58`).
- **The admin's two biggest numbers were hard-coded `"USD"`.**
  `verify-topup-dialog.tsx` passed a literal while `creditCurrency` sat
  three lines below being used correctly. On a EUR 100 funding at 3% the
  admin read "Net Credit **$97.00**" and then topped the supplier up by
  hand from that number — about 13% short, every manual EUR top-up
  (`f8381f7`).
- **"Funded automatically" was false.** Nothing is pushed on its own and
  the owner does not want it to be. On a card whose next control is
  Verify, that green pill told the person about to press it that the
  money was already there. Now "API available", which is a fact about
  the TYPE (`f8381f7`).
- **A tick-box with no question.** The first checklist step asked the
  admin to confirm "the figures match the customer's payment". On a
  WALLET top-up that is the whole job; on an ad-account funding there is
  nothing to match — the money came out of a wallet that was verified
  when it was topped up, and the figures were computed by the RPC. The
  figures were already in the table directly above. Removed: a tick-box
  for a question with no answer teaches people to tick without reading,
  two boxes above one that matters (`a7abf31`).
- **The verify header was a pile** — five right-aligned items stacked
  against two on the left (`a7abf31`).
- **Verify pushed to the supplier as a side effect.** Shut, a no-op;
  armed, pressing Verify would have moved money at the supplier as a
  consequence of recording that it had already moved. Split:
  `pushAdTopupToSupplier` is its own admin action and its own button in
  the checklist, above the tick that asks whether the money is on the
  account. Walked live with the gate shut: **"Not pushed — supplier is
  in mock mode — no real pushes. Fund it in the supplier's portal
  instead."** Nothing happened, it said why, and it said what to do
  instead (`ef73b9e`, `ec14d29`).

#### A4 — still OPEN

1. **`top_ups` never got the GRANT revoke.** `"Enable ALL for admins"
   for all to authenticated using (_is_admin_of(tenant_id))` gives every
   employee admin INSERT/UPDATE/DELETE on the funding row, with no
   column trigger (`_fee_is_the_owners` is on `ad_accounts` only). One
   line from devtools defeats `TOPUP_UPDATE_ALLOWED`, the
   completed→pending refusal, `maintenanceGuard` and the owner-only fee
   gate:
   `update top_ups set fee=0, fee_amount=0, topup_amount=<gross>, status='completed'`.
   Needs live confirmation of the grant, then the same revoke pattern
   already used on `wallet_topups`, `wallets` and `ad_account_requests`
   — but **UPDATE must stay**, the admin actions write with the caller's
   session.
2. **`top_up_admin_verify` is callable at `/rest/v1/rpc/`** and the
   entire pricing gate for a funding lives in the TypeScript wrapper.
   `rpc('top_up_admin_verify', { p_top_up_id, p_new_fee_percent: 0 })`
   skips the floor, the ceiling, the tenant compare and the
   already-completed re-read. `20260920290000` revoked exactly this for
   two sibling RPCs; this one was not on the list. Body still unread.
3. **The locked-account refusal on the customer path is browser-only.**
   `top_up_create_for_advertiser` selects `id, fee` and never reads
   `status`, so a direct RPC call funds a banned account — and the
   withdrawal side refuses a locked account, so the money cannot come
   back.
4. The fee floor/ceiling is skipped entirely when `advertiser_id` is
   null (`topup-actions.ts:1175` wraps the whole gate in `if`).
5. `top_up_create_for_advertiser` does not reject a deactivated
   advertiser.
6. **"Funded to date" adds euros to dollars** and keeps whichever
   currency arrived first under `.order("id")`.
   `sumLandedByCurrency` exists for exactly this and is imported by
   nothing but its test.
7. The wallet statement books admin-filed ad-account top-ups as wallet
   debits — no `wallet_debited` filter — so a bank transfer an admin
   recorded straight onto an account shows as money leaving a wallet
   that never moved.
8. On the customer path an account with `fee = 0` and no plan resolves
   to 0%, so the ad-account type's own 5–6% is never collected. Accounts
   created from a request land with `fee = 0`.
9. The dialog's fee is not rounded before it is subtracted, so its three
   lines can fail to add up by a cent; and the percentage prints raw
   ("3.3499999999999996%").

### A3 — walked 2026-09-21, NOT closed

Walked as PSM0005 in the pane with the owner in Chrome. What was proved:

- Every branch of the request dialog opened first. **Meta** offers EUR+USD
  with the Facebook fields; **TikTok** and **Google** are USD-only and swap
  in their own fields (Business Center ID / TikTok Account Email /
  Countries, and Google Email). Data-driven and correct.
- The **included** path: "Included in your plan — no fee · 1 of 2 included
  ad accounts left". Confirm modal read Platform Meta / Currency EUR /
  **Cost: Included in your plan**, no supplier named anywhere. Sent it —
  the request reached the admin queue (Pending · Meta · EUR · BM
  123456789012345) AND the customer's Requests view **without a reload**,
  and the wallet stayed at **EUR 195.00**. Correct end to end.
- The **EUR 50** path quotes correctly: with the pending request counted,
  reopening the dialog reads "Ad-account request fee: €50 · Charged from
  your wallet when you submit. **Balance: €195.00 → €145.00**". So the
  allowance count DOES include pending requests.

**The EUR 50 leg, executed 2026-09-21.** Confirm modal: "The fee leaves
your wallet the moment you send this" / Platform Meta / Currency EUR /
**Cost: €50 from your wallet**. After sending:

| | |
|---|---|
| customer wallet | €195.00 → **€145.00** |
| owner /wallets | **145.00** |
| statement | `21 Sep · Ad-account request fee · −€50.00 · Charged` |

That statement line had **never appeared before**. It needed both halves:
PLAK-19 writing `charged_at`, and the `adv-request-charges` invalidation.
Before today, nobody had ever actually been charged the €50 at all —
all 8 prior requests were included, which is why the gap went unnoticed.

The currency fix was re-verified live: EUR → TikTok (USD) → back to Meta
→ **EUR**.

#### Found by walking it, fixed and live

- **The currency latched to USD.** Open on Meta (EUR), tap TikTok to see
  what it is (USD is its only option and is selected for you), tap back
  to Meta — EUR returns as a *choice* and USD stays *selected*. The
  radios sit below the fold while you read the platform list, so nothing
  says what happened. An ad account keeps its currency for life (`11b7456`).
- **"Send the request" did nothing at all.** `timezone` is the only
  required field with no default; `select-field.tsx` never forwarded
  `field.ref`, so react-hook-form could not focus or scroll to it. No
  confirmation, no error, nothing. Reproduced on production (`af67745`).
- **The form saved a draft it never read back.** Escape or a tap outside
  loses platform, timezone, BM id, profile link, website and notes.
  CLAUDE.md names this form as one of the four that must never lose
  typing; both siblings already restored (`af67745`).
- **The price quote was all-or-nothing and failed OPEN.** Any one of five
  sub-reads erroring left the card on "Checking what this request
  costs…" for ever, the confirm on "Worked out when you submit" — and
  because `feeEnough` lets an unknown preview through, **the submit
  button stayed live**. A EUR 50 debit confirmed with no price and no
  balance shown, insufficient-balance gate off. `advertiser_plans` and
  `advertiser_perks` are hand-pasted, so 42P01/42703 now means "none
  yet" (`af67745`).
- **A wallet row `maybeSingle()` could not see became EUR 0.00** plus
  "Not enough balance", with submit and confirm both disabled, for a
  customer holding thousands (`af67745`).
- **`adv-request-charges` was invalidated by nothing**, so the balance
  dropped EUR 50 within a second and no statement line ever appeared
  (`af67745`).

#### A3 — still OPEN

1. **`PLAK-DIT-18-AANVRAAG-ZONDER-BETALEN.sql` — paste this.** An
   advertiser can INSERT into `ad_account_requests` straight through
   PostgREST (`ad_account_requests_insert_owner`, no table revoke). The
   EUR 50 is charged *inside* the RPC and enforced nowhere else, so the
   request reaches the queue with the wallet untouched — and the WITH
   CHECK binds only `advertiser_id`, so `tenant_id` is free and the row
   can land in ANOTHER tenant's queue. Then
   `ad_account_request_reject_refund` reads the refund amount out of that
   same customer-written `metadata.request_fee`: file with
   `{"request_fee": 100000}`, have an admin press Reject, and EUR 100,000
   is credited. PLAK-18 revokes INSERT and DELETE only — **not UPDATE**,
   because the admin actions write with the caller's session.
2. **The EUR 50 never appears on any customer surface.** The statement
   reads `charged_amount / charged_currency / charged_at` and
   `ad_account_request_create_paid` does not write them (its own check
   migration `20260920250000` reported `NOT WRITING`, with 7 historic
   unrecorded charges). `actions/finance-report-actions.ts` never touches
   `ad_account_requests` at all, so the Financial report and its CSV are
   EUR 50 out per request. **Needs the live RPC body — PLAK-18 row 6.**
3. **`request_fee_refunded_at` is not in the RPC's right-hand-wins key
   list**, so a customer passing it in `p_metadata` pre-stamps the row and
   their own refund is skipped — the fee was really taken and the admin
   is told "No fee was charged for this one". Survives the revoke, because
   this goes through the legitimate RPC. **PLAK-18 row 7.**
4. **`ad_accounts.notes` and `.metadata` are readable by the advertiser**
   through PostgREST. The app treats both as admin-only and says why —
   notes is where an operator writes a supplier account number and the
   rate we pay. A column-level revoke would break admins too (they are
   also `authenticated`), so the fix is the one the repo already used for
   `supplier_fee_pct`: move them to an admin-only table.
5. **The allowance counts REQUESTS, not accounts.** An account an admin
   creates by hand consumes none of it, so a customer on a
   one-account plan can hold two and be charged for neither.
6. **No cancel and no amend, anywhere**, and the 90-second twin trigger
   refuses the corrected re-file — while the admin queue offers a
   "Cancelled" filter no row can ever hold.
7. **An admin can hand an account to a deactivated customer**;
   `createAdAccountAsAdmin` never checks the advertiser's
   `is_active`/`status`, and a completed request can no longer be
   rejected, so the fee cannot be returned.
8. **`maintenanceGuard()` does not cover this journey's money mover** —
   `ad_account_request_create_paid` is called straight from the browser,
   so `MAINTENANCE_MODE=true` does not freeze the EUR 50 debit.
9. The admin fee-invoice dialog prices USD off a hardcoded `0.86`
   instead of the tenant's rate (a third copy of that constant).
10. Neither the admin queue nor the customer's Requests view shows the
    amount, so an admin pressing Reject cannot see what is about to
    leave PSM's account.

### A1 — the one that was actively costing money (2026-09-21)

**`create_invoice_for_subscription`, the trigger on `subscriptions`,
raised the first invoice as an ORPHAN.** It put `subscription_id` inside
the items JSON instead of in the column, and set no `period_start`.

Everything hangs off that column:

- The billing run's duplicate guard is
  `where i.subscription_id = r.id and i.period_start = v_period`. It
  matched nothing, so **PSM0006 was going to be billed EUR 200 twice
  that night** — `next_payment_date` was still today, status active.
- The collect loop filters `i.subscription_id is not null`, so the
  invoice could never be auto-debited. PLAK-14's due date did not help;
  it never entered the loop.
- `_on_subscription_invoice_paid` tests the same thing, so **paying it
  by hand did nothing either**: no reactivation, no clock advance, and
  the notification PLAK-15 had just turned on never fired.

Two more faults in the same body:

- `v_amount::real` on a money value. `real` is single precision, so
  EUR 99.99 becomes 99.98999786376953 — on the first invoice a customer
  ever sees, in columns that have been `numeric` since 20260918200000.
- **No perk applied.** The monthly run prices every invoice through
  `advertiser_perks`, and PLAK-12 brought `change_subscription_amount`
  into line. This trigger did not, so a customer with a discount got
  their FIRST invoice at full list price.

Fixed by **PLAK-16** (relink the rows that already existed, only where
no other invoice covered the same period) and **PLAK-17** (the trigger:
the column, the period, numeric, `_effective_subscription_amount`, and
a guard so an existing invoice is not raised twice). Both applied, with
`0` orphan subscription invoices left open.

**E2E0001's two open EUR 500 invoices are NOT this fault** — both are
linked, and they cover two different periods (2026-09-18 and
2026-10-01). Invoice 114 has `due_date` 2026-09-08, which is BEFORE its
own period starts, so it was hand-seeded rather than raised by the
engine. E2E0001 is on a different tenant from PSM0001-0006 and does not
appear in the owner's `/users` list.

**Watch for:** `position('::real' in prosrc)` in a check matched the
body's own comment saying the cast was gone. Check for the cast
(`v_amount::real`), not the substring.

### A1 — agent findings NOT yet fixed

Four scoped agents ran over A1 (money, dead ends, loading/empty/error,
permissions). What they found that is still open:

1. **`invitations` is writable by any employee admin through PostgREST**
   (`invitations_write_admin for all using (_is_admin_of(tenant_id))`,
   no table-level revoke). They can re-price a pending offer the owner
   authored, or delete it. **The app side is ready** — both writes now
   go through `createAdminClient()` — so the SQL is just
   `revoke insert, update, delete on public.invitations from anon, authenticated;`
   Postgres checks the GRANT before the policy, so reads are untouched.
   NOT YET WRITTEN AS A PLAK.
2. **Any admin can still READ every invitation's token** via
   `invitations_select_admin`. Narrow the admin branch to
   `_is_super_admin_of`, or revoke `select (token)` from
   `authenticated` — the app no longer selects it either way.
3. **`ensure_advertiser_and_wallet` / `create_subscription_from_invite`
   may still be execute-able by `authenticated`.** The revoke is in
   `20260920210000`, which is NOT in the applied ledger, and two later
   definition files re-grant. One query settles it:
   `select p.proname, has_function_privilege('authenticated', p.oid, 'execute') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('ensure_advertiser_and_wallet','create_subscription_from_invite');`
4. **A customer can write `companies` directly** — the allowlist in
   `actions/company-actions.ts` is advisory because
   `companies_insert_owner` / `companies_update_owner` grant it. They
   can move their own company row into another tenant.
5. **Invite expiry is not enforced in `_invited_to`**, and nothing ever
   writes `status='expired'`, so a months-old invitation still buys a
   `user_profiles` row.
6. **An expired invite's row still offers Copy link** (the badge is
   computed client-side, the action keys off the stored status) **and
   blocks a fresh invite** to the same address ("There's already a
   pending invitation"). Two screens contradicting each other, and the
   only way out is Cancel behind a "there is no un-cancel" modal.
7. **`InviteExpired` still renders a "Create New Organization" button**
   for an anonymous invitee, which 307s to a login they have no account
   for — login to signup and back, no exit. The file's own comment says
   this was removed; it was removed from one branch of the ternary only.
8. **"This email already has an account — log in instead"** is wrong
   advice: logging in does not accept the invitation, and there is no
   reachable in-app surface for pending invites.
9. **`walletLoading` is `isPending`**, so a profile with no advertiser
   row gets a permanent shimmer on the checklist and the balance hero
   under "Your wallet is still being set up. Reload in a moment."
10. **The country field is free text.** PSM0006 has Country =
    "Lelystad". VAT depends on country and the DST module below is
    per-country, so this needs a picker before either can be trusted.
11. **The first dashboard prints the LIST price**, not what will be
    invoiced, when a discount perk exists and no invoice has been paid
    yet.
12. `numOrNull(monthly_fee, 0, 1_000_000)` returns null out of range and
    the route still answers `success: true` — the same silent-null
    outcome as the unpriced-invite fault, one guard away.

### PARKED — DST is a SUPPLIER COST that has to be re-billed weekly (owner, 2026-09-21)

Owner, verbatim in substance: *at RockAds we also pay DST, and they said
it comes off OUR wallet, so we have to invoice each customer ourselves,
weekly.*

This is not a tax setting. It changes the money model, so write it down
properly before anyone builds it:

1. **It is our cost first.** The supplier debits DST from PSM's own
   balance, not from the advertiser's wallet and not from the ad
   account. Nothing in the app currently records a cost on our side of
   the ledger at all — `/reconciliation` only compares wallet credits
   against bank receipts.
2. **It has to be recharged, per advertiser.** The advertiser whose
   spend caused it owes their share. That is a NEW invoice type (a
   `dst` line, payable from the wallet like any other), raised
   **weekly**, not monthly — so it does not fit the existing
   subscription cadence and must not be bolted onto it.
3. **The rate is per country**, and the country comes from the ad
   account, not from the advertiser's company.
4. **The supplier's name must never appear on it.** Not in the invoice,
   not in the PDF, not in the JSON behind the page. Same rule as
   everywhere else.

**What to find out FIRST, before writing any code:** does the supplier's
API expose DST as its own line (amount, period, per ad account), or only
as a movement in our balance? If it is only a balance movement, there is
nothing to attribute per customer and the whole feature rests on a
manual entry — which changes the design completely. Nobody has checked
this yet, and it is the one question that decides the shape.

Also: cost data never goes on a customer-readable row. A DST cost line
belongs in an admin-only table; the customer sees only the recharge.

### PARKED — reconciliation beyond the wallet side (owner asked 2026-09-21)

Not on any of the sixteen journeys, so NOT before go-live. Recorded so
it is not re-derived.

The owner wants /reconciliation to cover the OUTGOING side too: what we
top up to ad accounts, DST off our own wallet, everything from
RockAds/the supplier, and what leaves through Wise. Today the screen
only compares "credited to wallets" against "received", which is why
PSM0005 reads **EUR credited €305.00 · received €0.00 · Check** —
correct, because nothing has been entered in the ledger by hand.

What each piece would actually take:

| source | state today | missing |
|---|---|---|
| ad-account top-ups | the credited side is already in `top_ups` | only the wiring into this screen |
| RockAds / supplier balance | adapter is live-wired (app.gradyn.io/api, per-account balance works) | nothing to READ it; auto-push stays off by the owner's own rule |
| Wise | **off on production** | three env vars + a webhook URL — `docs/WISE_SETUP.md` |
| DST | **does not exist** | a new module: rate per country, charged on spend |

So reading RockAds and joining `top_ups` needs no new infrastructure.
Wise needs the three env vars. DST has to be built.

Meanwhile the manual ledger on that screen already takes the outgoing
side: `Withdrawal (out)` against `Supplier bank`.

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
