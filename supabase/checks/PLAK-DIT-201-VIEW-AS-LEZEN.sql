-- ════════════════════════════════════════════════════════════════════
-- PLAK 201 -- View as customer: de eigenaar leest wat de klant leest
-- ════════════════════════════════════════════════════════════════════
--
-- /view-as/PSM00xx (commit 42593ed6) toont de klantschermen in de sessie
-- van de eigenaar. Drie tabellen lieten een beheerder niets lezen, en dan
-- liegt het scherm in plaats van leeg te blijven:
--
--   billings                  -> "Still needed: billing address" bij T4-A,
--                                terwijl het adres er staat (gemeten 02-10).
--                                Gewone admins: zij zien dit adres al op
--                                elke factuur.
--   notifications             -> de bel van de klant leek leeg.
--                                ALLEEN EIGENAARS.
--   notification_preferences  -> elke schakelaar stond AAN.
--                                ALLEEN EIGENAARS.
--
-- Alleen SELECT-policies. Policies tellen op (OR): niemand verliest iets,
-- en schrijven kan via geen van deze drie. De eigen bel en de eigen
-- schakelaars van een eigenaar filteren in de code op hun eigen id (bel:
-- altijd al; schakelaars: commit na 42593ed6) -- plak deze pas als die
-- live is.
--
-- Twee keer plakken kan.

do $blk0$
begin
  drop policy if exists billings_admin_read on public.billings;
  create policy billings_admin_read on public.billings
    for select to authenticated
    using (exists (
      select 1 from public.companies c
       where c.id = billings.company_id
         and public._is_admin_of(c.tenant_id)
    ));

  drop policy if exists notifications_owner_read on public.notifications;
  create policy notifications_owner_read on public.notifications
    for select to authenticated
    using (public._is_tenant_owner(tenant_id));

  drop policy if exists notification_preferences_owner_read on public.notification_preferences;
  create policy notification_preferences_owner_read on public.notification_preferences
    for select to authenticated
    using (exists (
      select 1 from public.user_profiles p
       where p.user_id = notification_preferences.user_id
         and public._is_tenant_owner(p.tenant_id)
    ));
end;
$blk0$;

-- ── RAPPORT ──────────────────────────────────────────────────────────
select
  (select count(*) from pg_policy where polname in
     ('billings_admin_read', 'notifications_owner_read', 'notification_preferences_owner_read')
     and polcmd = 'r') as select_policies_moet_3,
  (select count(*) from pg_policy where polname in
     ('billings_admin_read', 'notifications_owner_read', 'notification_preferences_owner_read')
     and polcmd <> 'r') as schrijf_policies_moet_0,
  has_table_privilege('anon', 'public.billings', 'select') as anon_billings_moet_false;
