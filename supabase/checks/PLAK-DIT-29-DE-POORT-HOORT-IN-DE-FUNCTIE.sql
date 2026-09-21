-- =====================================================================
-- PLAK 29 — de poort hoort IN de functie, niet in de wrapper ervoor
-- =====================================================================
-- Plak 28 gaf me de twee bodies. Ze bevestigen allebei wat de sweep
-- vermoedde: de controle die het geld bewaakt staat in TypeScript en
-- niet in de functie, en allebei zijn ze aanroepbaar op /rest/v1/rpc/
-- met het token van een gewone medewerker-admin.
--
-- `execute` intrekken kan bij geen van beide: de wrapper belt ze met de
-- SESSIE VAN DE BELLER en de functie leest zelf `auth.uid()` om te zien
-- of je admin bent. Met de service-client aanroepen zou hun eigen poort
-- breken. Dus moet de poort erin.
--
-- ── 1. top_up_admin_verify: de prijs stond open ──────────────────────
--
-- De body controleert `p_new_fee_percent` alleen op 0..100:
--
--     v_new_fee := COALESCE(p_new_fee_percent, v_topup.fee);
--     IF v_new_fee < 0 OR v_new_fee > 100 THEN ... END IF;
--
-- De vloer, het plafond en de eigenaar-uitzondering staan alleen in
-- `verifyAdTopup`. Dus:
--
--   POST /rest/v1/rpc/top_up_admin_verify
--   {"p_top_up_id":"...","p_new_fee_percent":0}
--
-- zet de fee op nul, en de functie herrekent fee_amount, topup_amount,
-- amount_usd, topup_usd, eur_value en eur_topup netjes mee -- dus de rij
-- leest daarna GENUINE 0% en elk fee-rapport is het ermee eens. De
-- andere kant op is erger: 100 invullen betekent dat de klant EUR 10.000
-- betaalde en er NIETS op het account landt.
--
-- Wat hier bij komt is dezelfde regel als in de wrapper, met een
-- verschil: de wrapper vergelijkt met het afgesproken tarief uit het
-- plan, en dat kan deze functie niet zonder een halve planlookup. Hij
-- vergelijkt daarom met `top_ups.fee` -- het percentage dat op de RIJ
-- staat, en dat is precies wat de klant bij het aanmaken geciteerd
-- kreeg. Een correctie van maximaal 1 procentpunt blijft vrij (een
-- afronding, een koers die bewoog); verder weg is de eigenaar.
--
-- De rijke poort in TypeScript blijft gewoon staan. Deze is de bodem
-- eronder, voor wie de wrapper overslaat.
--
-- ── 2. ad_account_withdrawal_approve: het plafond stond open ─────────
--
-- De body controleert admin, tenant, status en of het ad-account nog van
-- deze adverteerder is -- en crediteert dan de wallet, ONGEACHT hoeveel
-- er ooit op dat account is gezet. `_withdrawal_within_the_account`
-- rekent dat plafond wel uit, maar die trigger hangt op INSERT, dus hij
-- bewaakt de AANVRAAG en niet de GOEDKEURING. Wie de wrapper overslaat
-- keurt goed wat hij wil.
--
-- Hier komt dezelfde som in te staan als in die trigger: alles wat er
-- `completed` op het account is gezet, min alles wat er al is
-- teruggevraagd en niet is afgewezen, deze aanvraag niet meegerekend.
--
-- ── 3. En de laatste tabel met open schrijfrechten ───────────────────
--
-- Plak 28 regel 4: `ad_account_withdrawals` geeft nog DELETE, INSERT en
-- UPDATE aan `authenticated`. Nagelopen: er is GEEN enkele plek in de
-- codebase die deze tabel vanuit een bellersessie schrijft -- aanvragen,
-- goedkeuren en afwijzen gaan alle drie via een SECURITY DEFINER RPC.
-- Alles kan dus dicht, net als bij wallet_exchanges.
--
-- Veilig om vaker te draaien.
-- =====================================================================

set search_path = public;

create temporary table if not exists _pg (k text, v text);
delete from _pg;

insert into _pg
select 'grants_voor',
  coalesce((
    select string_agg(distinct privilege_type, ', ' order by privilege_type)
      from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'ad_account_withdrawals'
       and grantee in ('authenticated', 'anon')
       and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
  ), 'geen');

-- ── 1. De prijspoort in top_up_admin_verify ──────────────────────────
create or replace function public.top_up_admin_verify(
  p_top_up_id uuid,
  p_new_fee_percent smallint default null::smallint
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $blk0$
DECLARE
  v_user_id uuid := auth.uid();
  v_topup RECORD;
  v_new_fee smallint;
  v_new_fee_amount numeric;
  v_new_topup_amount numeric;
  v_new_amount_usd numeric;
  v_new_topup_usd numeric;
  v_new_eur_value numeric;
  v_new_eur_topup numeric;
  v_rate numeric;
  v_fee_changed boolean := false;
  v_owner uuid;
  v_headroom numeric := 1;   -- een correctie van 1 punt blijft vrij
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT id, advertiser_id, tenant_id, status, currency, amount_received,
         fee, fee_amount, topup_amount, amount_usd, topup_usd,
         eur_value, eur_topup, rate
  INTO v_topup
  FROM top_ups WHERE id = p_top_up_id FOR UPDATE;
  IF v_topup.id IS NULL THEN
    RAISE EXCEPTION 'Top-up not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM 1 FROM user_profiles
  WHERE user_id = v_user_id AND role = 'admin' AND COALESCE(is_active, true) AND COALESCE(status, 'active') <> 'inactive' AND tenant_id = v_topup.tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Forbidden: admin required' USING ERRCODE = '42501';
  END IF;

  IF v_topup.status <> 'pending' THEN
    RAISE EXCEPTION 'Cannot verify top-up with status: %', v_topup.status
      USING ERRCODE = '22023';
  END IF;

  v_new_fee := COALESCE(p_new_fee_percent, v_topup.fee);
  IF v_new_fee < 0 OR v_new_fee > 100 THEN
    RAISE EXCEPTION 'Invalid fee percent: must be 0-100' USING ERRCODE = '22023';
  END IF;

  v_fee_changed := (v_new_fee <> v_topup.fee);

  -- ── DE PRIJS IS DIE VAN DE EIGENAAR ────────────────────────────────
  --
  -- Dit stond alleen in verifyAdTopup, en deze functie is aanroepbaar op
  -- /rest/v1/rpc/. Omlaag is geld dat wij niet ophalen, omhoog is geld
  -- dat de klant niet heeft afgesproken en dat rechtstreeks van zijn
  -- account afgaat. Allebei de eigenaar.
  IF v_fee_changed
     AND ( v_new_fee::numeric + 0.0001 < v_topup.fee::numeric
        OR v_new_fee::numeric > v_topup.fee::numeric + v_headroom + 0.0001 )
  THEN
    SELECT owner_id INTO v_owner FROM tenants WHERE id = v_topup.tenant_id;
    IF v_owner IS NULL OR v_owner <> v_user_id THEN
      RAISE EXCEPTION
        'This top-up was filed at %%%. Verifying it at %%% is the super-admin''s call.',
        v_topup.fee, v_new_fee
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_fee_changed THEN
    v_new_fee_amount := round(v_topup.amount_received::numeric * v_new_fee::numeric / 100, 2);
    v_new_topup_amount := round(v_topup.amount_received::numeric - v_new_fee_amount, 2);
    v_rate := v_topup.rate::numeric;

    IF v_rate IS NULL OR v_rate <= 0 THEN
      RAISE EXCEPTION 'Top-up rate missing or invalid' USING ERRCODE = '22023';
    END IF;

    IF upper(v_topup.currency) = 'USD' THEN
      v_new_amount_usd := v_topup.amount_received;
      v_new_topup_usd := v_new_topup_amount;
      v_new_eur_value := round(v_topup.amount_received::numeric * v_rate, 2);
      v_new_eur_topup := round(v_new_topup_amount * v_rate, 2);
    ELSE
      v_new_eur_value := v_topup.amount_received;
      v_new_eur_topup := v_new_topup_amount;
      v_new_amount_usd := round(v_topup.amount_received::numeric / v_rate, 2);
      v_new_topup_usd := round(v_new_topup_amount / v_rate, 2);
    END IF;

    UPDATE top_ups
    SET status = 'completed',
        fee = v_new_fee,
        fee_amount = v_new_fee_amount,
        topup_amount = v_new_topup_amount,
        amount_usd = v_new_amount_usd,
        topup_usd = v_new_topup_usd,
        eur_value = v_new_eur_value,
        eur_topup = v_new_eur_topup,
        verified_at = now(),
        updated_at = now()
    WHERE id = p_top_up_id;
  ELSE
    UPDATE top_ups
    SET status = 'completed',
        verified_at = now(),
        updated_at = now()
    WHERE id = p_top_up_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'top_up_id', p_top_up_id,
    'fee_changed', v_fee_changed,
    'fee_percent', v_new_fee,
    'fee_amount', CASE WHEN v_fee_changed THEN v_new_fee_amount ELSE v_topup.fee_amount END,
    'topup_amount', CASE WHEN v_fee_changed THEN v_new_topup_amount ELSE v_topup.topup_amount END
  );
END;
$blk0$;

-- ── 2. Het plafond in ad_account_withdrawal_approve ──────────────────
create or replace function public.ad_account_withdrawal_approve(
  p_withdrawal_id uuid
)
returns ad_account_withdrawals
language plpgsql
security definer
set search_path to 'public'
as $blk1$
declare
  v_admin  record;
  v_wd     public.ad_account_withdrawals%rowtype;
  v_row    public.ad_account_withdrawals%rowtype;
  v_put_on numeric;
  v_taken  numeric;
  v_room   numeric;
begin
  select * into v_admin from public._require_profile('admin');

  select * into v_wd
    from public.ad_account_withdrawals
   where id = p_withdrawal_id
   for update;
  if not found then
    raise exception 'Withdrawal not found' using errcode = '42704';
  end if;
  if v_wd.tenant_id <> v_admin.tenant_id then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if v_wd.status <> 'pending' then
    raise exception 'This withdrawal is no longer pending' using errcode = '22000';
  end if;

  -- KIJK NAAR HET AD-ACCOUNT. Een opname die bleef staan terwijl het
  -- account was uitgezet en teruggegeven aan de pool werd gewoon
  -- goedgekeurd, en dan kreeg de klant geld terug voor een saldo dat
  -- inmiddels op het account van iemand anders stond.
  if not exists (
    select 1 from public.ad_accounts aa
     where aa.id = v_wd.ad_account_id
       and aa.advertiser_id = v_wd.advertiser_id
       and coalesce(aa.status, 'active') not in ('banned', 'closed')
  ) then
    raise exception 'That ad account is no longer this advertiser''s, or has been closed. Check it before approving.'
      using errcode = '22000';
  end if;

  -- ── EN HET PLAFOND, HIER, BIJ DE GOEDKEURING ─────────────────────
  --
  -- Dit stond alleen in de TypeScript-wrapper en in
  -- `_withdrawal_within_the_account`, en die trigger hangt op INSERT --
  -- dus hij bewaakt de AANVRAAG en niet dit moment. Zonder deze som
  -- crediteert een directe aanroep de wallet met geld dat nooit op het
  -- account heeft gestaan. Zelfde rekening als de trigger.
  begin
    select coalesce(sum(t.topup_amount), 0) into v_put_on
      from public.top_ups t
     where t.account_id = v_wd.ad_account_id
       and t.status = 'completed'
       and coalesce(t.is_deleted, false) = false;
  exception when undefined_column then
    select coalesce(sum(t.topup_amount), 0) into v_put_on
      from public.top_ups t
     where t.account_id = v_wd.ad_account_id
       and t.status = 'completed';
  end;

  select coalesce(sum(w.amount), 0) into v_taken
    from public.ad_account_withdrawals w
   where w.ad_account_id = v_wd.ad_account_id
     and w.id is distinct from v_wd.id
     and lower(coalesce(w.status, '')) not in ('rejected', 'cancelled');

  v_room := round((v_put_on - v_taken)::numeric, 2);

  if round(coalesce(v_wd.amount, 0)::numeric, 2) > v_room + 0.005 then
    raise exception
      'Approving this would credit the wallet with money that was never on the account. We funded % and % has already been asked back, so at most % is available.',
      to_char(v_put_on, 'FM999999990.00'),
      to_char(v_taken, 'FM999999990.00'),
      to_char(greatest(v_room, 0), 'FM999999990.00')
      using errcode = '23514';
  end if;

  -- Credit the wallet in the withdrawal's currency.
  if v_wd.currency = 'USD' then
    update public.wallets
       set usd_balance = coalesce(usd_balance, 0) + v_wd.amount,
           updated_at = now()
     where id = v_wd.wallet_id;
  elsif v_wd.currency = 'EUR' then
    update public.wallets
       set eur_balance = coalesce(eur_balance, 0) + v_wd.amount,
           updated_at = now()
     where id = v_wd.wallet_id;
  else
    -- Een valuta waar geen wallet voor is zou stil slagen zonder dat er
    -- geld beweegt: goedgekeurd op het scherm, niets op de rekening.
    raise exception 'This withdrawal is in %, and there is no wallet for that.', v_wd.currency
      using errcode = '22000';
  end if;

  update public.ad_account_withdrawals
     set status = 'approved',
         reviewed_by = v_admin.profile_id,
         reviewed_at = now(),
         updated_at = now()
   where id = p_withdrawal_id
  returning * into v_row;

  return v_row;
end;
$blk1$;

-- ── 3. De laatste open schrijfrechten ────────────────────────────────
do $blk2$
begin
  execute 'revoke insert, update, delete on public.ad_account_withdrawals from authenticated';
  execute 'revoke insert, update, delete on public.ad_account_withdrawals from anon';
  insert into _pg values ('revoke', 'gelukt');
exception when others then
  insert into _pg values ('revoke', 'MISLUKT: ' || sqlstate || ' ' || sqlerrm);
end;
$blk2$;

-- =====================================================================
-- Het rapport — de SQL-editor toont alleen dit
-- =====================================================================
select 1 as nr, 'prijspoort zit nu IN top_up_admin_verify' as item,
  case when exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'top_up_admin_verify'
       and position('super-admin' in pg_get_functiondef(p.oid)) > 0
  ) then 'ja - gerepareerd' else 'NEE - zeg het meteen' end as antwoord
union all
select 2, 'de rekenkunde van de fee staat er nog precies zo in',
  case when exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'top_up_admin_verify'
       and position('v_new_topup_usd := round(v_new_topup_amount / v_rate, 2)' in pg_get_functiondef(p.oid)) > 0
       and position('Invalid fee percent' in pg_get_functiondef(p.oid)) > 0
  ) then 'ja - onveranderd' else 'NIET GOED - er is meer veranderd dan de bedoeling' end
union all
select 3, 'plafond zit nu IN ad_account_withdrawal_approve',
  case when exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'ad_account_withdrawal_approve'
       and position('never on the account' in pg_get_functiondef(p.oid)) > 0
  ) then 'ja - gerepareerd' else 'NEE - zeg het meteen' end
union all
select 4, 'de accountcontrole en het crediteren staan er nog in',
  case when exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'ad_account_withdrawal_approve'
       and position('no longer this advertiser' in pg_get_functiondef(p.oid)) > 0
       and position('eur_balance = coalesce(eur_balance, 0) + v_wd.amount' in pg_get_functiondef(p.oid)) > 0
  ) then 'ja - onveranderd' else 'NIET GOED' end
union all
select 5, 'zijn allebei nog SECURITY DEFINER',
  coalesce((
    select string_agg(p.proname || '=' ||
             case when p.prosecdef then 'definer' else 'INVOKER - NIET GOED' end,
             ', ' order by p.proname)
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('top_up_admin_verify', 'ad_account_withdrawal_approve')
  ), 'niet gevonden')
union all
select 6, 'schrijfrechten op ad_account_withdrawals VOOR',
  coalesce((select v from _pg where k = 'grants_voor' limit 1), '?')
union all
select 7, 'intrekken gelukt', coalesce((select v from _pg where k = 'revoke' limit 1), '?')
union all
select 8, 'schrijfrechten op ad_account_withdrawals NA (hoort GEEN te zijn)',
  coalesce((
    select string_agg(distinct privilege_type, ', ' order by privilege_type)
      from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'ad_account_withdrawals'
       and grantee in ('authenticated', 'anon')
       and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
  ), 'geen - dicht')
union all
-- Als een bestaande opname het nieuwe plafond niet haalt, wil ik dat
-- WETEN voordat een admin hem morgen goedkeurt.
select 9, 'openstaande opnames die boven het plafond uitkomen',
  coalesce((
    select string_agg(w.reference || ': vraagt ' || w.amount::text ||
                      ' maar er is ' ||
                      greatest(coalesce(p.put_on, 0) - coalesce(tk.taken, 0), 0)::text,
                      E'\n')
      from public.ad_account_withdrawals w
      left join lateral (
        select coalesce(sum(t.topup_amount), 0) as put_on from public.top_ups t
         where t.account_id = w.ad_account_id and t.status = 'completed'
      ) p on true
      left join lateral (
        select coalesce(sum(x.amount), 0) as taken from public.ad_account_withdrawals x
         where x.ad_account_id = w.ad_account_id and x.id <> w.id
           and lower(coalesce(x.status, '')) not in ('rejected', 'cancelled')
      ) tk on true
     where lower(coalesce(w.status, '')) = 'pending'
       and round(w.amount::numeric, 2)
           > round((coalesce(p.put_on, 0) - coalesce(tk.taken, 0))::numeric, 2) + 0.005
  ), 'geen - elke openstaande opname past')
order by nr;
