-- ════════════════════════════════════════════════════════════════════
-- PLAK 134 — DRINGEND: een klant kan zijn eigen wallet crediteren
-- ════════════════════════════════════════════════════════════════════
--
-- PLAK DEZE ALS EERSTE. Alles hieronder is vandaag nagemeten op de
-- live database.
--
-- ── WAT ER OPEN STAAT ───────────────────────────────────────────────
--
-- `public.wise_record_and_settle(...)` is SECURITY DEFINER, mag worden
-- uitgevoerd door `authenticated`, en toetst NIETS -- geen
-- `_require_profile`, geen `auth.uid()`, geen rol, geen tenant. Gemeten:
--
--   prosecdef = true
--   has_function_privilege('authenticated', ...) = true
--   de body bevat geen _require_profile en geen auth.uid()
--
-- Regel 41-46 van die body:
--
--   if p_auto_settle then
--     update public.wallet_topups
--        set status = 'completed', updated_at = now()
--      ...
--
-- en `trg_wallet_topup_balance_sync` op `wallet_topups` staat aan
-- (tgenabled = 'O'). Die telt bij binnenkomst van 'completed' het
-- bedrag op bij `wallets.eur_balance`.
--
-- DE KETEN, met alleen de publieke sleutel en een gewoon account:
--
--   1. de klant maakt zijn eigen storting aan met
--      `wallet_topup_advertiser_create` -- dat MAG hij, dat is de
--      opwaardeerknop;
--   2. hij roept POST /rest/v1/rpc/wise_record_and_settle aan met zijn
--      eigen topup-id, het passende bedrag en p_auto_settle = true;
--   3. zijn wallet is gecrediteerd. Er is geen geld binnengekomen.
--
-- Hij kan er bovendien vrij rijen mee in `wise_incoming_transfers`
-- zetten -- de wachtrij van het depositotabblad.
--
-- `public.wise_remember_sender(...)` heeft dezelfde vorm: SECURITY
-- DEFINER, uitvoerbaar door `authenticated`, geen enkele toets, en hij
-- schrijft in `advertiser_bank_senders` met de tenant en de advertiser
-- die de aanroeper zélf meegeeft. Dat is precies de tabel waarmee een
-- binnenkomende bankstorting aan een klant wordt toegeschreven.
--
-- Ik heb dit NIET uitgeprobeerd op productie. Het volgt uit de gemeten
-- grant, de gemeten body en de gemeten trigger.
--
-- ── WAAROM DE GRANT ER STAAT ────────────────────────────────────────
--
-- Nergens voor. Beide functies hebben in de hele repo precies één
-- aanroeper, `lib/integrations/wise-webhook.ts` (regel 217 en 266), en
-- die draait met de SERVICE ROLE. `authenticated` heeft ze nooit nodig
-- gehad; de plak die ze maakte had alleen geen revoke, zoals
-- CLAUDE.md voorschrijft.
--
-- ── WAT DEZE PLAK DOET ──────────────────────────────────────────────
--
--   1. `authenticated` eraf bij allebei -- de webhook draait als
--      service_role en merkt er niets van;
--   2. `authenticated` ook van de schrijfrechten op
--      `wise_incoming_transfers` en `advertiser_bank_senders`. RLS
--      houdt die vandaag al tegen (geen enkele insert/update/delete-
--      policy), maar dat is één vergeten policy van echt af -- dezelfde
--      les als plak 130;
--   3. `top_ups`: de sessie-wacht laat `pending -> completed` nog door.
--      Een MEDEWERKER-admin kan daarmee rechtstreeks
--      `PATCH /rest/v1/top_ups {"status":"completed"}` doen en
--      `top_up_admin_verify` helemaal overslaan: geen `verified_at`,
--      geen herberekende fee, geen leverancierspush -- terwijl de
--      factuur- en meldingstriggers wél afgaan. Die overgang gaat op
--      slot; via de RPC blijft alles werken.
--
-- Er beweegt geen geld en geen enkele bestaande rij verandert.
--
-- Plak dit hele bestand in de SQL editor. Onderaan staat EEN
-- rapporttabel.
-- ════════════════════════════════════════════════════════════════════

create temporary table if not exists _plak134 (
  n integer, stap text, uitkomst text
) on commit preserve rows;
truncate _plak134;

-- ── 1. de twee webhookfuncties gaan dicht ───────────────────────────
do $blk0$
declare
  r   record;
  v_n integer := 0;
begin
  for r in
    select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('wise_record_and_settle', 'wise_remember_sender')
  loop
    execute 'revoke all on function public.' || quote_ident(r.proname)
         || '(' || r.args || ') from public, anon, authenticated';
    execute 'grant execute on function public.' || quote_ident(r.proname)
         || '(' || r.args || ') to service_role';
    v_n := v_n + 1;
  end loop;

  insert into _plak134 values (0, 'de webhookfuncties',
    v_n || ' functie(s) alleen nog voor de service role');
exception when others then
  insert into _plak134 values (0, 'de webhookfuncties', 'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk0$;

-- ── 2. en hun tabellen ──────────────────────────────────────────────
do $blk1$
begin
  revoke insert, update, delete, truncate on public.wise_incoming_transfers
    from authenticated, anon, public;
  revoke insert, update, delete, truncate on public.advertiser_bank_senders
    from authenticated, anon, public;

  insert into _plak134 values (1, 'hun tabellen',
    'authenticated kan er niet meer in schrijven; lezen blijft zoals het was');
exception when others then
  insert into _plak134 values (1, 'hun tabellen', 'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk1$;

-- ── 3. top_ups: verifiëren kan alleen nog via de RPC ────────────────
do $blk2$
declare
  v_oid oid;
  v_def text;
  v_pat text;
begin
  select p.oid into v_oid
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = '_guard_top_ups_session_write'
   limit 1;

  if v_oid is null then
    insert into _plak134 values (2, 'top_ups',
      '_guard_top_ups_session_write bestaat niet -- overgeslagen');
    return;
  end if;

  v_def := pg_get_functiondef(v_oid);

  if position('completed hoort via de RPC' in v_def) > 0 then
    insert into _plak134 values (2, 'top_ups', 'stond er al -- niets gedaan');
    return;
  end if;

  -- Vlak na het begin van de functie, zodat hij vóór alle andere
  -- toetsen valt. `tg_op = 'UPDATE'` want een insert met status
  -- completed wordt elders al geweigerd.
  v_pat := 'begin';

  if not (v_def ~ ('^CREATE OR REPLACE FUNCTION[^$]*AS \$function\$[[:space:]]*declare[^;]*;[[:space:]]*' || v_pat)) then
    -- Geen aanname doen over de vorm: als hij niet matcht, niets doen.
    insert into _plak134 values (2, 'top_ups',
      'FOUT: de vorm van de wacht is niet herkend -- niets gewijzigd. Stuur me pg_get_functiondef van _guard_top_ups_session_write.');
    return;
  end if;

  execute regexp_replace(v_def,
    '(^CREATE OR REPLACE FUNCTION[^$]*AS \$function\$[[:space:]]*declare[^;]*;[[:space:]]*)begin',
    '\1begin' || chr(10) ||
    '  -- completed hoort via de RPC' || chr(10) ||
    '  --' || chr(10) ||
    '  -- Deze wacht liet pending -> completed door, en de policy' || chr(10) ||
    '  -- "Enable ALL for admins" geldt voor authenticated. Een' || chr(10) ||
    '  -- medewerker-admin kon daarmee rechtstreeks PATCHen en' || chr(10) ||
    '  -- top_up_admin_verify overslaan: geen verified_at, geen' || chr(10) ||
    '  -- herberekende fee, geen leverancierspush -- terwijl de' || chr(10) ||
    '  -- factuur- en meldingstriggers wel afgingen.' || chr(10) ||
    '  if tg_op = ''UPDATE''' || chr(10) ||
    '     and coalesce(new.status, '''') = ''completed''' || chr(10) ||
    '     and coalesce(old.status, '''') is distinct from ''completed'' then' || chr(10) ||
    '    raise exception ''Verify a top-up with the Verify button, not by changing its status.''' || chr(10) ||
    '      using errcode = ''42501'';' || chr(10) ||
    '  end if;' || chr(10));

  insert into _plak134 values (2, 'top_ups',
    'pending -> completed kan niet meer vanaf een sessie; via de RPC wel');
exception when others then
  insert into _plak134 values (2, 'top_ups', 'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk2$;

-- ── controle ────────────────────────────────────────────────────────
do $blk3$
declare
  v_fn    integer;
  v_tab   integer;
  v_guard boolean;
begin
  select count(*) into v_fn
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('wise_record_and_settle', 'wise_remember_sender')
     and (has_function_privilege('authenticated', p.oid, 'execute')
       or has_function_privilege('anon', p.oid, 'execute'));

  select count(*) into v_tab
    from (select unnest(array['wise_incoming_transfers','advertiser_bank_senders']) as t) x
   where has_table_privilege('authenticated', 'public.' || x.t, 'insert')
      or has_table_privilege('authenticated', 'public.' || x.t, 'update')
      or has_table_privilege('authenticated', 'public.' || x.t, 'delete');

  select coalesce(bool_or(position('completed hoort via de RPC' in pg_get_functiondef(p.oid)) > 0), false)
    into v_guard
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = '_guard_top_ups_session_write';

  insert into _plak134 values (3, 'stand van zaken',
    'klant kan de webhookfuncties nog aanroepen: ' || v_fn || ' (moet 0)'
    || ' | kan nog in hun tabellen schrijven: ' || v_tab || ' (moet 0)'
    || ' | top_ups op slot: ' || v_guard::text);
exception when others then
  insert into _plak134 values (3, 'stand van zaken', 'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk3$;

-- ════════════════════════════════════════════════════════════════════
-- HET RAPPORT — de editor toont alleen deze laatste tabel.
-- ════════════════════════════════════════════════════════════════════
select n as "#", stap as "wat", uitkomst as "uitkomst"
  from _plak134 order by n;
