-- ════════════════════════════════════════════════════════════════════
-- PLAK 136 — de laatste vier tabellen met een schrijfrecht te veel
-- ════════════════════════════════════════════════════════════════════
--
-- Uit `supabase/checks/RECHTEN-KLOPT.sql`, de scan die nu na elke plak
-- gedraaid kan worden. Stand na 134 en 135:
--
--   tabel 1 (functies zonder toets)   LEEG   <- die waren de geldgaten
--   tabel 2 (schrijfrecht zonder policy)  4  <- deze plak
--   tabel 3 (wat anon mag)   6 leesfuncties, 0 tabellen -- allemaal met
--            opzet: current_advertiser_id, generate_wallet_reference_no,
--            get_current_profile_id, get_invite_by_token,
--            get_my_advertiser_id, mark_session_seen
--   tabellen zonder RLS      0
--
-- DE VIER
--
--   advertiser_plans             wat een klant per maand betaalt, hoeveel
--                                accounts inbegrepen zijn en zijn
--                                top-upfee. `authenticated` mag hier
--                                insert, update EN delete.
--   rate_limit_buckets           de emmers waarmee wij herhaalde pogingen
--                                afremmen. Schrijfrecht hierop is
--                                schrijfrecht op je eigen rem.
--   audit_events_monthly_stats   een afgeleide telling over het auditlog.
--   _view_backup_20260918        een kopie van 18 september. Zie hieronder.
--
-- GEEN VAN VIEREN IS VANDAAG UIT TE BUITEN: alle vier hebben RLS aan en
-- geen van alle heeft een policy die een insert, update of delete
-- toestaat, dus Postgres weigert de schrijf alsnog. Maar `advertiser_plans`
-- en `rate_limit_buckets` zijn precies de twee waar één vergeten policy
-- duur wordt -- een klant die zijn eigen maandbedrag kan wijzigen, en
-- een klant die zijn eigen rem kan legen.
--
-- Zelfde oorzaak als altijd: Supabase DEFAULT PRIVILEGES geven
-- `authenticated` arwdDxtm op alles wat in `public` wordt gemaakt, en
-- `revoke ... from anon, public` raakt die rol niet.
--
-- `_view_backup_20260918` WORDT NIET VERWIJDERD. Dat is een kopie uit
-- een ingreep van 18 september en weggooien is aan de eigenaar, niet
-- aan mij. Hij gaat hier alleen op alleen-lezen. Als hij niet meer
-- nodig is, is `drop table public._view_backup_20260918;` genoeg -- en
-- dat is een aparte beslissing.
--
-- Er beweegt geen geld en geen enkele rij verandert.
--
-- Plak dit hele bestand in de SQL editor. Onderaan staat EEN
-- rapporttabel.
-- ════════════════════════════════════════════════════════════════════

create temporary table if not exists _plak136 (
  n integer, stap text, uitkomst text
) on commit preserve rows;
truncate _plak136;

do $blk0$
declare
  r   record;
  v_n integer := 0;
  v_l text := '';
begin
  for r in
    select unnest(array[
      'advertiser_plans',
      'rate_limit_buckets',
      'audit_events_monthly_stats',
      '_view_backup_20260918'
    ]) as t
  loop
    if to_regclass('public.' || r.t) is null then
      v_l := v_l || r.t || ' (bestaat niet), ';
      continue;
    end if;
    execute format(
      'revoke insert, update, delete, truncate on public.%I from authenticated, anon, public',
      r.t);
    v_n := v_n + 1;
  end loop;

  insert into _plak136 values (0, 'de vier tabellen',
    v_n || ' op alleen-lezen gezet'
    || case when v_l = '' then '' else ' | overgeslagen: ' || v_l end);
exception when others then
  insert into _plak136 values (0, 'de vier tabellen', 'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk0$;

-- ── controle: de hele scan opnieuw ──────────────────────────────────
do $blk1$
declare
  v_fn   integer;
  v_tab  integer;
  v_lijst text;
  v_anon integer;
  v_norls integer;
begin
  select count(*) into v_fn
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    join pg_type t on t.oid = p.prorettype
   where n.nspname = 'public' and t.typname <> 'trigger' and p.prosecdef
     and has_function_privilege('authenticated', p.oid, 'execute')
     and position('_require_profile' in pg_get_functiondef(p.oid)) = 0
     and position('auth.uid' in pg_get_functiondef(p.oid)) = 0
     and p.proname <> 'get_invite_by_token';

  select count(*), coalesce(string_agg(t, ', ' order by t), 'geen')
    into v_tab, v_lijst
    from (
      select c.relname as t
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
         and (has_table_privilege('authenticated', 'public.' || c.relname, 'insert')
           or has_table_privilege('authenticated', 'public.' || c.relname, 'update')
           or has_table_privilege('authenticated', 'public.' || c.relname, 'delete'))
         and not exists (
           select 1 from pg_policy p
            where p.polrelid = c.oid and p.polcmd in ('a', 'w', 'd', '*')
         )
    ) x;

  select count(*) into v_anon
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'v')
     and (has_table_privilege('anon', 'public.' || c.relname, 'select')
       or has_table_privilege('anon', 'public.' || c.relname, 'insert'));

  select count(*) into v_norls
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;

  insert into _plak136 values (1, 'de hele scan',
    'functies zonder toets: ' || v_fn || ' (moet 0)'
    || ' | schrijfrecht zonder policy: ' || v_tab || ' (moet 0)'
    || ' | tabellen voor anon: ' || v_anon || ' (moet 0)'
    || ' | tabellen zonder RLS: ' || v_norls || ' (moet 0)');
  insert into _plak136 values (2, 'wat er nog openstaat', v_lijst);
exception when others then
  insert into _plak136 values (1, 'de hele scan', 'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk1$;

-- ════════════════════════════════════════════════════════════════════
-- HET RAPPORT — de editor toont alleen deze laatste tabel.
-- ════════════════════════════════════════════════════════════════════
select n as "#", stap as "wat", uitkomst as "uitkomst"
  from _plak136 order by n;
