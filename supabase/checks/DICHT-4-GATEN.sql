-- =====================================================================
-- DICHT-4-GATEN — vier functies die meer mochten dan de bedoeling was.
-- =====================================================================
-- HOE DRAAI JE DIT
--   Plakken in de Supabase SQL editor en Run. Geen rol wisselen, geen
--   instelling aanzetten: de editor draait als `postgres`, dat is de
--   eigenaar, en row-level security geldt niet voor die rol. Veilig om
--   twee keer te draaien. De LAATSTE query is het rapport — dat is het
--   enige wat de editor toont, en daar staat per deel in wat er gebeurde.
--
-- WAT HIER MIS IS
--   Postgres geeft EXECUTE op een nieuwe functie standaard aan iedereen,
--   en PostgREST zet elke public functie op /rest/v1/rpc/<naam>. Dus een
--   SECURITY DEFINER functie die vanbinnen niet controleert wie hem
--   aanroept, is een knop die elke ingelogde klant kan indrukken — vanuit
--   de browserconsole, zonder scherm.
--
--   A  create_subscription_from_invite(p_invite_id)
--      Leest de uitnodiging op id, zonder te kijken of hij van de beller
--      is of al gebruikt is, en zet daarna het PLAN van de beller. Het
--      id van je eigen uitnodiging staat in de JSON die je bij het
--      openen van de link krijgt. Dus: een klant wiens top-up-fee of
--      inbegrepen accounts later door jou zijn bijgesteld, kan z'n eigen
--      uitnodiging opnieuw afspelen en de oude voorwaarden terugzetten.
--      Een doorgestuurde uitnodiging met gunstigere voorwaarden werkt
--      ook. Dat is een klant die z'n eigen prijs bepaalt.
--      Hij zoekt de adverteerder bovendien zonder tenant-filter, dus hij
--      kan het plan van iemands account in een ANDERE tenant overschrijven.
--
--   B  ensure_advertiser_and_wallet(p_profile_id)
--      Roept auth.uid() helemaal niet aan. Elke ingelogde gebruiker kan
--      een advertisers- en wallets-rij aanmaken voor een willekeurig
--      profiel in een willekeurige tenant, en krijgt de id's terug.
--
--   C  grant_advertiser_perk / revoke_advertiser_perk
--      Controleren alleen `role = 'admin'` — niet of die admin nog actief
--      is. Een uitgezette admin met een nog geldige sessie kan een
--      permanente abonnementsvrijstelling uitdelen. En elke medewerker-
--      admin kan het ook, terwijl dit gewoon prijs bepalen is.
--
--   D  wallet_precharge_create
--      Staat op admin-niveau, terwijl lib/permissions.ts dit expliciet
--      als SUPER_ADMIN_ONLY beschrijft en z'n twee broertjes
--      (wallet_adjustment_approve en wallet_refund_approve) wél op de
--      eigenaar staan. Elke medewerker-admin kan dus elke wallet met elk
--      bedrag bijschrijven, zonder dat er geld binnen is.
--
-- HOE IK ZE AANPAS
--   Ik lees de functie zoals hij NU op deze database staat, vervang er
--   een exact stukje tekst in, en voer het resultaat uit. Alles wat ik
--   niet noem blijft letterlijk zoals het was. Vind ik het stukje niet,
--   dan verandert er niets en zegt de rapportregel dat.
-- =====================================================================

set search_path = public;

drop table if exists public._psm_run_log;
create table public._psm_run_log (nr int, deel text, uitkomst text);

create or replace function public._log(p_nr int, p_deel text, p_uit text)
returns void language sql as $logfn$
  insert into public._psm_run_log(nr, deel, uitkomst) values (p_nr, p_deel, p_uit);
$logfn$;


-- ── A · de uitnodiging moet van jou zijn ─────────────────────────────
-- Drie wijzigingen, alle drie kleine tekstvervangingen:
--   1  de adverteerder wordt met tenant-filter gezocht;
--   2  de beller moet het e-mailadres van de uitnodiging hebben (de
--      service-key, waarmee de aanmeldroute draait, heeft auth.uid()
--      null en gaat er dus langs);
--   3  het plan wordt niet meer OVERSCHREVEN. Deze functie bestaat om
--      een plan te ZETTEN bij aanmelden; staat er al een, dan is dat de
--      afspraak die geldt.
do $a$
declare
  v_def text;
  v_new text;
  v_n   int := 0;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'create_subscription_from_invite'
     and p.prokind = 'f';
  if v_def is null then
    perform public._log(1, 'A uitnodiging kan niet meer opnieuw afgespeeld worden',
      'OVERGESLAGEN: functie bestaat niet');
    return;
  end if;
  v_new := v_def;

  -- 1 · tenant-filter op de adverteerder
  if position('select * into v_adv from public.advertisers where user_id = v_uid and tenant_id = v_inv.tenant_id' in v_new) = 0
     and position('select * into v_adv from public.advertisers where user_id = v_uid' in v_new) > 0 then
    v_new := replace(v_new,
      'select * into v_adv from public.advertisers where user_id = v_uid',
      'select * into v_adv from public.advertisers where user_id = v_uid and tenant_id = v_inv.tenant_id');
    v_n := v_n + 1;
  end if;

  -- 2 · de beller moet de genodigde zijn
  if position('MOET DE GENODIGDE ZIJN' in v_new) = 0 then
    v_new := replace(v_new,
      '  if not found then return; end if;
' || chr(10) || '  v_cur := upper(coalesce(v_inv.plan_currency, ''EUR''));',
      '  if not found then return; end if;

  -- MOET DE GENODIGDE ZIJN. Zonder dit leest deze functie een
  -- willekeurige uitnodiging op id en zet hem op de beller. Het id van
  -- je eigen uitnodiging krijg je van get_invite_by_token, dus iedereen
  -- kan z''n eigen voorwaarden opnieuw toepassen -- of die van een
  -- doorgestuurde uitnodiging. auth.uid() is null voor de service-key,
  -- waarmee de aanmeldroute draait, dus die gaat er langs.
  if v_uid is not null and not exists (
    select 1 from public.user_profiles up
     where up.user_id = v_uid
       and lower(coalesce(up.email, '''')) = lower(coalesce(v_inv.email, ''*''))
  ) then
    raise exception ''Forbidden'' using errcode = ''42501'';
  end if;

  v_cur := upper(coalesce(v_inv.plan_currency, ''EUR''));');
    if position('MOET DE GENODIGDE ZIJN' in v_new) > 0 then
      v_n := v_n + 1;
    end if;
  end if;

  -- 3 · een bestaand plan wordt niet overschreven
  if position('on conflict (advertiser_id) do update' in v_new) > 0 then
    v_new := regexp_replace(
      v_new,
      'on conflict \(advertiser_id\) do update[\s\S]*?updated_at\s*=\s*now\(\);',
      'on conflict (advertiser_id) do nothing;',
      'g');
    v_n := v_n + 1;
  end if;

  if v_n = 0 then
    perform public._log(1, 'A uitnodiging kan niet meer opnieuw afgespeeld worden',
      'AL GOED: niets te vervangen — waarschijnlijk al gedaan');
    return;
  end if;

  execute v_new;
  perform public._log(1, 'A uitnodiging kan niet meer opnieuw afgespeeld worden',
    format('GELUKT: %s van 3 wijzigingen toegepast (tenant-filter, genodigde-check, plan niet overschrijven)', v_n));
exception when others then
  perform public._log(1, 'A uitnodiging kan niet meer opnieuw afgespeeld worden', 'FOUT: ' || sqlerrm);
end;
$a$;


-- ── B · een profiel opstarten dat niet van jou is ────────────────────
do $b$
declare v_def text; v_new text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'ensure_advertiser_and_wallet'
     and p.prokind = 'f';
  if v_def is null then
    perform public._log(2, 'B advertiser/wallet alleen voor je eigen profiel',
      'OVERGESLAGEN: functie bestaat niet');
    return;
  end if;
  if position('ALLEEN JE EIGEN PROFIEL' in v_def) > 0 then
    perform public._log(2, 'B advertiser/wallet alleen voor je eigen profiel', 'AL GOED');
    return;
  end if;
  if position('raise exception ''Profile not found'' using errcode = ''42704'';' in v_def) = 0 then
    perform public._log(2, 'B advertiser/wallet alleen voor je eigen profiel',
      'OVERGESLAGEN: de functie ziet er anders uit dan verwacht — stuur me de body');
    return;
  end if;

  v_new := replace(v_def,
    'raise exception ''Profile not found'' using errcode = ''42704'';
  end if;',
    'raise exception ''Profile not found'' using errcode = ''42704'';
  end if;

  -- ALLEEN JE EIGEN PROFIEL. Deze functie riep auth.uid() helemaal niet
  -- aan, dus elke ingelogde gebruiker kon een advertisers- en
  -- wallets-rij aanmaken voor een willekeurig profiel in een
  -- willekeurige tenant, en kreeg de id''s terug. De aanmeldroute draait
  -- met de service-key (auth.uid() null) en gaat er dus langs.
  if auth.uid() is not null and v_profile.user_id <> auth.uid() then
    raise exception ''Forbidden'' using errcode = ''42501'';
  end if;');

  execute v_new;
  perform public._log(2, 'B advertiser/wallet alleen voor je eigen profiel',
    'GELUKT: een ander profiel opstarten wordt geweigerd');
exception when others then
  perform public._log(2, 'B advertiser/wallet alleen voor je eigen profiel', 'FOUT: ' || sqlerrm);
end;
$b$;


-- ── C · een uitgezette admin deelt geen vrijstellingen uit ───────────
do $c$
declare
  r record;
  v_def text;
  v_new text;
  v_done text := '';
  v_zoek text := 'where up.user_id = v_uid and up.tenant_id = v_adv.tenant_id and up.role = ''admin''';
  v_zoek2 text := 'where up.user_id = v_uid and up.tenant_id = v_tenant and up.role = ''admin''';
begin
  for r in
    select p.oid, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
       and p.proname in ('grant_advertiser_perk', 'revoke_advertiser_perk')
  loop
    v_def := pg_get_functiondef(r.oid);
    v_new := v_def;
    -- Uitgezet houdt de rol en verliest de toegang. Beide kolommen
    -- worden gebruikt om iemand uit te zetten, dus beide.
    v_new := replace(v_new, v_zoek,
      v_zoek || ' and coalesce(up.is_active, true) = true and coalesce(up.status, ''active'') <> ''inactive''');
    v_new := replace(v_new, v_zoek2,
      v_zoek2 || ' and coalesce(up.is_active, true) = true and coalesce(up.status, ''active'') <> ''inactive''');
    if v_new = v_def then
      v_done := v_done || r.proname || ': al goed of anders geschreven. ';
    else
      execute v_new;
      v_done := v_done || r.proname || ': dicht. ';
    end if;
  end loop;
  perform public._log(3, 'C perks niet meer door een uitgezette admin',
    case when v_done = '' then 'OVERGESLAGEN: geen van beide functies bestaat'
         else 'GELUKT: ' || v_done end);
exception when others then
  perform public._log(3, 'C perks niet meer door een uitgezette admin', 'FOUT: ' || sqlerrm);
end;
$c$;


-- ── D · voorschot is een beslissing van de eigenaar ──────────────────
-- _require_profile('admin') -> ('super_admin') zou ik moeten raden; in
-- plaats daarvan zet ik de eigenaar-check ernaast, in dezelfde vorm als
-- wallet_adjustment_approve en wallet_refund_approve die al hebben.
do $d$
declare v_def text; v_new text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'wallet_precharge_create'
     and p.prokind = 'f';
  if v_def is null then
    perform public._log(4, 'D voorschot alleen door de eigenaar',
      'OVERGESLAGEN: functie bestaat niet');
    return;
  end if;
  if position('ALLEEN DE EIGENAAR' in v_def) > 0 then
    perform public._log(4, 'D voorschot alleen door de eigenaar', 'AL GOED');
    return;
  end if;
  if position('select * into v_admin from public._require_profile(''admin'');' in v_def) = 0 then
    perform public._log(4, 'D voorschot alleen door de eigenaar',
      'OVERGESLAGEN: de guard ziet er anders uit — stuur me de body');
    return;
  end if;

  v_new := replace(v_def,
    'select * into v_admin from public._require_profile(''admin'');',
    'select * into v_admin from public._require_profile(''admin'');

  -- ALLEEN DE EIGENAAR. Een voorschot zet geld op een wallet voordat er
  -- geld binnen is; lib/permissions.ts noemt dat SUPER_ADMIN_ONLY en de
  -- twee broertjes (wallet_adjustment_approve, wallet_refund_approve)
  -- staan er al op. Dit stond op admin-niveau, dus elke
  -- medewerker-admin kon elke wallet met elk bedrag bijschrijven.
  if auth.uid() is not null and not exists (
    select 1 from public.tenants t
     where t.id = v_admin.tenant_id
       and t.owner_id = auth.uid()
  ) then
    raise exception ''Only the account owner can advance credit''
      using errcode = ''42501'';
  end if;');

  execute v_new;
  perform public._log(4, 'D voorschot alleen door de eigenaar',
    'GELUKT: een medewerker-admin kan geen voorschot meer geven');
exception when others then
  perform public._log(4, 'D voorschot alleen door de eigenaar', 'FOUT: ' || sqlerrm);
end;
$d$;


-- ── HET RAPPORT ──────────────────────────────────────────────────────
select nr as "#", deel as "wat", uitkomst as "resultaat"
  from public._psm_run_log
 order by nr;
