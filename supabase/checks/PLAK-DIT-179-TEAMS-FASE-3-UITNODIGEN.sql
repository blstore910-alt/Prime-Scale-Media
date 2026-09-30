-- ════════════════════════════════════════════════════════════════════
-- PLAK 179 — TEAMS, FASE 3: EEN COLLEGA UITNODIGEN
-- ════════════════════════════════════════════════════════════════════
--
-- Na 175 (fundering) en 176 (teamleden mogen lezen). Zie
-- docs/TEAM_ACCOUNTS.md.
--
-- ── WAT DEZE PLAK DOET ────────────────────────────────────────────
--
-- 1. Twee kolommen op `invitations`, zodat een uitnodiging kan zeggen:
--    "dit is een collega voor DEZE adverteerder, in DEZE rol." Leeg is
--    een gewone klantuitnodiging, precies zoals vandaag.
--
-- 2. Een leesregel op `advertisers` voor teamleden. Plak 176 zette die
--    op dertien klanttabellen, maar niet op `advertisers` zelf -- en
--    daar staat alleen "je eigen rij". Zonder deze regel kan een
--    teamlid de adverteerder van zijn team niet lezen, en ziet de
--    sessielader niets om aan zijn profiel te hangen.
--
-- ── WAT DE CODE DOET ZOLANG DEZE PLAK ER NIET IS ──────────────────
--
-- Niets anders dan vandaag. De acceptatie leest de teamkolommen APART
-- (lib/auth/team-invite.ts): bestaan ze niet, dan faalt die ene lees en
-- is het een gewone uitnodiging. Geen enkele nieuwe klant loopt vast
-- omdat deze plak nog niet gedraaid is. Zie de regel in CLAUDE.md over
-- een kolom die een migratie nog niet heeft toegevoegd.
--
-- ── EN WAAROM DE LEESREGEL NIET TE RUIM KAN ZIJN ──────────────────
--
-- Dezelfde vorm als 176: een TWEEDE regel naast "je eigen rij", die
-- alleen toegang TOEVOEGT. `_psm_member_of('advertiser', id)` toetst
-- precies deze adverteerder tegen precies de ingelogde gebruiker. Tot er
-- echt iemand wordt uitgenodigd zijn de enige leden de eigenaars, en die
-- lazen hun eigen rij al.
-- ════════════════════════════════════════════════════════════════════

select set_config(
  'request.headers',
  json_build_object('x-psm-actor',
                    '8bd9b91b-c07b-4aae-9bd5-2aff773ab082')::text,
  true);

-- ── 0. de poort: fase 1 moet er staan ────────────────────────────
do $blk0$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = '_psm_member_of') then
    raise exception 'Fase 1 (plak 175) staat er niet -- eerst die draaien.';
  end if;
end
$blk0$;

-- ── 1. de uitnodiging kan een collega zijn ───────────────────────
do $blk1$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='invitations'
                    and column_name='team_advertiser_id') then
    alter table public.invitations
      add column team_advertiser_id uuid references public.advertisers(id) on delete cascade;
  end if;

  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='invitations'
                    and column_name='member_role') then
    alter table public.invitations add column member_role text;
  end if;

  if not exists (select 1 from pg_constraint
                  where conname = 'invitations_member_role_check') then
    alter table public.invitations
      add constraint invitations_member_role_check
      check (member_role is null or member_role in ('manager', 'viewer'));
  end if;

  -- Een teamuitnodiging heeft BEIDE of GEEN van beide. Een adverteerder
  -- zonder rol, of een rol zonder adverteerder, is een halve uitnodiging
  -- die bij acceptatie niet weet wat hij moet doen.
  if not exists (select 1 from pg_constraint
                  where conname = 'invitations_team_both_or_neither') then
    alter table public.invitations
      add constraint invitations_team_both_or_neither
      check ((team_advertiser_id is null) = (member_role is null));
  end if;
end
$blk1$;

-- ── 2. teamleden mogen de adverteerder van hun team lezen ────────
do $blk2$
begin
  drop policy if exists advertisers_team_read on public.advertisers;
  create policy advertisers_team_read on public.advertisers
    for select to authenticated
    using (public._psm_member_of('advertiser', id));
end
$blk2$;

-- ── HET RAPPORT, HELEMAAL ONDERAAN ─────────────────────────────────
--   kolommen            hoort 2
--   toetsen             hoort 2
--   leesregel           hoort 1
--   eigen_regel_intact  hoort 1  -- "advertisers_self_select", onaangeroerd
--   team_uitnodigingen  hoort 0  -- deze plak nodigt niemand uit
select
  'plak 179 geplaatst'                                             as wat,
  (select count(*)::text from information_schema.columns
    where table_schema='public' and table_name='invitations'
      and column_name in ('team_advertiser_id','member_role'))     as kolommen,
  (select count(*)::text from pg_constraint
    where conname in ('invitations_member_role_check',
                      'invitations_team_both_or_neither'))         as toetsen,
  (select count(*)::text from pg_policies where schemaname='public'
     and tablename='advertisers' and policyname='advertisers_team_read') as leesregel,
  (select count(*)::text from pg_policies where schemaname='public'
     and tablename='advertisers' and policyname='advertisers_self_select') as eigen_regel_intact,
  (select count(*)::text from public.invitations
    where team_advertiser_id is not null)                          as team_uitnodigingen;
