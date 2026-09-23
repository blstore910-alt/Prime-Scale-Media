-- ════════════════════════════════════════════════════════════════════
-- PLAK 83 — de helft van plak 82 die op een view stuk liep, plus de
--            drie views en vier sequences die plak 79/80 hebben gemist
-- ════════════════════════════════════════════════════════════════════
--
-- 1  `referral_links.commission_*` kon niet van `real` naar `numeric`
--    omdat twee views die kolommen noemen. Postgres weigert dat met
--    0A000 en laat de tabel ongemoeid — de adverteerderskant IS al om.
--    Dit blok pakt de definities zelf op, laat de views los, zet de
--    kolommen om en bouwt ze precies zo terug, met dezelfde rechten.
--    Niets wordt hier met de hand overgetypt.
--
--    Waarom het moet: `select 12345.67::real` geeft 12345.7 en
--    `99999.99::real` geeft 100000. Het commissievenster biedt
--    step="0.01" aan en leest de kolom rechtstreeks terug.
--
-- 2  anon houdt nog INSERT/UPDATE/DELETE/TRUNCATE op drie VIEWS
--    (referral_links_with_details, referral_commissions_with_details,
--    top_ups_view) en SELECT/UPDATE op vier SEQUENCES. Plak 79 en 80
--    hebben alleen tabellen afgelopen.
--
--    Het is vandaag niet uit te buiten: alle drie de views staan op
--    `security_invoker=on`, dus de rechtencontrole op de onderliggende
--    tabel gebeurt als de AANROEPER, en die rechten heeft anon niet
--    meer. Maar het is precies het soort restje dat een volgende
--    `create or replace view` weer betekenis geeft, en op de sequences
--    kan anon vandaag wél het volgende audit-volgnummer opstoken.
--
-- Plak dit hele bestand in de SQL editor. Onderaan staat EEN
-- rapporttabel.
-- ════════════════════════════════════════════════════════════════════

create temporary table if not exists _plak83 (
  n integer, stap text, uitkomst text
) on commit preserve rows;
truncate _plak83;

-- ── 1. de views los, de kolommen om, de views terug ──────────────────
do $blk0$
declare
  v_links_def text;
  v_comms_def text;
  v_step      text := 'start';
begin
  -- De definities zoals Postgres ze zelf teruggeeft.
  select pg_get_viewdef('public.referral_links_with_details'::regclass, true)
    into v_links_def;
  select pg_get_viewdef('public.referral_commissions_with_details'::regclass, true)
    into v_comms_def;
  v_step := 'definities opgehaald';

  drop view public.referral_links_with_details;
  drop view public.referral_commissions_with_details;
  v_step := 'views losgelaten';

  alter table public.referral_links
    alter column commission_monthly type numeric(14,2)
      using round(commission_monthly::numeric, 2),
    alter column commission_onetime type numeric(14,2)
      using round(commission_onetime::numeric, 2),
    alter column commission_pct type numeric(6,3)
      using round(commission_pct::numeric, 3);
  v_step := 'kolommen omgezet';

  execute 'create view public.referral_links_with_details '
       || 'with (security_invoker = on) as ' || v_links_def;
  execute 'create view public.referral_commissions_with_details '
       || 'with (security_invoker = on) as ' || v_comms_def;
  v_step := 'views teruggebouwd';

  -- Dezelfde rechten als ervoor, minus wat anon nooit had moeten hebben.
  grant select on public.referral_links_with_details
    to authenticated, service_role;
  grant select on public.referral_commissions_with_details
    to authenticated, service_role;
  revoke all on public.referral_links_with_details from public, anon;
  revoke all on public.referral_commissions_with_details from public, anon;
  -- De leesaccounts die npm run check gebruikt.
  begin
    grant select on public.referral_links_with_details to psm_readonly, psm_check;
    grant select on public.referral_commissions_with_details to psm_readonly, psm_check;
  exception when others then
    null;  -- die rollen hoeven niet te bestaan
  end;
  v_step := 'rechten teruggezet';

  insert into _plak83 values (
    1, 'referral_links commissiebedragen naar numeric', 'klaar (' || v_step || ')');
exception when others then
  insert into _plak83 values (1, 'referral_links commissiebedragen naar numeric',
    'FOUT ' || sqlstate || ' bij "' || v_step || '": ' || sqlerrm);
end
$blk0$;

-- ── 2. de views en sequences die anon nog kon schrijven ──────────────
do $blk1$
declare
  r      record;
  v_n    integer := 0;
  v_list text := '';
begin
  for r in
    select c.relname, c.relkind
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind in ('v', 'S')
       and exists (
         select 1 from aclexplode(c.relacl) g
          where g.grantee::regrole::text = 'anon'
            and g.privilege_type in
              ('SELECT','INSERT','UPDATE','DELETE','TRUNCATE','USAGE')
       )
     order by c.relname
  loop
    execute format('revoke all on %I.%I from anon', 'public', r.relname);
    v_n := v_n + 1;
    v_list := v_list || (case when v_list = '' then '' else ', ' end) || r.relname;
  end loop;

  insert into _plak83 values (
    2, 'anon van de views en sequences af',
    case when v_n = 0 then 'er stond niets meer open'
         else v_n || ': ' || v_list end);
exception when others then
  insert into _plak83 values (2, 'anon van de views en sequences af',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk1$;

-- ── controle ─────────────────────────────────────────────────────────
do $blk2$
declare
  v_real  integer;
  v_anon  integer;
  v_views integer;
begin
  select count(*) into v_real
    from information_schema.columns
   where table_schema = 'public'
     and column_name like 'commission%'
     and data_type = 'real';

  select count(*) into v_anon
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and exists (
       select 1 from aclexplode(c.relacl) g
        where g.grantee::regrole::text = 'anon'
          and g.privilege_type in
            ('SELECT','INSERT','UPDATE','DELETE','TRUNCATE','USAGE')
     );

  select count(*) into v_views
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'v';

  insert into _plak83 values (
    3, 'nog open',
    v_real || ' commissiekolom(men) nog in real, ' ||
    v_anon || ' object(en) waar anon nog bij kan, ' ||
    v_views || ' views aanwezig');
exception when others then
  insert into _plak83 values (3, 'nog open', 'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk2$;

-- ════════════════════════════════════════════════════════════════════
-- HET RAPPORT — de editor toont alleen deze laatste tabel.
-- ════════════════════════════════════════════════════════════════════
select n as "#", stap as "wat", uitkomst as "uitkomst"
  from _plak83 order by n;
