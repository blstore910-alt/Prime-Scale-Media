-- ════════════════════════════════════════════════════════════════════
-- PLAK 135 — vijf interne helpers die een klant kon aanroepen
-- ════════════════════════════════════════════════════════════════════
--
-- Vervolg op plak 134, uit dezelfde telling. Ik heb de hele lijst
-- SECURITY DEFINER-functies doorgemeten in plaats van er een te
-- pakken, en dit is wat er overblijft:
--
--   101  SECURITY DEFINER-functies in `public`
--    76  daarvan mag `authenticated` uitvoeren
--     6  daarvan hebben GEEN `_require_profile` en GEEN `auth.uid()`
--        in hun body -- dus geen enkele toets op wie er belt
--
-- Van die zes SCHRIJFT er één:
--
--   _claw_back_referral_commission(p_advertiser_id, p_amount, ...)
--
-- SECURITY DEFINER gaat om alle RLS heen, dus een klant die hem met de
-- publieke sleutel aanroept kan de commissie van een affiliate laten
-- terugvorderen, met een bedrag van zijn eigen keuze. Hij is bedoeld
-- als interne helper -- de opname- en terugbetaalpaden roepen hem aan
-- nadat zij zelf hebben getoetst wie er belt.
--
-- De andere vijf lezen alleen, maar horen er net zo min:
--
--   _admin_recipients(p_tenant)              wie de beheerders zijn
--   _effective_subscription_amount(...)      wat een klant betaalt
--   _effective_topup_fee_pct(...)            welke fee er geldt
--   _invited_to(p_tenant)                    wie er is uitgenodigd
--
-- Dat is prijs- en personeelsinformatie van een andere klant, op te
-- vragen met alleen een account en de sleutel die in elke pagina
-- staat.
--
-- `get_invite_by_token(p_token)` blijft WEL staan voor `authenticated`:
-- die is er met opzet, want iemand met een uitnodiging moet hem kunnen
-- ophalen, en het token is het geheim.
--
-- Een onderstreepje voorop betekent in dit schema "intern". Dat is nu
-- ook wat de rechten zeggen.
--
-- Plak dit hele bestand in de SQL editor. Onderaan staat EEN
-- rapporttabel.
-- ════════════════════════════════════════════════════════════════════

create temporary table if not exists _plak135 (
  n integer, stap text, uitkomst text
) on commit preserve rows;
truncate _plak135;

do $blk0$
declare
  r     record;
  v_n   integer := 0;
  v_lst text := '';
begin
  for r in
    select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      join pg_type t on t.oid = p.prorettype
     where n.nspname = 'public'
       and t.typname <> 'trigger'
       and p.prosecdef
       and has_function_privilege('authenticated', p.oid, 'execute')
       and position('_require_profile' in pg_get_functiondef(p.oid)) = 0
       and position('auth.uid' in pg_get_functiondef(p.oid)) = 0
       -- Met opzet bereikbaar: het token IS het geheim.
       and p.proname <> 'get_invite_by_token'
  loop
    execute 'revoke all on function public.' || quote_ident(r.proname)
         || '(' || r.args || ') from public, anon, authenticated';
    execute 'grant execute on function public.' || quote_ident(r.proname)
         || '(' || r.args || ') to service_role';
    v_n := v_n + 1;
    v_lst := v_lst || r.proname || ', ';
  end loop;

  insert into _plak135 values (0, 'interne helpers',
    case when v_n = 0 then 'stonden al dicht'
         else v_n || ' dicht: ' || left(v_lst, 200) end);
exception when others then
  insert into _plak135 values (0, 'interne helpers', 'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk0$;

-- ── controle: de hele telling opnieuw ───────────────────────────────
do $blk1$
declare
  v_sd    integer;
  v_auth  integer;
  v_geen  integer;
  v_namen text;
begin
  select count(*) filter (where p.prosecdef),
         count(*) filter (where p.prosecdef
                            and has_function_privilege('authenticated', p.oid, 'execute')),
         count(*) filter (where p.prosecdef
                            and has_function_privilege('authenticated', p.oid, 'execute')
                            and position('_require_profile' in pg_get_functiondef(p.oid)) = 0
                            and position('auth.uid' in pg_get_functiondef(p.oid)) = 0)
    into v_sd, v_auth, v_geen
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_type t on t.oid = p.prorettype
   where n.nspname = 'public' and t.typname <> 'trigger';

  select coalesce(string_agg(p.proname, ', ' order by p.proname), 'geen')
    into v_namen
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_type t on t.oid = p.prorettype
   where n.nspname = 'public' and t.typname <> 'trigger'
     and p.prosecdef
     and has_function_privilege('authenticated', p.oid, 'execute')
     and position('_require_profile' in pg_get_functiondef(p.oid)) = 0
     and position('auth.uid' in pg_get_functiondef(p.oid)) = 0;

  insert into _plak135 values (1, 'de hele telling',
    v_sd || ' SECURITY DEFINER | ' || v_auth || ' door een klant aanroepbaar | '
    || v_geen || ' daarvan zonder enige toets');
  insert into _plak135 values (2, 'wat er nog zonder toets staat',
    v_namen || '  (get_invite_by_token hoort hier: het token is het geheim)');
exception when others then
  insert into _plak135 values (1, 'de hele telling', 'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk1$;

-- ════════════════════════════════════════════════════════════════════
-- HET RAPPORT — de editor toont alleen deze laatste tabel.
-- ════════════════════════════════════════════════════════════════════
select n as "#", stap as "wat", uitkomst as "uitkomst"
  from _plak135 order by n;
