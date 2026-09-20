-- =====================================================================
-- PLAK 12 — een plan-wijziging negeert de korting van de klant
-- =====================================================================
-- Uit de body die je stuurde, één regel:
--
--   v_delta := p_new_amount - coalesce(v_sub.amount, v_curr.total, 0);
--
-- Dat zijn twee LIJSTPRIJZEN. `advertiser_perks` wordt in deze functie
-- nergens gelezen -- terwijl `subscription_billing_run` elke maand
-- netjes `round(amount * (1 - korting/100), 2)` factureert.
--
-- Wat dat kost, met een klant die 97,5% korting heeft op EUR 200:
--
--   maandfactuur nu                      EUR   5,00
--   plan gaat van EUR 200 naar EUR 500
--   wat hij die maand verschuldigd is    EUR  12,50  (500 x 0,025)
--   waarvan al betaald                   EUR   5,00
--   dus bij te betalen                   EUR   7,50
--   wat de functie nu rekent             EUR 300,00   <-- veertig keer
--
-- En die bijbetaling wordt automatisch uit de wallet geïncasseerd. De
-- maand erna staat de factuur wél weer op EUR 12,50, dus de fout valt
-- alleen op als iemand die ene afschrijving naloopt.
--
-- Dezelfde fout zit in de andere tak: is er nog niets betaald en gaat
-- het plan omhoog, dan wordt de openstaande factuur herschreven naar
-- `p_new_amount` -- ook de lijstprijs, ook zonder korting.
--
-- ── WAT DIT DOET ─────────────────────────────────────────────────────
--
-- Er komt één functie bij, `_effective_subscription_amount`, die
-- precies doet wat de incasso-motor doet: waiver -> 0, korting ->
-- procent eraf, anders de lijstprijs. Daarna is `change_subscription_amount`
-- letterlijk jouw body met drie plekken die door die functie gaan:
-- het verschil, de herschreven factuur, en de regel op de factuur.
--
-- `subscriptions.amount` blijft de LIJSTPRIJS. Dat hoort ook: de korting
-- is een losse afspraak met een einddatum, en die mag niet in de prijs
-- verdwijnen.
--
-- Veilig om vaker te draaien.
-- =====================================================================

set search_path = public;

-- ── Wat een klant deze maand echt betaalt ────────────────────────────
-- Zelfde regels als subscription_billing_run: één waiver zet alles op
-- nul, anders telt de grootste korting, en kortingen stapelen niet.
create or replace function public._effective_subscription_amount(
  p_advertiser_id uuid,
  p_list numeric
)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $eff$
declare
  v_disc numeric;
begin
  if p_list is null or p_list <= 0 then
    return 0;
  end if;

  if exists (
    select 1 from public.advertiser_perks p
     where p.advertiser_id = p_advertiser_id
       and p.kind = 'subscription_waiver'
       and p.active
       and p.starts_at <= now()
       and (p.expires_at is null or p.expires_at > now())
  ) then
    return 0;
  end if;

  select p.amount into v_disc
    from public.advertiser_perks p
   where p.advertiser_id = p_advertiser_id
     and p.kind = 'subscription_discount'
     and p.active
     and p.starts_at <= now()
     and (p.expires_at is null or p.expires_at > now())
   order by p.amount desc nulls last
   limit 1;

  if v_disc is not null and v_disc > 0 then
    return round(p_list * (1 - least(v_disc, 100) / 100.0), 2);
  end if;

  return round(p_list, 2);
exception when undefined_table or undefined_column then
  -- Geen perks-tabel op deze database: dan is de lijstprijs het bedrag.
  return round(p_list, 2);
end;
$eff$;

create or replace function public.change_subscription_amount(
  p_subscription_id uuid,
  p_new_amount numeric,
  p_new_currency text default null::text,
  p_refund boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $chg$
declare
  v_uid      uuid := auth.uid();
  v_sub      public.subscriptions%rowtype;
  v_cur      text;
  v_company  uuid;
  v_advuser  uuid;
  v_curr     public.invoices%rowtype;
  v_delta    numeric;
  v_refund   numeric;
  v_adjpaid  numeric;
  v_collected numeric;
  v_refunded numeric;
  v_wallet   uuid;
  v_new_inv  uuid;
  v_period   date;
  v_action   text := 'updated';
  v_going_up boolean;
  v_eff_new  numeric;
  v_eff_old  numeric;
begin
  if p_new_amount is null or p_new_amount < 0 then
    raise exception 'Invalid amount' using errcode = '22000';
  end if;

  select * into v_sub from public.subscriptions where id = p_subscription_id for update;
  if not found then
    raise exception 'Subscription not found' using errcode = '42704';
  end if;

  if v_uid is not null and not exists (
    select 1 from public.user_profiles up
     where up.user_id = v_uid
       and up.tenant_id = v_sub.tenant_id
       and up.role = 'admin'
       and exists (
         select 1 from public.tenants t
          where t.id = up.tenant_id and t.owner_id = up.user_id
       )
       and coalesce(up.is_active, true) = true
       and coalesce(up.status, 'active') <> 'inactive'
  ) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  v_cur := upper(coalesce(nullif(p_new_currency, ''), v_sub.currency, 'EUR'));
  if v_cur not in ('USD', 'EUR') then
    raise exception 'Unsupported currency %', v_cur using errcode = '22000';
  end if;

  select user_id into v_advuser from public.advertisers where id = v_sub.advertiser_id;
  select id into v_company from public.companies where advertiser_id = v_sub.advertiser_id limit 1;

  -- ── WAT DE KLANT ECHT BETAALT, NIET DE LIJSTPRIJS ──────────────────
  -- Dit is de hele wijziging. subscription_billing_run factureert al
  -- jaren de korting; deze functie rekende met de lijstprijs en stuurde
  -- daardoor een bijbetaling die tot veertig keer te hoog kon zijn.
  v_eff_new := public._effective_subscription_amount(v_sub.advertiser_id, p_new_amount);
  v_eff_old := public._effective_subscription_amount(
                 v_sub.advertiser_id, coalesce(v_sub.amount, 0));

  select * into v_curr from public.invoices
   where subscription_id = p_subscription_id and period_start is not null
   order by period_start desc, created_at desc
   limit 1;

  if found and v_curr.status = 'paid'
     and upper(coalesce(v_curr.currency, 'EUR')) = v_cur then
    -- Was: p_new_amount - coalesce(v_sub.amount, v_curr.total, 0)
    v_delta := v_eff_new - coalesce(nullif(v_eff_old, 0), v_curr.total, 0);

    if v_delta < 0 then
      -- ── LOWERING PAYS NOTHING BACK, AND CANCELS NOTHING ────────────
      -- The owner's rule (2026-09-20): a change works in OUR favour on
      -- both sides. An invoice that has already been written stands;
      -- the lower price applies from the next period.
      select coalesce(sum(total), 0) into v_adjpaid
        from public.invoices
       where subscription_id = p_subscription_id
         and type = 'subscription_adjustment'
         and status = 'paid'
         and created_at >= v_curr.created_at;

      select coalesce(sum(delta), 0) into v_refunded
        from public.wallet_adjustments
       where advertiser_id = v_sub.advertiser_id
         and status = 'approved'
         and reference = 'subscription_change_refund:' || v_curr.id::text;

      v_collected := coalesce(v_curr.total, 0) + coalesce(v_adjpaid, 0);
      v_refund := least(
        -v_delta,
        greatest(v_collected - v_eff_new - coalesce(v_refunded, 0), 0)
      );

      if p_refund and v_refund > 0 then
        if v_cur = 'USD' then
          update public.wallets
             set usd_balance = coalesce(usd_balance, 0) + v_refund, updated_at = now()
           where advertiser_id = v_sub.advertiser_id;
        else
          update public.wallets
             set eur_balance = coalesce(eur_balance, 0) + v_refund, updated_at = now()
           where advertiser_id = v_sub.advertiser_id;
        end if;

        select id into v_wallet from public.wallets
         where advertiser_id = v_sub.advertiser_id limit 1;
        if v_wallet is not null then
          insert into public.wallet_adjustments
            (tenant_id, advertiser_id, wallet_id, delta, currency, status,
             reference, reason, reviewed_at)
          values
            (v_sub.tenant_id, v_sub.advertiser_id, v_wallet, v_refund, v_cur,
             'approved',
             'subscription_change_refund:' || v_curr.id::text,
             'Subscription lowered to ' || p_new_amount::text || ' ' || v_cur,
             now());
        end if;
        v_action := 'refunded';
      else
        v_action := 'lowered_next_period';
      end if;

    elsif v_delta > 0 and v_company is not null then
      v_period := coalesce(v_sub.next_payment_date::date, current_date);
      insert into public.invoices
        (advertiser_id, tenant_id, company_id, subscription_id, type, currency,
         total, items, status, due_date)
      values
        (v_sub.advertiser_id, v_sub.tenant_id, v_company, p_subscription_id,
         'subscription_adjustment', v_cur, v_delta,
         jsonb_build_array(jsonb_build_object(
           'name', 'Subscription change adjustment', 'rate', v_delta,
           'amount', v_delta, 'quantity', 1, 'tax', 0, 'currency', v_cur)),
         'unpaid', (case when v_period > current_date then v_period::timestamptz else now() + interval '7 days' end))
      returning id into v_new_inv;
      v_action := 'charged_difference';
    end if;
  else
    -- ── NOTHING PAID YET ───────────────────────────────────────────
    -- Raising the price rewrites the open invoice; LOWERING it does
    -- not. The lower price starts next period.
    v_going_up := p_new_amount > coalesce(v_sub.amount, 0);

    if coalesce(v_sub.billing_period, 'month') = 'year' and p_refund then
      raise exception 'A yearly plan runs to its end date — yearly terms are not refunded part-way.'
        using errcode = '22000';
    end if;

    if v_going_up then
      update public.invoices
         set status = 'void', period_start = null
       where status = 'unpaid'
         and (
           subscription_id = p_subscription_id
           or (
             subscription_id is null
             and type = 'subscription'
             and advertiser_id = v_sub.advertiser_id
             and tenant_id = v_sub.tenant_id
           )
         );

      -- De herschreven factuur droeg ook de lijstprijs. Hier geldt
      -- hetzelfde: factureer wat de klant betaalt.
      if v_company is not null and v_eff_new > 0 then
        v_period := coalesce(v_sub.next_payment_date::date, current_date);
        insert into public.invoices
          (advertiser_id, tenant_id, company_id, subscription_id, type, currency,
           total, items, status, period_start, due_date)
        values
          (v_sub.advertiser_id, v_sub.tenant_id, v_company, p_subscription_id,
           'subscription', v_cur, v_eff_new,
           jsonb_build_array(jsonb_build_object(
             'name', 'Monthly subscription', 'rate', v_eff_new,
             'amount', v_eff_new, 'quantity', 1, 'tax', 0, 'currency', v_cur)),
           'unpaid', v_period, (case when v_period > current_date then v_period::timestamptz else now() + interval '7 days' end))
        returning id into v_new_inv;
        v_action := 'reissued';
      else
        v_action := 'lowered_next_period';
      end if;
    else
      v_action := 'lowered_next_period';
    end if;
  end if;

  update public.subscriptions
     set amount = p_new_amount, currency = v_cur, updated_at = now()
   where id = p_subscription_id;

  begin
    insert into public.notifications
      (recipient_user_id, tenant_id, type, payload, is_read)
    values
      (v_advuser, v_sub.tenant_id, 'subscription_changed',
       jsonb_build_object('amount', p_new_amount, 'currency', v_cur,
                          'action', v_action), false);
  exception when others then null; end;

  return jsonb_build_object('action', v_action, 'new_invoice', v_new_inv,
                            'amount', p_new_amount, 'currency', v_cur);
end;
$chg$;

-- =====================================================================
-- Het rapport — de SQL-editor toont alleen dit
-- =====================================================================
select 1 as nr, 'rekent een plan-wijziging nu met de korting' as item,
  coalesce((
    select case when position('_effective_subscription_amount' in p.prosrc) > 0
                then 'JA - gerepareerd'
                else 'nee - dit bestand is niet geplakt' end
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'change_subscription_amount' limit 1
  ), 'functie bestaat niet') as antwoord
union all
-- De proef: wat rekent hij voor een klant met en zonder korting.
select 2, 'PROEF: EUR 200 met 97,5% korting wordt',
  to_char(public._effective_subscription_amount(
    (select advertiser_id from public.subscriptions
      join public.advertisers a on a.id = subscriptions.advertiser_id
     where a.tenant_client_code = 'PSM0005' limit 1), 200), 'FM999999990.00')
  || '   (zonder korting hoort hier 200.00 te staan)'
union all
select 3, 'klanten met een actieve abonnements-korting of waiver',
  coalesce((
    select string_agg(a.tenant_client_code || ': ' || p.kind ||
                      coalesce(' ' || p.amount::text || '%', ''),
                      E'\n' order by a.tenant_client_code)
      from public.advertiser_perks p
      join public.advertisers a on a.id = p.advertiser_id
     where p.active
       and p.kind in ('subscription_waiver', 'subscription_discount')
       and p.starts_at <= now()
       and (p.expires_at is null or p.expires_at > now())
  ), 'geen - de fout heeft dus nog niets gekost')
union all
-- TWEE MOTOREN. process_recurring_subscriptions maakt OOK
-- type='subscription' facturen, met een andere duplicaat-test en zonder
-- korting. Wordt hij ergens aangeroepen, dan factureert deze klant
-- dubbel.
select 4, 'wordt process_recurring_subscriptions ergens gepland',
  coalesce((
    select string_agg(jobname || ': ' || command, E'\n')
      from cron.job
     where command ilike '%process_recurring%'
  ), 'nee - staat in geen enkele cron-job')
union all
select 5, 'alle cron-jobs die nu draaien',
  coalesce((
    select string_agg(jobname || '  [' || schedule || ']', E'\n' order by jobname)
      from cron.job
  ), 'geen')
union all
select 6, 'E2E0001 heeft 2 openstaande facturen - welke',
  coalesce((
    select string_agg(
             coalesce(i.number::text, i.id::text) || '  ' || i.type || '  ' ||
             to_char(i.total, 'FM999999990.00') || ' ' ||
             upper(coalesce(i.currency, 'EUR')) || '  ' ||
             coalesce(i.status, '-') || '  periode ' ||
             coalesce(i.period_start::text, 'GEEN'),
             E'\n' order by i.created_at)
      from public.invoices i
      join public.advertisers a on a.id = i.advertiser_id
     where a.tenant_client_code = 'E2E0001'
       and coalesce(i.status, '') not in ('paid', 'void', 'cancelled')
  ), 'geen')
order by nr;
