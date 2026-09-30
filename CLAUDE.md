# CLAUDE.md — instructions for Claude Code in this repo

This file is loaded automatically at the start of every Claude Code
session in this project. Keep it short — long instructions are worse
than none. Update it when patterns change.

## The plan — do not ask, this is settled

**Journeys first. Fault-class sweeps are the backlog, not the plan.**

We spent days sweeping by fault class and it did not converge, because
"find every fault of kind X across the app" has no end condition. Every
round found something, and none of it was what kept us off live. So the
order is inverted:

Close these EIGHT journeys, end to end, on production, with the test
users. A journey is binary — it works or it does not.

| # | journey | roles |
|---|---|---|
| 1 | invite -> signup -> onboarding -> dashboard | advertiser |
| 2 | wallet top-up: amount, reference, slip, admin verifies, balance right | advertiser + admin |
| 3 | request an ad account, EUR 50 off the wallet, request visible | advertiser |
| 4 | fund an ad account from the wallet, fee right, admin verifies | advertiser + admin |
| 5 | monthly invoice -> Pay now from wallet -> balance and status right | advertiser |
| 6 | ask money back off an ad account -> admin approves -> wallet | advertiser + admin |
| 7 | affiliate: link, referral, commission, request a payout | affiliate |
| 8 | admin queues: verify, reject WITH a reason, everything logged | admin/owner |

**Anything not on one of those eight goes to
`docs/NEXT_SESSION_FIRST.md` and is NOT fixed before go-live.** Perks
and promotions, the reconciliation ledger, the GDPR export, bulk
top-up, precharge, Wise auto-matching and the standalone affiliate role
are all out of scope for day one unless the owner says otherwise.

**Sweeps are per JOURNEY, not per fault class.** That is the whole
difference: "every fault of kind X in the app" has no end condition,
but "everything wrong with the wallet top-up journey" does — it is the
files that journey touches and nothing else. So for each journey, run
three or four agents at once, each with a different lens (money
arithmetic, dead ends, loading/empty/error states, permissions), and
every one of them SCOPED to that journey's screens, actions, hooks and
RPCs. Then walk it, fix what they found, close it, move on.

### What a journey being "closed" means

Walked in the built-in browser, by Claude, on app.primescalemedia.com,
with a signed-in session for EACH role the journey needs — not read off
the code. Every figure it produces checked against the database to the
cent. The result written into `docs/NEXT_SESSION_FIRST.md`.

**Open every branch of a dialog, not just the happy path.** A modal
with a currency picker, a bank choice, a type or a set of steps gets
walked through EVERY option: pick each one, press Next, press Back,
and check what changed — the bank details, the minimum, the labels, the
figures. Only then do one of them for real. Half the faults in this app
live in the branch nobody opened. The wallet top-up dialog is four
transfer currencies times two wallets; the ad-account funding dialog,
the exchange dialog, the withdraw dialog, the invite form and the
verify/reject dialogs are all the same shape.

**Two browser tabs, two roles.** Tab one is the owner; tab two is the
test advertiser or affiliate. Without the second tab Claude can only
read, and reading is what did not work. Ask for the login once, by
name, and then drive the whole loop without asking again.

### How to run it

- **Work one journey at a time until it is closed.** Do not start the
  next one to avoid a hard step in this one.
- **Say immediately what could not be verified** and why. No
  "probably" — read the code or ask for one SQL query.
- **Migrations** are handed over paste-ready with ONE report table at
  the end (the SQL editor shows only the last result set) and NAMED
  dollar tags (`$blk0$`).
- **Numbers must agree at both ends** — screen against database, to the
  cent. A confident 0 over a failed read is a fault, not a zero.
- **Do not stop to ask permission to continue.** Ask only when the
  answer changes the work.
- **Report per journey**, not per round: closed / blocked on what /
  what is needed from the owner.

### The percentage

The headline is **journeys closed, out of 8**. Nothing else. Screens
opened, findings fixed and SQL checks are working notes, not the
number: three of them at 90% while no journey is closed still means no
customer can get through the app.

## Non-negotiable — NOEM ALTIJD HET E-MAILADRES

De eigenaar, 30-09: "altijd zeggen welke email inloggen."

"Het paneel staat uitgelogd" is geen verzoek maar een mededeling. De
eigenaar moet dan zelf gaan uitzoeken WIE erin moet, en dat is precies
het werk dat hij niet hoeft te doen. Elke keer dat een inlog nodig is:
**het scherm, de rol en het e-mailadres, in één regel.**

Nooit een wachtwoord — dat typt hij. Nooit een gok: het adres komt uit
de database, niet uit het geheugen.

```sql
select a.tenant_client_code, p.role, p.full_name, p.email
  from public.advertisers a
  join public.user_profiles p on p.id = a.profile_id
 where a.tenant_client_code = 'PSM00NN';
```

De vijf testaccounts van test 3, gemeten op 30-09:

| code | rol | naam | inloggen met |
|---|---|---|---|
| PSM0017 | affiliate | AF1 TEST | `t3f-3009@robustq.com` |
| PSM0018 | advertiser | ADV1 TEST | `t3a-3009@robustq.com` |
| PSM0019 | advertiser (NSA) | ADV3 TEST | `t3n-3009@robustq.com` |
| PSM0020 | advertiser (referral) | T3R test2 | `kosot10190@deertees.com` |
| — | eigenaar/admin | Lasse | `contact@primescalemedia.com` |

## Non-negotiable — ZEG WELKE EFFORT, VOOR ELK BLOK

De eigenaar, 30-09: "kun jij per blok of per prompt of altijd wanneer
het moet zeggen welke effort, en hebben we nog hogere effort nodig
straks?"

**Zeg het in ÉÉN regel aan het begin van een blok werk, en alleen als
het afwijkt van `high`.** Niet elke prompt — dat is ruis. Wel zodra er
een blok begint dat duidelijk lichter of zwaarder is dan de rest.

| effort | waarvoor | voorbeeld uit dit project |
|---|---|---|
| **low** | mechanisch, het antwoord staat al vast | een label hernoemen, een CSS-waarde, een bekend patroon over zes bestanden uitrollen |
| **medium** | gewone bouw, de aanpak is duidelijk | een scherm bijbouwen zoals `/exchanges`, een dialoog compacter maken |
| **high** — DE STANDAARD | geld, SQL, en alles wat tegen de database gehouden moet worden | plakken, RPC's, wachters, een reis verifiëren, elk cijfer op een scherm |
| **max** | iets is stuk en de oorzaak is onbekend | de Verify-knop die weigerde; het tenant-owner-patroon dat drie plakken lang terugkwam |

**Hebben we straks hoger nodig?** Nee. `high` is hier de bovengrens
die loont, en `max` is voor een DIAGNOSE, niet voor meer werk per uur.
Twee keer vandaag was `max` het verschil: een fout die de code niet
liet zien maar de knop wel.

**En dit is belangrijker dan de knop zelf.** Effort is niet het
knelpunt van dit project. De drie echte vertragers zijn:

1. **Deploys** — elke push is ~4 minuten Vercel. Bundel het werk per
   rol en push één keer, niet vijf keer.
2. **Plakken** — elke plak is een heen-en-weer via de eigenaar. Zet er
   meer in één bestand.
3. **Opnieuw meten** — kost tijd en gaat er niet af. Dat is precies
   wat vandaag drie valse alarmen afving en één echte productiestoring
   vond.

Een blok puur UI-werk mag dus op `low` of `medium`; alles wat een
bedrag aanraakt blijft op `high`.

## Non-negotiable — WELKE BROWSER

De browser heet **`Baris Laptop`**. Dat is de enige die de eigenaar
ziet. Staat de sessie op een andere, dan gebeurt alles wat je doet
buiten zijn beeld — en wat hij niet ziet, gebeurt niet.

```
mcp__claude-in-chrome__list_connected_browsers   # welke zijn er
mcp__claude-in-chrome__switch_browser            # popup: hij klikt Connect
```

`list_connected_browsers` toont namen als "Browser 1" / "Browser 2"
en die zeggen NIETS over welke de zijne is — `onThisComputer: true`
evenmin, dat stond op de verkeerde. Ga niet raden en ga niet op
`isLocal` af. **Controleer het aan de app**, niet aan de lijst:

```js
// in de tab, na navigeren naar /dashboard
/Welcome back,\s*([^
]+)/.exec(document.body.innerText)?.[1]
```

Twee dingen die op elkaar lijken en het niet zijn:

1. **De verkeerde BROWSER** — jij stuurt een Chrome aan die hij niet
   voor zich heeft. Los op met `switch_browser`; hij klikt Connect en
   geeft hem een naam.
2. **Het verkeerde ACCOUNT in de goede browser** — de sessie staat op
   `contact@primescalemedia.com` (Lasse) in plaats van op hemzelf.
   Dat is een uit- en inlog en dus ZIJN werk. Zeg het in één regel en
   ga door: Lasse is mede-eigenaar, dus voor beheerwerk verandert er
   niets behalve de naam op de auditregel.

Een tab die JIJ opent kan in een ander Chrome-profiel landen dan waar
hij in zit, en komt dan uitgelogd binnen. Dat is geen storing en geen
reden om eromheen te werken — zeg het meteen.

## Deploying — branch, then production, then test live

`git push origin feat/redesign-advertiser:main` publishes to
app.primescalemedia.com immediately. **That is production. There is no
staging in front of it.**

The rhythm:

```
git push origin feat/redesign-advertiser:main   # straight to production
```

**Straight to main by default.** The branch push used to be a build gate,
and it no longer earns its keep: `scripts/gate.sh` runs tsc, lint and the
tests locally first, and a build that fails on main does NOT take
production down — Vercel only promotes a successful build, so the
previous deployment keeps serving and the change simply does not land.
The cost of a failure is identical either way, and the preview doubles
every wait.

Use the branch first ONLY for a change `next build` alone can catch:
a new page or route, a new `useSearchParams` (Suspense boundary), a CSS
template literal, JSX restructuring. Then sequentially, never both at
once — together they double the Vercel queue.

The owner does **not** want preview URLs and does not test on them.
**Never push the branch itself** (`git push origin feat/redesign-advertiser`)
— every branch push builds a Vercel preview. The ONLY push is
`git push origin feat/redesign-advertiser:main`. (2026-09-21: a session
pushed both after every deploy; the owner had to say it twice.)

Testing happens on the real URL, after promoting. Preview talks to the
**same Supabase database**, so a write there is a write on live data — it
proves the build and the render and nothing else.

Before any push: `npx tsc --noEmit && npm test` chained with `&&`.

**Never read the result through a pipe.** A grep over test output has
now lied in two different ways on the same day:

- it matched nothing, and the `&&` chain carried on as if green;
- it printed `Binary file (standard input) matches` -- one stray
  control byte in a test file makes grep refuse the whole stream --
  and that read as green too, so a failing suite got pushed.

So: redirect, check the exit code, and only then look.

```bash
npm test > /tmp/t.txt 2>&1; echo "exit=$?"
tr -d ' --' < /tmp/t.txt | grep -E "^. (pass|fail)"
```

Migrations do not deploy with git. They are pasted by hand into the SQL
editor, and every dollar-quoted block needs a NAMED tag (`$blk0$`, not
`$$`) or the editor can refuse a file whose quotes are balanced.

## Project shape

Multi-tenant financial dashboard on Next.js 15 (app router) +
Supabase. Advertisers hold EUR/USD wallets, top up via bank transfer,
spend on ad-account requests; admins verify payments; super-admin
owns the tenant.

Key tables: `wallets`, `wallet_topups`, `top_ups`, `invoices`,
`companies`, `subscriptions`, `advertisers`, `affiliates`,
`user_profiles`, `tenants`, `ad_accounts`, `ad_account_requests`,
`referral_links`, `referral_commissions`, `exchange_rates`,
`invitations`, `notifications`, `push_subscriptions`, `audit_events`,
`rate_limit_buckets`.

## Non-negotiable — how to write mutations

**Never** call `.from('BUSINESS_TABLE').insert/update/delete` from a
client component. Every mutation on a business table goes through
one of:

1. **SECURITY DEFINER RPC** in `supabase/migrations/` — for
   financial writes (wallets, wallet_topups).
2. **Server action** in `actions/*.ts` — for admin CRUD, with a
   column allowlist and tenant guard.
3. **Server action with owner-check** — for user self-service (own
   profile, own company).

See `docs/adr/0001-security-defender-rpcs-and-server-actions.md` for
the rationale. Reads may go direct — RLS covers them.

The auth guards are `apiRequireAdmin()`, `requireAdmin()`,
`requireSuperAdmin()`. Use them at the boundary; don't roll your
own.

## Non-negotiable — a column a migration has not added yet

Code reaches production in minutes; migrations are pasted by hand into
the SQL editor whenever somebody gets to it. **They are never in step.**

A `select` naming a column that does not exist yet does not degrade — it
throws, and PostgREST's message ("column plans_1.features does not
exist") lands on whatever screen asked for it. A customer read that
across their own dashboard.

So anything reading a column added by a pending migration must hold when
it is absent: ask for it, and on error retry without it. The feature
stays dark until the migration lands, instead of the screen breaking.

## Non-negotiable — EVERY plak goes to the owner as a FILE

Not a code block, not "plak 132 ligt klaar", not a path he has to go
and open. **Attach the .sql file in the message that mentions it.**

2026-09-28: plakken 132 and 133 were written, committed, and described
in a report — and neither was run, because the owner never saw a file.
He said it plainly: "je moet ook altijd een file geven anders zie ik
niet". A plak that is not attached does not exist.

The rule, in full:

- one message, one or more attached `.sql` files, with a caption that
  says what it does and what it is worth;
- if several are open, attach them ALL again rather than referring
  back to an earlier message;
- after he says it is done, **verify with `npm run check`** before
  saying it landed. Twice now a plak reported success while its own
  marker was missing, and once a plak with two `execute` statements in
  one block broke production (see below).

## Non-negotiable — ONE `execute` per block in a plak

A plak that does text surgery may contain exactly one `execute` per
function it changes. 2026-09-28: plak 124 carried a first attempt
referencing an undeclared variable and the corrected version below it.
The first ran, the second no longer matched its pattern, and the Join
button was broken on production for twenty minutes. Before sending any
plak that rewrites a live function:

```bash
grep -c "execute regexp_replace\|execute v_new" supabase/checks/PLAK-DIT-NNN-*.sql
```

The count must equal the number of functions it changes, and nothing
more.

## Non-negotiable — logging

Never `console.error(err)` where `err` is a raw Supabase error object.
Use `safeErrorMessage(err)` from `@/lib/pure-error` — Supabase's
`details`/`hint`/`row` fields leak PII.

## Non-negotiable — new financial tables

If you add a new financial table, extend the `_audit_row_change`
trigger's audited list in
`supabase/migrations/20260828130000_audit_events.sql` **and** the
`_touch_updated_at` list in
`supabase/migrations/20260829140000_updated_at_triggers.sql`. Every
business change should be reconstructable from `audit_events`, and
optimistic concurrency depends on `updated_at` being bumped.

## Non-negotiable — mutation actions

Every mutation server action:

1. Starts by calling `maintenanceGuard()` (or the `requireAdminCtx`
   helper it lives in) so `MAINTENANCE_MODE=true` freezes writes
   app-wide during an incident.
2. Column-allowlists the payload — never spread caller input into
   `.update({ ... })`.
3. Enforces tenant match by re-fetching the target row and
   comparing `tenant_id` server-side.
4. Accepts an optional `ifUpdatedAt` param and calls
   `versionMatches` before writing — protects against blind
   overwrite when two admins edit the same record. See
   `actions/_shared.ts`.

## UX — never lose typing

Long forms (company onboarding, ad-account form, ad-account
request, wallet-topup dialog) use `hooks/use-form-draft.ts` with
`profile.id` as the userScope. Combine with
`hooks/use-unsaved-changes-warning.ts` for a beforeunload dialog.
Clear the draft on successful submit.

## Style

Small commits with `fix(pX-*)` or `feat(...)` subject and a body
explaining why. Trailer: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.

## Local build

`npx tsc --noEmit`, `npx next lint` and `npm test` are the fast gate,
but they do NOT run `next build` — and some errors exist only there.
2026-09-22: two deploys failed on Vercel with a green gate, because a
`"use server"` file may export only async functions (`export function
isPayoutsMissing` in `actions/payout-actions.ts`). Production kept
serving the previous build, so nothing broke; the work simply was not
live, and `/api/version` still showed the old sha.

A real build DOES run locally with placeholder env vars — the old note
here said it could not:

```bash
printf 'NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY=dummy\nSUPABASE_SERVICE_ROLE_KEY=dummy\n' > .env.local && npx next build; rm -f .env.local
```

It takes ~3 minutes and reaches the route table. Run it before pushing a
NEW server action, route or page — and delete `.env.local` afterwards.

**After every push, check what is actually live:** `curl -s
https://app.primescalemedia.com/api/version` returns the deployed sha.
Polling GitHub's commit statuses unauthenticated runs into the 60/hour
limit and then hangs on "none" for ever.

## Non-negotiable — a revoke belongs with every create or replace

Postgres grants EXECUTE to PUBLIC on a newly created function, and PUBLIC
includes `anon` — the role behind the publishable key. So replacing a
money RPC to FIX something silently re-opens it: `top_up_admin_verify`
was repaired by plak 62 and was callable by anon again the same minute.

Every `create or replace function` on anything that touches money ends
with, in the same block:

```sql
revoke all on function public.<name>(<types>) from public, anon;
grant execute on function public.<name>(<types>) to authenticated, service_role;
```

And `pg_get_functiondef` returns the body with **CRLF** line endings on
this database, so text surgery on a live definition must match on
`[[:space:]]` rather than `chr(10)`. Cast by `p.oid`, never by a
signature string with parameter names in it — `regprocedure` takes types
only.

## Non-negotiable — a revoke belongs with every new TABLE too

Same lesson as the function rule above, one level up. Supabase sets
default privileges on `public` that hand **`anon` full `arwdDxtm`** —
select, insert, update, delete — on every table created there. So a new
table is open the moment it exists, and RLS is the only thing holding
it. 2026-09-27: `fee_change_requests` came out of plak 111 as the only
table in `public` readable by `anon`; RLS kept the rows in, but the
grant should never have been there.

Every `create table` in `public` ends with, in the same block:

```sql
alter table public.<name> enable row level security;
revoke all on public.<name> from anon, public;
-- AND from authenticated, which the line above does NOT reach: that
-- role gets its rights from Supabase DEFAULT PRIVILEGES, not from
-- PUBLIC, and the grant below adds -- it does not replace.
revoke insert, update, delete, truncate on public.<name> from authenticated;
grant select on public.<name> to authenticated;  -- and insert/update
                                                 -- only if a policy
                                                 -- actually needs it
```

2026-09-28: this rule was followed to the letter on `wallet_ledger`,
`polls` and `poll_votes` and `authenticated` still came out with
insert, update and delete on all three -- plus `fee_change_requests`
from earlier. RLS refused the writes (no policy allows them), so
nothing was exploitable, but on an append-only ledger that is one
forgotten policy away from being real. Plak 130 closed the four.
Check it, do not assume it:

```sql
select has_table_privilege('authenticated', 'public.<name>', 'insert');
```

The same goes for a `create or replace view`: it resets `reloptions` to
empty and silently drops `security_invoker=on`. Put the option in the
statement — `create or replace view … with (security_invoker = on)` —
and revoke `anon` after it. That is how `top_ups_view` ended up readable
without an account (plak 107).

## Checking a figure against the database

`npm run check -- "select ..."` reads the live database from here, so a
figure on screen can be held against the row behind it without a
hand-pasted plak. It only reads: every statement runs inside
`BEGIN READ ONLY ... ROLLBACK`, anything not starting with
select/with/explain/show/table/values is refused before it is sent, and
`EXPLAIN ANALYZE` is refused too (it runs the statement). Tests in
`tests/lib/check-readonly.test.ts` hold that line.

It needs `.env.check` (git-ignored, never printed — the password is
masked out of every line, including driver errors). If it is not set up,
`npm run check -- --setup` says what to do, and
`supabase/checks/PLAK-DIT-59-LEESACCOUNT.sql` makes the read-only login.

**A change still goes into the SQL editor by hand.** This is for reading
only, and a login that sees 0 tenants is RLS blinding it, not an empty
database — the script says so instead of printing a zero.

## Docs to know

- `docs/WALKTHROUGH_J1_J8.md` — **the script for going through the app by
  hand on production.** Five test users, J1-J8 step by step, the
  migrations that must be applied first, and a Known-limitations table so
  a known gap is not reported as a new bug.
- `docs/ROUTE_MAP.md` — **which file actually renders each screen.**
  Check it before editing a view: several ported `psm-*` components are
  on no route at all, and fixes have landed in them twice.
- `docs/WISE_SETUP.md` — the deposit feed is **ON** on production since
  17 September and real money is arriving through it (298 deposits,
  EUR/USD 567k, 21 waiting in the queue). Only one has ever matched a
  top-up, and that is correct: their references are the OLD system's
  client codes. Do not switch it off.
- `docs/UNREACHABLE.md` — components nothing imports, and the one
  FEATURE (precharge) that lost its UI in a port. Four fixes have
  already landed in files no route renders.
- `docs/NEXT_SESSION_FIRST.md` — **read this at the start of a new
  session.** Scoped, ready-to-execute work parked behind something more
  urgent; currently the 29-site silent-write sweep.
- `docs/SECURITY_HARDENING_SUMMARY.md` — commit-by-commit rundown of
  the 2026-08 sweep and what's still needed for go-live.
- `docs/TEST_PLAN.md` — manual test suite.
- `docs/RUNBOOK.md` — ops for common incidents.
- `docs/BACKUP_AND_RECOVERY.md` — backup + DR playbook.
- `docs/PRIVACY_AND_DATA_LIFECYCLE.md` — GDPR / retention.
- `docs/adr/0001*.md`, `0002*.md` — architecture decisions.
- `supabase/migrations/README.md` — schema assumptions.
