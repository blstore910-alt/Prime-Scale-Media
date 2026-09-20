-- =====================================================================
-- PLAK 7 — de klant mag zijn eigen meldingen lezen
-- =====================================================================
-- Gevonden door drie keer live te kijken en toen de policies op te
-- vragen. De rijen worden WEL geschreven. De klant mag ze niet lezen.
--
-- Dit staat er nu op `notifications`:
--
--   "Admin can do ALL on notifications"   using/check:
--       recipient_user_id = auth.uid()
--       AND type <> 'topup_completed'
--       AND exists (select 1 from tenants t
--                    where t.id = notifications.tenant_id
--                      and t.owner_id = auth.uid())
--
--   "User can do ALL on topup completed"  using/check:
--       recipient_user_id = auth.uid() AND type = 'topup_completed'
--
-- Lees dat als een klant. De tweede policy laat je precies EEN type
-- zien: `topup_completed`. Alles wat dat niet is valt terug op de
-- eerste, en die eist dat je `tenants.owner_id` BENT. Een advertiser is
-- dat nooit.
--
-- Dus alles wat we een klant ooit hebben verteld is onzichtbaar voor
-- hem. Uit de telling van zojuist, allemaal aan klanten gericht:
--
--   subscription_invoice      6   "je maandfactuur staat klaar"
--   subscription_changed      7   "je abonnement is gewijzigd"
--   subscription_past_due     2   "we konden niet incasseren"
--   wallet_topup_rejected     2   de afwijzing mét reden
--
-- Zeventien meldingen, geschreven, betaald voor met push-infrastructuur
-- en een voorkeurenscherm, en niet één ervan is ooit op het scherm van
-- de ontvanger verschenen. Dat is ook precies waarom dit niet eerder
-- opviel: `topup_completed` werkt, dus de bel leek te werken.
--
-- ── WAT DIT DOET ─────────────────────────────────────────────────────
--
-- Een melding draagt de ontvanger in `recipient_user_id`. Dat IS de
-- toegangsregel, en er is geen tweede nodig: een admin-melding is aan
-- een admin gericht en een klantmelding aan een klant. De twee
-- policies hierboven worden vervangen door die ene regel, voor lezen
-- en voor bijwerken. Verwijderen heeft al zijn eigen policy, en de
-- kolom-grendel van 20260920350000 zorgt dat bijwerken alleen de
-- lees-/archiefvlaggen raakt.
--
-- Schrijven blijft bij de service-role en bij de SECURITY DEFINER
-- triggers — daar verandert niets aan.
--
-- Veilig om vaker te draaien.
-- =====================================================================

set search_path = public;

do $blk0$
declare
  p record;
begin
  -- De twee oude policies bij naam, en ook eventuele naamvarianten.
  for p in
    select policyname from pg_policies
     where schemaname = 'public' and tablename = 'notifications'
       and policyname in (
         'Admin can do ALL on notifications',
         'User can do ALL on topup completed',
         'notifications_select',
         'notifications_update_self'
       )
  loop
    execute format('drop policy if exists %I on public.notifications', p.policyname);
    raise notice 'oude policy verwijderd: %', p.policyname;
  end loop;
end;
$blk0$;

-- ── Lezen: je eigen meldingen, alle types ────────────────────────────
drop policy if exists notifications_read_own on public.notifications;
create policy notifications_read_own on public.notifications
  for select to authenticated
  using (recipient_user_id = auth.uid());

-- ── Bijwerken: je eigen meldingen ────────────────────────────────────
-- WELKE kolommen bewaakt trg_notification_flags_only (20260920350000):
-- alleen is_read / read_at / archived_at mogen bewegen, de inhoud niet.
drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
  for update to authenticated
  using (recipient_user_id = auth.uid())
  with check (recipient_user_id = auth.uid());

-- =====================================================================
-- Het rapport — de SQL-editor toont alleen dit
-- =====================================================================
select 1 as nr, 'policies op notifications nu' as item,
  coalesce((
    select string_agg(
             policyname || ' [' || cmd || ']  using: ' || coalesce(qual, '-'),
             E'\n' order by cmd, policyname)
      from pg_policies
     where schemaname = 'public' and tablename = 'notifications'
  ), 'geen') as antwoord
union all
select 2, 'kan een klant nu meer zien dan alleen topup_completed',
  case when exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'notifications'
       and cmd in ('SELECT', 'ALL')
       and qual ilike '%recipient_user_id = auth.uid()%'
       and qual not ilike '%owner_id%'
       and qual not ilike '%topup_completed%'
  ) then 'JA' else 'NEE - dit bestand is niet geplakt' end
union all
-- Dit is wat er al die tijd klaarstond en niemand zag.
select 3, 'meldingen die tot nu toe onleesbaar waren voor hun ontvanger',
  coalesce((
    select string_agg(x.type || ': ' || x.n::text, E'\n' order by x.type)
      from (
        select n.type, count(*) n
          from public.notifications n
          join public.user_profiles up on up.user_id = n.recipient_user_id
          left join public.tenants t
                 on t.id = n.tenant_id and t.owner_id = n.recipient_user_id
         where n.type <> 'topup_completed'
           and t.id is null
         group by n.type
      ) x
  ), 'geen')
union all
select 4, 'daarvan ONGELEZEN, dus die de klant nu ineens te zien krijgt',
  (select count(*)::text from public.notifications n
     left join public.tenants t
            on t.id = n.tenant_id and t.owner_id = n.recipient_user_id
    where n.type <> 'topup_completed'
      and t.id is null
      and coalesce(n.is_read, false) = false)
union all
select 5, 'de kolom-grendel staat er nog',
  case when exists (
    select 1 from pg_trigger
     where tgname = 'trg_notification_flags_only' and not tgisinternal
  ) then 'AAN' else 'NIET AANGELEGD - plak 20260920350000 opnieuw' end
order by nr;
