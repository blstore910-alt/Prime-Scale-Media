-- =====================================================================
-- PLAK 41 — "eerste storting is voor ons" + één boekfunctie
-- =====================================================================
-- De eigenaar, 22-09: "voor community NSA en soms ook andere affiliates
-- wil ik kunnen instellen dat de eerste topup fee voor ons is ... alle
-- klanten: eerste topup fee is volledig voor ons, daarna alles qua
-- commissies".
--
-- 1  Een nieuwe regelsoort: 'first_topup' -- het % van de winst op de
--    EERSTE storting van elke doorverwezen klant. Staat die er (op welk
--    niveau ook), dan geldt hij op die eerste storting IN PLAATS VAN de
--    typeregel; 0% = die fee is helemaal voor ons. Staat hij er niet,
--    dan is de eerste storting een gewone storting. Zelfde "vanaf nu"-
--    versies, standaard en per affiliate. TS-tweeling:
--    resolveTopupRule in lib/pure-commission-rules.ts (getest).
--
-- 2  De boeking wordt één functie, los van de trigger:
--      _topup_commission_calc(funding, moment)  -- rekent, schrijft niets
--      _book_topup_commission(funding, moment)  -- rekent en boekt
--    De trigger roept de tweede aan met het verificatiemoment. F1 heeft
--    hem straks nodig voor het goedkeuren van een link: dan worden de
--    fundings van VÓÓR de goedkeuring alsnog geboekt (de eigenaar: "dan
--    moeten alle verdiensten meetellen, ook voor ik goedkeurde").
--
-- ZELFTEST (rij 3): de rekenfunctie op funding #000005, op zijn eigen
-- verificatiemoment, moet exact geven wat plak 38 zag: winst 0,53, 20%,
-- 0,11 EUR. Klopt dat niet, dan is er in de omzetting iets verschoven --
-- zeg het meteen.
--
-- Veilig om vaker te draaien.
-- =====================================================================

set search_path = public;

create temporary table if not exists _p41 (nr int, item text, v text);
delete from _p41;

-- ── 1. de nieuwe soort ───────────────────────────────────────────────
alter table public.commission_rules drop constraint if exists commission_rules_source_ok;
alter table public.commission_rules
  add constraint commission_rules_source_ok
  check (source in ('topup', 'subscription', 'onetime', 'first_topup'));
alter table public.commission_rules drop constraint if exists commission_rules_shape;
alter table public.commission_rules
  add constraint commission_rules_shape check (
    (source = 'onetime' and pct is null and ad_account_type is null
       and (amount is null or currency is not null))
    or (source = 'first_topup' and ad_account_type is null and amount is null)
    or (source in ('topup', 'subscription') and amount is null));

insert into _p41 values (1, 'commission_rules', 'soort first_topup toegestaan (per affiliate of standaard, geen type)');

-- ── 2. rekenen, zonder te schrijven ──────────────────────────────────
drop function if exists public._topup_commission_calc(uuid, timestamptz);
create function public._topup_commission_calc(p_topup_id uuid, p_at timestamptz)
returns table (
  link_id uuid, link_tenant uuid, affiliate_id uuid, affiliate_user uuid,
  is_first boolean,
  onetime_amount numeric, onetime_currency text, onetime_rule uuid,
  rule_source text, pct numeric, rule_id uuid,
  currency text, fee numeric, landed numeric,
  supplier_pct numeric, supplier_cost numeric, profit numeric, amount numeric,
  hold boolean)
language plpgsql
stable
security definer
set search_path to 'public'
as $blk0$
declare
  t        record;
  v_link   record;
  v_type   text;
  v_rule   record;
  v_found  boolean := false;
  v_status text;
  v_active boolean;
begin
  select * into t from public.top_ups where id = p_topup_id;
  if not found or coalesce(t.status, '') <> 'completed' or coalesce(t.is_deleted, false) then
    return;
  end if;

  select rl.id, rl.tenant_id, rl.affiliate_advertiser_id into v_link
    from public.referral_links rl
   where rl.referred_advertiser_id = t.advertiser_id
     and rl.tenant_id = t.tenant_id
     and coalesce(rl.status, 'active') = 'active'
   order by rl.created_at asc
   limit 1;
  if not found then
    return;
  end if;

  link_id := v_link.id;
  link_tenant := v_link.tenant_id;
  affiliate_id := v_link.affiliate_advertiser_id;

  select a.user_id, up.status, coalesce(up.is_active, true)
    into affiliate_user, v_status, v_active
    from public.advertisers a
    left join public.user_profiles up on up.id = a.profile_id
   where a.id = v_link.affiliate_advertiser_id;
  if not found or coalesce(v_status, 'active') = 'inactive' or not v_active then
    return;
  end if;

  -- De EERSTE voltooide funding van deze klant: geen andere voltooide
  -- funding met een eerder moment. (Live is dat "de enige", bij een
  -- achteraf-boeking de vroegste.)
  is_first := not exists (
    select 1 from public.top_ups t2
     where t2.advertiser_id = t.advertiser_id
       and t2.tenant_id = t.tenant_id
       and t2.status = 'completed'
       and coalesce(t2.is_deleted, false) = false
       and t2.id <> t.id
       and coalesce(t2.verified_at, t2.created_at) < coalesce(t.verified_at, t.created_at));

  -- Eenmalig: alleen op de eerste.
  if is_first then
    select r.amount, r.currency, r.rule_id into onetime_amount, onetime_currency, onetime_rule
      from public._commission_rule_at(t.tenant_id, v_link.affiliate_advertiser_id,
                                      'onetime', null, p_at) r;
  end if;

  -- Het %: op de eerste storting eerst de first_topup-regel, anders (of
  -- zonder die regel) de typeregel.
  select x.platform into v_type from public.ad_accounts x where x.id = t.account_id;
  if is_first then
    select * into v_rule
      from public._commission_rule_at(t.tenant_id, v_link.affiliate_advertiser_id,
                                      'first_topup', null, p_at);
    if found and v_rule.pct is not null then
      v_found := true;
      rule_source := 'first_topup';
    end if;
  end if;
  if not v_found then
    select * into v_rule
      from public._commission_rule_at(t.tenant_id, v_link.affiliate_advertiser_id,
                                      'topup', v_type, p_at);
    if found and v_rule.pct is not null then
      v_found := true;
      rule_source := 'topup';
    end if;
  end if;

  currency := case when t.topup_usd is not null
                   then upper(coalesce(t.currency, 'EUR')) else 'USD' end;
  fee      := round(coalesce(t.fee_amount, 0)::numeric, 2);
  landed   := round(coalesce(t.topup_amount, 0)::numeric, 2);

  if v_found then
    pct := v_rule.pct;
    rule_id := v_rule.rule_id;
    supplier_pct := public._supplier_fee_pct_for(t.account_id, t.tenant_id);
    if supplier_pct is null then
      hold := true;
    else
      hold := false;
      supplier_cost := round(landed * supplier_pct / 100, 2);
      profit := round(fee - supplier_cost, 2);
      amount := case when profit > 0 and pct > 0
                     then round(profit * pct / 100, 2) else 0 end;
    end if;
  end if;

  return next;
end;
$blk0$;

revoke all on function public._topup_commission_calc(uuid, timestamptz) from public, anon, authenticated;

-- ── 3. rekenen en boeken ─────────────────────────────────────────────
create or replace function public._book_topup_commission(p_topup_id uuid, p_at timestamptz)
returns void
language plpgsql
security definer
set search_path to 'public'
as $blk1$
declare
  c      record;
  t      record;
  v_code text;
begin
  select * into c from public._topup_commission_calc(p_topup_id, p_at);
  if not found or c.link_id is null then
    return;
  end if;
  select * into t from public.top_ups where id = p_topup_id;
  select a.tenant_client_code into v_code from public.advertisers a where a.id = t.advertiser_id;

  -- A. eenmalig
  if c.is_first and coalesce(c.onetime_amount, 0) > 0
     and not exists (select 1 from public.referral_commissions rc
                      where rc.referral_link_id = c.link_id and rc.source = 'onetime') then
    insert into public.referral_commissions
      (referral_link_id, tenant_id, type, source, amount, currency, status, topup_id, rule_id)
    values
      (c.link_id, c.link_tenant, 'onetime', 'onetime', round(c.onetime_amount, 2),
       upper(coalesce(c.onetime_currency, 'EUR')), 'unpaid', p_topup_id, c.onetime_rule);
    perform public._referral_link_earnings_add(c.link_id, upper(coalesce(c.onetime_currency, 'EUR')),
                                               round(c.onetime_amount, 2));
    if c.affiliate_user is not null then
      insert into public.notifications (recipient_user_id, tenant_id, type, payload)
      values (c.affiliate_user, c.link_tenant, 'referral_commission_earned',
              jsonb_build_object('amount', round(c.onetime_amount, 2),
                                 'currency', upper(coalesce(c.onetime_currency, 'EUR')),
                                 'client_code', v_code, 'source', 'onetime'));
    end if;
  end if;

  -- B. % van de winst
  if c.pct is null then
    return;   -- geen regel = geen commissie
  end if;
  if exists (select 1 from public.referral_commissions
              where topup_id = p_topup_id and coalesce(source, 'topup') = 'topup') then
    return;   -- al geboekt
  end if;

  if c.hold then
    insert into public.referral_commissions
      (referral_link_id, tenant_id, type, source, amount, currency, status, topup_id,
       pct, rule_id, fee_amount, note)
    values
      (c.link_id, c.link_tenant, 'pct', 'topup', 0, c.currency, 'on_hold', p_topup_id,
       c.pct, c.rule_id, c.fee,
       'Supplier fee not set for this account type (Settings > Finance > Ad-account types). Set it, then recalculate.');
    insert into public.notifications (recipient_user_id, tenant_id, type, payload)
    select tn.owner_id, tn.id, 'referral_commission_on_hold',
           jsonb_build_object('topup_id', p_topup_id, 'reason', 'supplier_fee_missing')
      from public.tenants tn
     where tn.id = c.link_tenant and tn.owner_id is not null;
    return;
  end if;

  if coalesce(c.amount, 0) <= 0 then
    return;   -- geen winst, of 0% (bv. eerste storting voor ons)
  end if;

  insert into public.referral_commissions
    (referral_link_id, tenant_id, type, source, amount, currency, status, topup_id,
     base_amount, pct, rule_id, fee_amount, supplier_fee_pct, supplier_cost, note)
  values
    (c.link_id, c.link_tenant, 'pct', 'topup', c.amount, c.currency, 'unpaid', p_topup_id,
     c.profit, c.pct, c.rule_id, c.fee, c.supplier_pct, c.supplier_cost,
     case when c.rule_source = 'first_topup' then 'First top-up rule' else null end);

  perform public._referral_link_earnings_add(c.link_id, c.currency, c.amount);

  if c.affiliate_user is not null then
    insert into public.notifications (recipient_user_id, tenant_id, type, payload)
    values (c.affiliate_user, c.link_tenant, 'referral_commission_earned',
            jsonb_build_object('amount', c.amount, 'currency', c.currency,
                               'client_code', v_code, 'source', 'topup'));
  end if;
end;
$blk1$;

revoke all on function public._book_topup_commission(uuid, timestamptz) from public, anon, authenticated;

-- ── 4. de trigger roept de boekfunctie aan ───────────────────────────
create or replace function public.handle_referral_commission_on_topup()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $blk2$
begin
  if coalesce(new.status, '') <> 'completed' then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if coalesce(old.status, '') = 'completed' then
      return new;
    end if;
  end if;
  if coalesce(new.is_deleted, false) then
    return new;
  end if;

  begin
    perform public._book_topup_commission(new.id, coalesce(new.verified_at, now()));
  exception when others then
    -- Nooit de verificatie van de klant tegenhouden -- en niet stil.
    raise warning 'referral commission for top-up % failed: %', new.id, sqlerrm;
    begin
      insert into public.notifications (recipient_user_id, tenant_id, type, payload)
      select tn.owner_id, tn.id, 'referral_commission_failed',
             jsonb_build_object('topup_id', new.id, 'error', left(sqlerrm, 300))
        from public.tenants tn
       where tn.id = new.tenant_id and tn.owner_id is not null;
    exception when others then
      null;
    end;
  end;
  return new;
end;
$blk2$;

insert into _p41 values (2, 'trigger', 'roept nu _book_topup_commission aan (zelfde triggers, zelfde momenten)');

-- ── ZELFTEST ─────────────────────────────────────────────────────────
insert into _p41
select 3, 'zelftest: #000005 opnieuw doorgerekend (moet 0.53 winst, 20%, 0.11 EUR zijn)',
  coalesce((
    select 'eerste=' || c.is_first || ' | regel ' || coalesce(c.rule_source, '-') || ' ' ||
           coalesce(c.pct::text, '-') || '% | fee ' || coalesce(c.fee::text, '-') ||
           ' | leverancier ' || coalesce(c.supplier_pct::text, '-') || '% = ' || coalesce(c.supplier_cost::text, '-') ||
           ' | winst ' || coalesce(c.profit::text, '-') || ' | commissie ' || coalesce(c.amount::text, '-') ||
           ' ' || coalesce(c.currency, '-') || ' | hold=' || coalesce(c.hold::text, '-')
      from public.top_ups tu
      join public.advertisers a on a.id = tu.advertiser_id
      cross join lateral public._topup_commission_calc(tu.id, coalesce(tu.verified_at, now())) c
     where a.tenant_client_code = 'PSM0007' and tu.number = 5
     limit 1), 'NIETS terug - zeg het meteen');

insert into _p41
select 4, 'zelftest: #000004 (de eerste van PSM0007) op zijn moment (moet: eerste=true, geen regel toen)',
  coalesce((
    select 'eerste=' || c.is_first || ' | regel ' || coalesce(c.rule_source, 'geen') ||
           ' | commissie ' || coalesce(c.amount::text, '-')
      from public.top_ups tu
      join public.advertisers a on a.id = tu.advertiser_id
      cross join lateral public._topup_commission_calc(tu.id, coalesce(tu.verified_at, now())) c
     where a.tenant_client_code = 'PSM0007' and tu.number = 4
     limit 1), 'niets terug');

insert into _p41
select 5, 'commissierijen (moet ongewijzigd 2 zijn: 4.85 + 0.11)',
  (select count(*)::text || ' rijen, som ' || coalesce(sum(amount), 0)::text from public.referral_commissions);

select nr, item, v as antwoord from _p41 order by nr;
