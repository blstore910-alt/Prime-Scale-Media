-- ════════════════════════════════════════════════════════════════════
-- PLAK 107 — top_ups_view is leesbaar voor anon, met RLS omzeild
--            DIT IS VAN MIJ. PLAK DEZE EERST.
-- ════════════════════════════════════════════════════════════════════
--
-- Gemeten op de live database:
--
--   relname                            reloptions              anon mag lezen
--   referral_commissions_with_details  {security_invoker=on}   false
--   referral_links_with_details        {security_invoker=on}   false
--   top_ups_view                       (leeg)                  TRUE
--
-- Een view zonder `security_invoker` draait als zijn EIGENAAR, en die is
-- `postgres`, die ook top_ups, advertisers, user_profiles en ad_accounts
-- bezit. RLS wordt dus niet toegepast. En `anon` -- de rol achter de
-- publieke sleutel die in de browserbundel van /auth/sign-up zit -- mag
-- hem lezen.
--
-- Samen betekent dat: zonder account, zonder inloggen, met een sleutel
-- die iedereen uit de pagina kan halen, is elke top-up van BEIDE tenants
-- op te vragen. Inclusief naam, e-mailadres, bedragen, koers, fee, de
-- naam van het ad-account, de status, de afwijsreden en het pad naar het
-- betalingsbewijs.
--
-- HOE HET ZOVER KWAM, EN DAT WAS IK
--
-- `_plak94_stash` legde deze view op 25-09 07:31:45 vast met
-- `invoker = true` en een grantlijst zonder anon. Vandaag staat de optie
-- uit.
--
-- Plak 105, die ik vanmiddag heb geleverd, deed dit om er een kolom bij
-- te zetten:
--
--     create or replace view public.top_ups_view as <definitie>
--
-- CREATE OR REPLACE VIEW zonder een `WITH (...)` zet de reloptions terug
-- naar leeg. De definitie komt terug, de beveiliging niet.
--
-- Dat is exact de les die CLAUDE.md al vastlegt voor functies -- "een
-- revoke hoort bij elke create or replace", omdat Postgres EXECUTE aan
-- PUBLIC geeft op een nieuwe functie -- maar dan voor een VIEW, en die
-- stond niet in de regel. Nu wel: hieronder staat de optie expliciet in
-- het statement, zodat een volgende wijziging hem niet opnieuw kan
-- wegnemen.
--
-- Plak dit hele bestand in de SQL editor, vóór alle andere. Onderaan
-- staat EEN rapporttabel.
-- ════════════════════════════════════════════════════════════════════

create temporary table if not exists _plak107 (
  n integer, stap text, uitkomst text
) on commit preserve rows;
truncate _plak107;

-- ── 0. vastleggen hoe het NU staat ──────────────────────────────────
do $blk0$
declare v text;
begin
  select coalesce(string_agg(
           c.relname || ': opties=' || coalesce(c.reloptions::text, 'LEEG') ||
           ', anon leest=' || has_table_privilege('anon', c.oid, 'select')::text,
           ' | ' order by c.relname), 'geen views')
    into v
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'v';
  insert into _plak107 values (0, 'views VOORAF', v);
exception when others then
  insert into _plak107 values (0, 'views VOORAF',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk0$;

-- ── 1. de view draait weer als de AANROEPER ─────────────────────────
--     Dan geldt het RLS-beleid van top_ups, advertisers en
--     user_profiles gewoon, en ziet elke lezer alleen wat hij al mocht.
do $blk1$
begin
  alter view public.top_ups_view set (security_invoker = on);
  insert into _plak107 values (1, 'security_invoker',
    'AAN -- RLS geldt weer voor wie hem leest');
exception when others then
  insert into _plak107 values (1, 'security_invoker',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk1$;

-- ── 2. en anon heeft er niets te zoeken ─────────────────────────────
--     Ook met security_invoker aan hoort anon hier niet bij: hij is de
--     rol van een bezoeker zonder account, en er is geen scherm zonder
--     account dat een top-up laat zien. Twee sloten, want het eerste is
--     er vanmiddag al een keer afgevallen.
do $blk2$
begin
  revoke all on public.top_ups_view from anon;
  revoke all on public.top_ups_view from public;
  grant select on public.top_ups_view to authenticated, service_role;
  insert into _plak107 values (2, 'rechten',
    'anon en public eraf; authenticated + service_role mogen lezen');
exception when others then
  insert into _plak107 values (2, 'rechten',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk2$;

-- ── 3. de kladtabel weg ─────────────────────────────────────────────
--     _plak94_stash heeft RLS UIT en anon houdt er select, insert,
--     update, delete en truncate op. Het is de enige tabel in `public`
--     zonder RLS. Hij bevat een back-up van een viewdefinitie uit een
--     eerdere plak -- die staat hierboven in de noot, dus hij mag weg.
do $blk3$
begin
  if to_regclass('public._plak94_stash') is not null then
    drop table public._plak94_stash;
    insert into _plak107 values (3, 'kladtabel _plak94_stash',
      'weg -- anon kon erin schrijven');
  else
    insert into _plak107 values (3, 'kladtabel _plak94_stash',
      'bestond al niet meer');
  end if;
exception when others then
  insert into _plak107 values (3, 'kladtabel _plak94_stash',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk3$;

-- ── 4. en elke andere view en tabel nalopen ─────────────────────────
--     Niet alleen deze: als er nog iets in `public` open ligt voor anon
--     wil ik dat nu weten en niet bij de volgende agent.
do $blk4$
declare
  v_views text;
  v_tab   text;
  v_norls text;
begin
  select coalesce(string_agg(c.relname, ', ' order by c.relname), 'geen')
    into v_views
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'v'
     and (has_table_privilege('anon', c.oid, 'select')
          or coalesce(c.reloptions::text, '') not like '%security_invoker=on%');

  select coalesce(string_agg(c.relname, ', ' order by c.relname), 'geen')
    into v_tab
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
     and has_table_privilege('anon', c.oid, 'select');

  select coalesce(string_agg(c.relname, ', ' order by c.relname), 'geen')
    into v_norls
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
     and c.relrowsecurity = false;

  insert into _plak107 values (4, 'views die anon leest OF zonder invoker', v_views);
  insert into _plak107 values (5, 'tabellen die anon mag lezen', v_tab);
  insert into _plak107 values (6, 'tabellen ZONDER RLS', v_norls);
exception when others then
  insert into _plak107 values (4, 'nalopen',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk4$;

-- ════════════════════════════════════════════════════════════════════
-- HET RAPPORT — de editor toont alleen deze laatste tabel.
--
-- Regel 4, 5 en 6 horen alle drie "geen" te zeggen. Staat er iets, stuur
-- het me -- dan kijk ik er meteen naar.
-- ════════════════════════════════════════════════════════════════════
select n as "#", stap as "wat", uitkomst as "uitkomst"
  from _plak107 order by n;
