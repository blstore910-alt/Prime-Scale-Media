-- =====================================================================
-- PLAK 2 — de incasso, en drie dingen die uit het vorige rapport kwamen
-- =====================================================================
-- Nu ik de echte body heb, woord voor woord. Er zit één fout in die
-- geld kost en één kolomnaam die ik misgokt had.
--
-- ── WAT ER MIS IS MET DE DUPLICAAT-TEST ──────────────────────────────
--
-- Hij staat er nu zo bij:
--
--   if exists (
--     select 1 from public.invoices i
--      where i.subscription_id = r.id
--        and (i.period_start = v_period
--             or (i.type = 'subscription' and i.status = 'unpaid'
--                 and i.period_start is not null))
--   ) then
--     continue;
--   end if;
--
-- Geen van beide takken kijkt naar `void`. Er staan 7 gestorneerde
-- abonnementsfacturen. Een factuur die je STORNEERT hoort niet te
-- tellen -- dat is wat storneren betekent -- maar hier telt hij wel, en
-- `next_payment_date` schuift alleen vooruit als er BETAALD wordt. Dus
-- die maand wordt nooit opnieuw gefactureerd. Niet deze maand, niet
-- volgende maand, nooit. Bij EUR 200 per maand is dat EUR 2.400 per
-- klant per jaar die nergens op een factuur komt.
--
-- Dit bestand verandert precies die twee voorwaarden: `void` en
-- `cancelled` tellen niet meer mee. Verder is de body letterlijk
-- dezelfde als wat er nu op de database staat.
--
-- ── WAT DIT BEWUST NIET VERANDERT ────────────────────────────────────
--
-- De tweede tak ("er staat nog een onbetaalde factuur open, dus sla
-- deze klant over") laat ik staan. Die vólgt namelijk uit hoe de klok
-- werkt: `next_payment_date` beweegt alleen bij betaling, dus zolang
-- oktober niet betaald is STAAT de klok op oktober en zou november
-- sowieso niet aan de beurt zijn. Dat weghalen zonder de klok te
-- veranderen levert dubbele facturen op dezelfde maand op, en de klok
-- veranderen raakt _on_subscription_invoice_paid, waarvan ik de body
-- niet heb.
--
-- Dus: wil je dat een klant die een maand mist tóch elke maand een
-- factuur krijgt (schuld die oploopt, i.p.v. facturatie die stilstaat),
-- dan is dat één beslissing van jou en dan heb ik
-- `_on_subscription_invoice_paid` erbij nodig. Regel 5 hieronder haalt
-- hem op.
--
-- Veilig om vaker te draaien.
-- =====================================================================

set search_path = public;

create or replace function public.subscription_billing_run()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $bill$
declare
  r        record;
  inv      record;
  v_company uuid;
  v_period  date;
  v_inv_id  uuid;
  v_cur     text;
  v_amount  numeric;
  v_disc    numeric;
  v_generated int := 0;
  v_charged   int := 0;
  v_pastdue   int := 0;
  v_no_company int := 0;
  v_waived    int := 0;
  v_was_status text;
begin
  for r in
    select s.id, s.advertiser_id, s.tenant_id, s.amount, s.currency,
           s.next_payment_date, a.user_id as adv_user
      from public.subscriptions s
      join public.advertisers a on a.id = s.advertiser_id
     where s.status in ('active', 'past_due')
       and coalesce(s.amount, 0) > 0
       and s.next_payment_date is not null
       and s.next_payment_date <= now()
  loop
    v_period := r.next_payment_date::date;
    v_cur := upper(coalesce(r.currency, 'EUR'));

    -- Waiver perk covering this period -> don't bill, just roll forward.
    if exists (
      select 1 from public.advertiser_perks p
       where p.advertiser_id = r.advertiser_id
         and p.kind = 'subscription_waiver'
         and p.active
         and p.starts_at <= now()
         and (p.expires_at is null or p.expires_at > now())
    ) then
      update public.subscriptions
         set next_payment_date = (v_period + interval '1 month'), updated_at = now()
       where id = r.id;
      v_waived := v_waived + 1;
      continue;
    end if;

    -- Discount perk -> reduce the amount for this invoice.
    v_amount := r.amount;
    select p.amount into v_disc from public.advertiser_perks p
      where p.advertiser_id = r.advertiser_id
        and p.kind = 'subscription_discount'
        and p.active
        and p.starts_at <= now()
        and (p.expires_at is null or p.expires_at > now())
      order by p.amount desc nulls last
      limit 1;
    if v_disc is not null and v_disc > 0 then
      v_amount := round(r.amount * (1 - least(v_disc, 100) / 100.0), 2);
    end if;
    if v_amount <= 0 then
      update public.subscriptions
         set next_payment_date = (v_period + interval '1 month'), updated_at = now()
       where id = r.id;
      v_waived := v_waived + 1;
      continue;
    end if;

    -- ── DE ENIGE INHOUDELIJKE WIJZIGING ────────────────────────────
    --
    -- `and coalesce(i.status, '') not in ('void', 'cancelled')` op
    -- allebei de takken. Een gestorneerde factuur is ingetrokken; hij
    -- hoort zijn maand niet te blokkeren. Omdat next_payment_date
    -- alleen bij BETALING vooruit schuift, blokkeerde hij die maand
    -- anders voor altijd.
    if exists (
      select 1 from public.invoices i
       where i.subscription_id = r.id
         and coalesce(i.status, '') not in ('void', 'cancelled')
         and (i.period_start = v_period
              or (i.type = 'subscription' and i.status = 'unpaid' and i.period_start is not null))
    ) then
      continue;
    end if;

    select id into v_company from public.companies
     where advertiser_id = r.advertiser_id limit 1;
    if v_company is null then
      v_no_company := v_no_company + 1;
      begin
        perform public.raise_integration_failure(
          r.tenant_id, 'billing',
          'Subscription ' || r.id || ' is due but the advertiser has no company to invoice.');
      exception when others then null; end;
      continue;
    end if;

    begin
      insert into public.invoices
        (advertiser_id, tenant_id, company_id, subscription_id, type, currency,
         total, items, status, period_start, due_date)
      values
        (r.advertiser_id, r.tenant_id, v_company, r.id, 'subscription', v_cur,
         v_amount,
         jsonb_build_array(jsonb_build_object(
           'name', 'Monthly subscription', 'rate', v_amount, 'amount', v_amount,
           'quantity', 1, 'tax', 0, 'currency', v_cur)),
         'unpaid', v_period, now() + interval '7 days')
      returning id into v_inv_id;
      v_generated := v_generated + 1;

      begin
        insert into public.notifications
          (recipient_user_id, tenant_id, type, payload, is_read)
        values
          (r.adv_user, r.tenant_id, 'subscription_invoice',
           jsonb_build_object('invoice_id', v_inv_id, 'amount', v_amount,
                              'currency', v_cur), false);
      exception when others then null; end;
    exception when others then
      raise warning 'subscription invoice generate failed for sub %: %', r.id, sqlerrm;
    end;
  end loop;

  for inv in
    select i.id, i.subscription_id, i.tenant_id, i.total, i.currency,
           i.advertiser_id, a.user_id as adv_user, s.status as sub_status
      from public.invoices i
      join public.advertisers a on a.id = i.advertiser_id
      join public.subscriptions s on s.id = i.subscription_id
     where i.subscription_id is not null
       and (i.status = 'unpaid' and i.period_start is not null)
       and i.due_date is not null
       and i.due_date <= now()
       and s.status not in ('cancelled', 'inactive', 'paused')
       -- Een uitgezette klant incasseer je niet. is_active en status
       -- worden allebei gebruikt om iemand uit te zetten, dus allebei.
       and not exists (
         select 1 from public.user_profiles up
          where up.user_id = a.user_id
            and up.tenant_id = i.tenant_id
            and (coalesce(up.is_active, true) = false
                 or coalesce(up.status, 'active') = 'inactive')
       )
  loop
    begin
      perform public.invoice_pay_from_wallet(inv.id);
      v_charged := v_charged + 1;
    exception when others then
      v_was_status := inv.sub_status;
      begin
        update public.subscriptions set status = 'past_due', updated_at = now()
         where id = inv.subscription_id and status <> 'cancelled';
      exception when others then null; end;
      if coalesce(v_was_status, '') <> 'past_due' then
        v_pastdue := v_pastdue + 1;
        begin
          insert into public.notifications
            (recipient_user_id, tenant_id, type, payload, is_read)
          values
            (inv.adv_user, inv.tenant_id, 'subscription_past_due',
             jsonb_build_object('invoice_id', inv.id, 'amount', inv.total,
                                'currency', upper(coalesce(inv.currency, 'EUR'))),
             false);
        exception when others then null; end;
      end if;
    end;
  end loop;

  return jsonb_build_object(
    'generated', v_generated,
    'charged', v_charged,
    'past_due', v_pastdue,
    'waived', v_waived,
    'skipped_no_company', v_no_company);
end;
$bill$;


-- =====================================================================
-- De meldingskolom heet `payload`, niet `metadata`
-- =====================================================================
-- In de vorige plak zette ik een grendel op notifications die
-- 'metadata' en 'data' bewaakte. De body van de incasso hierboven laat
-- zien dat de kolom op deze database `payload` heet -- dus juist het
-- veld dat de meldingenpagina dereferenceert stond nog open. Zelfde
-- functie, één naam erbij.
-- =====================================================================
create or replace function public._notification_flags_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $notif$
declare
  j_new jsonb := to_jsonb(new);
  j_old jsonb := to_jsonb(old);
  k     text;
begin
  if auth.uid() is null then
    return new;
  end if;

  foreach k in array array['recipient_user_id', 'type', 'title', 'body',
                           'payload', 'metadata', 'data', 'created_at']
  loop
    if coalesce(j_new->>k, '') is distinct from coalesce(j_old->>k, '') then
      raise exception
        'A notification cannot be rewritten. You can mark it read or archive it.'
        using errcode = '42501';
    end if;
  end loop;

  return new;
end;
$notif$;


-- =====================================================================
-- Het rapport — de SQL-editor toont alleen dit
-- =====================================================================
select 1 as nr, 'telt een GESTORNEERDE factuur nog mee als blokkade' as item,
  coalesce((
    select case when position('not in (''void'', ''cancelled'')' in p.prosrc) > 0
                then 'nee - gerepareerd'
                else 'JA - dit bestand is niet geplakt' end
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'subscription_billing_run' limit 1
  ), 'functie bestaat niet') as antwoord
union all
-- Dit zijn de maanden die door een storno geblokkeerd stonden. Na deze
-- plak pakt de volgende nachtelijke run ze op.
select 2, 'abonnementen met een GESTORNEERDE factuur op hun huidige periode',
  (select count(*)::text from public.subscriptions s
    where s.status in ('active', 'past_due')
      and s.next_payment_date is not null
      and exists (
        select 1 from public.invoices i
         where i.subscription_id = s.id
           and i.period_start = s.next_payment_date::date
           and coalesce(i.status, '') in ('void', 'cancelled'))
      and not exists (
        select 1 from public.invoices i
         where i.subscription_id = s.id
           and i.period_start = s.next_payment_date::date
           and coalesce(i.status, '') not in ('void', 'cancelled')))
union all
select 3, 'abonnementen waarvan de klok NU al achterloopt  |  oudste',
  (select count(*)::text || '  |  ' ||
          coalesce(min(next_payment_date)::text, '-')
     from public.subscriptions
    where status in ('active', 'past_due')
      and coalesce(amount, 0) > 0
      and next_payment_date is not null
      and next_payment_date <= now())
union all
select 4, 'grendel op notifications dekt nu payload',
  coalesce((
    select case when position('''payload''' in p.prosrc) > 0 then 'JA' else 'nee' end
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = '_notification_flags_only' limit 1
  ), 'functie bestaat niet')
union all
-- De laatste body die ik mis. Hij verzet next_payment_date bij betaling;
-- als jij wilt dat een onbetaalde maand de facturatie NIET meer stilzet,
-- moet ik weten wat hij precies doet voordat ik de klok aanraak.
select 5, 'STUUR TERUG >> body _on_subscription_invoice_paid',
  coalesce((
    select pg_get_functiondef(p.oid)
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = '_on_subscription_invoice_paid' limit 1
  ), 'staat niet op deze database')
union all
select 6, 'STUUR TERUG >> body invoice_pay_from_wallet',
  coalesce((
    select pg_get_functiondef(p.oid)
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'invoice_pay_from_wallet' limit 1
  ), 'staat niet op deze database')
order by nr;
