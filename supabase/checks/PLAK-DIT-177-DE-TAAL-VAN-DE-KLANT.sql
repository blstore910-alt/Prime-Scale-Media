-- ════════════════════════════════════════════════════════════════════
-- PLAK 177 — DE TAAL VAN DE KLANT
-- ════════════════════════════════════════════════════════════════════
--
-- De eigenaar, 30-09: "veel NSA-klanten zijn Nederlands, vandaar." Zie
-- docs/NL_EN.md voor de vier regels van de taalschakelaar.
--
-- ── WAAROM IN DE DATABASE EN NIET IN DE BROWSER ───────────────────
--
-- E-mails en de factuur-PDF worden op de SERVER gemaakt. Die moeten
-- weten in welke taal de klant leest. Een keuze die alleen in de
-- browser staat, levert een Nederlandse app en een Engelse factuur op
-- -- precies het soort halve vertaling die "foutloos" moet uitsluiten.
--
-- ── WAAROM EEN FUNCTIE EN GEEN GEWONE UPDATE ──────────────────────
--
-- Op 17-09 bleek de UPDATE-policy op `user_profiles` helemaal te
-- ontbreken terwijl de repo anders beweerde (zie CLAUDE.md). Een
-- instelling die via RLS geschreven wordt, kan dus stil niets doen: RLS
-- geeft nul rijen en geen fout, en de knop zegt "opgeslagen".
--
-- Deze functie mag precies één ding: `locale` zetten op de rij van de
-- beller zelf, en alleen op 'en' of 'nl'. Geen andere kolom, geen
-- andere rij. Hij geeft het aantal bijgewerkte rijen terug, zodat de
-- server action een 0 kan zien in plaats van te vertrouwen.
--
-- Geen maintenanceGuard-equivalent: een taalkeuze is persoonlijk en raakt
-- geen geld. Tijdens een storing je taal wisselen is onschadelijk.
-- ════════════════════════════════════════════════════════════════════

select set_config(
  'request.headers',
  json_build_object('x-psm-actor',
                    '8bd9b91b-c07b-4aae-9bd5-2aff773ab082')::text,
  true);

-- ── 1. de kolom ──────────────────────────────────────────────────
do $blk1$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'user_profiles'
       and column_name = 'locale'
  ) then
    alter table public.user_profiles
      add column locale text not null default 'en';
  end if;

  if not exists (select 1 from pg_constraint
                  where conname = 'user_profiles_locale_check') then
    alter table public.user_profiles
      add constraint user_profiles_locale_check check (locale in ('en', 'nl'));
  end if;
end
$blk1$;

-- ── 2. de functie ────────────────────────────────────────────────
create or replace function public.set_own_locale(p_locale text)
returns integer
language plpgsql
security definer
set search_path = public
as $blk2$
declare v_n integer;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if p_locale is null or p_locale not in ('en', 'nl') then
    raise exception 'Unknown language' using errcode = '22023';
  end if;

  -- ALLE profielrijen van deze gebruiker: iemand met een adverteerder-
  -- en een affiliateprofiel hoort in beide dezelfde taal te krijgen, en
  -- niet de ene rol in het Nederlands en de andere in het Engels.
  update public.user_profiles
     set locale = p_locale
   where user_id = auth.uid();
  get diagnostics v_n = row_count;
  return v_n;
end
$blk2$;

revoke all on function public.set_own_locale(text) from public, anon;
grant execute on function public.set_own_locale(text) to authenticated, service_role;

-- ── HET RAPPORT, HELEMAAL ONDERAAN ─────────────────────────────────
--   kolom           hoort 1
--   toets           hoort 1
--   functie         hoort 1
--   anon_mag        hoort 'nee'
--   iedereen_en     hoort gelijk aan het aantal profielen -- de
--                   standaard is Engels, en deze plak zet niemand om
select
  'plak 177 geplaatst'                                             as wat,
  (select count(*)::text from information_schema.columns
    where table_schema='public' and table_name='user_profiles'
      and column_name='locale')                                    as kolom,
  (select count(*)::text from pg_constraint
    where conname='user_profiles_locale_check')                    as toets,
  (select count(*)::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='set_own_locale')       as functie,
  (select case when has_function_privilege('anon',
            'public.set_own_locale(text)', 'execute')
               then 'JA -- FOUT' else 'nee' end)                   as anon_mag,
  (select count(*)::text from public.user_profiles where locale = 'en') as iedereen_en,
  (select count(*)::text from public.user_profiles)                as profielen;
