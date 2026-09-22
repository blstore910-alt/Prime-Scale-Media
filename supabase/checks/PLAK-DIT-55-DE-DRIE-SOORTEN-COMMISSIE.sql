-- ════════════════════════════════════════════════════════════════════
--  PLAK 55 — REIS F4: de drie soorten commissie kloppen
--
--  Uit de geld-sweep op F4 (storting, abonnement, eenmalige bonus). Vijf
--  dingen, allemaal geld:
--
--  1  BULK-INVOER MAAKTE ELKE RIJ "DE EERSTE". Een bulk-storting schrijft
--     tot 200 rijen in één statement, dus met dezelfde created_at. De
--     vergelijking keek alleen naar het moment, dus geen enkele rij was
--     "eerder" en de eerste-storting-regel (bij jou 0%) gold voor
--     ALLEMAAL. Vijf fundingen van EUR 2.000: EUR 0,00 commissie in
--     plaats van vier keer het gewone percentage. Nu wordt op (moment,
--     id) vergeleken, dus precies één rij is de eerste.
--
--  2  DE WELKOMSTBONUS KON MAAR OP ÉÉN MANIER VALLEN. Hij zat vast aan
--     "eerste storting", dus: een klant die alleen een abonnement neemt
--     kreeg hem nooit; een teruggedraaide funding liet een 'reversed'
--     bonusrij achter die de nieuwe blokkeerde (weg, voorgoed); en een
--     bonusregel die je NA de eerste storting instelt kwam nooit meer
--     aan bod. Nu is het één functie, geroepen vanuit de storting én de
--     betaalde factuur, die kijkt of er nog een levende bonus staat.
--
--  3  EEN TERUGGEDRAAIDE COMMISSIE BLOKKEERDE DE NIEUWE. Wordt een
--     funding opnieuw geverifieerd, dan hoort de commissie terug te
--     komen; de 'al geboekt'-controle keek niet naar de status.
--
--  4  BTW WERD MEEBETAALD. De abonnementsbasis was het brutototaal;
--     vandaag staat overal tax 0, dus er verandert niets -- maar de dag
--     dat er één factuur mét btw uitgaat, betaalde je commissie over het
--     btw-bedrag (EUR 48,40 in plaats van EUR 40,00 op een factuur van
--     EUR 200 + 21%).
--
--  5  0% GAF EEN VALSE ALARMBEL. Een eerste storting met een 0%-regel
--     zette een "commissie staat vast"-melding in je wachtrij voor geld
--     dat nooit van de affiliate was.
--
--  Plak alles in één keer. Onderaan komt ÉÉN tabel.
-- ════════════════════════════════════════════════════════════════════

drop table if exists _p55;
create temp table _p55(nr int, wat text, uitkomst text);

-- ── A. DE BEREKENING ─────────────────────────────────────────────────
create or replace function public._topup_commission_calc(p_topup_id uuid, p_at timestamptz)
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
as $blk1$
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
  -- FIX (plak 55): vergelijk op (moment, id), niet op het moment alleen.
  -- Een bulk-invoer schrijft tot 200 rijen in ÉÉN statement, dus met
  -- dezelfde created_at; met een vergelijking op alleen het moment was
  -- geen van die rijen "eerder" en gold de eerste-storting-regel (vaak
  -- 0%, "de eerste fee is van ons") voor ALLEMAAL. Vijf fundingen van
  -- EUR 2.000 leverden zo EUR 0,00 commissie in plaats van vier keer
  -- het gewone percentage.
  is_first := not exists (
    select 1 from public.top_ups t2
     where t2.advertiser_id = t.advertiser_id
       and t2.tenant_id = t.tenant_id
       and t2.status = 'completed'
       and coalesce(t2.is_deleted, false) = false
       and t2.id <> t.id
       and (coalesce(t2.verified_at, t2.created_at), t2.id)
           < (coalesce(t.verified_at, t.created_at), t.id));

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
    if supplier_pct is null and coalesce(pct, 0) <= 0 then
      -- FIX (plak 55): 0% verdient niets, met of zonder inkoopprijs. Dit
      -- zette een "commissie staat vast"-melding in de wachtrij van de
      -- eigenaar voor geld dat nooit van de affiliate was.
      hold := false;
      amount := 0;
    elsif supplier_pct is null then
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
$blk1$;

revoke all on function public._topup_commission_calc(uuid, timestamptz) from public, anon, authenticated;

-- ── B. DE WELKOMSTBONUS, OP ÉÉN PLEK ─────────────────────────────────
--
--  Hij hing in _book_topup_commission, binnen "is dit de eerste
--  storting?", en kon daardoor drie dingen niet:
--    * vallen bij een klant die alleen een abonnement afneemt,
--    * terugkomen nadat een funding was teruggedraaid (de rij bleef als
--      'reversed' staan en blokkeerde de nieuwe),
--    * geboekt worden toen de eigenaar de bonusregel pas instelde nadat
--      de klant al gestort had.
--  Nu is het één functie die kijkt of er een regel is en of er nog geen
--  levende bonus staat, en die vanaf beide kanten geroepen wordt.
create or replace function public._book_onetime_if_due(
  p_link_id uuid,
  p_at timestamptz,
  p_topup_id uuid default null,
  p_invoice_id uuid default null)
returns numeric
language plpgsql
security definer
set search_path to 'public'
as $blk2$
declare
  v_link     record;
  v_rule     record;
  v_amount   numeric;
  v_currency text;
  v_user     uuid;
  v_status   text;
  v_active   boolean;
  v_code     text;
begin
  select rl.id, rl.tenant_id, rl.affiliate_advertiser_id, rl.referred_advertiser_id
    into v_link
    from public.referral_links rl
   where rl.id = p_link_id
     and coalesce(rl.status, 'active') = 'active';
  if not found then
    return 0;
  end if;

  -- Eén levende bonus per aangebrachte klant. Een teruggedraaide telt niet.
  if exists (select 1 from public.referral_commissions rc
              where rc.referral_link_id = v_link.id
                and rc.source = 'onetime'
                and coalesce(rc.status, 'unpaid') <> 'reversed') then
    return 0;
  end if;

  select a.user_id, up.status, coalesce(up.is_active, true)
    into v_user, v_status, v_active
    from public.advertisers a
    left join public.user_profiles up on up.id = a.profile_id
   where a.id = v_link.affiliate_advertiser_id;
  if not found or coalesce(v_status, 'active') = 'inactive' or not v_active then
    return 0;
  end if;

  select r.amount, r.currency, r.rule_id into v_rule
    from public._commission_rule_at(v_link.tenant_id, v_link.affiliate_advertiser_id,
                                    'onetime', null, p_at) r;
  if not found or coalesce(v_rule.amount, 0) <= 0 then
    return 0;
  end if;

  v_amount   := round(v_rule.amount, 2);
  v_currency := upper(coalesce(v_rule.currency, 'EUR'));

  insert into public.referral_commissions
    (referral_link_id, tenant_id, type, source, amount, currency, status,
     topup_id, subscription_invoice_id, rule_id)
  values
    (v_link.id, v_link.tenant_id, 'onetime', 'onetime', v_amount, v_currency, 'unpaid',
     p_topup_id, p_invoice_id, v_rule.rule_id)
  on conflict do nothing;
  if not found then
    return 0;
  end if;

  perform public._referral_link_earnings_add(v_link.id, v_currency, v_amount);

  select a.tenant_client_code into v_code
    from public.advertisers a where a.id = v_link.referred_advertiser_id;
  if v_user is not null then
    insert into public.notifications (recipient_user_id, tenant_id, type, payload)
    values (v_user, v_link.tenant_id, 'referral_commission_earned',
            jsonb_build_object('amount', v_amount, 'currency', v_currency,
                               'client_code', v_code, 'source', 'onetime'));
  end if;
  return v_amount;
end;
$blk2$;

revoke all on function public._book_onetime_if_due(uuid, timestamptz, uuid, uuid)
  from public, anon, authenticated;


-- ── C. DE STORTING BOEKEN ────────────────────────────────────────────
create or replace function public._book_topup_commission(p_topup_id uuid, p_at timestamptz)
returns void
language plpgsql
security definer
set search_path to 'public'
as $blk3$
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

  -- A. eenmalig -- nu via _book_onetime_if_due, zodat hij ook op de
  --    eerste BETAALDE FACTUUR kan vallen (een klant die alleen een
  --    abonnement neemt kreeg hem nooit) en zodat een teruggedraaide
  --    bonus opnieuw geboekt kan worden.
  perform public._book_onetime_if_due(c.link_id, p_at, p_topup_id, null);

  -- B. % van de winst
  if c.pct is null then
    return;   -- geen regel = geen commissie
  end if;
  if exists (select 1 from public.referral_commissions
              where topup_id = p_topup_id and coalesce(source, 'topup') = 'topup'
                and coalesce(status, 'unpaid') <> 'reversed') then
    return;   -- al geboekt (een teruggedraaide rij telt niet: als de
              -- funding opnieuw geverifieerd wordt, hoort de commissie
              -- gewoon terug te komen)
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
$blk3$;

revoke all on function public._book_topup_commission(uuid, timestamptz) from public, anon, authenticated;

-- ── D. DE FACTUUR BOEKEN ─────────────────────────────────────────────
create or replace function public._book_invoice_commission(
  p_invoice_id uuid, p_at timestamptz, p_note text default null)
returns numeric
language plpgsql
security definer
set search_path to 'public'
as $blk4$
declare
  inv          record;
  v_link       record;
  v_rule       record;
  v_aff_user   uuid;
  v_aff_status text;
  v_aff_active boolean;
  v_base       numeric;
  v_amount     numeric;
  v_currency   text;
  v_code       text;
begin
  select * into inv from public.invoices where id = p_invoice_id;
  if not found or coalesce(inv.status, '') <> 'paid'
     or lower(coalesce(inv.type, '')) not in ('subscription', 'subscription_adjustment') then
    return 0;
  end if;

  select rl.id, rl.tenant_id, rl.affiliate_advertiser_id into v_link
    from public.referral_links rl
   where rl.referred_advertiser_id = inv.advertiser_id
     and rl.tenant_id = inv.tenant_id
     and coalesce(rl.status, 'active') = 'active'
   order by rl.created_at asc
   limit 1;
  if not found then
    return 0;
  end if;
  if exists (select 1 from public.referral_commissions where subscription_invoice_id = inv.id) then
    return 0;
  end if;

  select a.user_id, up.status, coalesce(up.is_active, true)
    into v_aff_user, v_aff_status, v_aff_active
    from public.advertisers a
    left join public.user_profiles up on up.id = a.profile_id
   where a.id = v_link.affiliate_advertiser_id;
  if not found or coalesce(v_aff_status, 'active') = 'inactive' or not v_aff_active then
    return 0;
  end if;

  select * into v_rule
    from public._commission_rule_at(inv.tenant_id, v_link.affiliate_advertiser_id,
                                    'subscription', null, p_at);
  if not found or v_rule.pct is null or v_rule.pct <= 0 then
    return 0;
  end if;

  -- FIX (plak 55): btw is niet van ons en dus ook niet van de affiliate.
  -- Vandaag schrijft geen enkele generator sub_total, en elke regel
  -- heeft tax 0 -- dus dit verandert nu niets. Zodra er één factuur met
  -- btw uitgaat, betaalde de oude regel commissie over het btw-bedrag.
  v_base := round(
    coalesce(
      nullif(inv.sub_total, 0),
      case
        when (to_jsonb(inv) ? 'tax')
             and coalesce((to_jsonb(inv) ->> 'tax')::numeric, 0) > 0
          then inv.total - (to_jsonb(inv) ->> 'tax')::numeric
        else inv.total
      end,
      0)::numeric, 2);
  if v_base <= 0 then
    return 0;
  end if;
  v_amount   := round(v_base * v_rule.pct / 100, 2);
  v_currency := upper(coalesce(inv.currency, 'EUR'));
  if v_amount <= 0 then
    return 0;
  end if;

  insert into public.referral_commissions
    (referral_link_id, tenant_id, type, source, amount, currency, status,
     subscription_id, subscription_invoice_id, base_amount, pct, rule_id, note)
  values
    (v_link.id, v_link.tenant_id, 'subscription_pct', 'subscription', v_amount, v_currency, 'unpaid',
     inv.subscription_id, inv.id, v_base, v_rule.pct, v_rule.rule_id, p_note)
  on conflict do nothing;
  if not found then
    return 0;
  end if;

  perform public._referral_link_earnings_add(v_link.id, v_currency, v_amount);

  -- Een klant die alleen een abonnement neemt verdient de welkomstbonus
  -- net zo goed: die hing tot nu toe uitsluitend aan een eerste storting.
  perform public._book_onetime_if_due(v_link.id, p_at, null, inv.id);

  select a.tenant_client_code into v_code from public.advertisers a where a.id = inv.advertiser_id;
  if v_aff_user is not null then
    insert into public.notifications (recipient_user_id, tenant_id, type, payload)
    values (v_aff_user, v_link.tenant_id, 'referral_commission_earned',
            jsonb_build_object('amount', v_amount, 'currency', v_currency,
                               'client_code', v_code, 'source', 'subscription'));
  end if;
  return v_amount;
end;
$blk4$;

revoke all on function public._book_invoice_commission(uuid, timestamptz, text) from public, anon, authenticated;

-- ── E. DE UNIEKE INDEXEN TELLEN TERUGGEDRAAIDE RIJEN NIET MEE ────────
do $blk6$
begin
  execute 'drop index if exists public.referral_commissions_onetime_uq';
  execute $ix$create unique index if not exists referral_commissions_onetime_uq
             on public.referral_commissions (referral_link_id)
           where source = 'onetime' and coalesce(status, 'unpaid') <> 'reversed'$ix$;

  execute 'drop index if exists public.referral_commissions_topup_source_uq';
  execute $ix$create unique index if not exists referral_commissions_topup_source_uq
             on public.referral_commissions (topup_id, (coalesce(source, 'topup')))
           where topup_id is not null and coalesce(status, 'unpaid') <> 'reversed'$ix$;

  insert into _p55 values (1, 'indexen', 'een teruggedraaide commissie blokkeert de nieuwe niet meer');
exception when others then
  insert into _p55 values (1, 'indexen', 'MISLUKT: ' || sqlerrm);
end
$blk6$;

do $blk7$
begin
  insert into _p55 values (2, 'eerste storting', 'bij een bulk-invoer is nog maar één rij de eerste (vergelijk op moment + id)');
  insert into _p55 values (3, 'welkomstbonus', 'valt nu ook op een betaalde factuur, en kan terugkomen na een teruggedraaide funding');
  insert into _p55 values (4, 'abonnement', 'commissie over het bedrag exclusief btw (vandaag identiek, want tax = 0)');
  insert into _p55 values (5, '0%-regel', 'geeft geen "commissie staat vast"-melding meer');
end
$blk7$;

-- ── F. WAT ER NU STAAT (alleen lezen) ────────────────────────────────
do $blk8$
declare v_txt text;
begin
  select coalesce(string_agg(x.src || ': ' || x.n::text || ' rijen, ' ||
                             upper(x.cur) || ' ' || to_char(x.som, 'FM999G999G990D00'),
                             ' · ' order by x.src), 'geen commissies')
    into v_txt
    from (
      select coalesce(rc.source, 'topup') as src,
             coalesce(rc.currency, 'EUR') as cur,
             count(*) as n, sum(rc.amount) as som
        from public.referral_commissions rc
       where coalesce(rc.status, 'unpaid') <> 'reversed'
       group by 1, 2
    ) x;
  insert into _p55 values (6, 'commissies per soort', v_txt);

  select coalesce(string_agg(r.source || coalesce(' · ' || r.ad_account_type, '') ||
                             ': ' || coalesce(r.pct::text || '%', to_char(r.amount, 'FM990D00')) ||
                             coalesce(' (' || a.tenant_client_code || ')', ' (standaard)'),
                             ' · ' order by r.source), 'GEEN REGELS')
    into v_txt
    from public.commission_rules r
    left join public.advertisers a on a.id = r.affiliate_advertiser_id
   where coalesce(r.effective_to, 'infinity'::timestamptz) > now();
  insert into _p55 values (7, 'regels die nu gelden', v_txt);
end
$blk8$;

select nr as "#", wat as "wat", uitkomst as "uitkomst" from _p55 order by nr;
