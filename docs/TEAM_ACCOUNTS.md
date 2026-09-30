# Team accounts — several people on one advertiser, and on one affiliate

Requested 2026-09-17: an advertiser should be able to put colleagues on
their account, with fewer rights, and optionally scoped to some of their ad
accounts. Extended the same day: **affiliates too.** Same shape as the competitor screen the request came with:
Members / Invitations, a Role column, a Status column, an "Ad accounts"
column reading "All accounts" or a subset, and an Invite member button.

**Not started.** This note exists so it is designed before it is built,
because the dangerous part is not the UI.

## Why this is not a screen

Today "an advertiser" and "a user" are the same row. Every advertiser-facing
policy resolves ownership the same way:

```sql
exists (select 1 from advertisers a
         where a.id = <table>.advertiser_id and a.user_id = auth.uid())
```

`advertisers.user_id` is the one link. Adding a second person to an
advertiser means that test is wrong on **every advertiser-readable table** —
wallets, wallet_topups, top_ups, ad_accounts, ad_account_requests,
ad_account_withdrawals, invoices, subscriptions, referral_links,
referral_commissions, notifications, companies. Miss one and a colleague
either cannot see their own company's data, or worse, the membership test is
written loosely and one advertiser reads another's.

## Affiliates need the same thing, and it is the same work

An affiliate is the same shape of problem with a different table: every
affiliate-facing policy resolves ownership through `referral_links` and
`affiliates` against `auth.uid()`. So the design below is written twice, once
per subject, and the membership helper takes the subject id whichever table
it comes from:

```sql
create table subject_members (
  id uuid primary key default gen_random_uuid(),
  subject_kind text not null check (subject_kind in ('advertiser','affiliate')),
  subject_id   uuid not null,
  tenant_id    uuid not null references tenants(id),
  user_id      uuid not null references auth.users(id),
  role         text not null check (role in ('owner','manager','viewer')),
  created_at   timestamptz not null default now(),
  unique (subject_kind, subject_id, user_id)
);
```

One table, one helper, two subjects — rather than two parallel sets of
tables that drift. The roles differ in what they gate: for an affiliate
there is no wallet and no withdrawal, so `manager` is "see referrals and
earnings, cannot change payout details" and `viewer` is read-only.

The per-ad-account scoping has no affiliate equivalent; an affiliate's
equivalent narrowing would be per referral link, which nobody has asked for
and should not be built on speculation.

## Shape

```sql
create table advertiser_members (
  id uuid primary key default gen_random_uuid(),
  advertiser_id uuid not null references advertisers(id) on delete cascade,
  tenant_id uuid not null references tenants(id),
  user_id uuid not null references auth.users(id),
  role text not null check (role in ('owner','manager','viewer')),
  -- NULL = every ad account. A row per account otherwise.
  created_at timestamptz not null default now(),
  unique (advertiser_id, user_id)
);

create table advertiser_member_accounts (
  member_id uuid not null references advertiser_members(id) on delete cascade,
  ad_account_id uuid not null references ad_accounts(id) on delete cascade,
  primary key (member_id, ad_account_id)
);
```

One SECURITY DEFINER helper replaces the ownership test everywhere:

```sql
create or replace function _member_of_advertiser(p_advertiser uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from advertiser_members m
     where m.advertiser_id = p_advertiser and m.user_id = auth.uid()
  );
$$;
```

Then every advertiser policy becomes `_member_of_advertiser(advertiser_id)`,
and the existing `advertisers.user_id` owner keeps working because a backfill
inserts one `owner` member row per advertiser.

Roles, minimum viable:

| role | can |
|---|---|
| owner | everything the advertiser can do today, incl. inviting and removing members and requesting withdrawals |
| manager | request ad accounts, request top-ups, see invoices — but NOT withdrawals, NOT member management, NOT company/billing details |
| viewer | read only: balances, accounts, spend |

Ad-account scoping applies on top and only narrows: a viewer scoped to two
accounts sees those two.

## Order of work

1. **WRITTEN, not applied:**
   `supabase/migrations/20260917180000_team_accounts_phase1.sql`. Two tables,
   two helpers, RLS on the new tables, and an idempotent backfill making
   today's single user the `owner` of their advertiser / affiliate. It
   touches NO existing policy, so applying it changes nothing about how the
   app behaves — that is why it is a separate phase and why it can go in
   before the rest is decided. Rollback is four `drop` statements, listed in
   the file. The closing SELECT is the gate: every advertiser and affiliate
   with a user must have an owner row, or something has a null `tenant_id`
   and phase 2 would lock that person out.
2. Rewrite each advertiser policy to the helper. **One table per migration**,
   each verified against live before the next.
3. Invitations: reuse `invitations`, adding `advertiser_id` and `member_role`
   so the accept path creates a member row instead of an advertiser.
4. Server actions for invite / change role / remove / scope, all
   owner-gated on the advertiser, all column-allowlisted.
5. The screen, last.
6. Role enforcement in the ACTIONS too, not only in RLS — a manager must be
   refused a withdrawal by the server action, with a reason, not by an empty
   result set.

## Cost and risk

Roughly 12 tables of policy work plus the invite flow and the UI. The risk
is not the feature, it is step 2: every policy rewritten on a live database
holding real balances, where a mistake is either a lockout or a leak. It
wants its own session with nothing else in it, and each policy verified
against live before the next one is touched — the same way the
`user_profiles` UPDATE policy turned out to be missing entirely on 2026-09-17
while the repo migration said otherwise.

Related: `docs/ROUTE_MAP.md`, `supabase/checks/user-profiles-update-policy.sql`.

---

## Stand op 30-09 — fase 1 en 2 staan, fase 3 is uitgeschreven

### Wat er ligt

| fase | wat | stand |
|---|---|---|
| 1 | `subject_members`, helpers, backfill | **LIVE** — plak 175, 22 van 22 adverteerders als eigenaar |
| 2 | teamleden mogen lezen | plak 176 — additief, zie hieronder |
| 3 | uitnodigen, accepteren, inloggen als teamlid | **uitgeschreven, niet gebouwd** — zie onder |

### Twee dingen die anders bleken dan in het ontwerp hierboven

**1. `affiliates` is een overblijfsel.** Eén rij, terwijl er vijf
affiliate-gebruikers zijn — alle vijf met een adverteerdersrij. Een
affiliate IS in deze database een adverteerder. Teams voor affiliates
lopen dus mee via `subject_kind = 'advertiser'`, en er is geen aparte
affiliate-helft nodig. (De backfill van 17-09 deed `select af.user_id
from affiliates` en zou zijn gestopt: die kolom bestaat niet.)

**2. Fase 2 herschrijft geen enkele policy.** Het ontwerp hierboven zei:
herschrijf elke leesregel, een tabel per plak. Plak 176 zet in plaats
daarvan per tabel een TWEEDE regel ernaast (`<tabel>_team_read`).
Postgres combineert permissieve regels met OR, dus die kan alleen
toegang toevoegen en nooit weghalen, en de eigenaarsregel blijft
onaangeroerd. Daarmee verviel de reden voor een-tabel-per-plak.

### Fase 3 — de vier plekken, precies

**A. `invitations` krijgt twee kolommen** (plak): `team_advertiser_id
uuid` en `member_role text check (member_role in ('manager','viewer'))`.
Leeg = een gewone klantuitnodiging, zoals vandaag.

**B. De acceptatie** — `app/api/accept-invite/route.ts` (regel ~200) en
`app/api/accept-invite/signup/route.ts` (regel ~150) maken een
`user_profiles`-rij, en daarna maakt `lib/auth/finalize-signup.ts` een
adverteerder (regel 133/423), een wallet (224) en een referral-link
(280). Voor een TEAMuitnodiging:
- wel het profiel, rol `advertiser`, in dezelfde tenant;
- **niet** de adverteerder, niet de wallet, niet de referral-link —
  anders is de collega een tweede klant met een lege wallet;
- wel een `subject_members`-rij naar `team_advertiser_id` met
  `member_role`.

**C. De sessielader** — `lib/auth/session.ts` regel ~38 embedt
`advertiser:advertisers(...)` via `profile_id`. Een teamlid heeft geen
adverteerder met zijn eigen `profile_id`, dus die lijst is leeg en de
hele klantapp denkt "geen account". De lader moet, als er geen eigen
adverteerder is, die van het lidmaatschap ophalen — en de EIGEN
adverteerder altijd eerst, zodat `profile.advertiser[0]` voor een
gewone klant precies blijft wat het is.

**D. Het scherm** — Settings → Team, alleen voor de eigenaar: leden,
uitnodigen (e-mail + rol), verwijderen. En voor een `viewer` verdwijnt
elke knop die iets doet. De server weigert die al vanzelf: elke actie en
elke geld-RPC zoekt de adverteerder op via `user_id = auth.uid()`, en een
teamlid heeft zo'n rij niet. Maar een knop die bestaat en altijd faalt
is een knop die niets doet.

### Waarom fase 3 niet in de sessie van 30-09 zit

Plek C ligt op het pad van **elke** login. Een fout daar betekent dat
niemand meer binnenkomt — de duurste fout die deze app kan maken. En
hij is niet te testen zonder een tweede account dat als teamlid
inlogt, en een account aanmaken is het werk van de eigenaar.

**Nodig van de eigenaar om te beginnen:** één e-mailadres dat als
test-teamlid kan dienen, en een login daarmee zodra fase 3 staat.

### En de managers — de stap daarna

Een `viewer` raakt geen geld, en heeft dus niets van de geld-RPC's
nodig. Een `manager` die opwaardeert of een account aanvraagt WEL: elke
geld-functie zoekt "de adverteerder van de beller" op, en voor een
manager moet dat de adverteerder van zijn team worden, met een roltoets.
Dat is een wijziging aan elke geld-RPC op live — precies het risico waar
dit document bovenaan voor waarschuwde, nu op de functies die geld
verplaatsen. Eigen ronde, na de viewers.
