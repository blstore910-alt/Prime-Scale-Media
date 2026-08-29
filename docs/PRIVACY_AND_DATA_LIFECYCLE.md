# Privacy + data lifecycle — Prime Scale Media App

Wat we opslaan, waarom, hoe lang, en hoe we een user-verzoek
afhandelen. Bedoeld als working document — bijwerken als het
data-model verandert.

---

## Welke persoonsgegevens verzamelen we

| Categorie              | Voorbeelden                                                     | Waar                          |
| ---------------------- | --------------------------------------------------------------- | ----------------------------- |
| Identiteit             | e-mail, naam, wachtwoord (hashed via Supabase Auth)             | `auth.users`, `user_profiles` |
| Bedrijfsgegevens       | bedrijfsnaam, VAT, adres, telefoon                              | `companies`, `billings`       |
| Financieel             | wallet-saldo, top-ups, invoices                                 | `wallets`, `wallet_topups`, `top_ups`, `invoices` |
| Betalingsbewijs        | upload van bank-transfer slips                                  | Supabase Storage bucket `wallet_payment_slips` |
| Audit                  | wie deed wat wanneer op business tabellen                       | `audit_events`                |
| Push-endpoints         | browser-specifieke push-URL + keys                              | `push_subscriptions`          |
| IP-adressen            | via `x-forwarded-for` in rate-limit buckets (tijdelijk)         | `rate_limit_buckets` (hashed key), server logs |
| Cookies                | `profile_id` (session), Supabase auth cookies, `ref`/`tenant`   | Client browser                |
| Metadata               | `heard_from`, `referred_by`, timestamps                         | `user_profiles`               |

Wij **verkopen niks** door aan derden. Third-party integraties:
- **Supabase** — infra (data staat in Supabase's Postgres cluster)
- **Brevo / Resend** — transactionele e-mail (invite, reset)
- **Web Push (browser vendor)** — push notificaties
- Exchange-rate provider — publiek EUR/USD/GBP/HKD data, alleen
  ingaand

---

## Grondslag per categorie

- Identiteit + financieel + audit: **contractuele noodzaak** (art. 6(1)(b) GDPR)
- Betalingsbewijzen: contractuele noodzaak + **wettelijke bewaarplicht**
  (7 jaar administratie NL)
- IP-adressen in rate-limit: **gerechtvaardigd belang** (fraud/DoS
  bescherming). Max 24u bewaard.
- Marketing e-mail / nieuwsbrief: **NIET verzameld** in dit systeem.

---

## Bewaartermijnen

| Data                              | Bewaartermijn                                          |
| --------------------------------- | ------------------------------------------------------ |
| `auth.users`                      | Totdat account verwijderd wordt (zie GDPR-verzoek)     |
| `user_profiles`                   | Anonimiseren bij delete-verzoek; row blijft voor referentiële integriteit |
| Financiële records (`invoices`, `top_ups`, `wallet_topups`) | 7 jaar (fiscale bewaarplicht) |
| `audit_events`                    | 7 jaar (matcht financiële records)                     |
| Betalingsbewijzen                 | 7 jaar                                                 |
| `push_subscriptions`              | Tot browser-endpoint dead is (auto-cleanup bij 404/410) |
| `rate_limit_buckets`              | 24 uur (via `rate_limit_prune` cron)                   |
| Server logs                       | Zoals Supabase / Vercel bewaartermijn (14-30 dagen)    |
| Cookies                           | `profile_id`: sessie. `ref`/`tenant`: 30 dagen.        |

---

## User-verzoeken afhandelen

### Recht op inzage

User vraagt "welke data heb je van mij?".

```sql
-- Volledig profiel + advertiser + wallet + subscription + invoices
select
  (select row_to_json(up) from user_profiles up where up.user_id = 'USER_ID') as profile,
  (select json_agg(row_to_json(a)) from advertisers a where a.user_id = 'USER_ID') as advertisers,
  (select json_agg(row_to_json(w)) from wallets w
   join advertisers a on a.id = w.advertiser_id
   where a.user_id = 'USER_ID') as wallets,
  (select json_agg(row_to_json(i)) from invoices i
   join advertisers a on a.id = i.advertiser_id
   where a.user_id = 'USER_ID') as invoices,
  (select json_agg(row_to_json(c)) from companies c
   join advertisers a on a.id = c.advertiser_id
   where a.user_id = 'USER_ID') as companies;
```

Export naar JSON, mail naar hun geregistreerde adres.

### Recht op rectificatie

Users kunnen zelf:
- Naam / e-mail / adres via `/profile`
- Bedrijfsgegevens via `/settings/company`

Als user het niet kan (bijv. e-mail change zit vast op auth-side):
- Admin past `user_profiles.email` aan
- Supabase Dashboard → Authentication → Users → Edit user

### Recht op wissen

Zie `docs/RUNBOOK.md` sectie "GDPR delete request".

Kernpunten:
- **Anonimiseer** `user_profiles` (naam + e-mail → placeholder),
  markeer `is_active = false`.
- **Verwijder** `auth.users` row via service role (breekt logins,
  bewaart referenties).
- **NIET** verwijderen: financiële records, audit trail. Wettelijk
  bewaarplicht.
- Log de operatie in `audit_events`.

### Recht op dataportabiliteit

Zelfde als "recht op inzage" — lever JSON-export.

### Bezwaar / beperking van verwerking

- Bezwaar tegen rate-limit tracking: niet mogelijk (fraude-preventie).
- Bezwaar tegen push: user kan zelf in-browser subscribe/unsubscribe.
- Beperking van verwerking (account bevriezen): `is_active = false`
  via `/users` → deactivate.

---

## Data-breach protocol

Zie `docs/RUNBOOK.md` sectie "Verdachte activiteit / mogelijk breach"
voor de technische stappen.

Wettelijke deadline: **72 uur** na ontdekking melden bij Autoriteit
Persoonsgegevens als er persoonsgegevens gelekt zijn.

Communicatie template:
1. Wat is er gebeurd? (technisch)
2. Wanneer? (tijdstempel)
3. Welke persoonsgegevens? (categorie + aantal betrokkenen)
4. Wat is het risico? (identity theft? phishing? financieel?)
5. Wat hebben we gedaan? (audit trail, patches)
6. Wat kunnen zij doen? (wachtwoord resetten, 2FA aan)

---

## Cookies — wat zetten we

Zonder consent-banner nodig omdat we alleen **functional** cookies
zetten (Session-management, tenant/referral tracking).

| Cookie        | Doel                              | Type                    | Duur   |
| ------------- | --------------------------------- | ----------------------- | ------ |
| `sb-*`        | Supabase auth session             | HttpOnly, Secure, Lax   | ~1 uur (refresh) |
| `profile_id`  | Welk profiel actief is (multi-tenant users) | HttpOnly, Secure, Lax | Sessie |
| `ref`         | Referral tracking bij signup      | HttpOnly, Secure, Lax   | 30 dagen |
| `tenant`      | Tenant tracking bij signup        | HttpOnly, Secure, Lax   | 30 dagen |

Geen advertising/analytics cookies. Als die worden toegevoegd:
consent-banner verplicht.

---

## Encryptie

- **In transit:** HTTPS enforced via HSTS (`Strict-Transport-Security`
  header). Geen HTTP fallback.
- **At rest:** Supabase Postgres versleutelt storage (AES-256 default).
  Wachtwoorden gehashed door Supabase Auth (bcrypt).
- **Backups:** PITR + off-site snapshot beide encrypted.

---

## Beoordeling voor go-live

- [ ] Deze pagina gelezen en gecontroleerd op accuraatheid t.o.v.
      huidige data-model.
- [ ] Privacy statement op publieke website ge-update en matcht deze
      doc.
- [ ] Data-verwerkersovereenkomsten (DPA's) met Supabase, Brevo/Resend
      geregeld.
- [ ] Contactpersoon (DPO of vervanger) aangewezen voor
      user-verzoeken.
- [ ] SLA voor verzoeken vastgelegd (30 dagen wettelijk).
- [ ] Breach-notification procedure getest (tabletop exercise).
