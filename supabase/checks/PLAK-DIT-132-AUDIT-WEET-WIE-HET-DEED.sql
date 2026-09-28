-- ════════════════════════════════════════════════════════════════════
-- PLAK 132 — het auditlog weet weer wie het deed
-- ════════════════════════════════════════════════════════════════════
--
-- De sluitingseis van blok 11, uit docs/LAATSTE_RONDE_A_TOT_Z.md:
--
--   "Geen enkele regel zegt GEEN ACTOR voor iets wat een mens deed."
--
-- Vandaag gemeten, en dat haalt hij niet:
--
--   invoices  UPDATE  63 rijen zonder actor, waaronder VIJF facturen
--             die op 24-09 om 14:43:54 in dezelfde seconde op 'paid'
--             gingen en vier die op 25-09 om 13:52:13 op 'void' gingen
--   tenants   UPDATE  27 rijen zonder actor -- elke instellingenopslag
--   plans     UPDATE  32 rijen zonder actor
--
-- Een factuur op 'void' zetten is geen machinehandeling. Iemand heeft
-- dat gedaan, en het auditlog -- de enige plek waar dat antwoord hoort
-- te staan -- weet niet wie.
--
-- (De 1521 + 356 rijen op `wise_incoming_transfers` horen WEL zonder
-- actor: dat is de bankfeed. Idem `subscriptions` van de nachtrun en de
-- INSERTs op `advertisers` en `wallets` bij het aanmelden. Die blijven
-- zoals ze zijn.)
--
-- DE OORZAAK
--
-- `_audit_row_change` doet `v_uid uuid := auth.uid();` en niets anders.
-- Een service-role client stuurt met opzet GEEN gebruikers-JWT -- dat
-- is precies waarom hij RLS mag omzeilen -- dus er is geen uid om te
-- pakken. Elke bevoorrechte schrijf is daardoor anoniem.
--
-- DE OPLOSSING
--
-- `set local` helpt niet: supabase-js stuurt elke aanroep als een eigen
-- verzoek, dus een GUC uit de ene bereikt de volgende niet. PostgREST
-- zet wél de REQUEST HEADERS klaar als instelling, voor elke statement
-- van dat verzoek. De naam reist dus mee als header `x-psm-actor`, en
-- deze trigger leest hem als `auth.uid()` leeg is.
--
-- `createAdminClient()` hangt die header er sinds vandaag zelf aan --
-- niet elke aanroeper apart, want dan is de ene die het vergeet precies
-- degene die ertoe doet.
--
-- WAAROM DIT GEEN GAT IS
--
-- De header zegt alleen WIE; hij geeft niemand iets extra's. Alleen de
-- service role kan hem zetten, want alleen de server bouwt die client
-- en de sleutel staat niet in de browser. En de trigger geeft
-- `auth.uid()` voorrang: is er een echte sessie, dan telt die en wordt
-- de header genegeerd. Een klant kan dus niet met een header een
-- handeling op andermans naam laten zetten.
--
-- Terugwerkende kracht is er niet: wat er staat blijft staan. Vanaf nu
-- staat er een naam bij.
--
-- Plak dit hele bestand in de SQL editor. Onderaan staat EEN
-- rapporttabel.
-- ════════════════════════════════════════════════════════════════════

create temporary table if not exists _plak132 (
  n integer, stap text, uitkomst text
) on commit preserve rows;
truncate _plak132;

do $blk0$
declare
  v_oid oid;
  v_def text;
  v_pat text;
  v_new text;
begin
  select p.oid into v_oid
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = '_audit_row_change'
   limit 1;

  if v_oid is null then
    insert into _plak132 values (0, 'de actor',
      'AFGEBROKEN: _audit_row_change bestaat niet');
    return;
  end if;

  v_def := pg_get_functiondef(v_oid);

  if position('x-psm-actor' in v_def) > 0 then
    insert into _plak132 values (0, 'de actor', 'stond er al -- niets gedaan');
    return;
  end if;

  v_pat := 'v_uid[[:space:]]+uuid[[:space:]]*:=[[:space:]]*auth\.uid\(\);';

  if not (v_def ~ v_pat) then
    insert into _plak132 values (0, 'de actor',
      'FOUT: de actor-regel is niet herkend -- niets gewijzigd. Stuur me pg_get_functiondef van deze functie.');
    return;
  end if;

  -- auth.uid() blijft voorgaan. De header is de terugval voor een
  -- service-role schrijf, en het hele blok kan niet omvallen: een
  -- onleesbare of ontbrekende header geeft gewoon null, en dan staat
  -- er wat er vandaag ook staat.
  v_new := regexp_replace(v_def, v_pat,
    'v_uid uuid := coalesce(' || chr(10) ||
    '      auth.uid(),' || chr(10) ||
    '      -- Wie het deed, als er geen sessie is. Een service-role' || chr(10) ||
    '      -- client stuurt geen gebruikers-JWT, dus auth.uid() is dan' || chr(10) ||
    '      -- leeg en elke bevoorrechte schrijf was anoniem -- vijf' || chr(10) ||
    '      -- facturen op paid en vier op void, door niemand.' || chr(10) ||
    '      -- createAdminClient() hangt de naam als header mee;' || chr(10) ||
    '      -- PostgREST zet die klaar in request.headers. auth.uid()' || chr(10) ||
    '      -- gaat voor, dus niemand kan met een header iets op' || chr(10) ||
    '      -- andermans naam zetten.' || chr(10) ||
    '      (select nullif(btrim(coalesce(' || chr(10) ||
    '         (current_setting(''request.headers'', true))::json ->> ''x-psm-actor'', '''')), '''')::uuid)' || chr(10) ||
    '    );');

  execute v_new;

  insert into _plak132 values (0, 'de actor',
    'een service-role schrijf draagt nu de naam van wie hem vroeg');
exception when others then
  insert into _plak132 values (0, 'de actor', 'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk0$;

-- ── controle ────────────────────────────────────────────────────────
do $blk1$
declare
  v_ok    boolean;
  v_zonder text;
begin
  select position('x-psm-actor' in pg_get_functiondef(p.oid)) > 0
    into v_ok
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = '_audit_row_change';

  -- Wat er NU zonder actor staat, per tabel. De bankfeed, de nachtrun
  -- en de aanmeldtriggers horen hier thuis; invoices, tenants en plans
  -- niet -- en die horen na vandaag niet meer bij te komen.
  select coalesce(string_agg(x.t || ' ' || x.n, ', ' order by x.n desc), 'geen')
    into v_zonder
    from (
      select ae.table_name as t, count(*) as n
        from public.audit_events ae
       where ae.actor_user_id is null
       group by 1
    ) x;

  insert into _plak132 values (1, 'stand van zaken',
    'trigger leest de header: ' || coalesce(v_ok, false)::text);
  insert into _plak132 values (2, 'zonder actor tot nu toe', left(v_zonder, 400));
exception when others then
  insert into _plak132 values (1, 'stand van zaken', 'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk1$;

-- ════════════════════════════════════════════════════════════════════
-- HET RAPPORT — de editor toont alleen deze laatste tabel.
-- ════════════════════════════════════════════════════════════════════
select n as "#", stap as "wat", uitkomst as "uitkomst"
  from _plak132 order by n;
