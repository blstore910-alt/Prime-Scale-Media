-- =====================================================================
-- PLAK 20 - een ad account telt mee, waar hij ook vandaan komt
-- =====================================================================
-- De inbegrepen-teller in `ad_account_request_create_paid` telde alleen
-- AANVRAGEN. Een account dat een admin met de hand aanmaakt (via
-- /accounts) laat geen aanvraagrij achter, dus verbruikte dat NIETS van
-- het plan: een klant op een plan met een inbegrepen account kon er
-- twee hebben, en voor geen van beide was iets in rekening gebracht.
--
-- Nu: de accounts die ze al HEBBEN, plus de aanvragen die er nog geen
-- zijn geworden. Een AFGERONDE aanvraag telt bewust niet mee -- die
-- heeft een account opgeleverd en dat zit al in het eerste getal.
-- Allebei tellen zou hetzelfde account twee keer in rekening brengen.
--
-- De body hieronder is LETTERLIJK die van plak 19, met alleen dat ene
-- blok vervangen. De schermkant staat al live en rekent hetzelfde.
--
-- WAT DIT VOOR BESTAANDE KLANTEN BETEKENT: niets met terugwerkende
-- kracht, er wordt niets nagefactureerd. Het raakt alleen de VOLGENDE
-- aanvraag. Regel 2 laat per klant zien wie er morgen EUR 50 betaalt
-- waar het gisteren gratis was.
--
-- Veilig om vaker te draaien.
-- =====================================================================

set search_path = public;

create or replace function public.ad_account_request_create_paid(
  p_platform text, p_currency text, p_timezone text,
  p_website_url text default null::text, p_notes text default null::text,
  p_metadata jsonb default '{}'::jsonb)
returns ad_account_requests
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_uid      uuid := auth.uid();
  v_adv      public.advertisers%rowtype;
  v_wallet   public.wallets%rowtype;
  v_cur      text;
  v_fee      numeric;
  v_rate     numeric;
  v_bal      numeric;
  v_email    text;
  v_req      public.ad_account_requests%rowtype;
  v_included int;
  v_used     int;
  v_is_free  boolean;
  v_perk_id  uuid;
  v_free_source text := null;
  v_meta_in  jsonb;
begin
  if v_uid is null then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  -- ORDER BY erbij: zonder was dit niet-deterministisch voor een
  -- gebruiker met meer dan een advertiser-rij.
  select * into v_adv from public.advertisers
   where user_id = v_uid order by created_at desc limit 1;
  if not found then
    raise exception 'No advertiser profile for this user' using errcode = '42501';
  end if;

  v_cur := upper(coalesce(p_currency, 'EUR'));
  if v_cur not in ('USD', 'EUR') then
    raise exception 'Unsupported currency %', v_cur using errcode = '22000';
  end if;

  -- ── WAT DE BELLER MEESTUURT MAG GEEN BOEKHOUDING ZIJN ─────────
  -- De merge onderaan overschreef VIER sleutels. request_fee_refunded_at
  -- zat daar niet bij, dus wie hem zelf meestuurde zette zijn eigen
  -- terugbetaling uit. Alles wat de server zelf zet gaat er hier af.
  v_meta_in := coalesce(p_metadata, '{}'::jsonb)
                 - 'request_fee'
                 - 'request_fee_currency'
                 - 'request_fee_included'
                 - 'request_fee_free_source'
                 - 'request_fee_refunded_at'
                 - 'request_fee_refunded_by';

  select included_ad_accounts into v_included
    from public.advertiser_plans
   where advertiser_id = v_adv.id
   for update;
  v_included := coalesce(v_included, 0);

  -- WAT ZE HEBBEN, PLUS WAT ER NOG AAN KOMT.
  -- Dit telde alleen AANVRAGEN. Een account dat een admin met de
  -- hand aanmaakt laat geen aanvraagrij achter, dus verbruikte het
  -- niets van het plan. Een AFGERONDE aanvraag telt hier bewust
  -- niet mee: die heeft een account opgeleverd, en dat zit al in
  -- het eerste getal.
  select
    (select count(*) from public.ad_accounts a
      where a.advertiser_id = v_adv.id)
    +
    (select count(*) from public.ad_account_requests r
      where r.advertiser_id = v_adv.id
        and coalesce(r.status, '') not in ('completed', 'rejected', 'cancelled'))
    into v_used;

  v_is_free := v_used < v_included;
  if v_is_free then
    v_free_source := 'plan_included';
  end if;

  if not v_is_free then
    select id into v_perk_id
      from public.advertiser_perks
     where advertiser_id = v_adv.id
       and kind = 'free_ad_account_requests'
       and active
       and (expires_at is null or expires_at > now())
       and starts_at <= now()
       and coalesce(remaining, 0) > 0
     order by expires_at nulls last
     for update
     limit 1;
    if found then
      v_is_free := true;
      v_free_source := 'perk';
      update public.advertiser_perks
         set remaining = remaining - 1, updated_at = now()
       where id = v_perk_id;
    end if;
  end if;

  if v_is_free then
    v_fee := 0;
  else
    if v_cur = 'EUR' then
      v_fee := 50;
    else
      select eur into v_rate
        from public.exchange_rates
       where tenant_id = v_adv.tenant_id and is_active = true
       limit 1;
      if v_rate is null or v_rate <= 0 then
        v_rate := 0.86;
      end if;
      v_fee := round(50 / v_rate, 0);
    end if;

    select * into v_wallet from public.wallets
     where advertiser_id = v_adv.id for update;
    if not found then
      raise exception 'No wallet for this advertiser' using errcode = '42704';
    end if;

    v_bal := case when v_cur = 'USD'
                  then coalesce(v_wallet.usd_balance, 0)
                  else coalesce(v_wallet.eur_balance, 0) end;
    if v_bal < v_fee then
      raise exception
        'Insufficient wallet balance for the % ad-account request fee (have %, need %). Please top up.',
        v_cur, v_bal, v_fee using errcode = '22000';
    end if;

    if v_cur = 'USD' then
      update public.wallets set usd_balance = coalesce(usd_balance, 0) - v_fee,
             updated_at = now() where id = v_wallet.id;
    else
      update public.wallets set eur_balance = coalesce(eur_balance, 0) - v_fee,
             updated_at = now() where id = v_wallet.id;
    end if;
  end if;

  select email into v_email
    from public.user_profiles where user_id = v_uid limit 1;

  insert into public.ad_account_requests
    (advertiser_id, tenant_id, email, platform, currency, timezone,
     website_url, notes, metadata, status,
     -- ── DE DRIE KOLOMMEN WAAR HET OVERZICHT OP LEEST ──────────
     charged_amount, charged_currency, charged_at)
  values
    (v_adv.id, v_adv.tenant_id, v_email, p_platform, v_cur, p_timezone,
     nullif(p_website_url, ''), nullif(p_notes, ''),
     v_meta_in
       || jsonb_build_object(
            'request_fee', v_fee,
            'request_fee_currency', v_cur,
            'request_fee_included', v_is_free,
            'request_fee_free_source', v_free_source
          ),
     'pending',
     -- NULL wanneer het gratis was: het overzicht filtert op
     -- charged_at, en een gratis aanvraag hoort er geen regel te
     -- krijgen.
     nullif(v_fee, 0),
     case when v_fee > 0 then v_cur else null end,
     case when v_fee > 0 then now() else null end)
  returning * into v_req;

  return v_req;
end;
$fn$;

-- =====================================================================
-- Het rapport - de SQL-editor toont alleen dit
-- =====================================================================
select 1 as nr, 'telt de motor nu ook de ad accounts zelf' as item,
  coalesce((
    select case when position('from public.ad_accounts a' in p.prosrc) > 0
                then 'ja - gerepareerd'
                else 'NEE - dit bestand is niet geplakt' end
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'ad_account_request_create_paid'
     limit 1
  ), 'functie bestaat niet') as antwoord
union all
select 2, 'per klant: inbegrepen / gebruikt OUD / gebruikt NIEUW',
  coalesce((
    select string_agg(
             x.code || ': ' || x.incl::text || ' inbegrepen, was ' ||
             x.oud::text || ', wordt ' || x.nieuw::text ||
             -- De vraag is of iemand van GRATIS naar BETAALD schuift,
             -- en de motor test `v_used < v_included`. De eerste versie
             -- hiervan vergeleek `nieuw > incl`, en zette daardoor een
             -- pijl bij een klant met 0 inbegrepen -- die betaalde al.
             case when x.oud < x.incl and x.nieuw >= x.incl
                  then '   <-- WAS GRATIS, KOST NU GELD'
                  else '' end,
             E'
' order by x.code)
      from (
        select a.tenant_client_code as code,
               coalesce(ap.included_ad_accounts, 0) as incl,
               (select count(*) from public.ad_account_requests r
                 where r.advertiser_id = a.id
                   and coalesce(r.status,'') not in ('rejected','cancelled')) as oud,
               (select count(*) from public.ad_accounts ac
                 where ac.advertiser_id = a.id)
               + (select count(*) from public.ad_account_requests r2
                   where r2.advertiser_id = a.id
                     and coalesce(r2.status,'') not in ('completed','rejected','cancelled')) as nieuw
          from public.advertisers a
          left join public.advertiser_plans ap on ap.advertiser_id = a.id
      ) x
  ), 'geen adverteerders')
union all
select 3, 'PSM0005 nu: accounts + open aanvragen',
  coalesce((
    select (select count(*) from public.ad_accounts ac where ac.advertiser_id = a.id)::text
           || ' account(s) + '
           || (select count(*) from public.ad_account_requests r
                where r.advertiser_id = a.id
                  and coalesce(r.status,'') not in ('completed','rejected','cancelled'))::text
           || ' open aanvraag/aanvragen, inbegrepen: '
           || coalesce((select ap.included_ad_accounts::text from public.advertiser_plans ap
                         where ap.advertiser_id = a.id), '?')
      from public.advertisers a
     where a.tenant_client_code = 'PSM0005'
     limit 1
  ), 'niet gevonden')
order by nr;
