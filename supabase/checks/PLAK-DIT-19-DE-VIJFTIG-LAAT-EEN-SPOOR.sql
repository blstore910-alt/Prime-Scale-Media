-- =====================================================================
-- PLAK 19 — de EUR 50 laat eindelijk een spoor na
-- =====================================================================
-- Twee gaten die de bodies uit plak 18 bevestigden. Allebei in dezelfde
-- twee functies, dus in één plak.
--
-- ── 1. DE AFSCHRIJVING STAAT OP GEEN ENKEL KLANTSCHERM ───────────────
--
-- `ad_account_request_create_paid` schrijft `charged_amount`,
-- `charged_currency` en `charged_at` niet. Het wallet-overzicht bouwt
-- zijn regel juist uit die drie kolommen, met
-- `.not("charged_at","is",null)` -- dus die regel is altijd leeg.
--
-- De klant ziet EUR 500 worden EUR 450 en kan nergens vinden waarom.
-- Er staan zeven historische afschrijvingen zonder spoor; die worden
-- hieronder alsnog uit de metadata bijgeschreven.
--
-- ── 2. DE KLANT KON ZIJN EIGEN TERUGBETALING UITZETTEN ───────────────
--
-- De metadata-merge overschrijft vier sleutels:
--   request_fee, request_fee_currency, request_fee_included,
--   request_fee_free_source
-- `request_fee_refunded_at` zit daar NIET bij. Wie hem zelf meestuurt
-- in p_metadata pre-stempelt de rij, en `ad_account_request_reject_refund`
-- leest dat als "al terugbetaald": de EUR 50 is echt afgeschreven, de
-- afwijzing houdt hem, en de admin krijgt te zien "No fee was charged
-- for this one, so there is nothing to refund".
--
-- Twee reparaties, want één is niet genoeg:
--   * create_paid STRIPT alle server-sleutels uit wat de beller
--     meestuurt, voordat het mergt.
--   * reject_refund gelooft de METADATA niet meer, maar de kolom
--     `refunded_at` -- die de klant niet kan schrijven. Historische
--     rijen worden hieronder bijgewerkt zodat die kolom klopt.
--
-- ── WAAROM DIT VEILIG IS OM TE PLAKKEN ───────────────────────────────
--
-- De bodies hieronder zijn LETTERLIJK die van de live database, zoals
-- teruggestuurd, met de gemarkeerde regels erbij. Er is niets uit de
-- repo overgezet.
--
-- En het script kijkt EERST of de vijf kolommen bestaan. Bestaan ze
-- niet, dan wordt er geen functie vervangen en zegt regel 1 het --
-- liever niets dan een functie die bij de volgende aanvraag omvalt.
--
-- Veilig om vaker te draaien.
-- =====================================================================

set search_path = public;

create temporary table if not exists _fee (k text, v text);
delete from _fee;

do $blk0$
declare
  v_have int;
  v_cols text;
begin
  select count(*) into v_have
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'ad_account_requests'
     and column_name in ('charged_amount', 'charged_currency', 'charged_at',
                         'refunded_amount', 'refunded_at');

  select coalesce(string_agg(column_name, ', ' order by column_name), 'geen')
    into v_cols
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'ad_account_requests'
     and column_name in ('charged_amount', 'charged_currency', 'charged_at',
                         'refunded_amount', 'refunded_at');

  insert into _fee values ('kolommen', v_have::text || ' van 5: ' || v_cols);

  if v_have <> 5 then
    insert into _fee values ('gestopt',
      'NIET alle vijf kolommen bestaan -- er is niets vervangen');
    return;
  end if;

  -- ── create_paid: strip de server-sleutels EN schrijf de kolommen ───
  execute $def$
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

      select count(*) into v_used
        from public.ad_account_requests
       where advertiser_id = v_adv.id
         and coalesce(status, '') not in ('rejected', 'cancelled');

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
  $def$;
  insert into _fee values ('create_paid', 'vervangen');

  -- ── reject_refund: geloof de KOLOM, niet de metadata ──────────────
  execute $def2$
    create or replace function public.ad_account_request_reject_refund(
      p_request_id uuid, p_reason text default null::text)
    returns jsonb
    language plpgsql
    security definer
    set search_path to 'public'
    as $fn2$
    declare
      v_uid          uuid := auth.uid();
      v_admin_id     uuid;
      v_admin_tenant uuid;
      v_req_tenant   uuid;
      v_req_status   text;
      v_req_adv      uuid;
      v_meta         jsonb;
      v_fee          numeric;
      v_cur          text;
      v_src          text;
      v_wallet_id    uuid;
      v_perk_id      uuid;
      v_refunded     numeric := 0;
      v_perk_restored boolean := false;
      v_already      boolean;
    begin
      if v_uid is null then
        raise exception 'not authenticated' using errcode = '28000';
      end if;

      select up.id, up.tenant_id into v_admin_id, v_admin_tenant
        from public.user_profiles up
       where up.user_id = v_uid
         and up.role = 'admin'
         and coalesce(up.is_active, true)
       limit 1;
      if not found then
        raise exception 'admins only' using errcode = '42501';
      end if;

      -- ── v_already KOMT UIT DE KOLOM ───────────────────────────────
      -- Was: `(v_meta->>'request_fee_refunded_at') is not null`. Die
      -- sleutel stond niet in de lijst die create_paid overschreef, dus
      -- een klant kon hem zelf meesturen en zijn eigen terugbetaling
      -- uitzetten. `refunded_at` is een kolom die hij niet kan
      -- schrijven.
      select r.tenant_id, r.status, r.advertiser_id,
             coalesce(r.metadata, '{}'::jsonb), r.refunded_at is not null
        into v_req_tenant, v_req_status, v_req_adv, v_meta, v_already
        from public.ad_account_requests r
       where r.id = p_request_id
       for update;
      if not found then
        raise exception 'request not found' using errcode = '42704';
      end if;
      if v_req_tenant <> v_admin_tenant then
        raise exception 'not your tenant' using errcode = '42501';
      end if;
      if v_req_status = 'completed' then
        raise exception 'That request was already completed - it cannot be rejected.'
          using errcode = '22000';
      end if;
      if v_req_status = 'rejected' then
        raise exception 'That request was already rejected.' using errcode = '22000';
      end if;

      v_fee := coalesce((v_meta->>'request_fee')::numeric, 0);
      v_cur := upper(coalesce(v_meta->>'request_fee_currency', 'EUR'));
      v_src := coalesce(v_meta->>'request_fee_free_source', '');

      update public.ad_account_requests
         set status = 'rejected',
             rejection_reason = nullif(btrim(coalesce(p_reason, '')), '')
       where id = p_request_id;

      if v_fee > 0 and not v_already then
        select w.id into v_wallet_id
          from public.wallets w
         where w.advertiser_id = v_req_adv
         for update;
        if not found then
          raise exception 'That advertiser has no wallet to refund into.'
            using errcode = '42704';
        end if;

        if v_cur = 'USD' then
          update public.wallets
             set usd_balance = coalesce(usd_balance, 0) + v_fee,
                 updated_at = now()
           where id = v_wallet_id;
        else
          update public.wallets
             set eur_balance = coalesce(eur_balance, 0) + v_fee,
                 updated_at = now()
           where id = v_wallet_id;
        end if;
        v_refunded := v_fee;
      end if;

      if v_src = 'perk' and not v_already then
        select ap.id into v_perk_id
          from public.advertiser_perks ap
         where ap.advertiser_id = v_req_adv
           and ap.kind = 'free_ad_account_requests'
           and ap.active
           and (ap.expires_at is null or ap.expires_at > now())
         order by ap.expires_at nulls last
         for update
         limit 1;
        if found then
          update public.advertiser_perks
             set remaining = coalesce(remaining, 0) + 1, updated_at = now()
           where id = v_perk_id;
          v_perk_restored := true;
        end if;
      end if;

      -- Stempel in de KOLOM zowel als in de metadata.
      if v_refunded > 0 or v_perk_restored then
        update public.ad_account_requests
           set refunded_amount = nullif(v_refunded, 0),
               refunded_at     = now(),
               metadata = coalesce(metadata, '{}'::jsonb)
                          || jsonb_build_object(
                               'request_fee_refunded_at', now(),
                               'request_fee_refunded_by', v_admin_id
                             )
         where id = p_request_id;
      end if;

      return jsonb_build_object(
        'refunded', v_refunded,
        'currency', v_cur,
        'perk_restored', v_perk_restored
      );
    end;
    $fn2$;
  $def2$;
  insert into _fee values ('reject_refund', 'vervangen');
exception when others then
  insert into _fee values ('FOUT', sqlstate || ' ' || sqlerrm);
end;
$blk0$;

-- ── De afschrijvingen die er al staan, alsnog uit de metadata ───────
do $blk1$
declare
  v_c int := 0;
  v_r int := 0;
begin
  with done as (
    update public.ad_account_requests r
       set charged_amount   = (r.metadata->>'request_fee')::numeric,
           charged_currency = upper(coalesce(r.metadata->>'request_fee_currency','EUR')),
           charged_at       = r.created_at
     where r.charged_at is null
       and coalesce((r.metadata->>'request_fee')::numeric, 0) > 0
    returning 1
  ) select count(*) into v_c from done;

  with done2 as (
    update public.ad_account_requests r
       set refunded_amount = coalesce(r.refunded_amount, (r.metadata->>'request_fee')::numeric),
           refunded_at     = (r.metadata->>'request_fee_refunded_at')::timestamptz
     where r.refunded_at is null
       and (r.metadata->>'request_fee_refunded_at') is not null
    returning 1
  ) select count(*) into v_r from done2;

  insert into _fee values ('bijgewerkt',
    v_c::text || ' afschrijving(en) kregen hun spoor, '
    || v_r::text || ' terugbetaling(en) hun kolom');
exception when others then
  insert into _fee values ('bijgewerkt', 'MISLUKT: ' || sqlstate || ' ' || sqlerrm);
end;
$blk1$;

-- =====================================================================
-- Het rapport — de SQL-editor toont alleen dit
-- =====================================================================
select 1 as nr, 'bestaan de vijf kolommen' as item,
  coalesce((select v from _fee where k = 'kolommen' limit 1), '?') as antwoord
union all
select 2, 'wat er vervangen is',
  coalesce((select string_agg(k || ': ' || v, E'\n' order by k)
              from _fee where k in ('create_paid','reject_refund','gestopt','FOUT')),
           'niets')
union all
select 3, 'historische rijen bijgewerkt',
  coalesce((select v from _fee where k = 'bijgewerkt' limit 1), '?')
union all
select 4, 'schrijft create_paid nu charged_at',
  coalesce((
    select case when position('charged_at)' in p.prosrc) > 0
                then 'ja - gerepareerd' else 'NEE' end
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'ad_account_request_create_paid'
     limit 1), 'functie bestaat niet')
union all
select 5, 'strip create_paid de server-sleutels uit p_metadata',
  coalesce((
    select case when position('request_fee_refunded_at''' in p.prosrc) > 0
                then 'ja - gerepareerd' else 'NEE' end
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'ad_account_request_create_paid'
     limit 1), 'functie bestaat niet')
union all
select 6, 'leest reject_refund nu de KOLOM in plaats van de metadata',
  coalesce((
    select case when position('r.refunded_at is not null' in p.prosrc) > 0
                then 'ja - gerepareerd' else 'NEE' end
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'ad_account_request_reject_refund'
     limit 1), 'functie bestaat niet')
union all
select 7, 'afschrijvingen zonder spoor die nog over zijn',
  (select count(*)::text from public.ad_account_requests
    where charged_at is null
      and coalesce((metadata->>'request_fee')::numeric, 0) > 0)
order by nr;
