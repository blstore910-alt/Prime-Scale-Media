# Security hardening — sessie samenvatting

Overzicht van alle wijzigingen tijdens de autopilot-sweep, plus wat
er nog aan de gebruikerskant moet gebeuren voor go-live.

Alle commits staan op `main`. **47 commits, ~90 files geraakt.**

---

## Commits (nieuwste bovenaan)

### Reliability + hardening (2026-08-29 → 30 sweep)

| Commit    | Wat                                                                       |
| --------- | ------------------------------------------------------------------------- |
| `0d24164` | docs(runbook): MAINTENANCE_MODE, last_seen queries, client-error, GDPR    |
| `a8cbc48` | docs: update CLAUDE.md with new mutation + UX patterns                    |
| `1620a5b` | fix(security): tenant slug regex rejected 2-char slugs by accident        |
| `bfa0c48` | feat(security): rate-limit /api/heartbeat and /api/log/client-error       |
| `203097c` | feat(ops): X-Request-Id middleware + polished /auth/error page            |
| `ec3b82c` | feat(ux): IDB draft on wallet-topup-dialog (multi-step form)              |
| `9b500ff` | feat(ops): last_seen indicator on admins-table + 6 unit tests             |
| `23fa7ab` | feat(db): auto-touch updated_at trigger on every business table           |
| `fe31589` | test+docs: SECURITY.md refresh + pure-error unit tests                    |
| `adb8005` | feat(security): session activity heartbeat (last_seen_at)                 |
| `36b3d62` | docs: refresh SECURITY_HARDENING_SUMMARY with 2026-08-29 sweep            |
| `40cc911` | feat(gdpr): privacy controls on /profile + shared adminContext helper     |
| `3d64f4c` | feat(gdpr): right-to-portability + two-step right-to-erasure              |
| `a055577` | feat(ops): read-only MAINTENANCE_MODE feature flag                        |
| `76c697d` | feat(ux): IDB draft + unsaved-warning on account-form and ad-account-request |
| `673b116` | feat(reliability): error boundary + client-error logger + unsaved warning |
| `f711c09` | feat(ops): /api/health + /api/version + deploy-detection banner           |
| `45f3c7c` | feat(ops): pg_cron scheduled maintenance + audit retention policy         |
| `b5c160c` | feat(ux): IndexedDB form-draft persistence + wire into company onboarding |
| `8d497dd` | feat(security): optimistic concurrency guards on admin update actions     |
| `06327db` | docs: cross-reference bol-app data-integrity lessons                      |

### Ops + tests + CI (2026-08-28 evening)

| Commit    | Wat                                                                       |
| --------- | ------------------------------------------------------------------------- |
| `9b33480` | feat(ops): scripts/check-env.mjs preflight                                |
| `cd32900` | docs: CLAUDE.md — non-negotiable patterns for Claude sessions             |
| `0cf4565` | docs: privacy + data-lifecycle policy                                     |
| `b22eca6` | test: pure-helpers coverage (utils-pure)                                  |
| `f113674` | ci+docs: strict lint gate, SECURITY.md, PR template, ADR-0002             |
| `dc31d3c` | chore(lint): drop or annotate the last unused-imports warnings            |
| `2d67df0` | test: node:test-based unit tests for pure helpers + CI wiring             |
| `22750ca` | docs: runbook + refresh SECURITY_HARDENING_SUMMARY                        |

### Security hardening sweep (main 2026-08-28)

| Commit    | Wat                                                                       |
| --------- | ------------------------------------------------------------------------- |
| `bf735a1` | ci+docs: GitHub Actions verify workflow + ADR-0001                        |
| `0961018` | chore(lint): drop unused imports after server-action refactor             |
| `349dca7` | feat(security): CSP report-only header                                    |
| `a9794c0` | feat(security): zod-validated bodies + PII-scrubbed error logs            |
| `d9c0fca` | feat(security): distributed rate limiter for public API endpoints         |
| `7d9c37e` | feat(security): RLS policy templates for every audited table              |
| `55a2ab8` | fix(push): lazy-init VAPID + supabase admin in /api/push/notify           |
| `a0ea864` | docs: session summary of full security hardening sweep                    |
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

## Nieuw sinds vorige refresh (2026-08-29)

### Data-integrity (bol-app lessons)

- **Optimistic concurrency guards** op admin updates. Twee admins die
  tegelijk hetzelfde bewerken → tweede krijgt `code: "conflict"` ipv
  stille overschrijving. `actions/_shared.ts:versionMatches`.
- **IndexedDB form-drafts** in de 3 langste formulieren
  (`company-onboarding`, `account-form`, `ad-account-request`).
  7-dagen TTL, per-user scoped. `lib/form-draft.ts` +
  `hooks/use-form-draft.ts`.
- **Beforeunload-guard** — browser vraagt "leave this page?" als er
  ongewisselde input is. `hooks/use-unsaved-changes-warning.ts`.
- **audit_events retentie policy** — 0-2 jaar hot, 2-7 warm, >7 cold
  archive naar S3/R2/GCS. Cron `psm-audit-monthly-stats` schrijft
  metrics zodat we een "flat line" trigger-failure kunnen detecteren.
  `supabase/migrations/20260829120000_scheduled_maintenance.sql` +
  `docs/BACKUP_AND_RECOVERY.md`.
- **pg_cron rate_limit_prune** — dagelijks 03:15 UTC.
- **audit_events_archive_candidates(days)** — read-only helper voor
  de retentie-playbook.

### Reliability

- **Error boundary** rond de authed layout. Ships errors naar
  `/api/log/client-error` via `navigator.sendBeacon` (survives page
  unload). `components/error-boundary.tsx`.
- **Client-error logger endpoint** — zod-validated body, server-side
  user_id resolution, structured server-log. Zonder DB-write om
  audit_events niet te vervuilen.
- **App version watcher** — polls `/api/version` elke minuut, toont
  subtiele "new version available" banner bij deploy-tijdens-sessie.
  User klikt zelf reload; combined met IDB drafts = niks kwijt.
- **/api/health** — uptime probe, checks Supabase + env presence.
  200/503 met JSON. `maintenance` field.
- **Read-only MAINTENANCE_MODE** — `MAINTENANCE_MODE=true` freezes
  every write; leest werken door. `/api/health` exposeert de status,
  `components/maintenance-banner.tsx` toont een amber banner.
  Zonder redeploy inzetbaar tijdens incidents.

### GDPR

- **Right to portability** — `GET /api/me/export` levert een JSON-file
  met álle rijen waar de caller data subject van is. Filtert per
  definitie op `auth.uid()` — kan niemand anders' data trekken.
- **Right to erasure (two-step)**:
  - `requestOwnErasure` — user zelf, zet `status='pending_erasure'`
    + `is_active=false`. Login direct geblokkeerd.
  - `hardDeleteUser(userId)` — super-admin only, roept
    `auth.admin.deleteUser()` aan op de anniversary datum. Vereist
    de target in `pending_erasure` staat + zelfde tenant.
- **UI op /profile** — `components/profile/privacy-controls.tsx`
  met "Download my data" + "Request deletion" (met confirmatie).

### Aanvullingen 2026-08-30

- **Slug validator bug gefikst** — de oude regex accepteerde
  1-char slugs maar niet 2-char. `test-org-2026` werkt nu, "a" niet.
  9 unit tests in `tests/actions/tenant-slug.test.ts`.
- **X-Request-Id middleware** — elke response krijgt een uniek ID
  (honoreert caller-supplied), sanitised tegen log-injection. Voor
  correlatie tussen client-error reports en server logs.
- **/auth/error page** — was raw ?error rendering. Nu: icon, kop,
  actie-buttons ("Back to sign in", "Reset password"), en een
  translator van 6 bekende error slugs (Tenant slug mismatch,
  Referral code mismatch, etc.) naar friendly copy. Sanitised
  om reflected-XSS te voorkomen.
- **Rate limits** op `/api/heartbeat` (60/hour per IP) en
  `/api/log/client-error` (60/hour per IP) — vangt runaway loops
  en scripted abuse zonder legitieme reports te verliezen.
- **Wallet-topup IDB draft** — vierde form met draft protection.
  Multi-step: bewaart step, currency, accountType, amount,
  paymentSlipUrl. Restore banner in de dialog zelf.
- **admins-table last_seen indicator** — kleuren gecodeerde
  "Active now" / "30m ago" / "3h ago" / "5d ago" column op basis
  van heartbeat data.
- **`updated_at` trigger** — bump on every UPDATE via
  BEFORE-trigger op alle 17 business tabellen. Voorkomt
  false-positive "no conflict" bij optimistic-concurrency check.
- **/api/heartbeat + session tracking** — RPC-throttled (max 1
  write/5min per user), hook draait alleen als tab visible is.
- **CLAUDE.md refresh** — non-negotiable patterns voor mutation
  actions + UX draft-hooks pattern gedocumenteerd voor toekomstige
  sessies.
- **RUNBOOK.md** — 4 nieuwe secties: MAINTENANCE_MODE flip,
  last_seen queries, client-error log grep, GDPR verzoeken.

### Test coverage

- **62 unit tests** (van 23 gestart). Nieuw: 7 versionMatches tests,
  6 maintenance-mode tests, 4 debounced tests, 8 safeErrorMessage
  tests, 6 formatLastSeen tests, 9 tenant-slug tests.

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

### Extra P1+ hardening (nieuwste laag)

- **RLS policy templates** voor alle audited tabellen — zie
  `supabase/migrations/20260828140000_rls_templates.sql`. Klaar om te
  reviewen en te deployen als je bestaande policies overzet.
- **Rate limiter** via Postgres RPC (`rate_limit_check`) —
  `/api/send-invite` (20/uur per tenant), `/api/accept-invite` (10/uur
  per IP), `/api/accept-invite/signup` (5/uur per IP),
  `/api/push/subscribe` (20/uur per IP). Zie
  `supabase/migrations/20260828150000_rate_limits.sql` + `lib/rate-limit.ts`.
- **Zod-schemas** op de gevoeligste public API bodies (`accept-invite`,
  `accept-invite/signup`) + `parseJsonBody` helper in `lib/http.ts`.
- **PII-scrubbed error logs** — `safeErrorMessage()` unwrapt errors
  zonder Supabase's `details`/`hint`/`row` velden te dumpen.
- **CSP header (report-only)** — grondwerk zodat we na een week clean
  reports op enforcing kunnen zetten.
- **GitHub Actions CI** — typecheck + lint op elke PR, optionele build.

### Overig

- Global security headers (HSTS, Permissions-Policy, X-DNS-Prefetch-Control).
- `ilike` search sanitize (users, invoices, topups zoekvelden).
- Dead code opgeruimd (`/staff` stub, `constants.ts-temp`, duplicate push-actions).
- Cleaned `console.log(error)`s die PII konden lekken.

---

## Wat nog moet gebeuren (jij)

### Pre-go-live blockers

Volg `docs/TEST_PLAN.md` sectie 0:

1. **SQL migraties deployen** — 4 files in `supabase/migrations/`:
   - `20260828120000_wallet_rpcs.sql` — wallet + wallet_topups RPCs
   - `20260828130000_audit_events.sql` — audit log + trigger
   - `20260828140000_rls_templates.sql` — RLS baseline (review eerst!)
   - `20260828150000_rate_limits.sql` — rate limiter table + RPC
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
