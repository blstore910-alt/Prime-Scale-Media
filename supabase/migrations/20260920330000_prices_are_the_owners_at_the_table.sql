-- =====================================================================
-- Elke prijs is van de eigenaar — ook aan de tabelkant
-- =====================================================================
-- Zeven schermen zijn bewust eigenaar-only gemaakt, één voor één, elk
-- met een commit die uitlegt waarom. De tabel eronder zegt nog steeds
-- `_is_admin_of(tenant_id)` -- en dat is "rol = admin en actief", de
-- eigenaar wordt daar niet onderscheiden. PostgREST zet elke tabel op
-- /rest/v1/<naam>, dus één regel uit de console van een
-- werknemer-admin:
--
--   from('exchange_rates').update({ eur: 0.5 })
--       -> elke omrekening in de app deelt door dit getal
--   from('plans').update({ monthly_fee: 5, topup_fee_pct: 0 })
--   from('subscriptions').update({ amount: 5 })
--   from('referral_links').update({ status:'active', commission_pct: 90 })
--   from('fee_defaults').update({ fee_pct: 0 })
--
-- De commit op exchange-rate-actions zegt het zelf: "an employee admin
-- could invoke this directly and change the rate every conversion in
-- the app divides by. The UI said owner-only; nothing behind it
-- agreed." Dat gold voor alle zeven.
--
-- ── WAT DIT DOET ─────────────────────────────────────────────────────
--
-- Lezen blijft voor elke admin -- zonder die rijen kan niemand een
-- scherm laten zien of een klant vertellen wat hij betaalt. Alleen
-- SCHRIJVEN gaat naar de eigenaar, met dezelfde helper die
-- require-super-admin gebruikt.
--
-- `subscriptions` en `referral_links` zijn de twee waar een admin nog
-- wel iets aan moet kunnen doen dat GEEN prijs is: een abonnement
-- pauzeren, een affiliate goedkeuren. Die gaan daarom niet op slot als
-- tabel -- daar bewaakt een trigger de geld-kolommen, net zoals bij
-- ad_accounts.fee. Zo blijft de desk werken en is de prijs dicht.
--
-- Veilig om vaker te draaien. Als een scherm hierna weigert te
-- schrijven, staat in het rapport welke tabel het was.
-- =====================================================================

set search_path = public;

-- ── 1. De tabellen die ALLEEN prijzen bevatten ───────────────────────
do $blk0$
declare
  t text;
begin
  foreach t in array array['exchange_rates', 'plans', 'fee_defaults'] loop
    if to_regclass('public.' || t) is null then
      raise notice 'tabel niet aanwezig, overgeslagen: %', t;
      continue;
    end if;

    -- De bestaande ALL-policy dekt SELECT mee, dus splitsen in plaats
    -- van weghalen: lezen voor elke admin, schrijven voor de eigenaar.
    execute format(
      'drop policy if exists %I on public.%I', t || '_admin_write', t);
    execute format(
      'drop policy if exists %I on public.%I', t || '_write_admin', t);
    execute format(
      'drop policy if exists %I on public.%I', t || '_admin_all', t);

    execute format(
      'drop policy if exists %I on public.%I', t || '_admin_read_v2', t);
    execute format($blk1$
      create policy %I on public.%I
        for select to authenticated
        using (public._is_admin_of(tenant_id))
    $blk1$, t || '_admin_read_v2', t);

    execute format(
      'drop policy if exists %I on public.%I', t || '_owner_write_v2', t);
    execute format($blk1$
      create policy %I on public.%I
        for all to authenticated
        using (public._is_super_admin_of(tenant_id))
        with check (public._is_super_admin_of(tenant_id))
    $blk1$, t || '_owner_write_v2', t);

    raise notice 'op slot: %', t;
  end loop;
end;
$blk0$;

-- ── 2. De twee tabellen waar een admin nog iets mag ──────────────────
-- Een abonnement pauzeren is desk-werk; het BEDRAG is een prijs. Een
-- affiliate goedkeuren is desk-werk; zijn PERCENTAGE is een prijs.
-- Dus geen slot op de tabel, maar een trigger op de kolommen.
create or replace function public._money_columns_are_the_owners()
returns trigger
language plpgsql
security definer
set search_path = public
as $blk2$
declare
  v_uid   uuid := auth.uid();
  v_owner uuid;
  v_tenant uuid;
begin
  -- Geen mens aan de knoppen: service-role, cron, de incasso-motor.
  if v_uid is null then
    return new;
  end if;

  v_tenant := new.tenant_id;
  select t.owner_id into v_owner from public.tenants t where t.id = v_tenant;
  if v_owner is not null and v_owner = v_uid then
    return new;
  end if;

  if tg_table_name = 'subscriptions' then
    if round(coalesce(new.amount, 0)::numeric, 2)
       is distinct from round(coalesce(old.amount, 0)::numeric, 2)
       or coalesce(new.currency, '') is distinct from coalesce(old.currency, '')
    then
      raise exception
        'Only the super-admin can change what a customer pays for their plan. Pausing, resuming and cancelling are still yours.'
        using errcode = '42501';
    end if;
  elsif tg_table_name = 'referral_links' then
    if coalesce(new.commission_pct, -1) is distinct from coalesce(old.commission_pct, -1)
       or coalesce(new.commission_monthly, -1) is distinct from coalesce(old.commission_monthly, -1)
       or coalesce(new.commission_onetime, -1) is distinct from coalesce(old.commission_onetime, -1)
       or coalesce(new.commission_type, '') is distinct from coalesce(old.commission_type, '')
       or coalesce(new.commission_currency, '') is distinct from coalesce(old.commission_currency, '')
    then
      raise exception
        'Only the super-admin can set commission terms. Approving and rejecting a referral is still yours.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$blk2$;

do $blk3$
begin
  if to_regclass('public.subscriptions') is not null then
    execute 'drop trigger if exists trg_money_columns_owner on public.subscriptions';
    execute 'create trigger trg_money_columns_owner before update on public.subscriptions for each row execute function public._money_columns_are_the_owners()';
  end if;
  if to_regclass('public.referral_links') is not null then
    execute 'drop trigger if exists trg_money_columns_owner on public.referral_links';
    execute 'create trigger trg_money_columns_owner before update on public.referral_links for each row execute function public._money_columns_are_the_owners()';
  end if;
end;
$blk3$;

-- =====================================================================
-- Het rapport — de SQL-editor toont alleen het LAATSTE resultaat
-- =====================================================================
select 1 as nr, 'prijstabellen: wie mag schrijven' as item,
  coalesce((
    select string_agg(
             tablename || ': ' || policyname || ' (' || cmd || ')',
             E'\n' order by tablename, policyname)
      from pg_policies
     where schemaname = 'public'
       and tablename in ('exchange_rates', 'plans', 'fee_defaults')
       and cmd in ('ALL', 'INSERT', 'UPDATE', 'DELETE')
  ), 'geen') as antwoord
union all
select 2, 'kan een werknemer-admin nog een prijs schrijven',
  case when exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename in ('exchange_rates', 'plans', 'fee_defaults')
       and cmd in ('ALL', 'INSERT', 'UPDATE')
       and qual ilike '%_is_admin_of%'
       and qual not ilike '%_is_super_admin_of%'
  ) then 'JA - dit bestand is niet geplakt' else 'nee' end
union all
select 3, 'geld-kolom-trigger op subscriptions en referral_links',
  (select coalesce(string_agg(c.relname, ' + ' order by c.relname), 'GEEN')
     from pg_trigger t join pg_class c on c.oid = t.tgrelid
    where t.tgname = 'trg_money_columns_owner' and not t.tgisinternal)
union all
-- Lezen moet blijven werken: zonder een actieve koers weigert elke
-- niet-USD top-up, en zonder plannen kan niemand een klant uitnodigen.
select 4, 'actieve koersen zichtbaar voor JOU, nu',
  case when to_regclass('public.exchange_rates') is null then 'tabel ontbreekt'
       else (select count(*)::text from public.exchange_rates where is_active) end
union all
select 5, 'tenants met MEER DAN EEN actieve koers',
  case when to_regclass('public.exchange_rates') is null then 'tabel ontbreekt'
       else (select count(*)::text from (
               select tenant_id from public.exchange_rates
                where is_active group by 1 having count(*) > 1) x) end
order by nr;
