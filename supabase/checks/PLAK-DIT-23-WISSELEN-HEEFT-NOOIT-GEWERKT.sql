-- =====================================================================
-- PLAK 23 — wisselen tussen EUR en USD heeft NOOIT gewerkt
-- =====================================================================
-- Gelopen op productie als PSM0005: 50 EUR wisselen gaf
--
--   insert or update on table "wallet_exchanges" violates foreign key
--   constraint "wallet_exchanges_created_by_fkey"
--
-- woordelijk, in een toast, op de wallet van de klant. Er is niets
-- kwijtgeraakt -- de hele transactie rolt terug, de saldo's stonden
-- onveranderd op EUR 95,00 en USD 0,00 -- maar er kon dus ook niets
-- gewisseld worden.
--
-- ── WAAROM ───────────────────────────────────────────────────────────
--
--   wallet_exchanges.created_by  ->  user_profiles(id)
--
-- en de RPC schrijft daar `auth.uid()` in. Dat is de AUTH-gebruiker, en
-- `user_profiles.id` is een eigen sleutel met een apart `user_id` dat
-- naar die auth-gebruiker wijst. Die twee zijn nooit hetzelfde, dus de
-- insert kan niet slagen -- voor niemand, nooit.
--
-- De rest van deze codebase doet het overal al goed. Uit
-- `wallet_topup_advertiser_create` (20260828120000_wallet_rpcs.sql):
--
--     select id, user_id, tenant_id, role into v_profile
--       from public.user_profiles where user_id = v_uid
--      order by created_at asc limit 1;
--     ... created_by = v_profile.id
--
-- en `wallet_precharge_create` schrijft `v_admin.profile_id`. Alleen
-- `wallet_exchange` mist die stap. Dat is de hele fout.
--
-- ── WAT DIT WEL EN NIET VERANDERT ────────────────────────────────────
--
-- ALLEEN de regel die `created_by` vult. De rekenkunde blijft letterlijk
-- staan zoals hij is: het slot op de walletrij, de eigenaarscontrole,
-- de saldocontrole, de koers per tenant, 0,6% fee over het BRUTO in de
-- doelvaluta, afronden op 2 decimalen, en dezelfde JSON terug. Ik heb
-- die cijfers op het scherm nagerekend voordat ik hem indrukte --
-- 50 EUR / 0,872361 = 57,3157 bruto, fee 0,34, ontvangt 56,98 -- en app
-- en functie kwamen tot op de cent overeen. Daar blijf ik dus af.
--
-- Als iemand geen user_profiles-rij heeft blijft `created_by` leeg in
-- plaats van dat de wissel afketst: de eigenaarscontrole twee stappen
-- eerder heeft dan al bewezen dat het zijn eigen wallet is, en zijn
-- eigen geld tegenhouden om een ontbrekende auditregel is de verkeerde
-- kant op falen. De kolom staat null toe (on delete set null).
--
-- ── EN DE TWEE ONTBREKENDE TRIGGERS ──────────────────────────────────
--
-- `wallet_exchanges` staat in GEEN van beide verplichte lijsten uit
-- CLAUDE.md: niet in de audited-array van
-- 20260828130000_audit_events.sql en niet in die van
-- 20260829140000_updated_at_triggers.sql. Een wissel beweegt twee
-- saldo's en was tot nu toe niet terug te lezen uit `audit_events`.
-- Dezelfde twee regels als elke andere financiële tabel, hier alsnog.
--
-- Veilig om vaker te draaien.
-- =====================================================================

set search_path = public;

create temporary table if not exists _we (k text, v text);
delete from _we;

-- ── Meten vóór ───────────────────────────────────────────────────────
insert into _we
select 'rijen_voor', (select count(*)::text from public.wallet_exchanges);

insert into _we
select 'kolommen',
  coalesce((
    select string_agg(column_name || ' ' || data_type ||
                      case when is_nullable = 'NO' then ' NOT NULL' else '' end,
                      E'\n' order by ordinal_position)
      from information_schema.columns
     where table_schema = 'public' and table_name = 'wallet_exchanges'
  ), 'tabel bestaat niet');

-- ── De functie, met de ene regel gerepareerd ─────────────────────────
create or replace function public.wallet_exchange(
  p_wallet_id uuid,
  p_from_currency text,
  p_amount numeric
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $blk0$
DECLARE
  v_user_id uuid;
  v_profile_id uuid;
  v_wallet RECORD;
  v_advertiser RECORD;
  v_exchange_rate numeric;
  v_to_currency text;
  v_to_amount_gross numeric;
  v_fee_amount numeric;
  v_to_amount_net numeric;
  v_exchange_id uuid;
BEGIN
  -- 1. Auth check
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  -- 2. Validate inputs
  IF p_from_currency NOT IN ('USD', 'EUR') THEN
    RAISE EXCEPTION 'Invalid currency: %', p_from_currency USING ERRCODE = '22023';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive' USING ERRCODE = '22023';
  END IF;

  v_to_currency := CASE WHEN p_from_currency = 'USD' THEN 'EUR' ELSE 'USD' END;

  -- 3. Lock wallet row (serializes parallel calls)
  SELECT w.* INTO v_wallet
  FROM wallets w
  WHERE w.id = p_wallet_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet not found' USING ERRCODE = '02000';
  END IF;

  -- 4. Ownership check: caller must be the advertiser who owns this wallet
  SELECT a.* INTO v_advertiser
  FROM advertisers a
  WHERE a.id = v_wallet.advertiser_id
  AND a.user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Forbidden: wallet does not belong to caller' USING ERRCODE = '42501';
  END IF;

  -- 4b. DE REPARATIE. created_by wijst naar user_profiles(id), niet naar
  --     de auth-gebruiker. auth.uid() daarin zetten kan per definitie
  --     niet slagen; dit is de stap die overal elders in deze codebase
  --     wel staat. Blijft hij leeg, dan gaat de wissel gewoon door --
  --     stap 4 heeft het eigendom al bewezen.
  SELECT up.id INTO v_profile_id
  FROM user_profiles up
  WHERE up.user_id = v_user_id
  ORDER BY up.created_at ASC
  LIMIT 1;

  -- 5. Balance check
  IF p_from_currency = 'USD' AND v_wallet.usd_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient USD balance' USING ERRCODE = '23514';
  END IF;
  IF p_from_currency = 'EUR' AND v_wallet.eur_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient EUR balance' USING ERRCODE = '23514';
  END IF;

  -- 6. Fetch active rate for this tenant
  --    Semantic: rate = "1 USD = N EUR"
  SELECT er.eur INTO v_exchange_rate
  FROM exchange_rates er
  WHERE er.tenant_id = v_wallet.tenant_id
  AND er.is_active = true
  ORDER BY er.updated_at DESC NULLS LAST
  LIMIT 1;

  IF v_exchange_rate IS NULL OR v_exchange_rate <= 0 THEN
    RAISE EXCEPTION 'Exchange rate unavailable for tenant' USING ERRCODE = '02000';
  END IF;

  -- 7. Calculate gross to_amount (server-side, attacker cannot spoof)
  IF p_from_currency = 'USD' THEN
    v_to_amount_gross := p_amount * v_exchange_rate;
  ELSE
    v_to_amount_gross := p_amount / v_exchange_rate;
  END IF;

  -- 8. Fee = 0.6% of gross to_amount in target currency
  v_fee_amount := round(v_to_amount_gross * 0.006::numeric, 2);
  v_to_amount_net := round(v_to_amount_gross - v_fee_amount, 2);

  IF v_to_amount_net <= 0 THEN
    RAISE EXCEPTION 'Net exchange amount too small after fee' USING ERRCODE = '22023';
  END IF;

  -- 9. Insert exchange record (audit trail)
  INSERT INTO wallet_exchanges (
    wallet_id, from_currency, to_currency,
    from_amount, to_amount, exchange_rate,
    fee_amount, created_by
  ) VALUES (
    p_wallet_id, p_from_currency, v_to_currency,
    p_amount, v_to_amount_net, v_exchange_rate,
    v_fee_amount, v_profile_id
  ) RETURNING id INTO v_exchange_id;

  -- 10. Update wallet balances atomically (we hold FOR UPDATE lock)
  IF p_from_currency = 'USD' THEN
    UPDATE wallets
    SET usd_balance = usd_balance - p_amount,
        eur_balance = eur_balance + v_to_amount_net,
        updated_at = now()
    WHERE id = p_wallet_id;
  ELSE
    UPDATE wallets
    SET eur_balance = eur_balance - p_amount,
        usd_balance = usd_balance + v_to_amount_net,
        updated_at = now()
    WHERE id = p_wallet_id;
  END IF;

  -- 11. Return JSON result
  RETURN jsonb_build_object(
    'success', true,
    'exchange_id', v_exchange_id,
    'from_currency', p_from_currency,
    'to_currency', v_to_currency,
    'from_amount', p_amount,
    'to_amount', v_to_amount_net,
    'fee_amount', v_fee_amount,
    'exchange_rate', v_exchange_rate
  );
END;
$blk0$;

-- ── De twee triggers die elke andere financiële tabel wel heeft ───────
do $blk1$
declare
  v_got text := '';
begin
  if exists (select 1 from information_schema.tables
              where table_schema = 'public' and table_name = 'wallet_exchanges')
     and exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = '_audit_row_change')
  then
    execute 'drop trigger if exists trg_audit_wallet_exchanges on public.wallet_exchanges;
             create trigger trg_audit_wallet_exchanges
               after insert or update or delete on public.wallet_exchanges
               for each row execute function public._audit_row_change();';
    v_got := 'audit aangehangen';
  else
    v_got := 'audit NIET aangehangen (tabel of _audit_row_change ontbreekt)';
  end if;

  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'wallet_exchanges'
                and column_name = 'updated_at')
     and exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = '_touch_updated_at')
  then
    execute 'drop trigger if exists trg_touch_wallet_exchanges on public.wallet_exchanges;
             create trigger trg_touch_wallet_exchanges
               before update on public.wallet_exchanges
               for each row execute function public._touch_updated_at();';
    v_got := v_got || ' + updated_at aangehangen';
  else
    v_got := v_got || ' + geen updated_at-kolom, dus die trigger niet (klopt)';
  end if;

  insert into _we values ('triggers', v_got);
exception when others then
  insert into _we values ('triggers', 'MISLUKT: ' || sqlstate || ' ' || sqlerrm);
end;
$blk1$;

-- =====================================================================
-- Het rapport — de SQL-editor toont alleen dit
-- =====================================================================
select 1 as nr, 'heeft er OOIT iemand kunnen wisselen' as item,
  case coalesce((select v from _we where k = 'rijen_voor' limit 1), '?')
    when '0' then 'nee - 0 rijen in wallet_exchanges, precies wat de FK voorspelt'
    else coalesce((select v from _we where k = 'rijen_voor' limit 1), '?') ||
         ' rij(en) stonden er al - die zijn van vóór de FK, zeg het even'
  end as antwoord
union all
select 2, 'schrijft de functie nu de PROFIEL-id (en niet auth.uid())',
  case when exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'wallet_exchange'
       and position('v_profile_id' in pg_get_functiondef(p.oid)) > 0
       and position('fee_amount, v_profile_id' in pg_get_functiondef(p.oid)) > 0
  ) then 'ja - gerepareerd'
  else 'NEE - NIET GOED, zeg het meteen' end
union all
select 3, 'staat auth.uid() nog ergens als created_by',
  case when exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'wallet_exchange'
       and position('fee_amount, v_user_id' in pg_get_functiondef(p.oid)) > 0
  ) then 'JA - NIET GOED' else 'nee - weg' end
union all
select 4, 'de rekenkunde staat er nog precies zo in (0,6% over bruto)',
  case when exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'wallet_exchange'
       and position('0.006::numeric, 2' in pg_get_functiondef(p.oid)) > 0
       and position('FOR UPDATE' in pg_get_functiondef(p.oid)) > 0
       and position('does not belong to caller' in pg_get_functiondef(p.oid)) > 0
  ) then 'ja - slot, eigenaarscontrole en fee onveranderd'
  else 'NIET GOED - er is meer veranderd dan de bedoeling was' end
union all
select 5, 'triggers', coalesce((select v from _we where k = 'triggers' limit 1), '?')
union all
select 6, 'triggers die er nu op wallet_exchanges hangen',
  coalesce((
    select string_agg(t.tgname || ' -> ' || p.proname, E'\n' order by t.tgname)
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_proc p on p.oid = t.tgfoid
     where c.relname = 'wallet_exchanges'
       and c.relnamespace = 'public'::regnamespace
       and not t.tgisinternal
  ), 'geen')
union all
select 7, 'kolommen van wallet_exchanges (staat er een tenant_id die leeg blijft)',
  coalesce((select v from _we where k = 'kolommen' limit 1), '?')
union all
select 8, 'wie mag wallet_exchanges LEZEN (ziet de klant zijn eigen wissel terug)',
  coalesce((
    select string_agg(policyname || ' [' || cmd || ']  using: ' ||
                      coalesce(qual, '-'), E'\n' order by cmd, policyname)
      from pg_policies
     where schemaname = 'public' and tablename = 'wallet_exchanges'
  ), 'GEEN POLICY - dan is de tabel dicht en ziet niemand zijn wissels')
union all
-- to_jsonb, niet a.advertiser_code: een kolom die niet bestaat laat
-- 42703 de HELE plak omvallen en dan ziet niemand een rapport. Zo komt
-- er hooguit niets uit deze ene regel.
select 9, 'het saldo van PSM0005 nu (moet 95,00 EUR / 0,00 USD zijn)',
  coalesce((
    select string_agg(coalesce(to_jsonb(a) ->> 'advertiser_code',
                               to_jsonb(a) ->> 'code', a.id::text) || ': ' ||
                      coalesce(w.eur_balance, 0)::text || ' EUR / ' ||
                      coalesce(w.usd_balance, 0)::text || ' USD', E'\n')
      from public.wallets w
      join public.advertisers a on a.id = w.advertiser_id
     where coalesce(to_jsonb(a) ->> 'advertiser_code',
                    to_jsonb(a) ->> 'code', '') = 'PSM0005'
  ), 'niet gevonden')
order by nr;
