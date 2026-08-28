# Backup + disaster recovery — Prime Scale Media App

Doel: **niemand raakt data kwijt**, en als er iets stuk gaat kunnen we
binnen minuten terug naar een bekend goede staat.

Drie lagen — meer redundantie is bijna gratis en heeft bespaard-me-de-baan
karakter.

---

## Laag 1 — Immutable audit log (nu ingebouwd)

Migration: `supabase/migrations/20260828130000_audit_events.sql`

Wat het doet:

- Nieuwe tabel `audit_events` — append-only. Elke `INSERT`/`UPDATE`/`DELETE`
  op onze financial-tabellen (`wallets`, `wallet_topups`, `top_ups`,
  `invoices`, `companies`, `billings`, `subscriptions`,
  `exchange_rates`, `referral_commissions`, `referral_links`,
  `ad_accounts`, `ad_account_requests`, `advertisers`, `affiliates`,
  `user_profiles`, `tenants`, `invitations`) triggert 1 rij met:
  - `actor_user_id` (`auth.uid()` op moment van change)
  - `actor_profile_id` (best-effort uit `user_profiles`)
  - `tenant_id` (uit de gewijzigde rij of het profiel)
  - `table_name`, `action` (`INSERT`/`UPDATE`/`DELETE`)
  - `row_id` (primary key)
  - `before_data` (OLD hele rij als JSONB, `null` voor INSERT)
  - `after_data` (NEW hele rij als JSONB, `null` voor DELETE)
  - `occurred_at`
- **De tabel is write-locked**: RLS + `REVOKE` blokkeren UPDATE/DELETE
  volledig, ook voor `service_role`. Trigger inserts glippen erdoor omdat
  ze `SECURITY DEFINER` draaien.
- Admins van de eigen tenant kunnen ALLES teruglezen. Advertisers
  zien niks.

Praktisch nut:

- **"Wie heeft die wallet leeggehaald?"** → filter `audit_events` op
  `table_name='wallets'`, `row_id=<walletid>`. Elke `UPDATE` toont
  before/after balance en `actor_profile_id`.
- **"Kunnen we een verwijderd invoice terugzetten?"** → filter op
  `table_name='invoices'`, `action='DELETE'`. `before_data` is de hele
  rij; inserten kopieert 'm terug.
- **"Wat gebeurde er precies rond 14:30 gisteren?"** → filter op
  `occurred_at between ... and ...`, plus `tenant_id=<tenant>`.

Deploy:

```bash
supabase db push
```

(of via Dashboard SQL editor).

### Query cheat sheet

```sql
-- Recente activiteit voor 1 tenant
select occurred_at, table_name, action, row_id, actor_profile_id
  from audit_events
 where tenant_id = 'XYZ'
 order by occurred_at desc
 limit 100;

-- Alles rondom 1 specifieke wallet
select occurred_at, action, before_data, after_data, actor_profile_id
  from audit_events
 where table_name = 'wallets'
   and row_id = 'walletid'
 order by occurred_at desc;

-- Wallet balance van gisteren 12:00 reconstrueren
select after_data->>'usd_balance', after_data->>'eur_balance', occurred_at
  from audit_events
 where table_name = 'wallets'
   and row_id = 'walletid'
   and occurred_at <= '2026-08-27 12:00:00+00'
 order by occurred_at desc
 limit 1;

-- Deleted invoices in laatste 30 dagen
select occurred_at, actor_profile_id, before_data
  from audit_events
 where table_name = 'invoices'
   and action = 'DELETE'
   and occurred_at > now() - interval '30 days'
 order by occurred_at desc;
```

### Restore-uit-audit voorbeeld

```sql
-- Deleted invoice terugzetten (voer als admin uit)
insert into public.invoices
select
  (before_data->>'id')::uuid,
  (before_data->>'tenant_id')::uuid,
  before_data->>'number',
  -- ... verdere columns
  (before_data->>'created_at')::timestamptz
from public.audit_events
where table_name = 'invoices'
  and action = 'DELETE'
  and row_id = 'INVOICE_ID_HIER';
```

---

## Laag 2 — Supabase Point-in-Time Recovery (PITR)

Aan te zetten (Pro plan of hoger nodig):

1. Supabase Dashboard → Project settings → Database → Point-in-time
   recovery.
2. Toggle aan. Kies retention (7 dagen minimum, 30 dagen aan te bevelen).
3. Kosten: ~$100/mnd extra op Pro, wordt vaak goedgemaakt door 1
   incident dat je afwendt.

Wat het geeft:

- Herstel naar elk moment binnen de retentie window, granulariteit
  seconden.
- Volledige DB restore als backup — inclusief `audit_events`.
- Herstel gebeurt naar een NIEUWE database (safe rollback pattern).

Beperkingen:

- Alleen Supabase kan initiëren (via dashboard of API).
- Restore is niet instant — reken op minuten tot uur afhankelijk van
  DB-omvang.

---

## Laag 3 — Off-site dagelijkse snapshot

Voor het geval Supabase zelf onbereikbaar is (hele project weg,
account gecompromitteerd, prijsdispuut). Optie A is simpelst.

### Optie A: `pg_dump` naar S3/R2/GCS via Supabase Edge Function

Skelet (nog niet ingebouwd — hier voor referentie):

```typescript
// supabase/functions/nightly-backup/index.ts
import { S3Client, PutObjectCommand } from "npm:@aws-sdk/client-s3";
import { execFileSync } from "node:child_process";

Deno.serve(async () => {
  const dumpPath = `/tmp/backup-${new Date().toISOString()}.dump`;
  execFileSync("pg_dump", [
    "-Fc",
    "-Z", "9",
    "-f", dumpPath,
    Deno.env.get("SUPABASE_DB_URL")!,
  ]);
  const buf = await Deno.readFile(dumpPath);
  const s3 = new S3Client({
    region: Deno.env.get("S3_REGION"),
    credentials: {
      accessKeyId: Deno.env.get("S3_ACCESS_KEY")!,
      secretAccessKey: Deno.env.get("S3_SECRET_KEY")!,
    },
  });
  await s3.send(new PutObjectCommand({
    Bucket: Deno.env.get("S3_BUCKET")!,
    Key: `psm/backup-${new Date().toISOString().slice(0,10)}.dump`,
    Body: buf,
  }));
  return new Response("ok");
});
```

Aan te sluiten op een Supabase Cron Job (Dashboard → Cron → dagelijks
`03:00 UTC`).

### Optie B: extern (GitHub Action)

- Repo secret: `SUPABASE_DB_URL` (connection string met
  `pgbouncer=false` voor pg_dump-compat).
- Repo secret: `S3_*` credentials.
- `.github/workflows/nightly-backup.yml` met `pg_dump` naar `s3 cp`.

Deze doen we niet in code nu; het is 30 min werk zodra de S3 bucket
geregeld is.

### Retentie policy

- Daily snapshots: bewaar laatste 30.
- Weekly (elke maandag): bewaar laatste 12.
- Monthly (1e van de maand): bewaar laatste 12.

Kost <$1/mnd bij R2.

---

## Restore drill (elke maand)

Wat er misgaat als je nooit test: je ontdekt dat je backups corrupt zijn
op de dag dat je ze nodig hebt.

1e van elke maand:

1. Neem laatste snapshot uit S3/R2.
2. `pg_restore` naar een lokale Postgres in Docker.
3. Voer 3 checks uit:
   - `select count(*) from wallets` — klopt het met productie ± 1%?
   - `select sum(usd_balance) from wallets` — klopt de USD-som?
   - `select count(*) from audit_events` — is audit log intact?
4. Log het resultaat in `docs/RESTORE_DRILL_LOG.md`.

Als een drill faalt: **onmiddellijk backup fixen**, niet 'later' —
je bent 1 incident van dataverlies vandaan.

---

## Wat te doen bij een echt incident

Volgorde:

1. **Stop de bleeding** — zet de app op maintenance mode
   (Vercel/rewrite naar een status pagina).
2. **Snapshot NU** — trigger een handmatige `pg_dump` naar S3 voordat
   je iets herstelt. De huidige (mogelijk corrupte) staat wil je
   OOK bewaren voor forensisch onderzoek.
3. **Identificeer scope** — `select action, count(*) from audit_events
   where occurred_at > 'INCIDENT_START' group by action`. Weet je wat
   er is gewijzigd.
4. **Kies restore-strategie:**
   - Kleine scope (1 rij, 1 tabel): reconstrueer uit `audit_events`.
     Zie query-voorbeeld hierboven.
   - Grote scope: Supabase PITR naar een moment vóór het incident.
     Restore gaat naar een NIEUWE DB. Vergelijk audit_events tussen
     oude en nieuwe DB om te bepalen wat er verloren is gegaan aan
     legitieme changes ná het incident (die moet je handmatig
     replayen).
   - Volledig verlies van Supabase project: restore uit S3 snapshot
     naar een nieuw project. `pg_restore -d $NEW_DB_URL backup.dump`.
5. **Communiceer** — laat gebruikers weten wat er gebeurde. Audit log
   maakt dit eerlijk mogelijk.

---

## Sign-off checklist

Vóór je 'live' zegt:

- [ ] `20260828130000_audit_events.sql` gedeployed en verified
      (`select count(*) from audit_events` > 0 na 1 topup).
- [ ] Supabase PITR aan, retention >= 7 dagen.
- [ ] S3/R2/GCS bucket klaar, credentials in env.
- [ ] Backup edge function of GitHub Action draait (test 1× handmatig).
- [ ] Eerste restore drill uitgevoerd en geslaagd.
- [ ] Datum + naam onder verantwoordelijk voor drill in
      `docs/RESTORE_DRILL_LOG.md`.
