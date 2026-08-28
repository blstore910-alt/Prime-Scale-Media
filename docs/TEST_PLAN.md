# Test plan — Prime Scale Media App (security-hardened build)

Doel: bewijzen dat het financiële deel (wallets, top-ups, invoices,
invites, RBAC, tenant-isolatie) veilig **en** werkend is voordat we
live gaan.

Deze doc gaat uit van de huidige commits op `main` (t/m
`fix(p0-rest)`). Doorloop de secties **in volgorde** — de flight-check
en pre-flight moeten kloppen voor je aan de scenario's begint.

---

## 0. Pre-flight (deploy + config check)

Zonder deze stappen faalt de rest.

### 0.1 SQL migratie deployen naar Supabase

De P0 wallet-RPC's staan in `supabase/migrations/20260828120000_wallet_rpcs.sql`.

```bash
supabase db push
```

Of via Supabase Dashboard → SQL Editor → plak inhoud en run.

**Verifieer** in Supabase → Database → Functions dat deze functions
bestaan met `SECURITY DEFINER` en `authenticated` execute rights:

- [ ] `wallet_create_for_advertiser`
- [ ] `wallet_topup_advertiser_create(numeric, text, text)`
- [ ] `wallet_topup_admin_verify(uuid)`
- [ ] `wallet_topup_admin_reject(uuid, text)`
- [ ] `wallet_topup_admin_undo(uuid)`
- [ ] `wallet_admin_set_min_topup(uuid, numeric)`
- [ ] `_require_profile(text)` (helper)

**Belangrijk:** de balance-update wordt door een trigger op
`wallet_topups.status` verwacht. Check in Supabase → Database →
Triggers of die er is. Zo niet: activeer de stub onderaan de migratie.

### 0.2 RLS controle (de grootste onbekende)

Loop deze tabellen af in Supabase → Authentication → Policies.
Voor elk moet er minimaal 1 SELECT-policy zijn die *filtert op
`tenant_id`* en 1 write-policy die dat ook doet. Als er ergens
géén policy staat, is die tabel volledig open voor de anon key.

| Tabel                | RLS aan? | SELECT policy? | INSERT policy? | UPDATE policy? | DELETE policy? |
| -------------------- | -------- | -------------- | -------------- | -------------- | -------------- |
| `wallets`            | [ ]      | [ ]            | [ ]            | [ ]            | [ ]            |
| `wallet_topups`      | [ ]      | [ ]            | [ ]            | [ ]            | [ ]            |
| `top_ups`            | [ ]      | [ ]            | [ ]            | [ ]            | [ ]            |
| `topup_logs`         | [ ]      | [ ]            | [ ]            | –              | –              |
| `invoices`           | [ ]      | [ ]            | [ ]            | [ ]            | [ ]            |
| `companies`          | [ ]      | [ ]            | [ ]            | [ ]            | [ ]            |
| `billings`           | [ ]      | [ ]            | [ ]            | [ ]            | [ ]            |
| `tenants`            | [ ]      | [ ]            | [ ]            | [ ]            | [ ]            |
| `subscriptions`      | [ ]      | [ ]            | [ ]            | [ ]            | [ ]            |
| `exchange_rates`     | [ ]      | [ ]            | [ ]            | [ ]            | –              |
| `referral_commissions` | [ ]    | [ ]            | [ ]            | [ ]            | –              |
| `referral_links`     | [ ]      | [ ]            | [ ]            | [ ]            | –              |
| `ad_accounts`        | [ ]      | [ ]            | [ ]            | [ ]            | –              |
| `ad_account_requests`| [ ]      | [ ]            | [ ]            | [ ]            | –              |
| `advertisers`        | [ ]      | [ ]            | [ ]            | [ ]            | –              |
| `affiliates`         | [ ]      | [ ]            | [ ]            | [ ]            | –              |
| `user_profiles`      | [ ]      | [ ]            | [ ]            | [ ]            | –              |
| `notifications`      | [ ]      | [ ]            | [ ]            | [ ]            | –              |
| `push_subscriptions` | [ ]      | [ ]            | [ ]            | [ ]            | [ ]            |
| `invitations`        | [ ]      | [ ]            | [ ]            | [ ]            | –              |

Voor `wallets`, `wallet_topups`, `top_ups`, `invoices` is de vuistregel:
**advertiser mag alleen eigen rows lezen; alleen admin van de tenant
mag lezen/updaten binnen `tenant_id`. Insert vanuit browser volledig
uit — moet via RPC of server action.**

### 0.3 Environment / secrets

- [ ] `SUPABASE_SERVICE_ROLE_KEY` alleen op de server (niet in Vercel
  frontend build logs zichtbaar)
- [ ] `PUSH_WEBHOOK_SECRET` gezet en dezelfde als in de Supabase
  webhook definitie
- [ ] `VAPID_PRIVATE_KEY` gezet
- [ ] `NEXT_PUBLIC_APP_URL` wijst naar productie URL (invite links
  gebruiken deze)

### 0.4 Build + smoke

```bash
npm run build
```

- [ ] Build klaar zonder errors
- [ ] `next start` opent op localhost zonder crash
- [ ] `/auth/login` toont het login formulier

---

## 1. Testaccounts opzetten

Je hebt minimaal 3 accounts nodig om alle rollen te testen. Elk
account krijgt een eigen browserprofiel (Chrome profiel A/B/C) of
gebruik incognito + normal + Edge.

### 1.1 Super-admin (Tenant Owner)

Dit is degene die de tenant maakt.

1. Ga naar `/auth/sign-up` in browser A.
2. Vul e-mail in, wachtwoord **minimaal 12 tekens**.
3. Bevestig e-mail via de link.
4. Je komt uit bij `/onboard` — maak een tenant aan:
   - Naam: `Test Org`
   - Slug: `test-org` (moet uniek zijn)
5. **Verify in DB:**
   - `tenants.owner_id` = user.id van deze account
   - `user_profiles.role` = `admin`
   - `user_profiles.tenant_id` = de nieuwe tenant

### 1.2 Reguliere admin (uitgenodigd door super-admin)

1. In browser A (super-admin), ga naar `/admins` → **Create Admin**.
2. Vul e-mail + tijdelijk wachtwoord (12+ chars) in.
3. Open browser B, log in met de nieuwe admin.
4. **Verify:** deze admin ziet `/wallets`, `/top-ups`, `/users` etc.,
   maar `/admins`, `/settings`, `/commissions`, `/activity-logs` NIET
   (super-admin only).

### 1.3 Advertiser (via invite)

1. In browser A (super-admin of admin), ga naar `/invites` →
   **Send Invite** → advertiser e-mail.
2. Open invitatie-mail, klik link. Je komt op `/invite/accept`.
3. Klik **Accept** → signup formulier verschijnt (wachtwoord 12+).
4. Bevestig, log in.
5. **Verify:** advertiser ziet dashboard, wallet, invoices, top-up
   flow. Kan NIET bij `/admins`, `/users`, `/settings/*`.
6. **Verify in DB:** advertiser heeft `user_profiles` + `advertisers`
   + `wallets` row.

---

## 2. Functionele scenario's (happy path)

### 2.1 Advertiser wallet top-up (bank transfer)

Browser C (advertiser).

1. Ga naar `/wallet`. Zie USD/EUR balances (start op 0).
2. Klik **Add Balance**.
3. Kies EUR, "Meta - EU - PSM".
4. Volg de stappen. In "Transferred Amount" vul `500`.
5. Submit.
6. **Expected:** succes toast + status `pending` in transactietabel.
7. **Verify in DB:** nieuwe `wallet_topups` row met:
   - `amount` = 500
   - `currency` = EUR
   - `status` = `pending`
   - `wallet_id` = advertiser's wallet
   - `advertiser_id` = advertiser
   - `tenant_id` = tenant
   - `created_by` = advertiser's profile.id
   - `reference_no` = wallet's oude reference_no
8. **Verify:** `wallets.reference_no` van deze advertiser is nu een
   NIEUWE 10-cijferige code (rotatie werkt).

### 2.2 Admin approve wallet top-up

Browser A of B (admin), ga naar `/wallet-topups`.

1. Klik **Approve** op de nieuwe pending topup.
2. Zie de "Requested amount" (NIET bewerkbaar meer — dit is de fix).
3. Klik **Confirm Approval**.
4. **Expected:** status → `completed`, `approved_by` gezet.
5. **Verify in DB:** `wallets.eur_balance` van advertiser is met 500
   verhoogd (mits balance trigger geactiveerd is — zie 0.1).

### 2.3 Admin reject wallet top-up

Maak nog een pending topup (herhaal 2.1 met amount 200).

1. In `/wallet-topups`, klik **Reject** op de nieuwe.
2. Vul reden in.
3. **Expected:** status → `rejected`, `rejection_reason` gezet.

### 2.4 Admin undo wallet top-up

1. Op de zojuist rejected: klik **Undo**.
2. **Expected:** status → `pending`, `rejection_reason` weer NULL,
   `approved_by` NULL.
3. Herhaal met een `completed` topup: **Expected:** balance rolt
   terug (of trigger reverseert).

### 2.5 Admin creëert account top-up voor advertiser

Browser A/B. Ga naar `/users`.

1. Open advertiser detail sheet → **Add Topup**.
2. Vul: type `top-up`, EUR, fee `10`, amount `300`.
3. Toggle "Mark Topup as Paid ?" AAN.
4. Submit.
5. **Expected:** succes. In `/top-ups` verschijnt row met
   `status='completed'`.
6. **Verify in DB:** `top_ups` row heeft `tenant_id` = admin's tenant,
   `author` = admin object, `status='completed'`.

### 2.6 Admin verifieert een account top-up

Zorg voor een pending `top_ups` row (of laat advertiser er 1 aanmaken
via `/wallet/topup`).

1. Ga naar `/top-ups`.
2. Klik **Verify** op een pending row.
3. Optioneel: pas fee percentage aan.
4. Klik **Verify Payment**.
5. **Expected:** status → `completed`. Fee correct opgeslagen.

### 2.7 Admin maakt invoice

Browser A/B → `/invoices` → **Create Invoice**.

1. Kies advertiser, currency EUR, amount 100.
2. Submit.
3. **Expected:** nieuwe invoice, status `unpaid`.
4. Klik **Mark Paid**. Status → `paid`, `paid_at` gezet.
5. Klik **Mark Unpaid**. Terug naar `unpaid`, `paid_at` NULL.

### 2.8 Admin download invoice PDF

1. In `/invoices` klik **Download** op een row.
2. **Expected:** PDF opent/downloadt.
3. Advertiser (browser C) → `/invoices` → klik **Download** op zijn
   eigen invoice.
4. **Expected:** PDF opent.

### 2.9 Invite flow (advertiser accept + reject)

1. Admin stuurt invite naar test e-mail X.
2. In browser D open link → **Accept**.
3. Signup, verify, log in → dashboard verschijnt.
4. Nieuwe invite naar test e-mail Y.
5. In browser E open link → **Reject**.
6. **Verify in DB:** `invitations.status` = `rejected`. Geen
   `user_profiles` row aangemaakt.

### 2.10 Wallet exchange (USD ↔ EUR)

Advertiser (browser C) met balances > 0.

1. `/wallet` → **Exchange balance**.
2. Zet 50 EUR → USD.
3. **Expected:** balance verandert conform exchange rate. Nieuwe
   `wallet_exchanges` row.

---

## 3. Security testen (echt kritiek)

Dit is waar we specifiek de audit-vondsten testen.

### 3.1 RBAC — advertiser mag geen admin pages zien

Browser C (advertiser).

1. Navigeer handmatig naar `/admins`, `/settings`, `/users`,
   `/activity-logs`, `/wallet-topups`, `/top-ups`.
2. **Expected:** redirect naar `/dashboard` bij elk.

### 3.2 RBAC — reguliere admin mag geen super-admin pages zien

Browser B (reguliere admin).

1. Navigeer naar `/admins`, `/settings/finance`, `/commissions`,
   `/affiliates`, `/activity-logs`.
2. **Expected:** redirect naar `/dashboard`.

### 3.3 Tenant isolation

Maak in een aparte flow een tweede tenant met een andere super-admin.

1. In browser D (tenant 2 admin), let op de user IDs / advertiser IDs
   van tenant 1.
2. Open browser dev tools → console:
   ```js
   const supabase = /* import from window if exposed */;
   await supabase.from("wallets").select("*");
   ```
3. **Expected:** ZERO rows van tenant 1 zichtbaar.
4. Herhaal voor `wallet_topups`, `top_ups`, `invoices`, `user_profiles`.
5. Als je wél rows uit tenant 1 ziet: **kritieke RLS mis** — stop
   direct en fix.

### 3.4 Wallet topup amount kan niet gemanipuleerd worden bij approve

Browser A (admin). Open dev tools → Network.

1. Ga naar `/wallet-topups`, klik Approve, klik Confirm.
2. In Network tab: bekijk de `wallet_topup_admin_verify` RPC call.
3. **Expected:** payload bevat ALLEEN `p_topup_id` (geen amount).
4. In Supabase: verifieer dat `wallet_topups.amount` na approve nog
   steeds de originele request-amount is.

### 3.5 Advertiser kan geen andermans wallet topup indienen

Browser C (advertiser). Open dev tools.

1. Bekijk de RPC call bij een normale topup — noteer je eigen
   wallet_id.
2. Probeer via console:
   ```js
   supabase.rpc("wallet_topup_advertiser_create", {
     p_amount: 999,
     p_currency: "EUR",
     p_payment_slip: null
   })
   ```
3. **Expected:** slaagt maar bindt aan **jouw** wallet (server derived).
4. Probeer nu een insert direct:
   ```js
   supabase.from("wallet_topups").insert({
     wallet_id: "een-andere-wallet-id",
     amount: 100000,
     status: "completed",
     currency: "EUR"
   })
   ```
5. **Expected:** geblokkeerd door RLS (row-level violation). Als dit
   werkt → RLS is te lek.

### 3.6 Invoice mark-paid niet toegankelijk voor advertiser

Browser C → `/invoices`.

1. **Expected:** GEEN "Create Invoice" knop, GEEN "Mark Paid" knop
   op invoice rows.
2. Console poging:
   ```js
   supabase.from("invoices").update({ status: "paid" }).eq("id", "...")
   ```
3. **Expected:** RLS blokkeert (rows 0). Bevestig in DB dat status
   niet veranderde.

### 3.7 Tenant self-create voorkomt duplicates

Browser C (advertiser, heeft geen tenant).

1. Navigeer naar `/onboard`.
2. **Expected:** redirect naar `/dashboard` (advertiser hoort daar
   niet).
3. Als de super-admin naar `/onboard` gaat: expected redirect naar
   `/dashboard` want owns al een tenant.
4. Verifieer server action: browser F (nieuwe user, geen tenant).
   Ga naar `/onboard`, maak tenant "Foo Bar" met slug "foo-bar".
   Probeer nog een tenant "Baz" te maken.
5. **Expected:** foutmelding "You already own a tenant".

### 3.8 Invite token cannot leak tenant

1. Neem de invite link van 2.9 stap 4, kopieer 'm.
2. Open in browser G (compleet nieuwe user, ander e-mail).
3. Registreer met een ANDER e-mailadres dan waar de invite naartoe
   ging.
4. **Expected:** signup faalt met "Email does not match invitation".

### 3.9 send-invite kan geen admin-role invite versturen

Browser A (admin), dev tools → console:

```js
fetch("/api/send-invite", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    email: "attacker@example.com",
    role: "admin",
    sender_profile_id: "een-andere-profile-id"
  })
})
```

**Expected:** 400 "Role must be one of: advertiser, affiliate".

### 3.10 Confirm route weigert tenant-slug-tampering

Alleen indien de gebruiker via een externe link binnenkomt. Test
door in de URL na e-mailconfirmatie `?t=` te veranderen naar een
andere tenant-slug dan waar de user zich voor registreerde.

**Expected:** redirect naar `/auth/error?error=Tenant slug mismatch`.

### 3.11 Password minimum

1. Signup pagina met wachtwoord `Kort1234` (8 chars).
2. **Expected:** afgewezen.
3. Met `MinimaalTwaalfChar!` (18 chars) → OK.

### 3.12 Admins-table toggle vraagt super-admin

Browser B (reguliere admin, geen owner). Open dev tools → console:

```js
import("/actions/admin-actions.ts").then(m =>
  m.toggleAdminStatus("some-admin-id")
);
```

(Of test via de UI door direct naar `/admins` te browsen — reguliere
admin zou daar al redirect moeten krijgen.)

**Expected:** result `{ok: false, error: "Forbidden"}`.

---

## 4. Regressie (bestaande features werken nog)

### 4.1 Dashboard

- [ ] Home dashboard laadt zonder errors
- [ ] Stats tegels (topups, subscriptions, profit, fees) tonen data
      van jouw tenant

### 4.2 Ad account request flow

1. Advertiser → `/dashboard` → Request Ad Account.
2. Vul velden.
3. Admin ziet request → maakt invoice → advertiser betaalt (mark paid).
4. Admin creëert account → toewijzen aan advertiser.
5. **Expected:** hele flow zonder errors.

### 4.3 Wallet exchange dialog

Advertiser met EUR + USD balance:

1. Wallet → Exchange.
2. Exchange 20 EUR → USD.
3. **Expected:** balance klopt volgens exchange rate.

### 4.4 Bulk topup voor ad accounts (admin)

Admin → `/top-ups` → Bulk topup dialog. (**Let op:** deze is nog niet
via server action beveiligd — zie follow-up in P0-rest commit.)

### 4.5 Notificaties + push

1. Advertiser topup submits.
2. Admin krijgt push (indien geabonneerd) + notification-bell toont badge.
3. **Expected:** popover werkt, markeren als gelezen werkt.

### 4.6 Invoice PDF stijl

1. Download 1 invoice PDF.
2. **Expected:** bedragen kloppen, tenant-naam bovenaan, geen HTML
   escapes zichtbaar.

### 4.7 Zoek + filter

- [ ] Users search (typ deel naam met leestekens)
- [ ] Invoices search (nummer + advertiser code + company naam)
- [ ] Topups search
- [ ] **Verify:** speciale tekens zoals `,` `(` `%` in de zoekterm
      breken de query NIET (dit is de ilike sanitize fix).

### 4.8 Uitloggen + inloggen

1. Log uit.
2. Login opnieuw als super-admin.
3. **Verify:** `profile_id` cookie is `HttpOnly` en `Secure` (dev tools
   → Application → Cookies).

---

## 5. Bekende follow-ups (niet blocking voor go-live, maar tracken)

Deze items zijn bewust nog niet gehard. Ze werken wel, maar leunen
op RLS:

1. `referral_commissions` mark paid/unpaid vanuit
   `commission-status-action.tsx` — direct client update.
2. `referral_links` admin insert vanuit `user-affiliates.tsx`.
3. `exchange_rates` auto-upsert in `context/app-provider.tsx` bij
   admin mount, met response van 3rd-party API. Verplaats naar
   server + valideer numeric range.
4. `bulk-ad-accounts-topup-dialog` doet directe `top_ups` insert —
   moet ook via `createTopupAsAdmin`.
5. `use-update-user.ts` (subscriptions cascade) — deze werkt nu via
   `updateUserProfile` server action, maar de cascade check kan nog
   scherper (rate limit, audit log).

---

## 6. Backup / disaster recovery (aanbevolen vóór live)

Nog niet geïmplementeerd. Aanbevolen basis:

1. **Supabase PITR** aanzetten (Pro plan): Dashboard → Settings →
   Database → Point-in-time recovery, 7-30 dagen retentie.
2. **Off-site daily snapshot** naar eigen bucket (S3/R2/GCS) via een
   Supabase Edge Function op cron.
3. **Immutable audit log**: `audit_events` tabel + trigger op
   financial tabellen. Niet-muteerbaar (INSERT-only policy).
4. **Restore drill** — 1× per maand een snapshot restoren in een
   staging DB en steekproef doen.

Zie de sectie in de vorige chatbericht voor implementatiedetails.

---

## 7. Sign-off

Voor go-live moeten deze checked zijn:

- [ ] Sectie 0.1 — SQL migratie deployed
- [ ] Sectie 0.2 — RLS matrix volledig ingevuld
- [ ] Sectie 0.3 — Secrets check
- [ ] Sectie 0.4 — Build clean
- [ ] Sectie 1 — 3 testaccounts opgezet
- [ ] Sectie 2 — Alle happy path scenario's groen
- [ ] Sectie 3 — Alle security tests groen, ZERO tenant-cross-leak
- [ ] Sectie 4 — Regressie zonder blockers
- [ ] Sectie 6 — Backup strategy besloten (implementeren kan post-launch)

**Als een sectie 3 test faalt (met name 3.3 en 3.5): STOP. Fix eerst.**

---

## Bijlage: DB direct-query cheat sheet

Vanuit Supabase SQL editor:

```sql
-- Rijen per tenant tellen
select
  (select count(*) from wallets where tenant_id = 'XYZ') as wallets,
  (select count(*) from wallet_topups where tenant_id = 'XYZ') as wallet_topups,
  (select count(*) from top_ups where tenant_id = 'XYZ') as top_ups,
  (select count(*) from invoices where tenant_id = 'XYZ') as invoices,
  (select count(*) from user_profiles where tenant_id = 'XYZ') as profiles;

-- Verdachte rows: wallet_topups met status buiten allowed
select id, status, amount, tenant_id from wallet_topups
 where status not in ('pending','completed','rejected');

-- Verdachte rows: top_ups met status buiten allowed
select id, status, amount_received, tenant_id from top_ups
 where status not in ('pending','completed','rejected');

-- Wie is owner van welke tenant
select t.id, t.slug, t.owner_id, u.email
  from tenants t
  join auth.users u on u.id = t.owner_id;
```
