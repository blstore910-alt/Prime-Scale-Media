-- ════════════════════════════════════════════════════════════════════
-- PLAK 82 — wat de D2-sweep in de database vond
-- ════════════════════════════════════════════════════════════════════
--
-- Vier dingen. De eerste twee kosten geld, de derde is een uitsluiting.
--
-- 1  DE COMMISSIE VAN EEN AFFILIATE STOND NERGENS OP DE KOPPELING.
--    referral_link_assign schrijft (tenant, referred, affiliate,
--    affiliate_user, advertiser_user, status) en GEEN ENKELE
--    commissiekolom. Maar _accrue_referral_commission rekent met
--    referral_links.commission_pct en stopt bij
--    `coalesce(v_link.commission_pct, 0) <= 0`.
--
--    Dus: de koppeling PSM0010 -> PSM0005, aangemaakt op 22-09 via deze
--    RPC, draagt geen tarief. Elke geverifieerde top-up van PSM0010
--    levert EUR 0 op, terwijl het instellingenvenster van PSM0005 "10%"
--    laat zien en user-affiliates er letterlijk bij zet: "Their
--    commission setup is copied into the referral link." Dat kopiëren
--    gebeurde niet.
--
--    Opgelost met een BEFORE-trigger in plaats van chirurgie in de
--    functie: hij vult de commissiekolommen uit de affiliate zodra ze
--    leeg zijn, welke schrijver de rij ook maakt — de RPC, de fallback
--    in referral-actions, of de uitnodiging. Bestaande rijen worden
--    hieronder alsnog ingevuld.
--
-- 2  DE COMMISSIEBEDRAGEN STONDEN IN `real`.
--    `select 12345.67::real` geeft 12345.7, en `99999.99::real` geeft
--    100000. Het venster biedt step="0.01" aan en leest de kolom
--    rechtstreeks terug, dus je typt 12345,67, slaat op, doet hem open
--    en er staat 12345,70. Naar numeric(14,2), net als
--    referral_commissions.amount al is.
--
-- 3  EEN MEDEWERKER-BEHEERDER KON DE EIGENAAR BUITENSLUITEN.
--    `authenticated` mag UPDATE op user_profiles, de policy laat elke
--    tenant-beheerder erbij, en _guard_user_profile_lockout begint met
--    "is de aanroeper beheerder? dan mag alles". Eén PATCH met
--    {"is_active": false} op de rij van de eigenaar, en de eigenaar
--    faalt daarna _is_super_admin_of: geen /settings, geen /invites,
--    geen plannen, geen uitnodigingen. Zelf terugzetten kan niet — dan
--    is hij geen beheerder meer en raakt hij precies de uitzondering
--    van diezelfde trigger. Alleen de SQL editor helpt dan nog.
--
-- 4  wallet_topups.advertiser_id IS NULLBAAR en 4 van de 19 rijen zijn
--    leeg. Het is een tweede kopie van de eigenaar (wallets.advertiser_id
--    is de echte), en /users telt de levenslange top-ups via die kopie.
--    In de psm-e2e tenant leest die kolom daardoor EUR 0,00 / $0,00 over
--    drie geverifieerde overboekingen van samen EUR 300 en USD 750.
--
-- Plak dit hele bestand in de SQL editor. Onderaan staat EEN
-- rapporttabel.
-- ════════════════════════════════════════════════════════════════════

create temporary table if not exists _plak82 (
  n integer, stap text, uitkomst text
) on commit preserve rows;
truncate _plak82;

-- ── 1a. de kolommen van real naar numeric ────────────────────────────
do $blk0$
declare
  v_done text := '';
begin
  alter table public.advertisers
    alter column commission_monthly type numeric(14,2)
      using round(commission_monthly::numeric, 2),
    alter column commission_onetime type numeric(14,2)
      using round(commission_onetime::numeric, 2),
    alter column commission_pct type numeric(6,3)
      using round(commission_pct::numeric, 3);
  v_done := 'advertisers ok';

  alter table public.referral_links
    alter column commission_monthly type numeric(14,2)
      using round(commission_monthly::numeric, 2),
    alter column commission_onetime type numeric(14,2)
      using round(commission_onetime::numeric, 2),
    alter column commission_pct type numeric(6,3)
      using round(commission_pct::numeric, 3);
  v_done := v_done || ', referral_links ok';

  insert into _plak82 values (1, 'commissiebedragen van real naar numeric', v_done);
exception when others then
  insert into _plak82 values (1, 'commissiebedragen van real naar numeric',
    'FOUT ' || sqlstate || ': ' || sqlerrm || ' (tot: ' || v_done || ')');
end
$blk0$;

-- ── 1b. de trigger die de commissie meeschrijft ──────────────────────
do $blk1$
begin
  create or replace function public._referral_link_inherits_commission()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public'
  as $fn$
  declare
    v_aff record;
  begin
    -- Alleen invullen wat leeg is. Een tarief dat iemand met opzet op
    -- DEZE koppeling heeft gezet blijft staan.
    if new.affiliate_advertiser_id is null then
      return new;
    end if;
    if new.commission_type is not null
       and coalesce(new.commission_pct, 0) <> 0 then
      return new;
    end if;

    select commission_type, commission_pct, commission_monthly,
           commission_onetime, commission_currency
      into v_aff
      from public.advertisers
     where id = new.affiliate_advertiser_id;

    if not found then
      return new;
    end if;

    new.commission_type :=
      coalesce(new.commission_type, v_aff.commission_type);
    new.commission_pct :=
      coalesce(nullif(new.commission_pct, 0), v_aff.commission_pct);
    new.commission_monthly :=
      coalesce(nullif(new.commission_monthly, 0), v_aff.commission_monthly);
    new.commission_onetime :=
      coalesce(nullif(new.commission_onetime, 0), v_aff.commission_onetime);
    new.commission_currency :=
      coalesce(new.commission_currency, v_aff.commission_currency);

    return new;
  end;
  $fn$;

  revoke all on function public._referral_link_inherits_commission()
    from public, anon;
  grant execute on function public._referral_link_inherits_commission()
    to authenticated, service_role;

  drop trigger if exists a2_referral_link_inherits_commission
    on public.referral_links;
  create trigger a2_referral_link_inherits_commission
    before insert or update of affiliate_advertiser_id
    on public.referral_links
    for each row
    execute function public._referral_link_inherits_commission();

  insert into _plak82 values (
    2, 'koppeling erft de commissie van de affiliate', 'trigger geplaatst');
exception when others then
  insert into _plak82 values (2, 'koppeling erft de commissie van de affiliate',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk1$;

-- ── 1c. en de koppelingen die er al zonder tarief staan ──────────────
do $blk2$
declare
  v_n integer := 0;
begin
  update public.referral_links rl
     set commission_type     = coalesce(rl.commission_type, a.commission_type),
         commission_pct      = coalesce(nullif(rl.commission_pct, 0), a.commission_pct),
         commission_monthly  = coalesce(nullif(rl.commission_monthly, 0), a.commission_monthly),
         commission_onetime  = coalesce(nullif(rl.commission_onetime, 0), a.commission_onetime),
         commission_currency = coalesce(rl.commission_currency, a.commission_currency)
    from public.advertisers a
   where a.id = rl.affiliate_advertiser_id
     and coalesce(rl.status, 'active') <> 'rejected'
     and (rl.commission_type is null or coalesce(rl.commission_pct, 0) = 0)
     and a.commission_type is not null;
  get diagnostics v_n = row_count;

  insert into _plak82 values (
    3, 'bestaande koppelingen alsnog van een tarief voorzien',
    v_n || ' koppeling(en) bijgewerkt');
exception when others then
  insert into _plak82 values (3, 'bestaande koppelingen alsnog van een tarief voorzien',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk2$;

-- ── 3. de eigenaar is niet uit te schakelen ──────────────────────────
do $blk3$
begin
  create or replace function public._guard_owner_stays_in()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public'
  as $fn$
  declare
    v_owner uuid;
  begin
    -- Gaat dit profiel UIT?
    if coalesce(new.is_active, true)
       and lower(coalesce(new.status, 'active')) <> 'inactive' then
      return new;
    end if;
    if not coalesce(old.is_active, true)
       or lower(coalesce(old.status, 'active')) = 'inactive' then
      return new;   -- stond al uit
    end if;

    select t.owner_id into v_owner
      from public.tenants t where t.id = new.tenant_id;
    if v_owner is null or v_owner <> new.user_id then
      return new;   -- niet de eigenaar, gewone regels
    end if;

    -- Het IS de eigenaar. Alleen de eigenaar zelf mag dat doen; een
    -- medewerker-beheerder kan hem anders buitensluiten uit zijn eigen
    -- organisatie, en terugzetten lukt daarna niemand meer omdat de
    -- eigenaar dan geen actieve beheerder meer is.
    if auth.uid() is distinct from v_owner then
      raise exception
        'The account owner cannot be switched off by anyone but themselves.'
        using errcode = '42501';
    end if;
    return new;
  end;
  $fn$;

  revoke all on function public._guard_owner_stays_in() from public, anon;
  grant execute on function public._guard_owner_stays_in()
    to authenticated, service_role;

  drop trigger if exists a3_guard_owner_stays_in on public.user_profiles;
  create trigger a3_guard_owner_stays_in
    before update on public.user_profiles
    for each row
    execute function public._guard_owner_stays_in();

  insert into _plak82 values (
    4, 'de eigenaar kan niet door een medewerker worden uitgeschakeld',
    'trigger geplaatst');
exception when others then
  insert into _plak82 values (4, 'de eigenaar kan niet door een medewerker worden uitgeschakeld',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk3$;

-- ── 4. wallet_topups.advertiser_id ───────────────────────────────────
do $blk4$
declare
  v_fix  integer := 0;
  v_rest integer := 0;
  v_nn   boolean;
begin
  update public.wallet_topups t
     set advertiser_id = w.advertiser_id
    from public.wallets w
   where w.id = t.wallet_id
     and t.advertiser_id is null
     and w.advertiser_id is not null;
  get diagnostics v_fix = row_count;

  select count(*) into v_rest
    from public.wallet_topups where advertiser_id is null;

  if v_rest = 0 then
    begin
      alter table public.wallet_topups
        alter column advertiser_id set not null;
    exception when others then
      insert into _plak82 values (5, 'wallet_topups.advertiser_id',
        'FOUT bij alter ' || sqlstate || ': ' || sqlerrm);
      return;
    end;
  end if;

  select a.attnotnull into v_nn
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'wallet_topups'
     and a.attname = 'advertiser_id';

  insert into _plak82 values (
    5, 'wallet_topups.advertiser_id invullen en vastzetten',
    v_fix || ' ingevuld via de portemonnee, ' || v_rest ||
    ' nog leeg; NOT NULL = ' || coalesce(v_nn::text, '?'));
exception when others then
  insert into _plak82 values (5, 'wallet_topups.advertiser_id invullen en vastzetten',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk4$;

-- ── controle ─────────────────────────────────────────────────────────
do $blk5$
declare
  v_links integer;
  v_null  integer;
begin
  select count(*) into v_links
    from public.referral_links
   where coalesce(status, 'active') <> 'rejected'
     and coalesce(commission_pct, 0) = 0
     and coalesce(commission_type, '') in ('', 'pct');

  select count(*) into v_null
    from public.wallet_topups where advertiser_id is null;

  insert into _plak82 values (
    6, 'nog open',
    v_links || ' actieve koppeling(en) zonder percentage, ' ||
    v_null || ' top-up(s) zonder eigenaar');
exception when others then
  insert into _plak82 values (6, 'nog open', 'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk5$;

-- ════════════════════════════════════════════════════════════════════
-- HET RAPPORT — de editor toont alleen deze laatste tabel.
-- ════════════════════════════════════════════════════════════════════
select n as "#", stap as "wat", uitkomst as "uitkomst"
  from _plak82 order by n;
