-- ════════════════════════════════════════════════════════════════════
-- PLAK 81 — wat de D1-sweep in de database vond
-- ════════════════════════════════════════════════════════════════════
--
-- Vier dingen, en de eerste is een knop die vandaag stuk is.
--
-- 1  wise_confirm_suggestion is NIET uitvoerbaar door `authenticated`.
--    Hij is SECURITY DEFINER en begint met _require_profile('admin'),
--    net als zijn drie broers -- en die zijn wel gegrant. Maar beide
--    aanroepen gebruiken de sessie van de beheerder zelf (dat MOET ook:
--    de functie leest auth.uid()), dus "Confirm & credit" op het
--    tabblad Bank deposits antwoordt 42501 permission denied. Precies
--    het gat dat CLAUDE.md beschrijft: een create-or-replace zet de
--    rechten terug naar PUBLIC, en het revoke-blok eronder vergat
--    `authenticated` opnieuw te geven.
--
-- 2  De tenantcontrole in de vier wallet_topup-RPC's is blind voor
--    NULL. `if v_topup.tenant_id <> v_admin.tenant_id then` is met een
--    NULL links geen FALSE maar NULL, dus de if slaat niet aan en de
--    controle wordt overgeslagen. Er staan vandaag vier zulke rijen,
--    waarvan een PENDING van USD 100. Ze zitten bovendien in geen
--    enkele wachtrij en op geen enkele badge, want elk scherm filtert
--    met .eq("tenant_id", ...) en .eq() sluit NULL uit -- dus niemand
--    kan ze zien, maar de RPC's laten ze wel door. De kolom hoort
--    gewoon NOT NULL te zijn; dan zijn alle vier de functies in een
--    keer dicht.
--
-- 3  Een actieve beheerder kan zijn EIGEN profiel naar een andere
--    tenant verplaatsen. _pin_profile_tenant eist alleen dat je
--    beheerder bent van de OUDE tenant -- dat ben je. Daarna wijst
--    _require_profile naar de nieuwe tenant en is elke top-up daar van
--    jou. Jezelf verplaatsen kan nu niet meer, en verplaatsen kan
--    alleen nog tussen tenants waar je zelf beheerder van bent.
--
-- 4  wallet_create_for_advertiser is uitvoerbaar door `anon`. Hij is
--    SECURITY DEFINER en schrijft in public.wallets. Het enige dat hem
--    tegenhoudt is een regel plpgsql ("if v_uid is null then raise").
--    Dat is precies de situatie waar de revoke-regel voor bestaat.
--
-- Plak dit hele bestand in de SQL editor. Onderaan staat EEN
-- rapporttabel.
-- ════════════════════════════════════════════════════════════════════

create temporary table if not exists _plak81 (
  n     integer,
  stap  text,
  uitkomst text
) on commit preserve rows;
truncate _plak81;

-- ── 1 ────────────────────────────────────────────────────────────────
-- De grant die een create-or-replace heeft weggehaald.
do $blk0$
declare
  v_before text;
  v_after  text;
begin
  select array_to_string(
           array(select (aclexplode(p.proacl)).grantee::regrole::text),
           ', ')
    into v_before
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'wise_confirm_suggestion';

  revoke all on function public.wise_confirm_suggestion(uuid)
    from public, anon;
  grant execute on function public.wise_confirm_suggestion(uuid)
    to authenticated, service_role;

  select array_to_string(
           array(select (aclexplode(p.proacl)).grantee::regrole::text),
           ', ')
    into v_after
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'wise_confirm_suggestion';

  insert into _plak81 values (
    1,
    'wise_confirm_suggestion uitvoerbaar maken',
    'was: ' || coalesce(v_before, '(geen)') ||
    '  ->  nu: ' || coalesce(v_after, '(geen)'));
exception when others then
  insert into _plak81 values (1, 'wise_confirm_suggestion uitvoerbaar maken',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk0$;

-- ── 2 ────────────────────────────────────────────────────────────────
-- tenant_id invullen en daarna vastzetten.
do $blk1$
declare
  v_via_wallet integer := 0;
  v_via_adv    integer := 0;
  v_rest       integer := 0;
  v_notnull    boolean;
begin
  update public.wallet_topups t
     set tenant_id = w.tenant_id
    from public.wallets w
   where w.id = t.wallet_id
     and t.tenant_id is null
     and w.tenant_id is not null;
  get diagnostics v_via_wallet = row_count;

  update public.wallet_topups t
     set tenant_id = a.tenant_id
    from public.advertisers a
   where a.id = t.advertiser_id
     and t.tenant_id is null
     and a.tenant_id is not null;
  get diagnostics v_via_adv = row_count;

  select count(*) into v_rest
    from public.wallet_topups where tenant_id is null;

  if v_rest = 0 then
    -- Alleen vastzetten als er echt niets meer leeg is; anders zou de
    -- alter de hele plak laten mislukken.
    begin
      alter table public.wallet_topups
        alter column tenant_id set not null;
    exception when others then
      insert into _plak81 values (2, 'wallet_topups.tenant_id NOT NULL',
        'FOUT bij alter ' || sqlstate || ': ' || sqlerrm);
      return;
    end;
  end if;

  select a.attnotnull into v_notnull
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'wallet_topups'
     and a.attname = 'tenant_id';

  insert into _plak81 values (
    2,
    'wallet_topups.tenant_id invullen en vastzetten',
    v_via_wallet || ' via de portemonnee, ' || v_via_adv ||
    ' via de adverteerder, ' || v_rest || ' nog leeg; NOT NULL = ' ||
    coalesce(v_notnull::text, '?'));
exception when others then
  insert into _plak81 values (2, 'wallet_topups.tenant_id invullen en vastzetten',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk1$;

-- ── 3 ────────────────────────────────────────────────────────────────
-- Jezelf verplaatsen kan niet meer.
do $blk2$
begin
  create or replace function public._pin_profile_tenant()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public'
  as $fn$
  begin
    if new.tenant_id is distinct from old.tenant_id then
      -- JEZELF VERPLAATSEN IS GEEN VERPLAATSING, DAT IS EEN OVERSTAP.
      -- De oude regel eiste alleen dat je beheerder was van de tenant
      -- waar het profiel NU in zit -- en dat ben je, want het is je
      -- eigen profiel. Dus: kies een tenant, schrijf hem hier, en
      -- _require_profile('admin') wijst daarna naar de wachtrij van
      -- iemand anders, met hun geld erin.
      if new.user_id = auth.uid() then
        raise exception
          'You cannot move your own profile to another tenant.'
          using errcode = '42501';
      end if;
      -- En alleen tussen tenants waar je zelf beheerder van bent. Een
      -- collega ergens anders neerzetten waar je zelf niets te zoeken
      -- hebt, is hetzelfde gat met een omweg.
      if not exists (
        select 1 from public.user_profiles up
         where up.user_id = auth.uid()
           and up.tenant_id = old.tenant_id
           and up.role = 'admin'
           and coalesce(up.is_active, true)
      ) then
        raise exception
          'A profile cannot change tenant. Ask an admin of the tenant it is in.'
          using errcode = '42501';
      end if;
      if not exists (
        select 1 from public.user_profiles up
         where up.user_id = auth.uid()
           and up.tenant_id = new.tenant_id
           and up.role = 'admin'
           and coalesce(up.is_active, true)
      ) then
        raise exception
          'You are not an admin of the tenant you are moving this profile into.'
          using errcode = '42501';
      end if;
    end if;
    return new;
  end;
  $fn$;

  revoke all on function public._pin_profile_tenant() from public, anon;
  grant execute on function public._pin_profile_tenant()
    to authenticated, service_role;

  insert into _plak81 values (
    3, 'een beheerder kan zichzelf niet meer verhuizen', 'vervangen');
exception when others then
  insert into _plak81 values (3, 'een beheerder kan zichzelf niet meer verhuizen',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk2$;

-- ── 4 ────────────────────────────────────────────────────────────────
do $blk3$
declare
  v_after text;
begin
  revoke all on function public.wallet_create_for_advertiser()
    from public, anon;
  grant execute on function public.wallet_create_for_advertiser()
    to authenticated, service_role;

  select array_to_string(
           array(select (aclexplode(p.proacl)).grantee::regrole::text),
           ', ')
    into v_after
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'wallet_create_for_advertiser';

  insert into _plak81 values (
    4, 'wallet_create_for_advertiser dicht voor anon',
    'nu: ' || coalesce(v_after, '(geen)'));
exception when others then
  insert into _plak81 values (4, 'wallet_create_for_advertiser dicht voor anon',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk3$;

-- ── controle ─────────────────────────────────────────────────────────
do $blk4$
declare
  v_anon integer;
  v_null integer;
begin
  select count(*) into v_anon
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and 'anon' = any(array(select (aclexplode(p.proacl)).grantee::regrole::text));

  select count(*) into v_null
    from public.wallet_topups where tenant_id is null;

  insert into _plak81 values (
    5, 'nog open',
    v_anon || ' functie(s) uitvoerbaar door anon, ' ||
    v_null || ' top-up(s) zonder tenant');
exception when others then
  insert into _plak81 values (5, 'nog open',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk4$;

-- ════════════════════════════════════════════════════════════════════
-- HET RAPPORT — de editor toont alleen deze laatste tabel.
-- ════════════════════════════════════════════════════════════════════
select n as "#", stap as "wat", uitkomst as "uitkomst"
  from _plak81 order by n;
