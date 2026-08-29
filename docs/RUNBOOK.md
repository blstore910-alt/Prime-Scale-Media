# Runbook — Prime Scale Media App

Concrete stappen voor veelvoorkomende ops. Bedoeld voor jou (of iemand
die je erbij haalt) om zonder na te denken uit te voeren als er iets
speelt.

---

## Iemand komt niet in z'n account

### Symptoom
Gebruiker klaagt "ik kan niet inloggen" / "krijg alleen redirect naar
`/auth/login`" / "krijg redirect naar `/dashboard` maar zie niks".

### Diagnose

1. **Bestaat de user in `auth.users`?**
   ```sql
   select id, email, created_at, confirmed_at
     from auth.users
    where lower(email) = lower('USER_EMAIL');
   ```
   - Niet gevonden → user heeft nooit signup afgemaakt. Vraag ze
     opnieuw te registreren via de invite / signup flow.
   - `confirmed_at` is null → email nooit geverifieerd. Stuur ze
     opnieuw de bevestigingsmail via Supabase dashboard.

2. **Bestaat een `user_profiles` row?**
   ```sql
   select id, user_id, tenant_id, role, is_active, status
     from user_profiles
    where user_id = 'USER_ID';
   ```
   - Geen row → profile-creation faalde tijdens signup. Check
     `audit_events` voor errors. Meestal fix: `insert` een nieuwe
     rij (als admin via SQL editor), voeg `tenant_id` + `role` toe.
   - `is_active = false` of `status = 'inactive'` → admin heeft ze
     gedeactiveerd. Zet terug via `/admins` UI of SQL update.

3. **Klopt de tenant_id?**
   ```sql
   select up.tenant_id, t.name, t.slug
     from user_profiles up
     join tenants t on t.id = up.tenant_id
    where up.user_id = 'USER_ID';
   ```

4. **Cookie sabotage** — als de user "geraakte data" verhaalt: check
   dat `profile_id` cookie legit is. Vraag hardrefresh + opnieuw inloggen.

---

## Verkeerd bedrag goedgekeurd op een wallet topup

### Symptoom
Advertiser meldt "mijn balance klopt niet" na een topup approval.

### Diagnose

1. **Wat is de historie?**
   ```sql
   select occurred_at, action, actor_profile_id, before_data, after_data
     from audit_events
    where table_name = 'wallet_topups'
      and row_id = 'TOPUP_ID'
    order by occurred_at desc;
   ```

2. **Vergelijk request-time amount met current amount:**
   ```sql
   select before_data->>'amount', after_data->>'amount', occurred_at, action
     from audit_events
    where table_name = 'wallet_topups'
      and row_id = 'TOPUP_ID';
   ```

### Fix

Als het bedrag daadwerkelijk verkeerd is:

1. **Undo** de topup via de UI (`/wallet-topups` → row → Undo). Dit
   zet 'm terug naar `pending` en de trigger reverseert de balance.
2. **Reject** met een duidelijke reden. De advertiser moet opnieuw
   indienen met het correcte bedrag.

Als het bedrag klopt maar de balance is fout:

1. Er is iets mis met de balance-update trigger. Query het huidige saldo:
   ```sql
   select usd_balance, eur_balance, updated_at from wallets where id = 'WALLET_ID';
   ```
2. Reconstrueer wat het zou moeten zijn:
   ```sql
   select
     sum(case when currency = 'USD' then amount else 0 end) as expected_usd,
     sum(case when currency = 'EUR' then amount else 0 end) as expected_eur
    from wallet_topups
    where wallet_id = 'WALLET_ID' and status = 'completed';
   ```
3. Trek daar exchanges + top_ups (uitgaande) van af.
4. Update handmatig ALLEEN via `wallet_admin_adjust` RPC (die logt in audit).

---

## Verdachte activiteit / mogelijk breach

### Symptoom
- Meerdere failed login attempts van 1 IP
- Onverwachte admin-toggle op een profiel
- Ongewone piek in `top_ups.insert`

### Reactie

1. **Bepaal actor:**
   ```sql
   select occurred_at, table_name, action, row_id, actor_profile_id, tenant_id
     from audit_events
    where actor_profile_id = 'SUSPECT_PROFILE_ID'
      and occurred_at > now() - interval '24 hours'
    order by occurred_at desc;
   ```

2. **Deactivate het account:**
   ```sql
   update user_profiles set is_active = false, status = 'inactive'
    where id = 'SUSPECT_PROFILE_ID';
   ```

3. **Revoke session** — Supabase Dashboard → Authentication → Users →
   … → Delete sessions.

4. **Reset password** — force password reset via Supabase Dashboard.

5. **Bewaar audit trail** — kopieer `audit_events` naar een backup
   voor forensisch onderzoek:
   ```sql
   create table audit_snapshot_INCIDENT as
   select * from audit_events
    where occurred_at > 'INCIDENT_START';
   ```

6. **Communiceer** — mail alle admins van de betrokken tenant.

---

## Push notificaties komen niet aan

### Diagnose

1. **Heeft user een subscription?**
   ```sql
   select id, endpoint, created_at, user_agent
     from push_subscriptions
    where user_id = 'USER_ID';
   ```

2. **Fires de webhook?** Supabase Dashboard → Database → Webhooks →
   check "Recent invocations" van de push-notify hook.

3. **Test de endpoint handmatig:**
   ```bash
   curl -X POST https://YOUR_APP/api/push/notify \
     -H "Content-Type: application/json" \
     -H "x-push-secret: YOUR_SECRET" \
     -d '{"record":{"id":"test","recipient_user_id":"USER_ID","type":"topup_completed","payload":{},"tenant_id":null,"actor_user_id":null}}'
   ```
   - 200 met `sent: 1` → alles goed
   - 200 met `skipped: no subscriptions` → user heeft geen push aan
   - 401 → PUSH_WEBHOOK_SECRET mismatch

---

## SQL migratie draaien (production)

1. **Backup eerst** — Supabase Dashboard → Backups → maak
   handmatige snapshot voor je begint. (PITR is er, maar snapshot
   is dubbele veiligheid.)

2. **Preview de migratie:**
   ```bash
   supabase db diff --linked > /tmp/migration-preview.sql
   less /tmp/migration-preview.sql
   ```

3. **Deploy:**
   ```bash
   supabase db push
   ```

4. **Verify:** run een spot check query direct na:
   ```sql
   -- Verify function exists
   select routine_name from information_schema.routines
    where routine_schema = 'public'
      and routine_name in (
        'wallet_topup_admin_verify',
        '_current_profile',
        'rate_limit_check'
      );
   ```

5. **Rollback plan** — Supabase migrations zijn append-only in het
   git-model. Voor rollback: schrijf een nieuwe migratie die de
   wijzigingen ongedaan maakt (`drop function ...` etc.), of
   gebruik PITR om terug te gaan naar vóór de deploy.

---

## Iemand wil zijn account laten verwijderen (GDPR)

1. **Bevestig identiteit** — mail vanaf het geregistreerde adres.

2. **Anonimiseer** in plaats van verwijderen (financiële regelgeving
   vereist meestal 7 jaar bewaarplicht op transactieregisters):
   ```sql
   update user_profiles
      set full_name = 'DELETED USER',
          email = concat('deleted-', id, '@example.com'),
          is_active = false,
          status = 'inactive'
    where id = 'PROFILE_ID';
   ```

3. **Verwijder Supabase auth user:**
   ```sql
   -- Requires service role
   delete from auth.users where id = 'USER_ID';
   ```

4. **Log de operatie:**
   ```sql
   insert into audit_events (
     actor_user_id, action, table_name, row_id, before_data, after_data, tenant_id
   ) values (
     auth.uid(), 'DELETE', 'auth.users', 'USER_ID', null, null, 'TENANT_ID'
   );
   ```

5. **Bevestig aan gebruiker.**

---

## Restore uit backup

Zie `docs/BACKUP_AND_RECOVERY.md` — sectie "Wat te doen bij een echt
incident".

---

## Deploy productie

Standard flow met Vercel:

1. Merge PR naar `main`.
2. GitHub Actions CI groen (`.github/workflows/ci.yml`).
3. Vercel picks up main and deploys.
4. Verify:
   - `curl -I https://YOUR_APP` → 200 met alle security headers
   - Login flow werkt
   - `/api/push/notify` met verkeerde secret → 401
   - `select count(*) from audit_events where occurred_at > now() - interval '5 min'` — new events komen binnen

Als iets breekt:
- **Vercel rollback** naar de vorige deploy: Vercel dashboard →
  deployments → previous → Promote to production.
- Postgres data is er nog; alleen frontend rolt terug.
