-- ════════════════════════════════════════════════════════════════════
-- PLAK 110 — het tarief van de klant: RockAds naar 4%, en het gat
--            waardoor een eigen top-up 0% kon kosten
-- ════════════════════════════════════════════════════════════════════
--
-- De eigenaar, 27-09: "op RA moeten we eig 4% chargen voor klanten ipv
-- 3% wat hun acc zegt", en even later: "soms heeft iemand hk geven we
-- hem 3% fee bijv en soms eu ra geven we hem 4% fee bijv dat die moet
-- betalen."
--
-- Het tarief hangt dus aan het TYPE account, niet aan de klant alleen.
-- Dezelfde klant kan op 3% zitten voor Hong Kong en op 4% voor EU
-- RockAds. Dat model klopt al -- ad_account_types.default_fee_pct is per
-- type -- maar twee dingen eromheen niet.
--
-- EERST HET GOEDE NIEUWS OVER PSM0004
--
-- Er is niets mis met zijn rij. PSM0004 heeft nog GEEN ad-account. Wat
-- op het scherm stond was het aanmaakformulier halverwege het typen, en
-- daar schreef de standaard van het type over zijn plantarief heen. Dat
-- is een fout in de voorvulling, niet in de database, en die is
-- inmiddels gefixt in de app: het formulier stelt nu de HOOGSTE van de
-- twee voor en noemt allebei de getallen, zodat de balie ziet waartussen
-- ze kiest in plaats van dat het stil voor ze wordt beslist.
--
-- Geen van de vijf bestaande ad-accounts is te laag geprijsd: PSM0005 en
-- PSM0007 hebben een plantarief van 3,00 en staan op 3,00; PSM0002 en
-- PSM0011 hebben geen plan en staan op de typestandaard.
--
-- Deze plak doet de twee dingen die WEL in de database moeten.
--
-- ── 1. ROCKADS NAAR 4% ──────────────────────────────────────────────
--
-- Het type Meta-EU-PSM-RA (slug eu-meta-psm) staat op 3,00. Naar 4,00.
-- Hong Kong blijft 3,00 -- precies het onderscheid dat u beschrijft.
--
-- Dit kan ook met de hand, in Settings -> Ad account types; het staat
-- hier omdat u toch al een plak plakt.
--
-- Het raakt NIEUWE accounts. Bestaande accounts houden hun eigen `fee`
-- -- met opzet, want een tarief dat met een klant is afgesproken verhoog
-- ik niet vanuit een plak. Blok 3 laat zien wie er nu op welk tarief
-- staat, zodat u per klant kunt beslissen. Het VERANDERT die rijen niet.
--
-- ── 2. HET GAT: EEN EIGEN TOP-UP KON 0% KOSTEN ──────────────────────
--
-- `_effective_topup_fee_pct` is de functie achter de top-up die de KLANT
-- zelf indient. Gemeten op deze database, de laatste tak:
--
--     if v_acct_fee is not null and v_acct_fee > 0 then ...
--     elsif v_plan_pct is not null then ...
--     else v_base := 0;          <-- hier
--
-- De TypeScript-kant (resolveEffectiveFeePct) heeft daar een derde trap:
-- de standaard van het ad-accounttype. Deze functie niet. Dus voor een
-- account met fee 0 en een klant zonder plantarief rekent een
-- door-de-balie-ingevoerde top-up de typestandaard, en dezelfde top-up
-- door de klant zelf ingevoerd rekent NUL. Zelfde account, twee prijzen,
-- afhankelijk van wie op de knop drukt.
--
-- En het is juist die derde trap die uw "4% op RA" bij de klant brengt.
-- Zonder hem heeft het verhogen van de typestandaard geen enkel effect
-- op de kant waar de klant zelf op de knop drukt.
--
-- Vandaag staan alle vijf de ad-accounts op fee 3,00, dus trap 1 vangt
-- ze allemaal op en er is nu geen klant die 0% betaalt. Het gat gaat
-- open zodra er een account met fee 0 ontstaat.
--
-- Wat hieronder gebeurt: trap 3 erbij, en als die er OOK niet is,
-- WEIGEREN in plaats van 0 rekenen. "Een fee die we niet gekregen hebben
-- is een weigering, geen standaard" -- de regel die
-- assignSupplierAdAccount al aanhoudt. Een weigering wordt opgemerkt en
-- gerepareerd; een stille 0 rekent voor eeuwig niets.
--
-- Een kwijtschelding blijft een echte 0 en gaat gewoon door.
--
-- De revoke staat in HETZELFDE blok als de create or replace, want
-- Postgres geeft EXECUTE aan PUBLIC op een nieuwe functie en PUBLIC is
-- inclusief anon. Dat is de regel uit CLAUDE.md.
--
-- Plak dit hele bestand in de SQL editor. Onderaan staat EEN
-- rapporttabel.
-- ════════════════════════════════════════════════════════════════════

create temporary table if not exists _plak110 (
  n integer, stap text, uitkomst text
) on commit preserve rows;
truncate _plak110;

-- ── 1. RockAds naar 4% ──────────────────────────────────────────────
do $blk0$
declare
  v_oud text;
  v_n   integer;
begin
  select coalesce(string_agg(label || ' = ' || default_fee_pct::text, ', '), 'geen')
    into v_oud
    from public.ad_account_types
   where slug = 'eu-meta-psm'
     and tenant_id = (select id from public.tenants where slug = 'prime-scale-media');

  update public.ad_account_types
     set default_fee_pct = 4.00,
         updated_at = now()
   where slug = 'eu-meta-psm'
     and tenant_id = (select id from public.tenants where slug = 'prime-scale-media')
     and default_fee_pct is distinct from 4.00;
  get diagnostics v_n = row_count;

  insert into _plak110 values (1, 'RockAds-tarief voor nieuwe accounts',
    'was: ' || v_oud || ' | nu 4.00 | rijen gewijzigd: ' || v_n);
exception when others then
  insert into _plak110 values (1, 'RockAds-tarief voor nieuwe accounts',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk0$;

-- ── 2. de derde trap in de fee-functie van de klant ─────────────────
do $blk1$
begin
  create or replace function public._effective_topup_fee_pct(
    p_advertiser_id uuid,
    p_ad_account_id uuid
  )
  returns numeric
  language plpgsql
  stable
  security definer
  set search_path to 'public'
  as $fn$
  declare
    v_acct_fee   numeric;
    v_platform   text;
    v_tenant     uuid;
    v_is_premium boolean := false;
    v_plan_pct   numeric;
    v_type_pct   numeric;
    v_base       numeric;
    v_waiver     boolean := false;
    v_discount   numeric := 0;
    v_premium    numeric := 0;
    v_pct        numeric;
    v_key        text;
  begin
    select aa.fee, aa.platform, aa.tenant_id
      into v_acct_fee, v_platform, v_tenant
      from public.ad_accounts aa
     where aa.id = p_ad_account_id;

    -- Gesorteerde woorden, niet een gelijkteken. Het settings-scherm
    -- slugt een type uit zijn label, dus "Meta-EU-Premium" ligt
    -- opgeslagen als meta-eu-premium terwijl de seed eu-meta-premium
    -- schrijft. Zie lib/pure-slug-key.
    v_key := (
      select coalesce(string_agg(w, '-' order by w), '')
        from unnest(string_to_array(lower(coalesce(v_platform, '')), '-')) w
       where w <> ''
    );
    v_is_premium := (v_key = 'eu-meta-premium');

    -- Een plan dat er niet is, is geen fout. Een tabel die er niet is
    -- ook niet -- die komt met een migratie mee.
    begin
      select p.topup_fee_pct into v_plan_pct
        from public.advertiser_plans p
       where p.advertiser_id = p_advertiser_id
       limit 1;
    exception when undefined_table or undefined_column then
      v_plan_pct := null;
    end;

    -- DE DERDE TRAP, DIE HIER ONTBRAK. Zelfde volgorde als
    -- resolveEffectiveFeePct in actions/topup-actions.ts. Op dezelfde
    -- gesorteerde sleutel gematcht als de premium-test hierboven, zodat
    -- een geslugd label ook gevonden wordt; een exacte slug wint.
    begin
      select t.default_fee_pct into v_type_pct
        from public.ad_account_types t
       where t.tenant_id = v_tenant
         and (
           t.slug = v_platform
           or (
             select coalesce(string_agg(w, '-' order by w), '')
               from unnest(string_to_array(lower(coalesce(t.slug, '')), '-')) w
              where w <> ''
           ) = v_key
         )
       order by (t.slug = v_platform) desc
       limit 1;
    exception when undefined_table or undefined_column then
      v_type_pct := null;
    end;

    begin
      select
        bool_or(pk.kind = 'topup_fee_waiver'),
        coalesce(max(case when pk.kind = 'topup_discount'
                          then coalesce(pk.amount, 0) else 0 end), 0)
        into v_waiver, v_discount
        from public.advertiser_perks pk
       where pk.advertiser_id = p_advertiser_id
         and pk.active
         and pk.kind in ('topup_fee_waiver', 'topup_discount')
         and (pk.starts_at is null or pk.starts_at <= now())
         and (pk.expires_at is null or pk.expires_at > now());
    exception when undefined_table or undefined_column then
      v_waiver := false;
      v_discount := 0;
    end;

    v_waiver := coalesce(v_waiver, false);
    v_discount := coalesce(v_discount, 0);
    v_premium := case when v_is_premium then 2 else 0 end;

    -- Account wint van plan, plan wint van de typestandaard. Alleen een
    -- fee > 0 telt als "heeft een eigen tarief" -- 0 betekent overal in
    -- deze app "niet ingesteld".
    if v_acct_fee is not null and v_acct_fee > 0 then
      v_base := v_acct_fee;
    elsif v_plan_pct is not null and v_plan_pct > 0 then
      v_base := v_plan_pct;
    elsif v_type_pct is not null and v_type_pct > 0 then
      v_base := v_type_pct;
    else
      -- GEEN STILLE NUL. Een kwijtschelding is een echte 0 en die komt
      -- hier langs; verder weten we het gewoon niet, en dan is doorgaan
      -- met 0 voor eeuwig gratis werken zonder dat iemand het ziet.
      if v_waiver then
        return 0;
      end if;
      raise exception
        'Er is geen top-up fee ingesteld voor dit ad-account. Zet een fee op het account, op het plan van de klant, of op het accounttype.'
        using errcode = '22000';
    end if;

    -- PROCENT ERAF, GEEN PROCENTPUNTEN. Het promotiescherm zegt "Top-up
    -- fee discount (%)". Puntenaftrek zou 20% korting op een 5%-account
    -- 0% opleveren: een top-up van EUR 10.000 die niets int. De twee
    -- premium-punten blijven wel een aftrek.
    v_pct := v_base * (1 - least(greatest(v_discount, 0), 100) / 100.0);
    if v_waiver then
      v_pct := 0;
    else
      v_pct := greatest(0, v_pct - v_premium);
    end if;

    return round(v_pct, 3);
  end;
  $fn$;

  -- Hoort in HETZELFDE blok als de create or replace: Postgres geeft
  -- EXECUTE aan PUBLIC op een nieuwe functie, en PUBLIC is inclusief
  -- anon -- de rol achter de publieke sleutel in de browserbundel.
  revoke all on function public._effective_topup_fee_pct(uuid, uuid)
    from public, anon;
  grant execute on function public._effective_topup_fee_pct(uuid, uuid)
    to authenticated, service_role;

  insert into _plak110 values (2, 'fee-functie van de klant',
    'derde trap erbij (typestandaard); geen stille 0 meer; rechten dicht voor anon');
exception when others then
  insert into _plak110 values (2, 'fee-functie van de klant',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk1$;

-- ── 3. wie staat er nu op welk tarief (ALLEEN LEZEN) ────────────────
--     Dit verandert NIETS. Een tarief dat met een klant is afgesproken
--     verhoog ik niet vanuit een plak -- dat is uw beslissing, en er
--     hoort meestal een bericht aan de klant bij.
do $blk2$
declare v text;
begin
  select coalesce(string_agg(
           coalesce(a.tenant_client_code, '?') || ' ' || coalesce(aa.name, '?') ||
           ': nu ' || coalesce(aa.fee::text, '-') ||
           ', plan ' || coalesce(ap.topup_fee_pct::text, 'geen') ||
           ', type ' || coalesce(t.default_fee_pct::text, 'geen'),
           ' | ' order by a.tenant_client_code), 'geen accounts')
    into v
    from public.ad_accounts aa
    left join public.advertisers a on a.id = aa.advertiser_id
    left join public.advertiser_plans ap on ap.advertiser_id = aa.advertiser_id
    left join public.ad_account_types t
           on t.tenant_id = aa.tenant_id and t.slug = aa.platform
   where aa.tenant_id = (select id from public.tenants where slug = 'prime-scale-media');

  insert into _plak110 values (3, 'bestaande accounts (NIET gewijzigd)', v);
exception when others then
  insert into _plak110 values (3, 'bestaande accounts (NIET gewijzigd)',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk2$;

-- ── controle ────────────────────────────────────────────────────────
do $blk3$
declare
  v_tar   text;
  v_nul   boolean;
  v_anon  boolean;
begin
  select coalesce(string_agg(label || ' = ' || default_fee_pct::text, ', '
           order by label), 'geen')
    into v_tar
    from public.ad_account_types
   where is_active
     and tenant_id = (select id from public.tenants where slug = 'prime-scale-media');

  select position('v_base := 0' in pg_get_functiondef(p.oid)) > 0
    into v_nul
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = '_effective_topup_fee_pct';

  select has_function_privilege('anon', p.oid, 'execute')
    into v_anon
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = '_effective_topup_fee_pct';

  insert into _plak110 values (4, 'actieve typen en hun tarief', v_tar);
  insert into _plak110 values (5, 'stand van zaken',
    'stille nul weg: ' || (not coalesce(v_nul, true))::text || ' (moet true)' ||
    ' | anon mag uitvoeren: ' || coalesce(v_anon, false)::text || ' (moet false)');
exception when others then
  insert into _plak110 values (4, 'stand van zaken',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk3$;

-- ════════════════════════════════════════════════════════════════════
-- HET RAPPORT — de editor toont alleen deze laatste tabel.
-- ════════════════════════════════════════════════════════════════════
select n as "#", stap as "wat", uitkomst as "uitkomst"
  from _plak110 order by n;
