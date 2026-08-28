# Security hardening — sessie samenvatting

Overzicht van alle wijzigingen tijdens de autopilot-sweep, plus wat
er nog aan de gebruikerskant moet gebeuren voor go-live.

Alle commits staan op `main`. 10 commits, ~50 files geraakt.

---

## Commits (nieuwste bovenaan)

| Commit    | Wat                                                                       |
| --------- | ------------------------------------------------------------------------- |
| `490a920` | docs+fix: setAdAccountRequestStatus action + Claude Code mobile guide     |
| `4aaf5f5` | fix(p0): company onboarding + profile self-update via server actions      |
| `94998cf` | fix(p0): ad accounts + ad account requests + affiliates via server actions |
| `8c135e4` | fix(p0): wallet-topup verify + subscriptions + invitations via server actions |
| `a56ba77` | feat(backup): immutable audit_events log + backup/DR playbook             |
| `8216d7b` | fix(p0-followup): referral flows, exchange rates, bulk topup              |
| `2e66d5d` | docs: comprehensive test plan                                             |
| `b32bd65` | fix(p0-rest): top_ups + invoices + tenants via server actions             |
| `43f4af5` | fix(p0-wallet): wallet + wallet_topups via SECURITY DEFINER RPCs          |
| `349032f` | fix(p1-sweep): cookies, admin server actions, input hardening, headers    |

---

## Wat is nu wél gehard

### Client kan geen financial-tabellen meer direct schrijven

Voor élk van deze tabellen is de client-side `.insert/.update/.delete`
vervangen door een RPC of server action met auth + tenant + column
allowlist:

| Tabel                | Mechaniek                                                    | Actie/RPC                                          |
| -------------------- | ------------------------------------------------------------ | -------------------------------------------------- |
| `wallets`            | RPC (SECURITY DEFINER)                                       | `wallet_create_for_advertiser`, `wallet_admin_set_min_topup` |
| `wallet_topups`      | RPC                                                          | `wallet_topup_advertiser_create/admin_verify/reject/undo` |
| `top_ups`            | server action                                                | `createTopupAsAdmin`, `bulkCreateTopupsAsAdmin`, `updateTopupAsAdmin` |
| `invoices`           | server action                                                | `createInvoiceAsAdmin`, `setInvoicePaidStatus`     |
| `tenants`            | server action                                                | `createTenantForCurrentUser`                       |
| `companies`, `billings` | server action                                             | `saveOwnCompanyOnboarding`, `updateOwnProfileAndCompany` |
| `subscriptions`      | server action                                                | `createSubscriptionAsAdmin`, `setSubscriptionStatus` |
| `exchange_rates`     | server action                                                | `ensureInitialExchangeRates`, `upsertExchangeRate` (validates 3rd-party API) |
| `referral_commissions` | server action                                              | `setCommissionStatus`                              |
| `referral_links`     | server action                                                | `assignAffiliateToAdvertiser`                      |
| `ad_accounts`        | server action                                                | `createAdAccountAsAdmin`, `updateAdAccountAsAdmin`, `createAdAccountFromRequest` |
| `ad_account_requests`| server action                                                | `setAdAccountRequestStatus`, `rejectAdAccountRequest` |
| `advertisers`        | server action (allowlist commission fields)                  | `updateAdvertiser`                                 |
| `affiliates`         | server action                                                | `updateAffiliate`                                  |
| `user_profiles`      | server action (admin toggle) + gehandhaafd owner-check       | `toggleAdminStatus`, `updateUserProfile`, `updateOwnProfileAndCompany` |
| `invitations`        | server action                                                | `cancelInvitation`                                 |

### API layer

- Alle stats endpoints: auth + admin + tenant filter (was P0-1).
- `/api/accept-invite/*`: body validation + server-side invite check (P0-2/3).
- `/api/send-invite`: `sender_profile_id` derived server-side, `role` restricted, tenant re-fetched.
- `/api/push/subscribe`: input bounds + HTTPS-only endpoint.
- `/api/admins/create`: super-admin check via `tenants.owner_id`.

### Auth infrastructure

- Cookies: `HttpOnly`, `Secure`, `SameSite=lax`, `Path=/` op alle
  `profile_id` sets (invite endpoints + login flow).
- `role` cookie gedropt (nooit server-side gelezen).
- `getSession()` → `getUser()` op alle guards + home page.
- Password minimum: 12 chars.
- Confirm route: tenant slug pinned tegen user metadata, weigert tampering.

### Backup / audit

- **`audit_events`** append-only tabel + trigger op alle financial tabellen.
  Non-updateable, non-deleteable (via `REVOKE` + RLS). Admins zien
  hun eigen tenant. Zie
  `supabase/migrations/20260828130000_audit_events.sql`.
- Backup/DR playbook in `docs/BACKUP_AND_RECOVERY.md` (PITR + off-site
  snapshot + restore drill).

### Overig

- Global security headers (HSTS, Permissions-Policy, X-DNS-Prefetch-Control).
- `ilike` search sanitize (users, invoices, topups zoekvelden).
- Dead code opgeruimd (`/staff` stub, `constants.ts-temp`, duplicate push-actions).
- Cleaned `console.log(error)`s die PII konden lekken.

---

## Wat nog moet gebeuren (jij)

### Pre-go-live blockers

Volg `docs/TEST_PLAN.md` sectie 0:

1. **SQL migraties deployen** — 2 files in `supabase/migrations/`:
   - `20260828120000_wallet_rpcs.sql`
   - `20260828130000_audit_events.sql`
   - Commando: `supabase db push` of via Dashboard SQL editor.
2. **RLS matrix verifiëren** — testplan sectie 0.2. Dit is het grootste
   onbekend: als één policy fout zit is dat een lek. Loop de tabel
   in testplan sectie 0.2 stapsgewijs af.
3. **Wallet balance trigger** — de RPC's verwachten dat een DB-trigger de
   `wallets.usd_balance` / `.eur_balance` bijwerkt op
   `wallet_topups.status` verandering. Als die er niet is: activeer
   de stub onderaan `20260828120000_wallet_rpcs.sql`.
4. **Backup infra**:
   - Supabase PITR aanzetten (Pro, 7-30 dagen retention).
   - Off-site daily snapshot naar S3/R2/GCS via edge function of
     GitHub Action.
   - Eerste restore drill uitvoeren.

### Testen (testplan uitvoeren)

`docs/TEST_PLAN.md` — sectie 1 t/m 7. Reken op 4-8 uur:
- 3 testaccounts opzetten (super-admin, admin, advertiser)
- 10 happy path scenario's
- 12 security assertions
- Regressie check
- Sign-off

**Als sectie 3.3 (tenant isolation) of 3.5 (topup manipulation) faalt:
STOP.** Fix eerst RLS, herstart testen.

### Live-monitoring vanaf dag 1

- Supabase Dashboard → Logs → filter op ERROR
- Query `audit_events` dagelijks even scannen:
  ```sql
  select action, count(*) from audit_events
   where occurred_at > now() - interval '24 hours'
   group by action;
  ```

---

## Follow-ups (post-launch, niet blocking)

- `use-update-topup.ts` schrijft nog naar `topup_logs` client-side.
  Kan naar server action, maar `audit_events` trigger dekt het al.
- `use-notifications.ts` mark-read is user-scoped (`recipient_user_id
  = userId`); relies on RLS. Acceptabel maar zou naar action kunnen.
- `console.log`/`console.error` in enkele client components — geen
  security issue maar log-noise.
- Warnings in ESLint over ongebruikte imports (pre-existing).

---

## Onbekende risico's

1. **RLS** — geen migratie voor RLS in de repo. Als jij bevestigt dat
   RLS bestaat en tenant-strict is voor de tabellen in testplan
   sectie 0.2, dan is dit rondgemaakt. Zo niet: kritiek gap.
2. **Bestaande DB triggers** — de wallet RPC's assumen dat een trigger
   de balance-update afhandelt. Als dat elders gebeurt: verify.
3. **Third-party dependencies** — exchange rates komen uit een externe
   API. `ensureInitialExchangeRates` valideert nu sane numeric ranges
   maar de API kan nog steeds "off" data teruggeven binnen die range.

---

## Time to go-live inschatting (bijgewerkt)

- ⏳ **Autopilot code werk**: ✅ klaar (10 commits, ~50 files).
- 👤 **SQL deployment**: 30 min–1 uur (jij).
- 👤 **RLS verificatie**: 2-4 uur (jij, echt cruciaal).
- 👤 **Backup infra opzetten**: 2-3 uur (jij, kan post-launch).
- 👤 **Testplan doorlopen**: 4-8 uur (jij).
- 👤 **Bug fixes uit testing**: onbekend (0-3 dagen).
- 👤 **UAT met echte gebruiker**: 1-2 dagen.

**Optimistisch**: 3-5 werkdagen. **Realistisch met buffer**: 1.5-2 weken.

---

## Waar de code nu staat

Alle changes zijn `on branch main`, gecommit, nog niet gepusht.
Volgende stap voor jou:

```bash
git push origin main
```

En dan de SQL deployment starten.
