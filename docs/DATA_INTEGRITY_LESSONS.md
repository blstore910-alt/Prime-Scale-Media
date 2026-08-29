# Data-integrity lessons — cross-referenced from the bol-app

Vergelijking van wat we uit de andere app (bol-app-deploy) leerden
tegen wat er hier al aanwezig is. Beide apps hebben één harde eis:
**geen dataloss, ooit** — een topup, invoice, affiliate commission of
audit-rij mag nooit stilzwijgend verdwijnen.

## Wat de bol-app hard geleerd heeft

Uit de bol-app memory (build-history 429 t/m 935):

| Bol-app patroon                                    | Aanleiding                                                                                                       |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Anti-corruption guards vóór write (build 429)      | Seed-device overschreef cloud 3× — verify state voordat je schrijft                                              |
| Per-mutatie append-only logboek (build 534)        | Whole-blob state → data verlies bij grote push; overgeschakeld naar per-mutation records + checker               |
| Per-product `bl-bescherming` met tijdstempels      | Cross-device sync overschreef elkaar zonder timestamps                                                           |
| Union-merge in plaats van replace (build 437)      | Tweede device wiste eerste device's shipments                                                                    |
| IDB backup (`blb_backup_*`) voor recovery          | Snapshots waren te groot; lokale IDB backup per-record redde 08-08 dataloss                                      |
| Snapshot-recovery-tool + rollback                  | Zichtbaar herstel: pak backup, valideer, promoot                                                                 |
| "Deploy tijdens invoer = dataloss" (memory)        | Build-bump herlaadt de tab, wist ongepushte state; nooit deployen terwijl user data invoert                      |
| One-writer-lock (chunk-gate/edit-gate) build 526-8 | LVB-zending stale checked state: aanvinken van 2 tabs → race condition                                           |
| Anti-force-immediate lek (build 634)               | Force-push omzeilde anti-dataloss guard → klein overschreef groot                                                |
| Voorraad-poort — voor-snapshot + NA-controle       | Live+logica-check tegen logboek; als iets niet strookt: rollback                                                 |
| Voorraad-logboek onbreekbaar (build 534)           | Append-only handeling-log met auto-checker; 2 lekken gedicht (ontvangst + LVB zonder stempel)                    |

## Hoe onze app daar tegen staat

| Concern                                | Bol-app oplossing                          | Prime Scale status                                                                                                                                                                                              |
| -------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Anti-corruption vóór write             | JS-level guards                            | **Sterker** — server actions met column-allowlist + tenant guard + role check. SECURITY DEFINER RPC voor financieel. Zie ADR-0001.                                                                              |
| Per-mutatie audit log                  | `blb_audit`-achtige app-level              | **Sterker** — `audit_events` tabel op DB-niveau. Trigger vangt élke INSERT/UPDATE/DELETE op alle financial tabellen. Append-only afgedwongen via RLS + REVOKE. Bevat before + after JSONB. Zie ADR-0002.        |
| Cross-device race                      | Per-product timestamp bescherming          | **Postgres row-level locks** — `FOR UPDATE` in wallet RPCs (`wallet_topup_admin_verify` etc). Voorkomt dubbele goedkeuring. Nog **NIET** op non-financial admin-updates — zie "Nog te doen".                    |
| Union-merge                            | Client-side merge, geen replace            | Niet expliciet — onze data is niet array-per-user maar row-per-record. Union-merge concept slaat op onze wallet_topups niet direct.                                                                             |
| IDB backup voor lokale recovery        | `blb_backup_*` per record                  | **NIEUW toe te voegen** — form drafts in IndexedDB (zie "Nog te doen").                                                                                                                                         |
| Deploy tijdens invoer                  | Manuele policy                              | Vercel deploys hebben dit issue minder (per-request functions), maar service-worker + navigation-tuning kan het volledig oplossen. Post-launch item.                                                             |
| One-writer-lock voor gedeelde acties    | JS-lock                                    | Row-level `FOR UPDATE` in RPCs. Client-side redundant.                                                                                                                                                          |
| Force-push lek                          | Verify-before-force pattern                | N.v.t. — wij hebben geen sync-lock; elke write is per-row en gaat door RLS+RPC.                                                                                                                                 |
| Snapshot-poort (voor + na)              | JS-side snapshot                           | **Vervangen door audit_events** — de trigger schrijft `before_data` + `after_data` in één transactie. Als iets niet strookt: `select before_data from audit_events where row_id = X order by occurred_at desc limit 1` en herstel.                             |
| Snapshot-recovery-tool                  | JS-tool                                    | SQL via `audit_events` — zie `docs/RUNBOOK.md` "verkeerd bedrag goedgekeurd".                                                                                                                                    |

**Kernconclusie:** waar bol-app app-level oplossingen had (omdat het
op Firestore draait met client-side state), doen wij het op DB-level
(Postgres triggers + RPC's + RLS). Dat is **sterker**. Wat we
ontbreken is de lokale recovery-laag (IndexedDB backups van form
drafts) — die is optioneel maar goed als extra vangnet.

## Wat nog te doen (uit dit vergelijk)

1. **Optimistic concurrency check** op server actions die multi-veld
   updates doen (`updateTopupAsAdmin`, `updateAdvertiser` etc.). Nu
   overschrijft laatste write blindelings. Fix: check
   `updated_at` van de client tegen de DB voor de update.
2. **IndexedDB form-draft utility** voor lange formulieren (invoice
   create, ad-account request). Auto-save elke 5s, restore on load.
3. **Cron voor `rate_limit_prune`** (Supabase Scheduled Function of
   pg_cron) — 1× per dag om oude buckets op te ruimen.
4. **`audit_events` retention policy** — bewaartermijn 7 jaar,
   daarna archiveren naar cold storage. Nu groeit 'ie oneindig.
5. **Deploy-tijdens-invoer signal** — service worker die
   `beforeunload` gebruikt om pending mutations te preserven. Post-
   launch.

Alle andere bol-app patronen zijn al gedekt of niet-toepasselijk.
