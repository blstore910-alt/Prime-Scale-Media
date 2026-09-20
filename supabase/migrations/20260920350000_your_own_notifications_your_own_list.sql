-- =====================================================================
-- Je eigen meldingen: wel opruimen, niet herschrijven
-- =====================================================================
-- Twee dingen kloppen niet aan `notifications`, en ze wijzen de
-- tegenovergestelde kant op.
--
-- 1. OPRUIMEN KAN NIET, MAAR ZEGT VAN WEL.
--
--    20260828140000_rls_templates.sql maakt precies twee policies:
--    notifications_select (regel 481) en notifications_update_self
--    (regel 485). Er is GEEN delete-policy. Met RLS aan betekent dat:
--    elke delete raakt nul rijen, voor iedereen.
--
--    PostgREST noemt dat geen fout. Dus het scherm waarschuwde "this
--    cannot be undone", de toast zei "Old read notifications cleaned",
--    en er ging nooit iets weg. De knop staat er sinds de melding-pagina
--    bestaat.
--
-- 2. HERSCHRIJVEN KAN WEL, EN DAT HOORT NIET.
--
--    notifications_update_self is
--      for update using (recipient_user_id = auth.uid())
--    zonder kolombeperking. De app biedt alleen is_read, read_at en
--    archived_at aan -- maar vanuit de console kan iemand op zijn EIGEN
--    rijen ook `type`, `title`, `body`, `metadata` en `created_at`
--    overschrijven. De meldingenpagina dereferenceert ids uit
--    `metadata` (app/(app)/notifications/page.tsx:87, 99, 113), dus dat
--    is precies het veld dat je niet in handen van de ontvanger wil
--    hebben. De WITH CHECK zet recipient_user_id wel vast, dus een rij
--    naar iemand anders schuiven kan niet.
--
-- Dit bestand doet allebei: opruimen mag (alleen je eigen, alleen
-- gelezen), en herschrijven van de inhoud mag niet meer.
--
-- Veilig om vaker te draaien.
-- =====================================================================

set search_path = public;

-- ── 1. Je mag je eigen gelezen meldingen weggooien ───────────────────
drop policy if exists notifications_delete_self on public.notifications;
create policy notifications_delete_self on public.notifications
  for delete to authenticated
  using (
    recipient_user_id = auth.uid()
    and coalesce(is_read, false) = true
  );

-- ── 2. Alleen de lees-/archiefvlaggen mogen bewegen ──────────────────
-- Een policy kan geen kolommen beperken, dus dit is een trigger. De
-- service-role (auth.uid() is null) gaat er ongemoeid doorheen: die
-- schrijft de melding in de eerste plaats.
create or replace function public._notification_flags_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $blk0$
begin
  if auth.uid() is null then
    return new;
  end if;

  -- Een admin die namens de app een melding bijwerkt loopt via de
  -- service-role; komt er ooit een beheerscherm, dan hoort dat hier
  -- expliciet bij te staan en niet stilzwijgend mee te liften.
  if new.recipient_user_id is distinct from old.recipient_user_id
     or coalesce(new.type, '')     is distinct from coalesce(old.type, '')
     or coalesce(new.title, '')    is distinct from coalesce(old.title, '')
     or coalesce(new.body, '')     is distinct from coalesce(old.body, '')
     or coalesce(new.metadata::text, '') is distinct from coalesce(old.metadata::text, '')
     or new.created_at is distinct from old.created_at
  then
    raise exception
      'A notification cannot be rewritten. You can mark it read or archive it.'
      using errcode = '42501';
  end if;

  return new;
end;
$blk0$;

do $blk1$
begin
  -- `metadata` heet op sommige installaties `data`. Als de kolom niet
  -- bestaat weigert de functie pas bij de eerste update, dus hier al
  -- testen en de trigger dan niet aanleggen -- liever geen grendel dan
  -- een kapot slot op een pagina die elke klant opent.
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'notifications'
       and column_name = 'metadata'
  ) then
    raise notice 'OVERGESLAGEN: notifications.metadata bestaat niet; trigger niet aangelegd';
    return;
  end if;

  execute 'drop trigger if exists trg_notification_flags_only on public.notifications';
  execute 'create trigger trg_notification_flags_only before update on public.notifications for each row execute function public._notification_flags_only()';
end;
$blk1$;

-- =====================================================================
-- Het rapport — de SQL-editor toont alleen het LAATSTE resultaat
-- =====================================================================
select 1 as nr, 'policies op notifications' as item,
  coalesce((
    select string_agg(policyname || ' (' || cmd || ')', '  |  ' order by cmd, policyname)
      from pg_policies
     where schemaname = 'public' and tablename = 'notifications'
  ), 'geen') as antwoord
union all
select 2, 'kan iemand zijn eigen gelezen meldingen nu wissen',
  case when exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'notifications' and cmd = 'DELETE'
  ) then 'JA' else 'NEE - dit bestand is niet geplakt' end
union all
select 3, 'kolom-grendel op notifications',
  case when exists (
    select 1 from pg_trigger
     where tgname = 'trg_notification_flags_only' and not tgisinternal
  ) then 'AAN' else 'NIET AANGELEGD' end
union all
-- Hoeveel er dus NOOIT opgeruimd zijn. Dit is het getal dat de knop al
-- die tijd beweerde te hebben verwijderd.
select 4, 'gelezen meldingen ouder dan 30 dagen, nu',
  (select count(*)::text from public.notifications
    where coalesce(is_read, false) = true
      and created_at < now() - interval '30 days')
union all
select 5, 'meldingen totaal  |  ongelezen',
  (select count(*)::text || '  |  ' ||
          count(*) filter (where coalesce(is_read, false) = false)::text
     from public.notifications)
order by nr;
