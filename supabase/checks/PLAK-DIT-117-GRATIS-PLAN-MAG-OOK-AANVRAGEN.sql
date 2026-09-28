-- ════════════════════════════════════════════════════════════════════
-- PLAK 117 — een klant op een gratis plan mag ook een account aanvragen
-- ════════════════════════════════════════════════════════════════════
--
-- Gelopen op productie, 28-09, met PSM0016 op het NSA-plan (EUR 0, 2
-- inbegrepen accounts, 5%). Het scherm liet hem eindelijk door: "2 of 2
-- included ad accounts left. Your wallet won't be charged." Bevestigd,
-- verstuurd -- en de server weigerde:
--
--     "Ad accounts come with a plan. Start a plan first, then request
--      an account."
--
-- Gemeten in de live functie:
--
--     if not exists (select 1 from public.subscriptions s
--                     where s.advertiser_id = v_adv.id
--                       and s.status = 'active') then
--
-- Dat is de NEGENDE plek vandaag met dezelfde aanname: dat een plan
-- iets is waarvoor je maandelijks betaalt. Een gratis plan krijgt met
-- opzet geen abonnementsrij -- create_subscription_from_invite keert
-- vroeg terug op `v_fee <= 0` -- dus deze test kan voor die klanten
-- nooit slagen. De acht in de app zijn al recht; dit is de laatste, en
-- de enige die er echt toe doet, want dit is degene die het WEIGERT.
--
-- WAT HET WORDT
--
-- Een actief abonnement, OF een planrij waarvan het maandbedrag nul is.
-- Die tweede is precies "hij heeft een plan waar niets voor te innen
-- valt". Een planrij met een bedrag BOVEN nul telt niet: dan hoort er
-- een abonnement te zijn en is de oude test terecht.
--
-- TEKSTCHIRURGIE, GEEN HERSCHRIJVING
--
-- Deze functie draagt fixes van meerdere plakken -- plak 101 haalde er
-- een verzonnen wisselkoers uit, plak 20 telt ad-accounts mee. Een
-- volledige `create or replace` uit een bestand zou die stil terugdraaien
-- (daarom staat er inmiddels een waarschuwing boven plak 20). Dus:
-- alleen deze ene voorwaarde vervangen in de HUIDIGE definitie.
--
-- pg_get_functiondef geeft op deze database CRLF terug, dus er wordt op
-- [[:space:]] gematcht en niet op chr(10). En de functie wordt op oid
-- aangesproken, niet op een signatuur met parameternamen erin.
--
-- Plak dit hele bestand in de SQL editor. Onderaan staat EEN
-- rapporttabel.
-- ════════════════════════════════════════════════════════════════════

create temporary table if not exists _plak117 (
  n integer, stap text, uitkomst text
) on commit preserve rows;
truncate _plak117;

do $blk0$
declare
  v_oid  oid;
  v_def  text;
  v_new  text;
  v_pat  text;
  v_rep  text;
begin
  select p.oid into v_oid
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'ad_account_request_create_paid'
   limit 1;

  if v_oid is null then
    insert into _plak117 values (0, 'voorwaarde',
      'AFGEBROKEN: ad_account_request_create_paid bestaat niet');
    return;
  end if;

  v_def := pg_get_functiondef(v_oid);

  if position('advertiser_plans ap0' in v_def) > 0 then
    insert into _plak117 values (0, 'planpoort',
      'stond er al -- niets gedaan');
    return;
  end if;

  -- Op [[:space:]]+ en niet op letterlijke spaties: de body komt met
  -- CRLF en met inspringing terug.
  v_pat :=
    'if[[:space:]]+not[[:space:]]+exists[[:space:]]*\([[:space:]]*select[[:space:]]+1[[:space:]]+from[[:space:]]+public\.subscriptions[[:space:]]+s[[:space:]]+where[[:space:]]+s\.advertiser_id[[:space:]]*=[[:space:]]*v_adv\.id[[:space:]]+and[[:space:]]+s\.status[[:space:]]*=[[:space:]]*''active''[[:space:]]*\)[[:space:]]+then';

  v_rep :=
    'if not exists (select 1 from public.subscriptions s' || chr(10) ||
    '                  where s.advertiser_id = v_adv.id' || chr(10) ||
    '                    and s.status = ''active'')' || chr(10) ||
    '     -- ...of een plan waar niets voor te innen valt. Een gratis' || chr(10) ||
    '     -- plan krijgt met opzet geen abonnementsrij, dus de test' || chr(10) ||
    '     -- hierboven kan voor die klant nooit slagen. Een planrij met' || chr(10) ||
    '     -- een bedrag BOVEN nul telt niet mee: dan hoort er wel een' || chr(10) ||
    '     -- abonnement te zijn.' || chr(10) ||
    '     and not exists (select 1 from public.advertiser_plans ap0' || chr(10) ||
    '                      where ap0.advertiser_id = v_adv.id' || chr(10) ||
    '                        and coalesce(ap0.monthly_fee, 0) <= 0) then';

  if not (v_def ~ v_pat) then
    insert into _plak117 values (0, 'planpoort',
      'FOUT: de verwachte voorwaarde is niet gevonden in de live definitie -- niets gewijzigd. Stuur me pg_get_functiondef van deze functie.');
    return;
  end if;

  v_new := regexp_replace(v_def, v_pat, v_rep);
  execute v_new;

  -- Postgres geeft EXECUTE aan PUBLIC op een (her)gemaakte functie, en
  -- PUBLIC is inclusief anon. Hoort in hetzelfde blok.
  execute 'revoke all on function public.ad_account_request_create_paid('
       || pg_get_function_identity_arguments(v_oid) || ') from public, anon';
  execute 'grant execute on function public.ad_account_request_create_paid('
       || pg_get_function_identity_arguments(v_oid) || ') to authenticated, service_role';

  insert into _plak117 values (0, 'planpoort',
    'een actief abonnement OF een planrij met maandbedrag 0 komt er nu door');
exception when others then
  insert into _plak117 values (0, 'planpoort',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk0$;

-- ── controle ────────────────────────────────────────────────────────
do $blk1$
declare
  v_ok    boolean;
  v_koers boolean;
  v_anon  boolean;
  v_wie   text;
begin
  select position('advertiser_plans ap0' in pg_get_functiondef(p.oid)) > 0,
         position('0.86' in pg_get_functiondef(p.oid)) > 0,
         has_function_privilege('anon', p.oid, 'execute')
    into v_ok, v_koers, v_anon
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'ad_account_request_create_paid';

  -- Wie hier vandaag door zou komen die dat eerder niet deed.
  select coalesce(string_agg(a.tenant_client_code, ', ' order by a.tenant_client_code), 'niemand')
    into v_wie
    from public.advertisers a
    join public.advertiser_plans ap on ap.advertiser_id = a.id
   where a.tenant_id = (select id from public.tenants where slug = 'prime-scale-media')
     and coalesce(ap.monthly_fee, 0) <= 0
     and not exists (
       select 1 from public.subscriptions s
        where s.advertiser_id = a.id and s.status = 'active'
     );

  insert into _plak117 values (1, 'stand van zaken',
    'planpoort verruimd: ' || coalesce(v_ok, false)::text ||
    ' | verzonnen koers 0.86 terug?: ' || coalesce(v_koers, true)::text ||
    ' (moet false) | anon mag uitvoeren: ' || coalesce(v_anon, false)::text ||
    ' (moet false)');
  insert into _plak117 values (2, 'klanten op een gratis plan die nu door kunnen', v_wie);
exception when others then
  insert into _plak117 values (1, 'stand van zaken',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk1$;

-- ════════════════════════════════════════════════════════════════════
-- HET RAPPORT — de editor toont alleen deze laatste tabel.
-- ════════════════════════════════════════════════════════════════════
select n as "#", stap as "wat", uitkomst as "uitkomst"
  from _plak117 order by n;
