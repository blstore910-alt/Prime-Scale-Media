-- =====================================================================
-- PLAK 35 — commissie op WINST, per regel die vanaf nu geldt
-- =====================================================================
-- De eigenaar, 21-09:
--   * "per affiliate of advertiser instellen wat ze verdienen vanaf dit
--     moment ... wat hij tot nu toe verdiende blijft"
--   * "nee op de profit, alleen op de profit, dus supplier fee moet er af"
--   * per accounttype, en % per betaalde abonnementsfactuur
--   * een standaard voor iedereen + per affiliate afwijken
--   * een nieuwe regel geldt vanaf nu voor ALLE klanten van die affiliate
--
-- Wat hier gebeurt:
--   1  commission_rules: elke wijziging is een NIEUWE rij met een start.
--      Er wordt nooit iets overschreven; de geschiedenis IS de tabel.
--   2  _slug_key + _commission_rule_at: dezelfde resolutie als
--      lib/pure-commission-rules.ts (13 tests). Eigen+type > eigen+alle
--      types > standaard+type > standaard+alle types; een lege versie
--      (pct null) = dat niveau is gewist, het volgende telt.
--   3  referral_commissions krijgt de BEREKENING erbij (grondslag, %,
--      fee, leverancierskost, welke regel) -- elke commissie is na te
--      rekenen -- en twee unieke indexen: één commissie per funding en
--      één per factuur.
--   4  De funding-trigger boekt nu: % van (onze fee - leverancierskost op
--      wat landde). Leverancierskost onbekend? Dan GEEN gok: een rij
--      "on hold" van 0 en een melding aan de eigenaar. Geen winst, geen
--      commissie. Plus: link alleen binnen DEZE tenant (plak 33: een
--      funding op een andere tenant boekte op diens link), en hij vuurt
--      nu ook bij een funding die meteen als 'completed' wordt aangemaakt.
--   5  Wordt een voltooide funding teruggezet, dan gaat de commissie mee
--      terug: onbetaald -> 'reversed', al betaald -> een clawback.
--   6  Abonnementen: % van elke betaalde abonnementsfactuur (excl. btw:
--      sub_total als die er is, anders total).
--   6b Eenmalig (F4, "1x eenmalig"): een VAST bedrag, een keer per
--      doorverwezen klant, bij zijn EERSTE geverifieerde funding. Staat
--      los van de winst: ook zonder winst op die funding.
--   7  De twee OUDE clawbacks (bij een wallet-refund en bij een opname
--      van een ad account) gaan uit. Waarom, in één zin: commissie komt
--      nu uit onze winst op een funding; een wallet-refund had nooit
--      commissie, en bij een opname van het account houden wij onze fee
--      -- de winst staat nog. De functies blijven bestaan.
--   8  affiliate_referral_stats (wat de AFFILIATE ziet): alleen actieve
--      links, besteding uit fundings (niet uit wallet-stortingen),
--      clawbacks binnen de gekozen periode, en 'reversed'/'on hold' tellen
--      niet als verdiend of open.
--   9  De view achter /commissions toont de berekening mee.
--  10  ad_account_request_create_paid: geen actief abonnement = geen
--      aanvraag. ("zonder plan moet niemand een ad acc aan kunnen vragen")
--  11  referral_commission_recalculate: een 'on hold' rij opnieuw rekenen
--      zodra de leverancierskost is ingevuld (alleen de eigenaar).
--
-- WAT DIT NIET DOET: de EUR 4,85 die er staat (oude regel, 10% van wat
-- landde) blijft staan -- "wat hij tot nu toe verdiende blijft". Zolang er
-- geen enkele regel is ingesteld, boekt de trigger NIETS: stel eerst de
-- standaard in op /affiliates -> Default rules.
--
-- Veilig om vaker te draaien.
-- =====================================================================

set search_path = public;

create temporary table if not exists _p35 (nr int, item text, v text);
delete from _p35;

-- ── 1. de regels ─────────────────────────────────────────────────────
create table if not exists public.commission_rules (
  id                      uuid primary key default gen_random_uuid(),
  tenant_id               uuid not null references public.tenants(id) on delete cascade,
  affiliate_advertiser_id uuid references public.advertisers(id) on delete cascade,
  source                  text not null,
  ad_account_type         text,
  pct                     numeric(6, 3) check (pct is null or (pct >= 0 and pct <= 100)),
  amount                  numeric(14, 2) check (amount is null or amount >= 0),
  currency                text check (currency is null or currency in ('EUR', 'USD')),
  effective_from          timestamptz not null default now(),
  created_at              timestamptz not null default now(),
  created_by              uuid,
  constraint commission_rules_type_only_topup check (source = 'topup' or ad_account_type is null)
);

-- Ook als de tabel er al stond van een eerdere poging: dezelfde vorm.
alter table public.commission_rules
  add column if not exists amount   numeric(14, 2),
  add column if not exists currency text;
alter table public.commission_rules drop constraint if exists commission_rules_source_check;
alter table public.commission_rules drop constraint if exists commission_rules_source_ok;
alter table public.commission_rules
  add constraint commission_rules_source_ok check (source in ('topup', 'subscription', 'onetime'));
alter table public.commission_rules drop constraint if exists commission_rules_shape;
alter table public.commission_rules
  add constraint commission_rules_shape check (
    (source = 'onetime' and pct is null and ad_account_type is null
       and (amount is null or currency is not null))
    or (source <> 'onetime' and amount is null));

create index if not exists commission_rules_lookup
  on public.commission_rules (tenant_id, source, affiliate_advertiser_id, effective_from desc);

alter table public.commission_rules enable row level security;

drop policy if exists commission_rules_owner_read on public.commission_rules;
create policy commission_rules_owner_read on public.commission_rules
  for select to authenticated
  using (exists (select 1 from public.tenants t
                  where t.id = commission_rules.tenant_id
                    and t.owner_id = (select auth.uid())));

-- Schrijven alleen via de server action (eigenaarscheck + service key).
revoke insert, update, delete, truncate on public.commission_rules from authenticated, anon;
grant select on public.commission_rules to authenticated;

drop trigger if exists trg_audit_commission_rules on public.commission_rules;
create trigger trg_audit_commission_rules
  after insert or update or delete on public.commission_rules
  for each row execute function public._audit_row_change();

insert into _p35 values (1, 'commission_rules', 'tabel, alleen-eigenaar-lezen, geen schrijfrecht voor sessies, audit aan');

-- ── 2. slug + resolutie ──────────────────────────────────────────────
create or replace function public._slug_key(p text)
returns text
language sql
immutable
as $blk0$
  select coalesce(string_agg(w, '-' order by w collate "C"), '')
    from unnest(regexp_split_to_array(lower(coalesce(p, '')), '[^a-z0-9]+')) w
   where w <> ''
$blk0$;

drop function if exists public._commission_rule_at(uuid, uuid, text, text, timestamptz);
create or replace function public._commission_rule_at(
  p_tenant uuid, p_affiliate uuid, p_source text, p_type text, p_at timestamptz)
returns table (pct numeric, amount numeric, currency text, rule_id uuid, level text)
language plpgsql
stable
security definer
set search_path to 'public'
as $blk1$
declare
  lv record;
  r  record;
begin
  for lv in
    select * from (values
      (1, 'own-type',     p_affiliate, true),
      (2, 'own-all',      p_affiliate, false),
      (3, 'default-type', null::uuid,  true),
      (4, 'default-all',  null::uuid,  false)
    ) as t(ord, lvl, aff, typed)
    order by ord
  loop
    if lv.typed and (p_source <> 'topup' or p_type is null) then
      continue;
    end if;
    select cr.id, cr.pct, cr.amount, cr.currency into r
      from public.commission_rules cr
     where cr.tenant_id = p_tenant
       and cr.source = p_source
       and cr.affiliate_advertiser_id is not distinct from lv.aff
       and case when lv.typed
                then cr.ad_account_type is not null
                     and public._slug_key(cr.ad_account_type) = public._slug_key(p_type)
                else cr.ad_account_type is null end
       and cr.effective_from <= p_at
     order by cr.effective_from desc, cr.created_at desc
     limit 1;
    -- Een versie ZET iets (een % of, eenmalig, een bedrag) of WIST dit
    -- niveau; dan telt het volgende.
    if found and (r.pct is not null or r.amount is not null) then
      pct := r.pct; amount := r.amount; currency := r.currency;
      rule_id := r.id; level := lv.lvl;
      return next;
      return;
    end if;
  end loop;
  return;
end;
$blk1$;

revoke all on function public._commission_rule_at(uuid, uuid, text, text, timestamptz) from public, anon, authenticated;

insert into _p35 values (2, '_slug_key + _commission_rule_at',
  'test: ' || public._slug_key('Meta-EU-PSM') || ' = ' || public._slug_key('eu-meta-psm'));

-- ── 3. de berekening op elke commissie ───────────────────────────────
alter table public.referral_commissions
  add column if not exists source           text,
  add column if not exists base_amount      numeric(14, 2),
  add column if not exists pct              numeric(6, 3),
  add column if not exists fee_amount       numeric(14, 2),
  add column if not exists supplier_fee_pct numeric(6, 3),
  add column if not exists supplier_cost    numeric(14, 2),
  add column if not exists rule_id          uuid,
  add column if not exists note             text;

do $blk2$
begin
  -- Een commissie per funding PER SOORT: de winst-commissie en de
  -- eenmalige bonus kunnen op dezelfde (eerste) funding vallen.
  if exists (select 1 from public.referral_commissions
              where topup_id is not null
              group by topup_id, coalesce(source, 'topup') having count(*) > 1) then
    insert into _p35 values (3, 'unieke index op (topup_id, soort)', 'NIET gezet: er staan al dubbele rijen - zeg het meteen');
  else
    execute 'drop index if exists public.referral_commissions_topup_uq';
    execute 'create unique index if not exists referral_commissions_topup_source_uq
               on public.referral_commissions (topup_id, (coalesce(source, ''topup'')))
               where topup_id is not null';
    insert into _p35 values (3, 'unieke index op (topup_id, soort)', 'gezet');
  end if;
  -- De eenmalige bonus: echt maar een keer per doorverwezen klant.
  execute $ix$create unique index if not exists referral_commissions_onetime_uq
             on public.referral_commissions (referral_link_id) where source = 'onetime'$ix$;
  if exists (select subscription_invoice_id from public.referral_commissions
              where subscription_invoice_id is not null
              group by subscription_invoice_id having count(*) > 1) then
    insert into _p35 values (4, 'unieke index op subscription_invoice_id', 'NIET gezet: dubbele rijen');
  else
    execute 'create unique index if not exists referral_commissions_invoice_uq
               on public.referral_commissions (subscription_invoice_id)
               where subscription_invoice_id is not null';
    insert into _p35 values (4, 'unieke index op subscription_invoice_id', 'gezet');
  end if;
end;
$blk2$;

-- De leverancierskost voor een account: eerst het account zelf, dan zijn
-- type. NULL = niet ingevuld, wat NIET 0 is.
create or replace function public._supplier_fee_pct_for(p_account uuid, p_tenant uuid)
returns numeric
language plpgsql
stable
security definer
set search_path to 'public'
as $blk3$
declare
  v_pct  numeric;
  v_type text;
begin
  if p_account is null then
    return null;
  end if;
  select c.supplier_fee_pct into v_pct
    from public.ad_account_costs c where c.ad_account_id = p_account;
  if v_pct is not null then
    return v_pct;
  end if;
  select x.platform into v_type from public.ad_accounts x where x.id = p_account;
  if v_type is null or to_regclass('public.ad_account_type_suppliers') is null then
    return null;
  end if;
  execute 'select s.supplier_fee_pct
             from public.ad_account_type_suppliers s
             join public.ad_account_types t on t.id = s.ad_account_type_id
            where t.tenant_id = $1
              and public._slug_key(t.slug) = public._slug_key($2)
              and s.supplier_fee_pct is not null
            limit 1'
     into v_pct using p_tenant, v_type;
  return v_pct;
end;
$blk3$;

revoke all on function public._supplier_fee_pct_for(uuid, uuid) from public, anon, authenticated;

-- De earnings-kolom op de link, één plek.
create or replace function public._referral_link_earnings_add(p_link uuid, p_currency text, p_amount numeric)
returns void
language plpgsql
security definer
set search_path to 'public'
as $blk4$
begin
  if p_amount is null or p_amount = 0 then
    return;
  end if;
  if upper(p_currency) = 'USD' then
    update public.referral_links
       set earnings_usd = greatest(coalesce(earnings_usd, 0) + p_amount, 0), updated_at = now()
     where id = p_link;
  else
    update public.referral_links
       set earnings_eur = greatest(coalesce(earnings_eur, 0) + p_amount, 0), updated_at = now()
     where id = p_link;
  end if;
end;
$blk4$;

revoke all on function public._referral_link_earnings_add(uuid, text, numeric) from public, anon, authenticated;

-- ── 4. de funding-trigger ────────────────────────────────────────────
create or replace function public.handle_referral_commission_on_topup()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $blk5$
declare
  v_link       record;
  v_rule       record;
  v_one        record;
  v_aff_user   uuid;
  v_aff_status text;
  v_aff_active boolean;
  v_type       text;
  v_at         timestamptz;
  v_currency   text;
  v_fee        numeric;
  v_landed     numeric;
  v_sup_pct    numeric;
  v_sup_cost   numeric;
  v_profit     numeric;
  v_amount     numeric;
  v_code       text;
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
    select rl.id, rl.tenant_id, rl.affiliate_advertiser_id into v_link
      from public.referral_links rl
     where rl.referred_advertiser_id = new.advertiser_id
       and rl.tenant_id = new.tenant_id
       and coalesce(rl.status, 'active') = 'active'
     order by rl.created_at asc
     limit 1;
    if not found then
      return new;
    end if;

    -- Een ontbrekende status is 'active', zoals overal in deze app; alleen
    -- een uitgezette affiliate verdient niets.
    select a.user_id, up.status, coalesce(up.is_active, true)
      into v_aff_user, v_aff_status, v_aff_active
      from public.advertisers a
      left join public.user_profiles up on up.id = a.profile_id
     where a.id = v_link.affiliate_advertiser_id;
    if not found or coalesce(v_aff_status, 'active') = 'inactive' or not v_aff_active then
      return new;
    end if;

    select x.platform into v_type from public.ad_accounts x where x.id = new.account_id;
    v_at := coalesce(new.verified_at, now());
    select a.tenant_client_code into v_code from public.advertisers a where a.id = new.advertiser_id;

    -- -- A. EENMALIG: de eerste voltooide funding van deze klant ------
    if (select count(*) from public.top_ups t2
         where t2.advertiser_id = new.advertiser_id
           and t2.tenant_id = new.tenant_id
           and t2.status = 'completed'
           and coalesce(t2.is_deleted, false) = false) = 1
       and not exists (select 1 from public.referral_commissions rc
                        where rc.referral_link_id = v_link.id and rc.source = 'onetime') then
      select * into v_one
        from public._commission_rule_at(new.tenant_id, v_link.affiliate_advertiser_id,
                                        'onetime', null, v_at);
      if found and coalesce(v_one.amount, 0) > 0 then
        insert into public.referral_commissions
          (referral_link_id, tenant_id, type, source, amount, currency, status, topup_id, rule_id)
        values
          (v_link.id, v_link.tenant_id, 'onetime', 'onetime', round(v_one.amount, 2),
           upper(coalesce(v_one.currency, 'EUR')), 'unpaid', new.id, v_one.rule_id);
        perform public._referral_link_earnings_add(v_link.id, upper(coalesce(v_one.currency, 'EUR')),
                                                   round(v_one.amount, 2));
        if v_aff_user is not null then
          insert into public.notifications (recipient_user_id, tenant_id, type, payload)
          values (v_aff_user, v_link.tenant_id, 'referral_commission_earned',
                  jsonb_build_object('amount', round(v_one.amount, 2),
                                     'currency', upper(coalesce(v_one.currency, 'EUR')),
                                     'client_code', v_code, 'source', 'onetime'));
        end if;
      end if;
    end if;

    -- -- B. % VAN DE WINST op deze funding ---------------------------
    if exists (select 1 from public.referral_commissions
                where topup_id = new.id and coalesce(source, 'topup') = 'topup') then
      return new;   -- al geboekt (ook de oude EUR 4,85 heeft source leeg)
    end if;

    select * into v_rule
      from public._commission_rule_at(new.tenant_id, v_link.affiliate_advertiser_id,
                                      'topup', v_type, v_at);
    if not found or v_rule.pct is null or v_rule.pct <= 0 then
      return new;   -- geen regel = geen commissie
    end if;

    -- topup_amount en fee_amount: op de klantroute in de BETAALvaluta, op
    -- de adminroutes in dollars. topup_usd is de discriminator
    -- (lib/pure-topup-landed.ts).
    v_currency := case when new.topup_usd is not null
                       then upper(coalesce(new.currency, 'EUR')) else 'USD' end;
    v_fee      := round(coalesce(new.fee_amount, 0)::numeric, 2);
    v_landed   := round(coalesce(new.topup_amount, 0)::numeric, 2);
    v_sup_pct  := public._supplier_fee_pct_for(new.account_id, new.tenant_id);

    if v_sup_pct is null then
      insert into public.referral_commissions
        (referral_link_id, tenant_id, type, source, amount, currency, status, topup_id,
         pct, rule_id, fee_amount, note)
      values
        (v_link.id, v_link.tenant_id, 'pct', 'topup', 0, v_currency, 'on_hold', new.id,
         v_rule.pct, v_rule.rule_id, v_fee,
         'Supplier fee not recorded for this ad account or its type. Set it, then recalculate.');
      insert into public.notifications (recipient_user_id, tenant_id, type, payload)
      select t.owner_id, t.id, 'referral_commission_on_hold',
             jsonb_build_object('topup_id', new.id, 'reason', 'supplier_fee_missing')
        from public.tenants t
       where t.id = new.tenant_id and t.owner_id is not null;
      return new;
    end if;

    v_sup_cost := round(v_landed * v_sup_pct / 100, 2);
    v_profit   := round(v_fee - v_sup_cost, 2);
    if v_profit <= 0 then
      return new;   -- geen winst, niets te delen
    end if;
    v_amount := round(v_profit * v_rule.pct / 100, 2);
    if v_amount <= 0 then
      return new;
    end if;

    insert into public.referral_commissions
      (referral_link_id, tenant_id, type, source, amount, currency, status, topup_id,
       base_amount, pct, rule_id, fee_amount, supplier_fee_pct, supplier_cost)
    values
      (v_link.id, v_link.tenant_id, 'pct', 'topup', v_amount, v_currency, 'unpaid', new.id,
       v_profit, v_rule.pct, v_rule.rule_id, v_fee, v_sup_pct, v_sup_cost);

    perform public._referral_link_earnings_add(v_link.id, v_currency, v_amount);

    if v_aff_user is not null then
      insert into public.notifications (recipient_user_id, tenant_id, type, payload)
      values (v_aff_user, v_link.tenant_id, 'referral_commission_earned',
              jsonb_build_object('amount', v_amount, 'currency', v_currency,
                                 'client_code', v_code, 'source', 'topup'));
    end if;
  exception when others then
    -- Nooit de verificatie van de klant tegenhouden -- maar ook niet stil:
    -- de eigenaar krijgt een melding met de fout.
    raise warning 'referral commission for top-up % failed: %', new.id, sqlerrm;
    begin
      insert into public.notifications (recipient_user_id, tenant_id, type, payload)
      select t.owner_id, t.id, 'referral_commission_failed',
             jsonb_build_object('topup_id', new.id, 'error', left(sqlerrm, 300))
        from public.tenants t
       where t.id = new.tenant_id and t.owner_id is not null;
    exception when others then
      null;
    end;
  end;
  return new;
end;
$blk5$;

do $blk6$
begin
  -- bestaande UPDATE-trigger blijft; daarnaast: aangemaakt als 'completed'
  execute 'drop trigger if exists trg_handle_referral_commission_ins on public.top_ups';
  execute 'create trigger trg_handle_referral_commission_ins
             after insert on public.top_ups
             for each row when (new.status = ''completed'')
             execute function public.handle_referral_commission_on_topup()';
  insert into _p35 values (5, 'funding-trigger', 'winst-berekening actief; vuurt bij UPDATE naar completed en bij INSERT als completed');
exception when others then
  insert into _p35 values (5, 'funding-trigger', 'MISLUKT: ' || sqlstate || ' ' || sqlerrm);
end;
$blk6$;

-- ── 5. funding teruggezet = commissie terug ──────────────────────────
create or replace function public._reverse_referral_commission_on_topup()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $blk7$
declare
  c record;
begin
  if coalesce(old.status, '') <> 'completed' or coalesce(new.status, '') = 'completed' then
    return new;
  end if;
  for c in
    select * from public.referral_commissions where topup_id = new.id for update
  loop
    if coalesce(c.status, 'unpaid') in ('unpaid', 'on_hold') then
      update public.referral_commissions
         set status = 'reversed',
             note = 'The top-up is no longer completed',
             updated_at = now()
       where id = c.id;
      if coalesce(c.status, 'unpaid') = 'unpaid' then
        perform public._referral_link_earnings_add(c.referral_link_id, c.currency, -c.amount);
      end if;
    elsif c.status = 'paid' then
      insert into public.referral_clawbacks
        (tenant_id, referral_link_id, advertiser_id, amount, currency,
         source, source_id, returned_amount, topup_volume, share, reason)
      values
        (c.tenant_id, c.referral_link_id, new.advertiser_id, c.amount, c.currency,
         'topup_reversed', c.id, round(coalesce(new.topup_amount, 0)::numeric, 2),
         round(coalesce(new.topup_amount, 0)::numeric, 2), 1,
         'Top-up no longer completed after the commission was paid')
      on conflict (source, source_id) do nothing;
      if found then
        perform public._referral_link_earnings_add(c.referral_link_id, c.currency, -c.amount);
      end if;
    end if;
  end loop;
  return new;
end;
$blk7$;

do $blk8$
begin
  execute 'drop trigger if exists trg_reverse_referral_commission on public.top_ups';
  execute 'create trigger trg_reverse_referral_commission
             after update of status on public.top_ups
             for each row when (old.status is distinct from new.status and old.status = ''completed'')
             execute function public._reverse_referral_commission_on_topup()';
  insert into _p35 values (6, 'terugdraaien', 'trigger staat');
exception when others then
  insert into _p35 values (6, 'terugdraaien', 'MISLUKT: ' || sqlstate || ' ' || sqlerrm);
end;
$blk8$;

-- ── 6. abonnementen ──────────────────────────────────────────────────
create or replace function public.handle_referral_commission_on_invoice_paid()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $blk9$
declare
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
  if coalesce(new.status, '') <> 'paid' then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if coalesce(old.status, '') = 'paid' then
      return new;
    end if;
  end if;
  if lower(coalesce(new.type, '')) not in ('subscription', 'subscription_adjustment') then
    return new;
  end if;

  begin
    select rl.id, rl.tenant_id, rl.affiliate_advertiser_id into v_link
      from public.referral_links rl
     where rl.referred_advertiser_id = new.advertiser_id
       and rl.tenant_id = new.tenant_id
       and coalesce(rl.status, 'active') = 'active'
     order by rl.created_at asc
     limit 1;
    if not found then
      return new;
    end if;
    if exists (select 1 from public.referral_commissions where subscription_invoice_id = new.id) then
      return new;
    end if;

    select a.user_id, up.status, coalesce(up.is_active, true)
      into v_aff_user, v_aff_status, v_aff_active
      from public.advertisers a
      left join public.user_profiles up on up.id = a.profile_id
     where a.id = v_link.affiliate_advertiser_id;
    if not found or coalesce(v_aff_status, 'active') = 'inactive' or not v_aff_active then
      return new;
    end if;

    select * into v_rule
      from public._commission_rule_at(new.tenant_id, v_link.affiliate_advertiser_id,
                                      'subscription', null, coalesce(new.paid_at, now()));
    if not found or v_rule.pct is null or v_rule.pct <= 0 then
      return new;
    end if;

    -- Excl. btw: sub_total als die er is, anders het totaal.
    v_base := round(coalesce(nullif(new.sub_total, 0), new.total, 0)::numeric, 2);
    if v_base <= 0 then
      return new;
    end if;
    v_amount   := round(v_base * v_rule.pct / 100, 2);
    v_currency := upper(coalesce(new.currency, 'EUR'));
    if v_amount <= 0 then
      return new;
    end if;

    insert into public.referral_commissions
      (referral_link_id, tenant_id, type, source, amount, currency, status,
       subscription_id, subscription_invoice_id, base_amount, pct, rule_id)
    values
      (v_link.id, v_link.tenant_id, 'subscription_pct', 'subscription', v_amount, v_currency, 'unpaid',
       new.subscription_id, new.id, v_base, v_rule.pct, v_rule.rule_id);

    perform public._referral_link_earnings_add(v_link.id, v_currency, v_amount);

    select a.tenant_client_code into v_code from public.advertisers a where a.id = new.advertiser_id;
    if v_aff_user is not null then
      insert into public.notifications (recipient_user_id, tenant_id, type, payload)
      values (v_aff_user, v_link.tenant_id, 'referral_commission_earned',
              jsonb_build_object('amount', v_amount, 'currency', v_currency,
                                 'client_code', v_code, 'source', 'subscription'));
    end if;
  exception when others then
    raise warning 'referral commission for invoice % failed: %', new.id, sqlerrm;
    begin
      insert into public.notifications (recipient_user_id, tenant_id, type, payload)
      select t.owner_id, t.id, 'referral_commission_failed',
             jsonb_build_object('invoice_id', new.id, 'error', left(sqlerrm, 300))
        from public.tenants t
       where t.id = new.tenant_id and t.owner_id is not null;
    exception when others then
      null;
    end;
  end;
  return new;
end;
$blk9$;

do $blk10$
begin
  execute 'drop trigger if exists trg_referral_commission_invoice_upd on public.invoices';
  execute 'create trigger trg_referral_commission_invoice_upd
             after update of status on public.invoices
             for each row when (old.status is distinct from new.status and new.status = ''paid'')
             execute function public.handle_referral_commission_on_invoice_paid()';
  execute 'drop trigger if exists trg_referral_commission_invoice_ins on public.invoices';
  execute 'create trigger trg_referral_commission_invoice_ins
             after insert on public.invoices
             for each row when (new.status = ''paid'')
             execute function public.handle_referral_commission_on_invoice_paid()';
  insert into _p35 values (7, 'abonnementscommissie', 'triggers staan op invoices');
exception when others then
  insert into _p35 values (7, 'abonnementscommissie', 'MISLUKT: ' || sqlstate || ' ' || sqlerrm);
end;
$blk10$;

-- ── 7. de oude clawbacks uit ─────────────────────────────────────────
do $blk11$
declare
  r record;
  v text := '';
begin
  for r in
    select t.tgname, c.relname
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_proc p on p.oid = t.tgfoid
     where not t.tgisinternal
       and p.proname in ('_clawback_on_wallet_refund', '_clawback_on_ad_account_withdrawal')
  loop
    execute format('drop trigger if exists %I on public.%I', r.tgname, r.relname);
    v := v || r.relname || '.' || r.tgname || ' ';
  end loop;
  insert into _p35 values (8, 'oude clawback-triggers uit (functies blijven)',
    case when v = '' then 'er hingen er geen' else v end);
exception when others then
  insert into _p35 values (8, 'oude clawbacks', 'MISLUKT: ' || sqlstate || ' ' || sqlerrm);
end;
$blk11$;

-- ── 8. wat de affiliate ziet ─────────────────────────────────────────
-- Zelfde handtekening als live (plak 33 rij 1), anders body.
create or replace function public.affiliate_referral_stats(
  p_from timestamp with time zone default null::timestamp with time zone,
  p_to   timestamp with time zone default null::timestamp with time zone)
returns table(referral_link_id uuid, referred_advertiser_id uuid, referred_advertiser_name text,
              referred_advertiser_email text, referred_advertiser_code text, commission_type text,
              commission_pct numeric, commission_currency text, spend_usd numeric, spend_eur numeric,
              topup_count integer, earnings_usd numeric, earnings_eur numeric,
              unpaid_usd numeric, unpaid_eur numeric)
language plpgsql
security definer
set search_path to 'public'
as $blk12$
declare
  v_uid uuid := auth.uid();
  v_aff uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select a.id into v_aff
    from public.advertisers a
   where a.user_id = v_uid
   order by a.created_at desc
   limit 1;
  if v_aff is null then
    return;
  end if;

  return query
  select
    d.id                                                   as referral_link_id,
    d.referred_advertiser_id                               as referred_advertiser_id,
    d.referred_advertiser_name::text                       as referred_advertiser_name,
    regexp_replace(d.referred_advertiser_email::text, '^(.)[^@]*@', '\1***@') as referred_advertiser_email,
    d.referred_advertiser_tenant_client_code::text         as referred_advertiser_code,
    rl.commission_type::text                               as commission_type,
    rl.commission_pct::numeric                             as commission_pct,
    rl.commission_currency::text                           as commission_currency,
    coalesce(sp.spend_usd, 0)::numeric                     as spend_usd,
    coalesce(sp.spend_eur, 0)::numeric                     as spend_eur,
    coalesce(sp.topup_count, 0)::int                       as topup_count,
    greatest(coalesce(ea.earn_usd, 0) - coalesce(cb.usd, 0), 0)::numeric   as earnings_usd,
    greatest(coalesce(ea.earn_eur, 0) - coalesce(cb.eur, 0), 0)::numeric   as earnings_eur,
    greatest(coalesce(ea.unpaid_usd, 0) - coalesce(cb.usd, 0), 0)::numeric as unpaid_usd,
    greatest(coalesce(ea.unpaid_eur, 0) - coalesce(cb.eur, 0), 0)::numeric as unpaid_eur
  from public.referral_links_with_details d
  join public.referral_links rl on rl.id = d.id
  -- Wat er op de ad accounts van de klant LANDDE, in de munt van het
  -- account (topup_usd onderscheidt klant- van adminrijen).
  left join lateral (
    select
      sum(t.topup_amount) filter (where t.topup_usd is null
                                     or upper(coalesce(t.currency, 'EUR')) = 'USD') as spend_usd,
      sum(t.topup_amount) filter (where t.topup_usd is not null
                                     and upper(coalesce(t.currency, 'EUR')) = 'EUR') as spend_eur,
      count(*)                                                                   as topup_count
    from public.top_ups t
    where t.advertiser_id = d.referred_advertiser_id
      and t.tenant_id = d.tenant_id
      and t.status = 'completed'
      and coalesce(t.is_deleted, false) = false
      and (p_from is null or coalesce(t.verified_at, t.created_at) >= p_from)
      and (p_to   is null or coalesce(t.verified_at, t.created_at) <= p_to)
  ) sp on true
  left join lateral (
    select
      sum(rc.amount) filter (where upper(rc.currency) = 'USD'
                               and coalesce(rc.status, 'unpaid') in ('unpaid', 'paid')) as earn_usd,
      sum(rc.amount) filter (where upper(rc.currency) = 'EUR'
                               and coalesce(rc.status, 'unpaid') in ('unpaid', 'paid')) as earn_eur,
      sum(rc.amount) filter (where upper(rc.currency) = 'USD'
                               and coalesce(rc.status, 'unpaid') = 'unpaid')            as unpaid_usd,
      sum(rc.amount) filter (where upper(rc.currency) = 'EUR'
                               and coalesce(rc.status, 'unpaid') = 'unpaid')            as unpaid_eur
    from public.referral_commissions rc
    where rc.referral_link_id = d.id
      and (p_from is null or rc.created_at >= p_from)
      and (p_to   is null or rc.created_at <= p_to)
  ) ea on true
  left join lateral (
    select
      sum(c.amount) filter (where upper(c.currency) = 'USD') as usd,
      sum(c.amount) filter (where upper(c.currency) = 'EUR') as eur
      from public.referral_clawbacks c
     where c.referral_link_id = d.id
       and (p_from is null or c.created_at >= p_from)
       and (p_to   is null or c.created_at <= p_to)
  ) cb on true
  where d.affiliate_advertiser_id = v_aff
    and coalesce(rl.status, 'active') = 'active'
  order by d.referred_advertiser_name nulls last;
end;
$blk12$;

insert into _p35 values (9, 'affiliate_referral_stats', 'alleen actieve links, besteding uit fundings, clawbacks binnen de periode');

-- ── 9. de view achter /commissions ───────────────────────────────────
do $blk13$
begin
  execute $v$
    create or replace view public.referral_commissions_with_details
    with (security_invoker = on) as
    select rc.id, rc.created_at, rc.referral_link_id, rc.tenant_id, rc.type, rc.amount,
           rc.currency, rc.status, rc.topup_id, rc.subscription_id, rc.subscription_invoice_id,
           a_aff.tenant_client_code as affiliate_advertiser_tenant_client_code,
           up_aff.email as affiliate_advertiser_email,
           up_aff.full_name as affiliate_advertiser_name,
           a_ref.tenant_client_code as referred_advertiser_tenant_client_code,
           up_ref.email as referred_advertiser_email,
           up_ref.full_name as referred_advertiser_name,
           rc.source, rc.base_amount, rc.pct, rc.fee_amount, rc.supplier_fee_pct,
           rc.supplier_cost, rc.rule_id, rc.note
      from public.referral_commissions rc
      left join public.referral_links rl on rl.id = rc.referral_link_id
      left join public.advertisers a_aff on a_aff.id = rl.affiliate_advertiser_id
      left join public.user_profiles up_aff on up_aff.id = a_aff.profile_id
      left join public.advertisers a_ref on a_ref.id = rl.referred_advertiser_id
      left join public.user_profiles up_ref on up_ref.id = a_ref.profile_id
  $v$;
  insert into _p35 values (10, 'view referral_commissions_with_details', 'toont de berekening mee; security_invoker aan');
exception when others then
  insert into _p35 values (10, 'view', 'MISLUKT: ' || sqlstate || ' ' || sqlerrm);
end;
$blk13$;

-- ── 10. geen plan, geen aanvraag ─────────────────────────────────────
-- De live body uit plak 33 rij 16, met één blok erbij (gemarkeerd).
create or replace function public.ad_account_request_create_paid(
  p_platform text, p_currency text, p_timezone text,
  p_website_url text default null::text, p_notes text default null::text,
  p_metadata jsonb default '{}'::jsonb)
returns ad_account_requests
language plpgsql
security definer
set search_path to 'public'
as $blk14$
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

  select * into v_adv from public.advertisers
   where user_id = v_uid order by created_at desc limit 1;
  if not found then
    raise exception 'No advertiser profile for this user' using errcode = '42501';
  end if;

  -- ── NIEUW (plak 35): GEEN PLAN, GEEN AANVRAAG ────────────────────
  -- De eigenaar: "zonder plan moet eigenlijk niemand een ad account aan
  -- kunnen vragen". Het scherm houdt het tegen; dit houdt ook een
  -- directe aanroep tegen.
  if not exists (select 1 from public.subscriptions s
                  where s.advertiser_id = v_adv.id and s.status = 'active') then
    raise exception 'Ad accounts come with a plan. Start a plan first, then request an account.'
      using errcode = '22000';
  end if;

  v_cur := upper(coalesce(p_currency, 'EUR'));
  if v_cur not in ('USD', 'EUR') then
    raise exception 'Unsupported currency %', v_cur using errcode = '22000';
  end if;

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
     nullif(v_fee, 0),
     case when v_fee > 0 then v_cur else null end,
     case when v_fee > 0 then now() else null end)
  returning * into v_req;

  return v_req;
end;
$blk14$;

insert into _p35 values (11, 'ad_account_request_create_paid', 'geen actief abonnement = geweigerd');

-- ── 11. een 'on hold' rij opnieuw rekenen ────────────────────────────
create or replace function public.referral_commission_recalculate(p_commission_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $blk15$
declare
  v_c      record;
  v_t      record;
  v_sup    numeric;
  v_fee    numeric;
  v_landed numeric;
  v_cost   numeric;
  v_profit numeric;
  v_amount numeric;
  v_user   uuid;
  v_code   text;
begin
  select * into v_c from public.referral_commissions where id = p_commission_id for update;
  if not found then
    raise exception 'Commission not found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.tenants t
                  where t.id = v_c.tenant_id and t.owner_id = auth.uid()) then
    raise exception 'Only the account owner can recalculate a commission' using errcode = '42501';
  end if;
  if coalesce(v_c.status, '') <> 'on_hold' or v_c.topup_id is null
     or coalesce(v_c.source, 'topup') <> 'topup' then
    raise exception 'Only a top-up commission on hold can be recalculated' using errcode = '22023';
  end if;

  select * into v_t from public.top_ups where id = v_c.topup_id;
  v_sup := public._supplier_fee_pct_for(v_t.account_id, v_t.tenant_id);
  if v_sup is null then
    raise exception 'The supplier fee is still not recorded for this ad account or its type'
      using errcode = '22023';
  end if;

  v_fee    := round(coalesce(v_t.fee_amount, 0)::numeric, 2);
  v_landed := round(coalesce(v_t.topup_amount, 0)::numeric, 2);
  v_cost   := round(v_landed * v_sup / 100, 2);
  v_profit := round(v_fee - v_cost, 2);
  v_amount := case when v_profit > 0 then round(v_profit * v_c.pct / 100, 2) else 0 end;

  if v_amount <= 0 then
    update public.referral_commissions
       set status = 'reversed', amount = 0, base_amount = v_profit,
           supplier_fee_pct = v_sup, supplier_cost = v_cost,
           note = 'No profit on this top-up once the supplier fee is counted',
           updated_at = now()
     where id = v_c.id;
    return jsonb_build_object('ok', true, 'amount', 0, 'currency', v_c.currency);
  end if;

  update public.referral_commissions
     set status = 'unpaid', amount = v_amount, base_amount = v_profit,
         supplier_fee_pct = v_sup, supplier_cost = v_cost, note = null, updated_at = now()
   where id = v_c.id;
  perform public._referral_link_earnings_add(v_c.referral_link_id, v_c.currency, v_amount);

  select a.user_id into v_user
    from public.referral_links rl join public.advertisers a on a.id = rl.affiliate_advertiser_id
   where rl.id = v_c.referral_link_id;
  select a.tenant_client_code into v_code from public.advertisers a where a.id = v_t.advertiser_id;
  if v_user is not null then
    insert into public.notifications (recipient_user_id, tenant_id, type, payload)
    values (v_user, v_c.tenant_id, 'referral_commission_earned',
            jsonb_build_object('amount', v_amount, 'currency', v_c.currency,
                               'client_code', v_code, 'source', 'topup'));
  end if;
  return jsonb_build_object('ok', true, 'amount', v_amount, 'currency', v_c.currency);
end;
$blk15$;

revoke all on function public.referral_commission_recalculate(uuid) from public, anon;
grant execute on function public.referral_commission_recalculate(uuid) to authenticated;

insert into _p35 values (12, 'referral_commission_recalculate', 'staat; alleen de eigenaar');

-- =====================================================================
-- Het rapport — de SQL-editor toont alleen dit
-- =====================================================================
insert into _p35
select 13, 'regels die er nu staan (verwacht 0: stel ze in op /affiliates)',
  (select count(*)::text from public.commission_rules);

insert into _p35
select 16, 'zelftest resolutie (moet leeg zijn zonder regels)',
  coalesce((select string_agg(coalesce(pct::text, '-') || ' / ' || coalesce(amount::text, '-') || ' ' || level, ', ')
              from public._commission_rule_at(
                (select a.tenant_id from public.advertisers a where a.tenant_client_code = 'PSM0005' limit 1),
                (select a.id from public.advertisers a where a.tenant_client_code = 'PSM0005' limit 1),
                'topup', 'eu-meta-psm', now())), 'leeg - goed: zonder regels geen commissie');

insert into _p35
select 14, 'triggers op top_ups en invoices voor commissie',
  coalesce(string_agg(c.relname || ' :: ' || t.tgname, E'\n' order by c.relname, t.tgname), 'geen')
  from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_proc p on p.oid = t.tgfoid
 where not t.tgisinternal
   and p.proname in ('handle_referral_commission_on_topup', '_reverse_referral_commission_on_topup',
                     'handle_referral_commission_on_invoice_paid');

insert into _p35
select 15, 'leverancierskost per type (ontbreekt die, dan gaat commissie "on hold")',
  coalesce((
    select string_agg(t.label || ' = ' || coalesce(s.supplier_fee_pct::text, 'NIET INGEVULD'), E'\n' order by t.sort_order)
      from public.ad_account_types t
      left join public.ad_account_type_suppliers s on s.ad_account_type_id = t.id
     where t.is_active
       and t.tenant_id = (select a.tenant_id from public.advertisers a where a.tenant_client_code = 'PSM0005' limit 1)
  ), 'geen types gevonden');

select nr, item, v as antwoord from _p35 order by nr;
