-- =====================================================================
-- ALLES IN 2. Wat ronde 9 vond en alleen in SQL te repareren is.
-- =====================================================================
-- Draai ALLES-IN-1.sql eerst als dat nog niet gebeurd is. Deze bouwt
-- daar niet op voort, maar de dingen daarin zijn urgenter.
--
-- Zelfde regels als het vorige bestand: veilig om twee keer te draaien,
-- elk deel kijkt eerst, elk deel dat de vorm niet herkent WEIGERT en
-- zegt het, elke dollar-quote heeft een naam, en alle leesvragen staan
-- achteraan.
--
-- WAT ER IN ZIT
--   DEEL 1  Een UITGEZETTE klant wordt nog steeds geïncasseerd — en als
--           die incasso lukt, zet het abonnement zichzelf weer op
--           ACTIEF. Dan loopt de facturatie gewoon maandelijks door voor
--           iemand die niet eens kan inloggen.
--   DEEL 2  Een GEANNULEERD voorschot blokkeert voor altijd een nieuw
--           voorschot op diezelfde storting.
--   DEEL 3  Een voorschot afwikkelen kan een wallet onder nul duwen. De
--           annuleer-kant weigert dat netjes; afwikkelen niet, en dat is
--           de primaire knop.
--   DEEL 4  Er is geen limiet op openstaande withdrawal-aanvragen. Twee
--           keer hetzelfde saldo aanvragen wordt twee keer goedgekeurd.
--   DEEL 5  Drie tabellen zonder audit-trigger, en een perk intrekken
--           legt nergens vast wie dat deed.
--   DEEL 6  Een gedeactiveerde admin kan nog steeds een perk geven of
--           intrekken — de vorige sweep noemde deze twee RPCs met naam
--           als bewust overgeslagen.
--
-- Daarna: alleen lezen.
-- =====================================================================

set search_path = public;


-- =====================================================================
-- DEEL 1 — UITGEZET, EN TOCH GEINCASSEERD
-- =====================================================================
-- Wat er nu gebeurt als je op "Deactivate" drukt:
--
--   1. elk abonnement van die klant gaat naar 'inactive'
--   2. de FACTUURLUS slaat ze over (die filtert op 'active','past_due')
--   3. de INCASSOLUS slaat ze NIET over: die filtert alleen op
--      `s.status <> 'cancelled'`. Een al verstuurde factuur wordt dus
--      gewoon van de wallet afgeschreven op de vervaldatum.
--   4. en als die afschrijving LUKT, zet de trigger op een betaalde
--      factuur de status terug naar 'active' en schuift de periode een
--      maand op. Vanaf dan draait de facturatie weer maandelijks — voor
--      iemand die niet kan inloggen om het te zien of te stoppen.
--
-- Niets in de app schrijft ooit 'cancelled'. De enige status die de
-- facturatie als definitief behandelt, is vanuit het scherm onbereikbaar.
--
-- Dit maakt 'inactive' en 'paused' ook definitief voor de incasso, en
-- laat de trigger een abonnement dat niet actief was met rust.
do $blk1$
declare
  v_src text;
  v_new text;
begin
  -- ── 1a. de incassolus ─────────────────────────────────────────────
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'subscription_billing_run'
   limit 1;

  if v_src is null then
    raise notice 'DEEL 1: subscription_billing_run bestaat hier niet.';
  elsif position('s.status not in (''cancelled'', ''inactive'', ''paused'')' in v_src) > 0 then
    raise notice 'DEEL 1a: de incassolus slaat een uitgezet abonnement al over.';
  elsif position('and s.status <> ''cancelled''' in v_src) = 0 then
    raise warning 'DEEL 1a: de incassolus ziet er anders uit dan verwacht - niets gedaan, zie leesvraag A.';
  else
    v_new := replace(
      v_src,
      'and s.status <> ''cancelled''',
      'and s.status not in (''cancelled'', ''inactive'', ''paused'')'
    );
    if v_new = v_src then
      raise exception 'DEEL 1a: replace raakte niets - ga er niet vanuit dat dit gelopen heeft.';
    end if;
    execute v_new;
    raise notice 'DEEL 1a: een uitgezet of gepauzeerd abonnement wordt niet meer geincasseerd.';
  end if;
end;
$blk1$;

do $blk2$
declare
  v_src text;
  v_new text;
  v_fn  text;
begin
  -- ── 1b. de trigger die het weer aanzet ────────────────────────────
  -- `case when status = 'cancelled' then status else 'active' end` zet
  -- ALLES behalve cancelled op actief - dus ook inactive en paused.
  select p.proname into v_fn
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and position('when status = ''cancelled'' then status else ''active''' in pg_get_functiondef(p.oid)) > 0
   limit 1;

  if v_fn is null then
    raise notice 'DEEL 1b: geen functie met die case-expressie gevonden - zie leesvraag A.';
    return;
  end if;

  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = v_fn
   limit 1;

  v_new := replace(
    v_src,
    'when status = ''cancelled'' then status else ''active''',
    'when status in (''cancelled'', ''inactive'', ''paused'') then status else ''active'''
  );
  if v_new = v_src then
    raise exception 'DEEL 1b: replace raakte niets.';
  end if;
  execute v_new;
  raise notice 'DEEL 1b: % zet een uitgezet abonnement niet meer terug op actief.', v_fn;
end;
$blk2$;


-- =====================================================================
-- DEEL 2 — EEN GEANNULEERD VOORSCHOT BLOKKEERT VOOR ALTIJD
-- =====================================================================
-- De unieke index staat op source_wallet_topup_id zonder naar de status
-- te kijken, terwijl de controle in de functie alleen op 'outstanding'
-- kijkt. Dus: voorschot gegeven, daarna geannuleerd (slip klopte niet),
-- klant legt het uit, admin drukt opnieuw op Precharge -> de controle
-- laat het door, de INSERT knalt op de index, en de toast leest
-- "duplicate key value violates unique constraint". Er is geen weg meer
-- vooruit voor die storting.
--
-- Partieel, op status: een LOPEND voorschot per storting blijft
-- onmogelijk om te verdubbelen, een afgewikkeld of geannuleerd voorschot
-- staat een nieuw voorschot niet meer in de weg.
do $blk3$
declare
  v_idx text;
begin
  if to_regclass('public.wallet_precharges') is null then
    raise notice 'DEEL 2: wallet_precharges bestaat hier niet.';
    return;
  end if;

  select i.indexname into v_idx
    from pg_indexes i
   where i.schemaname = 'public'
     and i.tablename = 'wallet_precharges'
     and i.indexdef ilike '%source_wallet_topup_id%'
     and i.indexdef ilike '%unique%'
     and i.indexdef not ilike '%status%'
   limit 1;

  if v_idx is null then
    raise notice 'DEEL 2: geen status-loze unieke index gevonden - waarschijnlijk al goed.';
    return;
  end if;

  execute format('drop index if exists public.%I', v_idx);
  create unique index if not exists wallet_precharges_open_source_uq
    on public.wallet_precharges (source_wallet_topup_id)
    where source_wallet_topup_id is not null and status = 'outstanding';

  raise notice 'DEEL 2: % vervangen - alleen een LOPEND voorschot blokkeert nog.', v_idx;
end;
$blk3$;


-- =====================================================================
-- DEEL 3 — AFWIKKELEN KAN EEN WALLET ONDER NUL DUWEN
-- =====================================================================
-- wallet_precharge_cancel weigert netjes en noemt het tekort.
-- wallet_precharge_settle heeft geen enkele ondergrens - en Settle is de
-- primaire knop op dat scherm. Scenario: vrij voorschot van 1.000 aan
-- iemand zonder openstaande storting (dat mag, met opzet), klant stort
-- daarna 1.000 en die wordt geverifieerd -> wallet 2.000, voorschot nog
-- open. De klant kan 2.000 uitgeven terwijl hij 1.000 betaald heeft, en
-- als het voorschot daarna wordt afgewikkeld gaat de wallet negatief.
do $blk4$
declare
  v_src text;
  v_new text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'wallet_precharge_settle'
   limit 1;

  if v_src is null then
    raise notice 'DEEL 3: wallet_precharge_settle bestaat hier niet.';
    return;
  end if;
  if position('would push the wallet below zero' in v_src) > 0 then
    raise notice 'DEEL 3: de ondergrens staat er al.';
    return;
  end if;
  raise warning 'DEEL 3: deze functie herschrijf ik niet blind - het is de enige weg om een voorschot af te sluiten en hem stukmaken is erger dan het gat. Zie leesvraag B: die drukt de body af, dan doe ik het exact.';
end;
$blk4$;


-- =====================================================================
-- DEEL 4 — GEEN LIMIET OP OPENSTAANDE WITHDRAWALS
-- =====================================================================
-- wallet_topups en ad_account_requests hebben allebei een
-- _cap_pending_* trigger. ad_account_withdrawals niet. De functie zegt
-- het zelf: "no balance check (admin gate)". Een klant kan hetzelfde
-- saldo twee keer aanvragen; het goedkeurscherm toont noch het saldo van
-- de advertentierekening, noch de andere openstaande aanvraag, en beide
-- goedkeuringen crediteren de wallet.
--
-- Dit is geen saldocontrole (die hoort bij de goedkeuring), het is een
-- rem op de wachtrij - dezelfde als de twee tabellen ernaast.
do $blk5$
begin
  if to_regclass('public.ad_account_withdrawals') is null then
    raise notice 'DEEL 4: ad_account_withdrawals bestaat hier niet.';
    return;
  end if;

  create or replace function public._cap_pending_withdrawals()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
  as $inner$
  declare
    v_open int;
  begin
    if new.status is distinct from 'pending' then
      return new;
    end if;
    select count(*) into v_open
      from public.ad_account_withdrawals w
     where w.ad_account_id = new.ad_account_id
       and w.status = 'pending';
    if v_open >= 3 then
      raise exception 'There are already % withdrawal requests waiting on this ad account. Wait for those to be reviewed first.', v_open
        using errcode = '22000';
    end if;
    return new;
  end;
  $inner$;

  drop trigger if exists trg_cap_pending_withdrawals on public.ad_account_withdrawals;
  create trigger trg_cap_pending_withdrawals
    before insert on public.ad_account_withdrawals
    for each row execute function public._cap_pending_withdrawals();

  raise notice 'DEEL 4: maximaal 3 openstaande withdrawal-aanvragen per advertentierekening.';
end;
$blk5$;


-- =====================================================================
-- DEEL 5 — DRIE TABELLEN ZONDER AUDIT-SPOOR
-- =====================================================================
-- De regel in CLAUDE.md is dat elke zakelijke wijziging uit audit_events
-- te reconstrueren is. Deze drie staan niet in de lijst - ze zijn
-- allemaal NA de audit-migratie gemaakt, en de `if exists` in die lus
-- sloeg ze stilletjes over.
--
-- En er is er een die extra pijn doet: een perk INTREKKEN zet alleen
-- active = false. De tabel heeft created_by maar geen revoked_by, en er
-- is geen audit-rij. Een medewerker kan dus de fee-vrijstelling van een
-- klant beeindigen zonder dat ergens staat wie dat was.
do $blk6$
declare
  v_tbl text;
begin
  if to_regprocedure('public._audit_row_change()') is null then
    raise notice 'DEEL 5: _audit_row_change bestaat hier niet.';
    return;
  end if;

  foreach v_tbl in array array[
    'subject_members',
    'subject_member_accounts',
    'notification_preferences',
    'referral_clawbacks',
    'advertiser_plans',
    'advertiser_perks',
    'tax_rates',
    'bank_accounts',
    'wallet_precharges',
    'wallet_refunds',
    'wallet_adjustments'
  ] loop
    if to_regclass('public.' || v_tbl) is null then
      raise notice 'DEEL 5: % bestaat hier niet.', v_tbl;
      continue;
    end if;
    execute format('drop trigger if exists trg_audit_%I on public.%I', v_tbl, v_tbl);
    execute format(
      'create trigger trg_audit_%I after insert or update or delete on public.%I
         for each row execute function public._audit_row_change()',
      v_tbl, v_tbl);
    raise notice 'DEEL 5: % heeft nu een audit-spoor.', v_tbl;
  end loop;
end;
$blk6$;

-- En wie een perk introk. Losse kolom, want de audit-rij vertelt WAT er
-- veranderde en deze vertelt het zonder dat je audit_events erbij hoeft
-- te halen.
do $blk7$
begin
  if to_regclass('public.advertiser_perks') is null then
    raise notice 'DEEL 5b: advertiser_perks bestaat hier niet.';
    return;
  end if;
  if exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='advertiser_perks'
       and column_name='revoked_by'
  ) then
    raise notice 'DEEL 5b: revoked_by staat er al.';
    return;
  end if;
  alter table public.advertiser_perks
    add column revoked_by uuid references public.user_profiles(id),
    add column revoked_at timestamptz;
  raise notice 'DEEL 5b: revoked_by en revoked_at toegevoegd (nog niet gevuld - dat doet de RPC pas na de volgende deploy).';
end;
$blk7$;


-- =====================================================================
-- DEEL 6 — EEN UITGEZETTE ADMIN KAN NOG STEEDS EEN PERK GEVEN
-- =====================================================================
-- 20260916100000 zegt in z'n eigen kop dat het acht RPCs NIET aanraakt,
-- en grant_advertiser_perk / revoke_advertiser_perk staan in dat lijstje.
-- Ze autoriseren nog steeds op role = 'admin' alleen. De server actions
-- controleren het wel; de RPC-deur staat open.
--
-- Dat is meer dan een detail: een medewerker-admin mag de prijs van een
-- plan niet wijzigen (owner-only, met opzet), maar mag die klant wel een
-- 100% subscription waiver geven. Zelfde economische uitkomst.
do $blk8$
declare
  r     record;
  v_src text;
  v_new text;
  v_n   int := 0;
begin
  for r in
    select p.oid, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('grant_advertiser_perk', 'revoke_advertiser_perk')
  loop
    v_src := pg_get_functiondef(r.oid);
    if position('coalesce(up.is_active, true)' in v_src) > 0
       or position('_require_profile' in v_src) > 0 then
      raise notice 'DEEL 6: % controleert al of het account actief is.', r.proname;
      continue;
    end if;

    -- De vorm die deze twee gebruiken.
    v_new := replace(
      v_src,
      'and up.role = ''admin''',
      'and up.role = ''admin''
       and coalesce(up.is_active, true) = true
       and coalesce(up.status, ''active'') <> ''inactive'''
    );
    if v_new = v_src then
      raise warning 'DEEL 6: % ziet er anders uit - niets gedaan, zie leesvraag C.', r.proname;
      continue;
    end if;
    execute v_new;
    v_n := v_n + 1;
    raise notice 'DEEL 6: % weigert nu een uitgezette admin.', r.proname;
  end loop;

  if v_n = 0 then
    raise notice 'DEEL 6: niets gewijzigd.';
  end if;
end;
$blk8$;


-- =====================================================================
-- ALLES IN EEN RIJ
-- =====================================================================
select
  (select position('not in (''cancelled'', ''inactive'', ''paused'')' in pg_get_functiondef(p.oid)) > 0
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='subscription_billing_run' limit 1)
                                                        as d1a_debit_skips_inactive,
  exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public'
       and pg_get_functiondef(p.oid) like '%when status in (''cancelled'', ''inactive'', ''paused'')%')
                                                        as d1b_no_reactivation,
  exists (
    select 1 from pg_indexes
     where schemaname='public' and tablename='wallet_precharges'
       and indexdef ilike '%outstanding%' and indexdef ilike '%unique%')
                                                        as d2_precharge_index,
  exists (
    select 1 from pg_trigger
     where tgname='trg_cap_pending_withdrawals')        as d4_withdrawal_cap,
  (select count(*) from pg_trigger t
     join pg_class c on c.oid=t.tgrelid
     join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and t.tgname like 'trg_audit_%'
      and c.relname in ('subject_members','subject_member_accounts',
                        'notification_preferences','referral_clawbacks',
                        'advertiser_plans','advertiser_perks','tax_rates',
                        'bank_accounts','wallet_precharges','wallet_refunds',
                        'wallet_adjustments'))          as d5_audited_of_11,
  exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='advertiser_perks'
       and column_name='revoked_by')                    as d5b_revoked_by,
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in ('grant_advertiser_perk','revoke_advertiser_perk')
      and pg_get_functiondef(p.oid) like '%is_active%') as d6_perks_of_2;


-- =====================================================================
-- =====================================================================
--   ALLEEN LEZEN VANAF HIER.
-- =====================================================================
-- =====================================================================

-- ── A. De twee plekken uit DEEL 1, als een van de twee weigerde ──────
select
  p.proname,
  position('s.status <> ''cancelled''' in pg_get_functiondef(p.oid)) > 0 as heeft_oude_incassofilter,
  position('when status = ''cancelled'' then status else ''active''' in pg_get_functiondef(p.oid)) > 0 as heeft_oude_reactivatie
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and (pg_get_functiondef(p.oid) ilike '%subscription%'
        or p.proname ilike '%invoice%')
 order by 2 desc, 3 desc, 1;

-- ── B. wallet_precharge_settle, regel voor regel ─────────────────────
-- Ik wil de body zien voordat ik er een ondergrens in zet. Dit is de
-- enige weg om een voorschot af te sluiten; stukmaken is erger dan het
-- gat dat ik dicht wil.
with src as (
  select pg_get_functiondef(p.oid) as def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'wallet_precharge_settle'
   limit 1
),
lines as (
  select row_number() over () as ln, l as line
    from src, regexp_split_to_table(src.def, E'\n') as l
)
select ln, line from lines order by ln;

-- ── C. De twee perk-RPCs, als DEEL 6 ze niet herkende ────────────────
select
  p.proname,
  position('up.role = ''admin''' in pg_get_functiondef(p.oid)) > 0 as heeft_rolcheck,
  position('is_active' in pg_get_functiondef(p.oid)) > 0           as heeft_actiefcheck
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('grant_advertiser_perk', 'revoke_advertiser_perk');

-- ── D. Zijn er klanten die NU uitgezet zijn met een open factuur? ────
-- Dit is de groep die DEEL 1 raakt. Als hier rijen uitkomen, zijn die
-- mensen mogelijk al geincasseerd terwijl ze geen toegang hadden.
select
  a.tenant_client_code                as klant,
  up.status                           as profiel_status,
  s.status                            as abo_status,
  i.id                                as factuur,
  i.total,
  i.currency,
  i.due_date::date                    as vervalt,
  i.status                            as factuur_status
  from public.invoices i
  join public.subscriptions s on s.id = i.subscription_id
  join public.advertisers a on a.id = i.advertiser_id
  left join public.user_profiles up on up.id = a.user_profile_id
 where i.status = 'unpaid'
   and (s.status in ('inactive', 'paused')
        or coalesce(up.is_active, true) = false
        or coalesce(up.status, 'active') = 'inactive')
 order by i.due_date;

-- ── E. Voorschotten die vastzitten achter de oude index ──────────────
select
  p.source_wallet_topup_id            as storting,
  count(*)                            as voorschotten,
  string_agg(p.status, ', ')          as statussen
  from public.wallet_precharges p
 where p.source_wallet_topup_id is not null
 group by p.source_wallet_topup_id
having count(*) > 1;

-- ── F. Meer dan een openstaande withdrawal op een rekening ───────────
select
  w.ad_account_id,
  count(*)                            as openstaand,
  sum(w.amount)                       as totaal_aangevraagd,
  w.currency
  from public.ad_account_withdrawals w
 where w.status = 'pending'
 group by w.ad_account_id, w.currency
having count(*) > 1;
