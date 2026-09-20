-- =====================================================================
-- PLAK 3B — dezelfde fee-fix, nu langs de view heen
-- =====================================================================
-- 3A struikelde op:
--
--   0A000: cannot alter type of a column used by a view or rule
--   DETAIL: rule _RETURN on view top_ups_view depends on column "fee"
--
-- Terecht. Een view pint het type van elke kolom die hij doorgeeft
-- vast. Dus: de definitie van de view uitlezen, hem opzij zetten, de
-- kolom verbreden, en hem exact zo terugzetten -- inclusief
-- security_invoker, dat 20260920290000 er bewust op heeft gezet.
--
-- De definitie wordt UIT DE DATABASE gelezen, niet uit deze repo. Die
-- view is met de hand geschreven en staat in geen migratie; hem uit de
-- repo terugzetten is precies de fout die hier al eens de productie
-- plat heeft gelegd.
--
-- Als er nog een view op top_ups_view leunt, faalt de DROP met een
-- duidelijke melding en is er niets veranderd. Dan hoor ik het en doe
-- ik die erbij.
--
-- De rest van dit bestand is 3A ongewijzigd.
--
-- Veilig om vaker te draaien.
-- =====================================================================

set search_path = public;

-- ── De kolom moet decimalen aankunnen ────────────────────────────────
do $col$
declare
  v_type    text;
  v_def     text;
  v_secinv  boolean := false;
  v_grants  text := '';
  g         record;
begin
  select data_type into v_type
    from information_schema.columns
   where table_schema = 'public' and table_name = 'top_ups' and column_name = 'fee';

  if v_type is null then
    raise notice 'top_ups.fee bestaat niet; overgeslagen';
    return;
  end if;

  if v_type not in ('smallint', 'integer', 'bigint') then
    raise notice 'top_ups.fee is al %; niets te doen', v_type;
    return;
  end if;

  if to_regclass('public.top_ups_view') is not null then
    -- De definitie zoals de database hem NU heeft.
    v_def := pg_get_viewdef('public.top_ups_view'::regclass, true);

    select coalesce(
             (select true from pg_class c
               where c.oid = 'public.top_ups_view'::regclass
                 and c.reloptions::text ilike '%security_invoker=on%'),
             false)
      into v_secinv;

    -- En wie er nu op mag lezen, zodat dat niet stilletjes wegvalt.
    for g in
      select grantee, privilege_type
        from information_schema.role_table_grants
       where table_schema = 'public' and table_name = 'top_ups_view'
    loop
      v_grants := v_grants || format(
        'grant %s on public.top_ups_view to %I; ', g.privilege_type, g.grantee);
    end loop;

    execute 'drop view public.top_ups_view';
    raise notice 'top_ups_view opzij gezet (security_invoker=%)', v_secinv;
  end if;

  execute 'alter table public.top_ups alter column fee type numeric(6,3) using fee::numeric';
  raise notice 'top_ups.fee verbreed van % naar numeric(6,3)', v_type;

  if v_def is not null then
    if v_secinv then
      execute 'create view public.top_ups_view with (security_invoker = on) as ' || v_def;
    else
      execute 'create view public.top_ups_view as ' || v_def;
    end if;
    if length(v_grants) > 0 then
      execute v_grants;
    end if;
    raise notice 'top_ups_view teruggezet';
  end if;
end;
$col$;

-- ── De tariefbepaling, als functie, zodat er één plek is ─────────────
-- Precies resolveEffectiveFeePct uit actions/topup-actions.ts, voor het
-- klantpad (fallback 0 -- de klant heeft geen eigen figuur mee te
-- geven).
create or replace function public._effective_topup_fee_pct(
  p_advertiser_id uuid,
  p_ad_account_id uuid
)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $fee$
declare
  v_acct_fee   numeric;
  v_platform   text;
  v_is_premium boolean := false;
  v_plan_pct   numeric;
  v_base       numeric;
  v_waiver     boolean := false;
  v_discount   numeric := 0;
  v_premium    numeric := 0;
  v_pct        numeric;
begin
  select aa.fee, aa.platform into v_acct_fee, v_platform
    from public.ad_accounts aa
   where aa.id = p_ad_account_id;

  -- sameSlug, niet =. Het settings-scherm slugt een type uit zijn label,
  -- dus "Meta-EU-Premium" ligt opgeslagen als meta-eu-premium terwijl de
  -- seed eu-meta-premium schrijft. Op gesorteerde woorden vergelijken is
  -- wat lib/pure-slug-key doet, en waarom dat bestaat: een exacte
  -- vergelijking hield de twee punten korting voor altijd tegen.
  v_is_premium := (
    select coalesce(string_agg(w, '-' order by w), '')
      from unnest(string_to_array(lower(coalesce(v_platform, '')), '-')) w
      where w <> ''
  ) = 'eu-meta-premium';

  -- Een plan dat er niet is, is geen fout. Een tabel die er niet is ook
  -- niet -- die komt met een migratie mee.
  begin
    select p.topup_fee_pct into v_plan_pct
      from public.advertiser_plans p
     where p.advertiser_id = p_advertiser_id
     limit 1;
  exception when undefined_table or undefined_column then
    v_plan_pct := null;
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

  -- Account wint van plan, plan wint van niets. Exact de volgorde in
  -- resolveEffectiveFeePct: alleen een fee > 0 telt als "het account
  -- heeft een eigen tarief".
  if v_acct_fee is not null and v_acct_fee > 0 then
    v_base := v_acct_fee;
  elsif v_plan_pct is not null then
    v_base := v_plan_pct;
  else
    v_base := 0;
  end if;

  -- PROCENT ERAF, GEEN PROCENTPUNTEN. Het promotie-scherm noemt dit
  -- "Top-up fee discount (%)" en toont de rij als "20% off". Als
  -- puntenaftrek zou 20% korting op een 5%-account 0% opleveren -- een
  -- top-up van EUR 10.000 die niets int in plaats van $465.
  -- De twee premium-punten blijven wel een aftrek, want dat ZIJN ze.
  v_pct := v_base * (1 - least(greatest(v_discount, 0), 100) / 100.0);
  if v_waiver then
    v_pct := 0;
  else
    v_pct := greatest(0, v_pct - v_premium);
  end if;

  return round(v_pct, 3);
end;
$fee$;

-- ── De RPC zelf: jouw body, één blok anders ──────────────────────────
create or replace function public.top_up_create_for_advertiser(
  p_account_id uuid,
  p_currency text,
  p_amount_received numeric,
  p_type text,
  p_payment_slip text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $topup$
DECLARE
  v_user_id uuid := auth.uid();
  v_advertiser RECORD;
  v_ad_account RECORD;
  v_wallet RECORD;
  v_exchange_rate numeric;
  v_fee_pct numeric;
  v_fee_amount numeric;
  v_topup_amount numeric;
  v_amount_usd numeric;
  v_eur_value numeric;
  v_topup_usd numeric;
  v_eur_topup numeric;
  v_topup_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;
  IF upper(p_currency) NOT IN ('USD', 'EUR') THEN
    RAISE EXCEPTION 'Invalid currency' USING ERRCODE = '22023';
  END IF;
  IF p_amount_received IS NULL OR p_amount_received <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive' USING ERRCODE = '22023';
  END IF;
  IF p_type IS NULL OR length(trim(p_type)) = 0 THEN
    RAISE EXCEPTION 'Type required' USING ERRCODE = '22023';
  END IF;

  SELECT a.id, a.tenant_id INTO v_advertiser
  FROM advertisers a WHERE a.user_id = v_user_id LIMIT 1;
  IF v_advertiser.id IS NULL THEN
    RAISE EXCEPTION 'Advertiser not found' USING ERRCODE = '42501';
  END IF;

  SELECT aa.id, aa.fee INTO v_ad_account
  FROM ad_accounts aa
  WHERE aa.id = p_account_id
  AND aa.tenant_id = v_advertiser.tenant_id
  AND aa.advertiser_id = v_advertiser.id;
  IF v_ad_account.id IS NULL THEN
    RAISE EXCEPTION 'Ad account not found or unauthorized' USING ERRCODE = '42501';
  END IF;

  -- ── HET ENIGE WAT ANDERS IS ────────────────────────────────────────
  --
  -- Was: v_fee_smallint := COALESCE(ROUND(v_ad_account.fee)::smallint, 0)
  --
  -- Dat sloeg de perks, de twee Meta-EU-Premium-punten, het plan en elke
  -- decimaal over -- terwijl de dialoog waar de klant net op geklikt
  -- heeft alle vier wél rekent. Een klant met een fee waiver werd de
  -- volle fee gerekend; een account zonder eigen fee bij een klant op
  -- een 5%-plan werd op 0 gezet.
  v_fee_pct := public._effective_topup_fee_pct(v_advertiser.id, p_account_id);

  SELECT w.id, w.usd_balance, w.eur_balance INTO v_wallet
  FROM wallets w WHERE w.advertiser_id = v_advertiser.id FOR UPDATE;
  IF v_wallet.id IS NULL THEN
    RAISE EXCEPTION 'Wallet not found' USING ERRCODE = 'P0002';
  END IF;

  IF upper(p_currency) = 'USD' AND v_wallet.usd_balance < p_amount_received THEN
    RAISE EXCEPTION 'Insufficient USD balance' USING ERRCODE = '23514';
  END IF;
  IF upper(p_currency) = 'EUR' AND v_wallet.eur_balance < p_amount_received THEN
    RAISE EXCEPTION 'Insufficient EUR balance' USING ERRCODE = '23514';
  END IF;

  SELECT er.eur INTO v_exchange_rate
  FROM exchange_rates er
  WHERE er.tenant_id = v_advertiser.tenant_id AND er.is_active = true
  ORDER BY er.updated_at DESC NULLS LAST LIMIT 1;
  IF v_exchange_rate IS NULL OR v_exchange_rate <= 0 THEN
    RAISE EXCEPTION 'Exchange rate unavailable' USING ERRCODE = '02000';
  END IF;

  v_fee_amount := round(p_amount_received * v_fee_pct / 100, 2);
  v_topup_amount := round(p_amount_received - v_fee_amount, 2);

  IF upper(p_currency) = 'USD' THEN
    v_amount_usd := p_amount_received;
    v_topup_usd := v_topup_amount;
    v_eur_value := round(p_amount_received * v_exchange_rate, 2);
    v_eur_topup := round(v_topup_amount * v_exchange_rate, 2);
  ELSE
    v_eur_value := p_amount_received;
    v_eur_topup := v_topup_amount;
    v_amount_usd := round(p_amount_received / v_exchange_rate, 2);
    v_topup_usd := round(v_topup_amount / v_exchange_rate, 2);
  END IF;

  INSERT INTO top_ups (
    advertiser_id, account_id, tenant_id,
    status, type, currency,
    amount_received, topup_amount, fee, fee_amount,
    amount_usd, topup_usd, eur_value, eur_topup, rate,
    payment_slip, wallet_debited, is_deleted
  ) VALUES (
    v_advertiser.id, p_account_id, v_advertiser.tenant_id,
    'pending', p_type, upper(p_currency),
    p_amount_received, v_topup_amount, v_fee_pct, v_fee_amount,
    v_amount_usd, v_topup_usd, v_eur_value, v_eur_topup, v_exchange_rate,
    p_payment_slip, true, false
  ) RETURNING id INTO v_topup_id;

  IF upper(p_currency) = 'USD' THEN
    UPDATE wallets SET usd_balance = usd_balance - p_amount_received,
      updated_at = now() WHERE id = v_wallet.id;
  ELSE
    UPDATE wallets SET eur_balance = eur_balance - p_amount_received,
      updated_at = now() WHERE id = v_wallet.id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'top_up_id', v_topup_id,
    'amount_received', p_amount_received,
    'currency', upper(p_currency),
    'fee_amount', v_fee_amount,
    'topup_amount', v_topup_amount,
    'exchange_rate', v_exchange_rate
  );
END;
$topup$;

-- =====================================================================
-- Het rapport — de SQL-editor toont alleen dit
-- =====================================================================
select 1 as nr, 'top_ups.fee kolomtype' as item,
  coalesce((
    select data_type from information_schema.columns
     where table_schema = 'public' and table_name = 'top_ups' and column_name = 'fee'
  ), 'kolom bestaat niet') as antwoord
union all
select 2, 'top_ups_view staat er nog  |  security_invoker',
  case when to_regclass('public.top_ups_view') is null then 'WEG - zeg het me'
       else 'ja  |  ' || coalesce((
         select case when c.reloptions::text ilike '%security_invoker=on%'
                     then 'aan' else 'UIT' end
           from pg_class c where c.oid = 'public.top_ups_view'::regclass), 'onbekend')
  end
union all
select 3, 'rekent de RPC nu perks/premium/plan mee',
  coalesce((
    select case when position('_effective_topup_fee_pct' in p.prosrc) > 0
                then 'JA' else 'NEE - dit bestand is niet geplakt' end
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'top_up_create_for_advertiser' limit 1
  ), 'functie bestaat niet')
union all
-- Het bewijs dat scherm en server het nu eens zijn. Per ad-account: wat
-- de OUDE regel rekende tegen wat het scherm rekent.
select 4, 'ad-accounts waar OUD en NIEUW tarief verschillen',
  coalesce((
    select string_agg(
             coalesce(aa.name, aa.id::text) || ': oud ' ||
             to_char(round(coalesce(aa.fee, 0)), 'FM990.###') || '%  ->  nieuw ' ||
             to_char(public._effective_topup_fee_pct(aa.advertiser_id, aa.id), 'FM990.###') || '%',
             E'\n' order by aa.name)
      from public.ad_accounts aa
     where aa.advertiser_id is not null
       and round(coalesce(aa.fee, 0))
           is distinct from public._effective_topup_fee_pct(aa.advertiser_id, aa.id)
  ), 'geen - scherm en server rekenden al hetzelfde')
union all
select 5, 'actieve top-up perks nu',
  coalesce((
    select count(*)::text || '  |  ' ||
           coalesce(string_agg(distinct pk.kind, ', '), '-')
      from public.advertiser_perks pk
     where pk.active
       and pk.kind in ('topup_fee_waiver', 'topup_discount')
       and (pk.starts_at is null or pk.starts_at <= now())
       and (pk.expires_at is null or pk.expires_at > now())
  ), '0')
union all
select 6, 'ad-accounts met een premium-type (2 punten korting)',
  (select count(*)::text from public.ad_accounts aa
    where (select coalesce(string_agg(w, '-' order by w), '')
             from unnest(string_to_array(lower(coalesce(aa.platform, '')), '-')) w
            where w <> '') = 'eu-meta-premium')
union all
select 7, 'bestaande top-ups met een fee die niet het huidige tarief is',
  (select count(*)::text from public.top_ups t
     join public.ad_accounts aa on aa.id = t.account_id
    where t.status = 'completed'
      and round(coalesce(t.fee, 0), 3)
          is distinct from public._effective_topup_fee_pct(aa.advertiser_id, aa.id))
order by nr;
