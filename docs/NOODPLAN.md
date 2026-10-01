# NOODPLAN — als er iets misgaat met de PSM-app

> Dit bestand zit **elke nacht in de backup-zip** op Google Drive (en in de
> mail), altijd de versie die op dat moment live stond. Ook als de app, de
> code of Supabase weg is, heb je dit nog.
>
> Laatst bijgewerkt: 01-10-2026.

---

## 0. De eerste minuut — altijd hetzelfde

1. **Open Claude Code** op de laptop, in de map
   `C:\Users\baris\Documents\Prime Scale Media App`, en typ:
   > **Noodgeval: <wat je ziet>. Lees docs/NOODPLAN.md en help me.**

   Claude kent de app, kan de database lezen (`npm run check`), de code
   nalopen en een herstel-plak schrijven. Jij hoeft niets uit te zoeken.
   Lukt Claude Code niet (laptop weg)? Dan werkt dit document ook met de
   hand — elk scenario hieronder staat stap voor stap.
2. **Gaat er geld mis, of weet je het niet zeker? Eerst bevriezen.**
   Vercel → project → Settings → Environment Variables →
   `MAINTENANCE_MODE` = `true` (Production) → Deployments → de bovenste →
   ⋯ → **Redeploy**. Na ±4 minuten weigert de app elke schrijfactie
   (lezen werkt nog). Er kan geen nieuwe schade meer bij terwijl je zoekt.
3. **Druk NOOIT op "Start a restore"** in Supabase → Backups. Dat zet
   PRODUCTIE terug en wist alles van na dat moment. Herstellen doe je
   altijd eerst naar een **nieuw** project (§3).

---

## 1. Welk scenario is het?

| wat je ziet | scenario | ga naar |
|---|---|---|
| app.primescalemedia.com laadt niet / foutpagina voor iedereen | app plat | §2.1 |
| app laadt, maar overal "could not load" / lege lijsten | database onbereikbaar | §2.2 |
| een saldo, top-up of factuur klopt niet; iemand heeft iets verwijderd of fout gezet | verkeerde data | §2.3 |
| 1 of 8 uur werk weg (bv. een foute plak, een fout script) | werk kwijt | §2.4 |
| het Supabase-project is weg of onherstelbaar | alles kwijt | §2.5 |
| een sleutel, wachtwoord of `.env` is gelekt | sleutel gelekt | §2.6 |
| geen mails meer (uitnodigingen, facturen, backup) | mail plat | §2.7 |
| alarmmail "backup failed" / "Drive" | backup mislukt | §2.8 |
| bankgeld komt niet meer binnen in de app (Wise-feed) | feed plat | §2.9 |
| een klant zegt "mijn geld is weg" | klantvraag | §2.10 |
| jij kunt niet meer inloggen bij Vercel/Supabase/Google | toegang kwijt | §2.11 |

---

## 2. De scenario's

### 2.1 De app is plat

1. Kijk op `https://app.primescalemedia.com/api/health` — `200` betekent dat
   de app én de database antwoorden; dan zit het in één scherm, niet overal.
2. Vercel → project → **Deployments**. Staat de bovenste op *Error*? Dan is
   de laatste deploy mislukt — de vorige draait nog gewoon. Is de vorige
   ook stuk: klik op de laatste groene → ⋯ → **Promote to Production**.
   Dat zet de vorige versie in één klik terug.
3. Vercel zelf storing? `https://www.vercel-status.com`. Dan wachten.
4. UptimeRobot mailt je als de app plat ligt; hij kijkt naar `/api/health`.

### 2.2 De database is onbereikbaar

1. `https://status.supabase.com` — storing bij Supabase? Dan wachten; er is
   niets kwijt, alleen tijdelijk onbereikbaar.
2. Supabase → project → Home: staat het project op **Paused**? Dan
   **Restore project** (gratis, duurt minuten).
3. Is het project echt weg → §2.5.

### 2.3 Verkeerde data (een rij is fout, verwijderd of overschreven)

Dit is het meest voorkomende geval, en het makkelijkste: **niet terugzetten,
maar chirurgisch herstellen.**

1. Bevries als het om geld gaat (§0.2).
2. Elke wijziging aan een geldtabel staat in `audit_events`, met de rij
   **ervoor en erna** en wie het deed. Elke saldobeweging staat in
   `wallet_ledger`. Claude zoekt het op:
   `npm run check -- "select occurred_at, table_name, action, before_data, after_data from audit_events where row_id = '<id>' order by occurred_at"`
3. Claude schrijft een herstel-plak die precies die rijen terugzet. Jij
   plakt hem in de SQL-editor.
4. Controle: `npm run ochtend` — alles groen, en
   `supabase/checks/RESTORE-DRILL-TELLING.sql` regel "wallets die niet bij
   hun ledger passen" = **0**.
5. Ontdooien: `MAINTENANCE_MODE` weg → Redeploy.

### 2.4 1 uur of 8 uur werk kwijt

Uitgebreid in **RESTORE_DRILL.md** (zit ook in deze zip). Kort:

1. Bevries (§0.2). Noteer het tijdstip van vóór de schade.
2. Supabase → Database → Backups → **Point in time** → **Restore to a
   new project**, op dat tijdstip. PITR staat aan: tot op 2 minuten nauwkeurig,
   7 dagen terug.
3. In het nieuwe project: haal de rijen op die in productie kapot zijn
   (Claude vergelijkt de twee). Zet alleen die terug in productie.
4. Alles wat klanten NA de schade goed deden, blijft zo staan — daarom
   nooit heel productie terugzetten als het ook zo kan.
5. Controle + ontdooien zoals §2.3.
6. Verwijder het tijdelijke project (het kost geld zolang het bestaat).

### 2.5 Alles kwijt: het Supabase-project bestaat niet meer

Eerst: mail Supabase support (support@supabase.com, of in het dashboard
"Support") — een verwijderd project is soms binnen enkele dagen terug te
halen. Lukt dat niet, dan herbouw je vanuit de zip:

1. Download de nieuwste `psm-backup-JJJJ-MM-DD.zip` van Google Drive
   (de backupmap die in `GOOGLE_DRIVE_FOLDER_ID` staat → Backups / jaar / maand)
   of uit de backupmail.
2. Controleer hem: `npm run backup:verify -- <pad-naar-zip>` — telt elke
   tabel en controleert de sha256 van elk bestand.
3. Maak een **nieuw Supabase-project** (regio EU, zelfde plan). Zet PITR aan.
4. SQL-editor → plak **`schema.sql`** uit de zip. Dat zet alle tabellen,
   sleutels, functies, triggers, RLS-regels en rechten terug zoals ze die
   nacht waren.
5. Data terugzetten: elke `tables/<naam>.json` is een lijst rijen. Claude
   maakt daar insert-plakken van (in de goede volgorde: eerst tenants en
   user_profiles, dan advertisers, wallets, en de rest).
6. Logins: `auth/users.json` heeft iedereen zonder wachtwoord. Na herstel
   kiest iedereen een nieuw wachtwoord via "Forgot password". Hun id blijft
   gelijk, dus alles blijft aan hen gekoppeld.
7. Bestanden (betaalbewijzen, logo's): `storage/<bucket>/…` — maak de
   buckets aan (staan onderaan schema.sql) en upload de mappen.
8. Vercel → Environment Variables: zet `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY` en
   `SUPABASE_SERVICE_ROLE_KEY` op het nieuwe project → Redeploy.
9. Supabase → Authentication: Site URL `https://app.primescalemedia.com`,
   Redirect URLs `https://app.primescalemedia.com/**`, SMTP (Brevo) en de
   zes mailtemplates (`supabase/email-templates/`).
10. Controle: `npm run ochtend` + `npm run check` tegen het nieuwe project.

### 2.6 Een sleutel is gelekt

Vervang hem waar hij vandaan komt, zet de nieuwe in Vercel, Redeploy.

| sleutel (naam in Vercel) | waar vervangen |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API Keys → roteer de secret key |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY` | idem, publishable key (deze is openbaar bedoeld, minder erg) |
| `BREVO_SMTP_USER` / `BREVO_SMTP_PASS` | Brevo → SMTP & API → nieuwe SMTP-sleutel |
| `WISE_API_TOKEN` / `WISE_*` | Wise → Settings → API tokens |
| `ROCKADS_API_KEY` / `ROCKADS_API_SECRET` | bij de leverancier |
| `SUPPLIER1_AUTH_TOKEN` | bij de leverancier (Falkyn) |
| `SLASH_API_KEY` | Slash → Developers |
| `CRON_SECRET`, `PUSH_WEBHOOK_SECRET` | zelf een nieuwe lange willekeurige tekst kiezen |
| `GOOGLE_OAUTH_*` (Drive) | Google Cloud → Credentials (zie BACKUP_DRIVE_SETUP.md) |
| `VAPID_PRIVATE_KEY` | nieuw paar maken; telefoons moeten meldingen opnieuw aanzetten |

**Nooit** een sleutel in een chat, mail of WhatsApp plakken — ook niet aan
Claude. Alleen in Vercel.

### 2.7 Er gaan geen mails meer uit

1. Brevo → **Transactional → Logs**: zie je de mails daar wel? Dan zit het
   bij de ontvanger (spam). Niet? Dan:
2. Brevo → account: geblokkeerd of tegoed op? SMTP-sleutel nog geldig?
3. Vercel → Logs, zoek op `Error sending email`.
4. De app werkt intussen gewoon; mails zijn een melding, geen voorwaarde.

### 2.8 De backup mislukt

Je krijgt een alarmmail én een melding in de app ("Backup problem").

1. Lees in de mail welke stap faalde: tabellen, bestanden, Drive of mail.
2. Drive: is de Google-koppeling verlopen? Zie BACKUP_DRIVE_SETUP.md
   (refresh-token opnieuw maken). Drive vol? Ruim oude zips op.
3. Opnieuw draaien: Vercel → Settings → Cron Jobs → `system-backup` → **Run**.
4. Eén mislukte nacht is geen ramp: PITR (7 dagen) dekt het. Twee nachten
   op rij: los het dezelfde dag op.

### 2.9 Bankgeld komt niet binnen (Wise-feed)

Zie WISE_SETUP.md. Klanten kunnen intussen gewoon top-ups aanmelden met
een slip; jullie verifiëren met de hand op het Wise-dashboard. Er gaat
geen geld verloren — alleen het automatisch koppelen stopt.

### 2.10 "Mijn geld is weg" (klant)

1. Klantcode vragen. `wallet_ledger` toont elke beweging met saldo
   ervoor en erna — het antwoord staat daar altijd.
2. Klopt de ledger niet met het saldo: §2.3.

### 2.11 Toegang kwijt

| dienst | wat er draait | eigenaar | herstel |
|---|---|---|---|
| Vercel | de app, de nachtelijke taken | Baris | wachtwoord-reset, 2FA-herstelcodes |
| Supabase | database, logins, bestanden | Baris | idem |
| GitHub | de code | blstore910-alt | idem |
| Google (Drive) | de backups | Baris | idem |
| Brevo | de mails | Baris | idem |
| Domein (DNS) | app.primescalemedia.com | Baris | bij de registrar |

**Bewaar de 2FA-herstelcodes van al deze diensten op papier of in een
wachtwoordkluis**, niet alleen op de telefoon. Lasse
(contact@primescalemedia.com) is mede-eigenaar in de app; geef hem
toegang tot minstens Vercel en Supabase als tweede persoon.

---

## 3. Een backup TESTEN (oefening B, veilig)

Een backup die nooit is teruggezet, is een hoop. Eén keer per kwartaal:

1. Supabase → Database → Backups → **Point in time** → **Restore to a new
   project** (NIET "Start a restore"). Kies een moment van een paar minuten
   geleden. Productie merkt hier niets van.
2. Wacht tot het nieuwe project klaar is (±10–20 min).
3. Open de **SQL-editor van het nieuwe project** en plak
   `supabase/checks/RESTORE-DRILL-TELLING.sql`. Stuur de uitkomst naar
   Claude; die draait dezelfde telling op productie en vergelijkt.
4. Klopt het: noteer het in RESTORE_DRILL.md (logboek onderaan) en
   **verwijder het nieuwe project** (Settings → General → Delete project).

De zip-backup testen: `npm run backup:verify -- <zip>` (gedaan op 01-10:
63 tabellen, 5.253 rijen, 44 bestanden, tot op de cent gelijk aan live).

---

## 4. Hoe het allemaal draait

```
klant/admin ──> app.primescalemedia.com (Vercel, Next.js 15)
                   │
                   ├── Supabase (Postgres + logins + bestanden), regio EU
                   ├── Brevo (alle mails)
                   ├── Wise (bankfeed), leveranciers-API's, Slash (saldo)
                   └── Google Drive (backups, betaalde facturen)
```

**Code**: GitHub, branch `feat/redesign-advertiser`. Live zetten:
`git push origin feat/redesign-advertiser:main` → Vercel bouwt ±4 min →
`https://app.primescalemedia.com/api/version` toont de live versie.
Een mislukte build zet NIETS plat: de vorige versie blijft draaien.

**Databasewijzigingen** ("plakken"): `supabase/checks/PLAK-DIT-<nr>-*.sql`,
met de hand geplakt in Supabase → SQL Editor. Ze staan niet allemaal in
`supabase/migrations/` — daarom gaat het schema elke nacht als
`schema.sql` mee in de backup.

**Nachtelijke en vaste taken** (Vercel → Settings → Cron Jobs, tijden UTC):

| taak | wanneer | wat |
|---|---|---|
| `integration-jobs` | elke minuut | koppelingen (leveranciers, Wise) |
| `exchange-rates` | elk uur | wisselkoersen |
| `system-backup` | 01:30 | de zip naar Drive + mail |
| `invoice-drive` | 02:00 | betaalde facturen als pdf naar Drive |
| `subscription-billing` | 03:00 | maandfacturen, herinneringen, afschrijven |

**Controles**:
- `npm run ochtend` — twaalf controles in één tabel (na elke plak).
- `npm run check -- "select …"` — leest de live database, kan niets wijzigen.
- `npm run backup:verify -- <zip>` — controleert een backup-zip.

**Instellingen** staan in Vercel → Environment Variables (alleen de namen
hier, nooit de waarden): `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`NEXT_PUBLIC_APP_URL`, `BREVO_SMTP_USER`, `BREVO_SMTP_PASS`, `FROM_EMAIL`,
`CRON_SECRET`, `PUSH_WEBHOOK_SECRET`, `VAPID_SUBJECT`,
`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `WISE_*`,
`ROCKADS_API_KEY`, `ROCKADS_API_SECRET`, `SUPPLIER1_*`, `SLASH_*`,
`GOOGLE_DRIVE_FOLDER_ID`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`,
`GOOGLE_OAUTH_REFRESH_TOKEN` (Drive), `BACKUP_EMAIL_TO`, `BACKUP_EMAIL_ATTACH`,
`MAINTENANCE_MODE`, `INVOICE_ISSUER_NAME`.

**In deze backup-zip**:

| bestand | wat |
|---|---|
| `NOODPLAN.md` | dit bestand |
| `docs/*.md` | RESTORE_DRILL, BACKUP_DRIVE_SETUP, RUNBOOK, WISE_SETUP, DEPLOYMENT, CLAUDE.md |
| `schema.sql` | het hele databaseschema van die nacht |
| `tables/*.json` | elke tabel, alle rijen |
| `auth/users.json` | de logins, zonder wachtwoorden |
| `storage/…` | betaalbewijzen, logo's |
| `manifest.json` | per bestand de telling en sha256, en wat er misging |
