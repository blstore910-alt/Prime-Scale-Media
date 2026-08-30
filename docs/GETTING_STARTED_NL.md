# Aan de slag — niet-technische gids

Je hebt Supabase + Vercel + GitHub. De code staat gepusht. Nu 4
stappen om het live te krijgen en jezelf als eerste gebruiker aan
te maken.

Reken op **30-60 minuten totaal**.

---

## Stap 1 — check dat GitHub CI groen is (2 min)

1. Open https://github.com/blstore910-alt/Prime-Scale-Media/actions
2. Zie je een groene ✔ bij de nieuwste commit? → door naar stap 2.
3. Zie je een rode ✘? → screenshot en stuur, ik fix het.

## Stap 2 — check dat Vercel opnieuw heeft gedeployd (2 min)

1. Ga naar https://vercel.com/dashboard
2. Zoek het `Prime-Scale-Media` project.
3. Kijk naar "Deployments" — er zou net een nieuwe deploy moeten
   staan (getriggerd door de git push).
4. Wacht tot het status "Ready" heeft (groene bal).
5. Klik op de URL onderaan → jouw app opent.
6. **Schrijf de URL ergens op** — bijv `psm-app.vercel.app`.

Als er GEEN Vercel project is:
- Vercel dashboard → "Add New Project"
- Import from GitHub → kies `blstore910-alt/Prime-Scale-Media`
- Framework: Next.js (auto-detect)
- Root: `/`
- Environment Variables: kopieer alles uit een bestaande deploy
  (of vul in vanuit je Supabase settings — zie hieronder)
- Deploy

**Environment variables die Vercel moet hebben** (allemaal onder
"Production" én "Preview"):

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
BREVO_SMTP_USER
BREVO_SMTP_PASS
FROM_EMAIL
NEXT_PUBLIC_APP_URL           ← je Vercel URL
NEXT_PUBLIC_VAPID_PUBLIC_KEY
VAPID_PRIVATE_KEY
VAPID_SUBJECT                 ← mailto:jouw-email@example.com
PUSH_WEBHOOK_SECRET           ← willekeurige lange string
```

Waar vind je die:
- Supabase URL / anon key / service role → Supabase Dashboard →
  Project Settings → API
- Brevo/Resend → account van je e-mail provider
- VAPID keys → genereer met `npx web-push generate-vapid-keys` in
  een terminal (of gebruik online generator)
- `NEXT_PUBLIC_APP_URL` → jouw Vercel URL (bijv `https://psm-app.vercel.app`)
- `PUSH_WEBHOOK_SECRET` → https://www.random.org/passwords/ (32+ tekens)

## Stap 3 — deploy de SQL naar Supabase (5 min)

De code roept 5 nieuwe RPC's + audit-triggers aan die eerst in de
database moeten staan.

1. Open Supabase Dashboard → jouw project.
2. Links in menu → **SQL Editor**.
3. Klik **"New query"**.
4. Open in je code editor het bestand
   `supabase/consolidated/all-migrations.sql`.
5. Kopieer de **hele inhoud**.
6. Plak in de Supabase SQL Editor.
7. Klik **"Run"** (rechtsonder).
8. Wacht 5-30 seconden.
9. Als het slaagt → "Success. No rows returned" onderaan.

**Als er een error verschijnt:**
- "pg_cron does not exist" → geen probleem, je Pro-plan is niet aan
  (cron jobs slaan silently over).
- "column X does not exist" → screenshot en stuur, dan pas ik de SQL
  aan.
- Andere error → screenshot en stuur.

**Verify dat het werkte:**
Nog een SQL query, plak dit + Run:

```sql
select count(*) as wallet_rpcs from pg_proc where proname like 'wallet_%';
-- verwacht: >= 5
select count(*) as audit_triggers from pg_trigger where tgname like 'trg_audit_%';
-- verwacht: >= 15
select count(*) as touch_triggers from pg_trigger where tgname like 'trg_touch_%';
-- verwacht: >= 15
```

## Stap 4 — maak jezelf super-admin (5 min)

1. Ga naar je app URL (uit stap 2).
2. Klik **Sign up**.
3. Vul je e-mail + wachtwoord (12+ tekens, sterke pass).
4. Check je mail → klik de bevestigingslink.
5. Je komt terug in de app op `/onboard`.
6. Vul organisatie-naam in (bijv "Prime Scale Media") + slug (bijv `prime-scale`).
7. Klik **Create Organization**.
8. Je landt op `/dashboard`. Je bent nu **super-admin** van deze tenant.

Als iets faalt bij signup / email verify → screenshot + stuur.

## Stap 5 — test dat alles werkt (optioneel, 10 min)

Snelle rondleiding:

- **`/dashboard`** → moet system-status panel + rate-limit panel
  tonen (want jij bent super-admin)
- **`/audit`** → open, klik "Refresh" — je ziet je eigen "tenant
  created" event
- **`/wallet-topups`** → leeg (nog geen advertisers)
- **`/admins`** → alleen jij, "Active now" badge
- **`/invites`** → maak een test-invite naar een 2e e-mailadres om
  een advertiser account te testen

**Als je iets specifieks wilt zien / testen**: zeg maar, ik help.

---

## Wat als ik iets moet fixen?

Alles wat kan misgaan zit in `docs/RUNBOOK.md`. Meest voorkomend:

- "Ik kan niet inloggen" → runbook sectie 1
- "Wallet bedrag klopt niet" → runbook sectie "Wallet balance drift"
- "Iemand heeft iets kwaads gedaan" → `/audit` viewer + audit_events
  in Supabase SQL editor

## Backup (belangrijk, doen VOOR je live gaat)

`docs/BACKUP_AND_RECOVERY.md` sectie 2 en 3.
- Supabase PITR aanzetten (Pro plan, ~€25/mnd)
- Off-site snapshot regelen (zie doc voor script)

Zonder deze 2 is 1 fout = data kwijt.

## Vragen? Screenshot + Slack/mail me.

Bij elke stap: als iets raar doet, screenshot + wat je zag + wat er
had moeten gebeuren. Snelste debug.
