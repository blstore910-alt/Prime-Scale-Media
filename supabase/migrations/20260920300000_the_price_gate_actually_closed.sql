-- =====================================================================
-- De prijs-poort, nu echt dicht — vervangt 20260920280000
-- =====================================================================
-- Een verificatie-agent heeft 20260920280000 nagelopen en er drie gaten
-- in gevonden. Als je die al geplakt hebt: dit bestand vervangt hem,
-- draai dit er gewoon overheen.
--
-- ── 1. HIJ LAS new.platform IN PLAATS VAN old.platform ───────────────
--
-- De toegestane waarden werden opgezocht met new.platform en
-- new.advertiser_id -- precies wat de server-actie een commit eerder
-- had weggehaald, omdat je dat zelf meestuurt. Twee calls vanuit de
-- console van een werknemer-admin:
--
--   update ad_accounts set platform='eigen-type', fee=25 where id=X
--   update ad_accounts set platform='eu-meta-psm'            where id=X
--
-- Call 1 komt erdoor, want de trigger kijkt naar 'eigen-type' en vindt
-- daar 25 als default. Call 2 zet platform terug -- en die trigger vuurt
-- NIET, want hij staat op `update OF fee` en fee staat niet in de SET.
-- Resultaat: 25% op een klant met een 5%-plan. Op EUR 10.000 is dat
-- EUR 2.500 in plaats van EUR 500, elke top-up, voor altijd.
--
-- En 'eigen-type' is zo gemaakt: ad_account_types heeft
-- `for all to authenticated using (_is_admin_of(tenant_id))`, dus één
-- insert vanuit de console.
--
-- ── 2. HIJ STOND ALLEEN OP UPDATE ────────────────────────────────────
--
-- De policy waar hij tegen beschermt is `for all` -- dus ook INSERT.
-- Eén insert met fee 25 en er was geen trigger, geen actie, geen
-- eigenaar. Nu INSERT en UPDATE.
--
-- ── 3. EN platform/advertiser_id KONDEN VRIJ WIJZIGEN ────────────────
--
-- Die twee bepalen WAT het afgesproken tarief is. Ze wijzigen terwijl
-- er al een fee staat was gratis, stil, en werd nergens als een
-- prijsbesluit vastgelegd. Een wijziging daarvan moet de fee opnieuw
-- verantwoorden.
--
-- ── WAT ER WEL MAG ───────────────────────────────────────────────────
--
-- Hetzelfde als de serverregel: niets, nul, het plantarief van deze
-- klant, of de default van dit type. De service-role (auth.uid() null)
-- gaat hier niet doorheen -- die gaat ook niet door RLS, en de
-- incasso-motor en de pool-sync zijn geen mensen.
--
-- Veilig om vaker te draaien.
-- =====================================================================

set search_path = public;

create or replace function public._fee_is_the_owners()
returns trigger
language plpgsql
security definer
set search_path = public
as $blk0$
declare
  v_uid     uuid := auth.uid();
  v_owner   uuid;
  v_old     numeric;
  v_new     numeric := round(coalesce(new.fee, 0)::numeric, 2);
  v_plan    numeric;
  v_default numeric;
  -- OLD op een UPDATE, NEW op een INSERT. Het type en de klant die de
  -- toegestane waarde bepalen zijn die van de rij ZOALS HIJ STAAT --
  -- niet die uit de payload, want die stuur je zelf mee.
  v_platform text;
  v_adv      uuid;
begin
  if tg_op = 'UPDATE' then
    v_old := round(coalesce(old.fee, 0)::numeric, 2);
    v_platform := old.platform;
    v_adv := old.advertiser_id;

    -- Geen prijswijziging EN geen verschuiving van de grondslag: klaar.
    if v_old = v_new
       and coalesce(new.platform, '') is not distinct from coalesce(old.platform, '')
       and new.advertiser_id is not distinct from old.advertiser_id then
      return new;
    end if;

    -- Verschuift de grondslag onder een fee die al staat? Dan moet de
    -- NIEUWE combinatie de fee verantwoorden, niet de oude.
    if coalesce(new.platform, '') is distinct from coalesce(old.platform, '')
       or new.advertiser_id is distinct from old.advertiser_id then
      v_platform := new.platform;
      v_adv := new.advertiser_id;
    end if;
  else
    v_old := 0;
    v_platform := new.platform;
    v_adv := new.advertiser_id;
  end if;

  -- Geen mens aan de knoppen: service-role, cron, trigger-op-trigger.
  if v_uid is null then
    return new;
  end if;

  select t.owner_id into v_owner
    from public.tenants t
   where t.id = new.tenant_id;
  if v_owner is not null and v_owner = v_uid then
    return new;
  end if;

  -- Nul of leeg betekent "gebruik wat er geconfigureerd staat".
  if v_new <= 0 then
    return new;
  end if;

  begin
    select p.topup_fee_pct into v_plan
      from public.advertiser_plans p
     where p.advertiser_id = v_adv
     limit 1;
  exception when undefined_table or undefined_column then
    v_plan := null;
  end;
  if v_plan is not null and round(v_plan::numeric, 2) = v_new then
    return new;
  end if;

  begin
    select ty.default_fee_pct into v_default
      from public.ad_account_types ty
     where ty.tenant_id = new.tenant_id
       and ty.slug = v_platform
     limit 1;
  exception when undefined_table or undefined_column then
    v_default := null;
  end;
  if v_default is not null and round(v_default::numeric, 2) = v_new then
    return new;
  end if;

  raise exception
    'Only the super-admin can set what a customer is charged on top-ups. Leave the fee at their plan rate or the account type default.'
    using errcode = '42501';
end;
$blk0$;

-- Geen `of fee` meer: een wijziging van platform of advertiser_id moet
-- hem ook wakker maken, en dat is precies wat `of fee` niet deed.
drop trigger if exists trg_fee_is_the_owners on public.ad_accounts;
create trigger trg_fee_is_the_owners
  before insert or update on public.ad_accounts
  for each row execute function public._fee_is_the_owners();

-- =====================================================================
-- Het rapport — de SQL-editor toont alleen het LAATSTE resultaat
-- =====================================================================
select 1 as nr, 'prijs-poort staat op ad_accounts' as item,
  coalesce((
    select string_agg(
             case t.tgtype::int & 4 when 4 then 'INSERT' else '' end ||
             case when (t.tgtype::int & 16) = 16 then ' UPDATE' else '' end,
             ', ')
      from pg_trigger t
     where t.tgname = 'trg_fee_is_the_owners' and not t.tgisinternal
  ), 'NIET AANGELEGD') as antwoord
union all
select 2, 'leest hij de OPGESLAGEN rij (old), niet de payload',
  case
    when to_regprocedure('public._fee_is_the_owners()') is null then 'functie ontbreekt'
    when position('old.platform' in pg_get_functiondef(
           'public._fee_is_the_owners()'::regprocedure)) > 0 then 'JA'
    else 'NEE - dit bestand is niet geplakt'
  end
union all
select 3, 'accounts met een fee die noch het plan noch het type-default is',
  case
    when to_regclass('public.ad_account_types') is null
      then 'ad_account_types staat niet op deze database'
    else (
      select count(*)::text || ' van ' ||
             (select count(*)::text from public.ad_accounts)
        from public.ad_accounts a
        left join public.advertiser_plans p on p.advertiser_id = a.advertiser_id
        left join public.ad_account_types ty
               on ty.tenant_id = a.tenant_id and ty.slug = a.platform
       where coalesce(a.fee, 0) > 0
         and round(coalesce(a.fee, 0)::numeric, 2)
             is distinct from round(coalesce(p.topup_fee_pct, -1)::numeric, 2)
         and round(coalesce(a.fee, 0)::numeric, 2)
             is distinct from round(coalesce(ty.default_fee_pct, -1)::numeric, 2)
    )
  end
union all
select 4, 'ad-account-TYPES die elke admin kan schrijven',
  coalesce((
    select string_agg(policyname || ' (' || cmd || ')', ' | ' order by policyname)
      from pg_policies
     where schemaname = 'public' and tablename = 'ad_account_types'
       and cmd in ('ALL', 'INSERT', 'UPDATE')
  ), 'geen schrijf-policy')
order by nr;
