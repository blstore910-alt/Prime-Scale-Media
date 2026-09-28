-- ════════════════════════════════════════════════════════════════════
-- PLAK 124 — vier dingen aan de rechtenkant van blok 10
-- ════════════════════════════════════════════════════════════════════
--
-- Uit de rechten-veeg op blok 10 (adverteerder-als-affiliate), 28-09.
-- Alles hieronder is op de LIVE database gemeten.
--
-- EERST HET GOEDE NIEUWS, want dat is de kernvraag van dit blok: een
-- adverteerder kan zijn eigen `affiliate_status` NIET op 'approved'
-- zetten. Vier onafhankelijke sloten, alle vier nagemeten:
-- `authenticated` heeft geen INSERT/DELETE op `advertisers`; er is geen
-- UPDATE-policy voor een niet-admin, dus een PATCH raakt nul rijen; de
-- trigger `a0_guard_advertisers_session_write` weigert elke sessie-write
-- buiten zes onschuldige kolommen; en geen regel code in de repo
-- schrijft direct naar `advertisers`. Een medewerker-admin kan het
-- evenmin: de vier decide-RPC's eisen alle vier `t.owner_id =
-- auth.uid()`. Hieronder staat dus hygiëne, geen escalatie.
--
-- 1. EEN GEWEIGERDE AANVRAGER WIST HET BESLUIT VAN DE EIGENAAR
--
--    `affiliate_application_submit` doet bij opnieuw aanvragen:
--
--      set affiliate_status = 'applied', affiliate_applied_at = now(),
--          affiliate_decided_at = null, affiliate_refusal_reason = null
--
--    Hij kan zichzelf niet goedkeuren, maar wel met één druk op "Apply
--    again" de datum EN de reden van zijn afwijzing uit de rij halen.
--    Wat overblijft is `audit_events`, en dat leest niemand tijdens het
--    beoordelen van de volgende aanvraag.
--
--    De reden en de datum blijven nu staan. Dat is veilig voor het
--    scherm: de kaart van de klant kijkt naar `affiliate_status`, en die
--    staat dan op 'applied', dus hij leest "we kijken ernaar" en niet de
--    oude afwijzing. De eigenaar ziet wél waarom hij de vorige keer nee
--    zei.
--
-- 2. DE VIEW `referral_commissions_with_details` MAG GESCHREVEN WORDEN
--
--    Gemeten: `has_table_privilege('authenticated', …, 'insert')` is
--    true, en ook update en delete. Zijn zusterview
--    `referral_links_with_details` heeft dat niet. Vandaag niet uit te
--    buiten -- de view staat op `security_invoker=on` en de basistabel
--    `referral_commissions` heeft geen write-grant aan `authenticated`,
--    dus de schrijf strandt daar -- maar dit is precies de regel uit
--    CLAUDE.md over een `create or replace view` die zijn grants reset.
--
-- 3. DRIE POLICIES STAAN OP `TO PUBLIC`
--
--    `referral_links_select`, `referral_commissions_select` en
--    `affiliate_payouts_select` hebben `polroles = '-'`. `anon` komt er
--    vandaag niet bij, maar alleen omdat de tabel-grant hem tegenhoudt:
--    riem aanwezig, bretel weg. Ze worden opnieuw gemaakt met dezelfde
--    voorwaarde, maar `to authenticated`.
--
-- 4. TIEN TRIGGERFUNCTIES ZIJN UITVOERBAAR DOOR `anon`
--
--    De plaks die ze maakten hadden geen revoke, terwijl elke
--    niet-triggerfunctie in diezelfde bestanden die wél heeft. Ze geven
--    `trigger` terug, dus PostgREST publiceert ze niet en Postgres
--    weigert een directe aanroep -- niet uit te buiten, wel de regel.
--
-- LET OP: BLOK 1 HIERONDER WAS STUK -- ZIE PLAK 127.
--
-- Er stonden per ongeluk TWEE execute regexp_replace() achter elkaar:
-- een eerste die naar een niet-bestaande variabele v_adv_keep verwijst,
-- en daaronder de verbeterde versie. De eerste liep en de tweede vond
-- zijn patroon daarna niet meer, dus de Join-knop viel om op productie.
-- PLAK-DIT-127-HERSTEL-JOIN-KNOP.sql zet het recht. De andere drie
-- blokken van deze plak zijn wel goed gegaan (nagemeten).
--
-- Tekstchirurgie op [[:space:]] en op oid, zodat eerdere plakken blijven
-- staan. Plak dit hele bestand in de SQL editor. Onderaan staat EEN
-- rapporttabel.
-- ════════════════════════════════════════════════════════════════════

create temporary table if not exists _plak124 (
  n integer, stap text, uitkomst text
) on commit preserve rows;
truncate _plak124;

-- ── 1. de afwijzing blijft staan ────────────────────────────────────
do $blk0$
declare
  v_oid  oid;
  v_def  text;
  v_pat  text;
  v_args text;
begin
  select p.oid, pg_get_function_identity_arguments(p.oid)
    into v_oid, v_args
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'affiliate_application_submit'
   limit 1;

  if v_oid is null then
    insert into _plak124 values (0, 'de afwijzing blijft staan',
      'AFGEBROKEN: affiliate_application_submit bestaat niet');
    return;
  end if;

  v_def := pg_get_functiondef(v_oid);

  if position('het besluit blijft staan' in v_def) > 0 then
    insert into _plak124 values (0, 'de afwijzing blijft staan',
      'stond er al -- niets gedaan');
    return;
  end if;

  v_pat :=
    'affiliate_decided_at[[:space:]]*=[[:space:]]*null[[:space:]]*,[[:space:]]*affiliate_refusal_reason[[:space:]]*=[[:space:]]*null';

  if not (v_def ~ v_pat) then
    insert into _plak124 values (0, 'de afwijzing blijft staan',
      'FOUT: de twee null-toekenningen zijn niet herkend -- niets gewijzigd');
    return;
  end if;

  execute regexp_replace(v_def, v_pat,
    'affiliate_decided_at = v_adv_keep.affiliate_decided_at' || chr(10) ||
    '         -- het besluit blijft staan' || chr(10) ||
    '         --' || chr(10) ||
    '         -- Dit zette allebei op null, dus wie was afgewezen wiste' || chr(10) ||
    '         -- met "Apply again" de datum en de reden van de eigenaar.' || chr(10) ||
    '         -- De klant ziet ze niet meer zodra de status weer op' || chr(10) ||
    '         -- applied staat; de eigenaar ziet bij de volgende' || chr(10) ||
    '         -- beoordeling waarom hij de vorige keer nee zei.' || chr(10) ||
    '         , affiliate_refusal_reason = v_adv_keep.affiliate_refusal_reason');

  -- v_adv_keep bestaat niet in de functie; we verwijzen naar de rij
  -- zelf. Postgres staat in een UPDATE toe om de OUDE waarde te lezen
  -- door de kolom onaangeroerd te laten -- dus eenvoudiger: haal de twee
  -- toekenningen gewoon weg.
  execute regexp_replace(pg_get_functiondef(v_oid), v_pat,
    'affiliate_decided_at = affiliate_decided_at' || chr(10) ||
    '         -- het besluit blijft staan' || chr(10) ||
    '         --' || chr(10) ||
    '         -- Dit zette allebei op null, dus wie was afgewezen wiste' || chr(10) ||
    '         -- met "Apply again" de datum en de reden van de eigenaar' || chr(10) ||
    '         -- uit zijn eigen rij. De klant ziet ze niet meer zodra de' || chr(10) ||
    '         -- status weer op applied staat -- de kaart kijkt naar' || chr(10) ||
    '         -- affiliate_status -- maar de eigenaar ziet bij de' || chr(10) ||
    '         -- volgende beoordeling waarom hij de vorige keer nee zei.' || chr(10) ||
    '         , affiliate_refusal_reason = affiliate_refusal_reason');

  execute 'revoke all on function public.affiliate_application_submit('
       || v_args || ') from public, anon';
  execute 'grant execute on function public.affiliate_application_submit('
       || v_args || ') to authenticated, service_role';

  insert into _plak124 values (0, 'de afwijzing blijft staan',
    'opnieuw aanvragen wist de reden en de datum niet meer');
exception when others then
  insert into _plak124 values (0, 'de afwijzing blijft staan',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk0$;

-- ── 2. de view mag alleen gelezen worden ────────────────────────────
do $blk1$
begin
  revoke insert, update, delete, truncate, references, trigger
      on public.referral_commissions_with_details from authenticated;
  revoke all on public.referral_commissions_with_details from anon, public;
  grant select on public.referral_commissions_with_details to authenticated;

  -- De zusterview meteen mee, zodat ze niet opnieuw uit elkaar lopen.
  revoke insert, update, delete, truncate, references, trigger
      on public.referral_links_with_details from authenticated;
  revoke all on public.referral_links_with_details from anon, public;
  grant select on public.referral_links_with_details to authenticated;

  insert into _plak124 values (1, 'de views',
    'alleen select voor authenticated, niets voor anon');
exception when others then
  insert into _plak124 values (1, 'de views', 'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk1$;

-- ── 3. drie policies van PUBLIC naar authenticated ──────────────────
do $blk2$
declare
  r     record;
  v_ex  text;
  v_n   integer := 0;
begin
  for r in
    select c.relname as tbl, p.polname as pol,
           pg_get_expr(p.polqual, p.polrelid) as qual
      from pg_policy p join pg_class c on c.oid = p.polrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and p.polname in ('referral_links_select',
                         'referral_commissions_select',
                         'affiliate_payouts_select')
       and p.polroles = '{0}'::oid[]     -- '-' = PUBLIC
  loop
    v_ex := format(
      'drop policy %I on public.%I; create policy %I on public.%I for select to authenticated using (%s)',
      r.pol, r.tbl, r.pol, r.tbl, r.qual);
    execute v_ex;
    v_n := v_n + 1;
  end loop;

  insert into _plak124 values (2, 'de policies',
    v_n || ' van 3 verplaatst van PUBLIC naar authenticated'
      || case when v_n = 0 then ' (stonden al goed)' else '' end);
exception when others then
  insert into _plak124 values (2, 'de policies', 'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk2$;

-- ── 4. anon van de triggerfuncties af ───────────────────────────────
do $blk3$
declare
  r   record;
  v_n integer := 0;
begin
  for r in
    select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      join pg_type t on t.oid = p.prorettype
     where n.nspname = 'public'
       and t.typname = 'trigger'
       and has_function_privilege('anon', p.oid, 'execute')
  loop
    execute 'revoke all on function public.' || quote_ident(r.proname)
         || '(' || r.args || ') from public, anon';
    execute 'grant execute on function public.' || quote_ident(r.proname)
         || '(' || r.args || ') to service_role';
    v_n := v_n + 1;
  end loop;

  insert into _plak124 values (3, 'de triggerfuncties',
    v_n || ' functie(s) niet meer uitvoerbaar door anon');
exception when others then
  insert into _plak124 values (3, 'de triggerfuncties', 'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk3$;

-- ── controle ────────────────────────────────────────────────────────
do $blk4$
declare
  v_wist   boolean;
  v_view   boolean;
  v_pub    integer;
  v_anonfn integer;
begin
  select position('het besluit blijft staan' in pg_get_functiondef(p.oid)) > 0
    into v_wist
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'affiliate_application_submit';

  select has_table_privilege('authenticated',
           'public.referral_commissions_with_details', 'insert')
    into v_view;

  select count(*) into v_pub
    from pg_policy p join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and p.polname in ('referral_links_select',
                       'referral_commissions_select',
                       'affiliate_payouts_select')
     and p.polroles = '{0}'::oid[];

  select count(*) into v_anonfn
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    join pg_type t on t.oid = p.prorettype
   where n.nspname = 'public' and t.typname = 'trigger'
     and has_function_privilege('anon', p.oid, 'execute');

  insert into _plak124 values (4, 'stand van zaken',
    'afwijzing blijft staan: ' || coalesce(v_wist, false)::text
    || ' | view schrijfbaar: ' || coalesce(v_view, false)::text || ' (moet false)'
    || ' | policies op PUBLIC: ' || v_pub || ' (moet 0)'
    || ' | triggerfuncties voor anon: ' || v_anonfn || ' (moet 0)');
exception when others then
  insert into _plak124 values (4, 'stand van zaken', 'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk4$;

-- ════════════════════════════════════════════════════════════════════
-- HET RAPPORT — de editor toont alleen deze laatste tabel.
-- ════════════════════════════════════════════════════════════════════
select n as "#", stap as "wat", uitkomst as "uitkomst"
  from _plak124 order by n;
