-- ════════════════════════════════════════════════════════════════════
--  PLAK 51 — F3: kiezen wát je uitbetaald wilt, en in welke valuta
--
--  De eigenaar, 22-09: "mensen moeten eerst kiezen welke spend ze uit
--  willen betalen: EUR of USD of allebei, en dan of wij alles
--  converteren naar EUR of USD — dan kun je gelijk 0,6% fee applyen —
--  of dat het naar een EUR- en een USD-bank moet."
--
--  WAT DIT TOEVOEGT AAN PLAK 50
--
--    group_id          aanvragen die samen gedaan zijn horen bij elkaar
--                      en worden in één keer afgehandeld
--    payout_currency   waarin de affiliate het ontvangt
--    fx_rate           de koers die we gebruikt hebben (EUR per 1 USD)
--    fx_fee_pct        0,60 bij omrekenen, 0 als we niet omrekenen
--    payout_amount     wat hij werkelijk krijgt, na koers en fee
--
--    affiliate_payout_request_multi(valuta[], uitbetaalvaluta, gegevens)
--    affiliate_payout_decide        handelt nu de HELE groep af
--
--  ELKE RIJ BLIJFT PER BRONVALUTA. Zo blijven de commissierijen netjes
--  aan hun eigen valuta hangen, kan dezelfde commissie nooit in twee
--  uitbetalingen zitten, en blijft "één openstaande aanvraag per valuta"
--  gewoon gelden. Wat erbij komt is hoe het UITBETAALD wordt.
--
--  De koers komt uit exchange_rates (kolom `eur` = EUR per 1 USD, de
--  koers die de app overal gebruikt). Is er geen actieve koers, dan
--  weigert de functie om te rekenen — een koers verzinnen is erger dan
--  even wachten.
--
--  Plak alles in één keer. Onderaan komt ÉÉN tabel.
-- ════════════════════════════════════════════════════════════════════

drop table if exists _p51;
create temp table _p51(nr int, wat text, uitkomst text);

-- ── A. DE KOLOMMEN ───────────────────────────────────────────────────
alter table public.affiliate_payouts
  add column if not exists group_id uuid,
  add column if not exists payout_currency text,
  add column if not exists fx_rate numeric(12,6),
  add column if not exists fx_fee_pct numeric(5,2) not null default 0,
  add column if not exists fx_fee_amount numeric(14,2) not null default 0,
  add column if not exists payout_amount numeric(14,2);

create index if not exists affiliate_payouts_group_idx
  on public.affiliate_payouts (group_id);

do $blk0$
begin
  -- Bestaande rijen (plak 50) betalen uit in hun eigen valuta.
  update public.affiliate_payouts
     set payout_currency = coalesce(payout_currency, upper(currency)),
         payout_amount = coalesce(payout_amount, amount),
         group_id = coalesce(group_id, id)
   where payout_currency is null or payout_amount is null or group_id is null;
  insert into _p51 values (1, 'kolommen voor valutakeuze', 'toegevoegd; bestaande aanvragen betalen uit in hun eigen valuta');
exception when others then
  insert into _p51 values (1, 'kolommen voor valutakeuze', 'MISLUKT: ' || sqlerrm);
end
$blk0$;

-- ── B. AANVRAGEN: WELKE VALUTA, EN WAARIN UITBETAALD ─────────────────
create or replace function public.affiliate_payout_request_multi(
  p_currencies text[],
  p_payout_currency text default 'SAME',   -- 'EUR' | 'USD' | 'SAME'
  p_details jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $blk1$
declare
  v_uid     uuid := auth.uid();
  v_aff     uuid;
  v_tenant  uuid;
  v_group   uuid := gen_random_uuid();
  v_pay_cur text := upper(coalesce(p_payout_currency, 'SAME'));
  v_rate    numeric(12,6);
  v_fee_pct numeric(5,2);
  v_cur     text;
  v_gross   numeric(14,2);
  v_claw    numeric(14,2);
  v_net     numeric(14,2);
  v_count   int;
  v_payout  uuid;
  v_conv    numeric(14,2);
  v_fee     numeric(14,2);
  v_rows    jsonb := '[]'::jsonb;
  v_total   numeric(14,2) := 0;
  v_any     boolean := false;
begin
  if v_uid is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if v_pay_cur not in ('EUR', 'USD', 'SAME') then
    raise exception 'Pay out in EUR, in USD, or in the same currencies' using errcode = '22023';
  end if;
  if p_currencies is null or array_length(p_currencies, 1) is null then
    raise exception 'Pick what you want paid out' using errcode = '22023';
  end if;

  -- Dezelfde advertiser-rij als het scherm gebruikt.
  select a.id, a.tenant_id into v_aff, v_tenant
    from public.advertisers a
   where a.user_id = v_uid
   order by a.created_at desc
   limit 1;
  if v_aff is null then
    raise exception 'There is nothing waiting to be paid out' using errcode = 'P0002';
  end if;

  -- De koers, alleen nodig als we echt omrekenen.
  if v_pay_cur <> 'SAME' then
    select er.eur into v_rate
      from public.exchange_rates er
     where er.tenant_id = v_tenant
       and coalesce(er.is_active, true)
     order by er.updated_at desc nulls last
     limit 1;
  end if;

  foreach v_cur in array p_currencies loop
    v_cur := upper(trim(v_cur));
    if v_cur not in ('EUR', 'USD') then
      raise exception 'Only EUR or USD' using errcode = '22023';
    end if;

    if exists (
      select 1 from public.affiliate_payouts p
       where p.affiliate_advertiser_id = v_aff
         and upper(p.currency) = v_cur
         and p.status = 'requested'
    ) then
      raise exception 'You already have a % payout waiting for us', v_cur
        using errcode = '23505';
    end if;

    select coalesce(sum(rc.amount), 0), count(*)
      into v_gross, v_count
      from public.referral_commissions rc
      join public.referral_links l on l.id = rc.referral_link_id
     where l.affiliate_advertiser_id = v_aff
       and coalesce(l.status, 'active') in ('active', 'pending')
       and coalesce(rc.status, 'unpaid') = 'unpaid'
       and rc.payout_id is null
       and upper(coalesce(rc.currency, 'EUR')) = v_cur;

    select coalesce(sum(cb.amount), 0)
      into v_claw
      from public.referral_clawbacks cb
      join public.referral_links l on l.id = cb.referral_link_id
     where l.affiliate_advertiser_id = v_aff
       and coalesce(l.status, 'active') in ('active', 'pending')
       and cb.payout_id is null
       and upper(cb.currency) = v_cur;

    v_net := round(v_gross - v_claw, 2);
    if v_net <= 0 then
      continue;  -- niets in deze valuta: sla hem over
    end if;
    v_any := true;

    -- Omrekenen, als daarom gevraagd is en het een andere valuta is.
    if v_pay_cur = 'SAME' or v_pay_cur = v_cur then
      v_conv := v_net;
      v_fee_pct := 0;
      v_fee := 0;
    else
      if v_rate is null or v_rate <= 0 then
        raise exception 'We cannot convert right now — no exchange rate is set. Ask to be paid in the same currencies.'
          using errcode = 'P0002';
      end if;
      -- exchange_rates.eur is EUR per 1 USD.
      if v_cur = 'USD' and v_pay_cur = 'EUR' then
        v_conv := round(v_net * v_rate, 2);
      else  -- EUR -> USD
        v_conv := round(v_net / v_rate, 2);
      end if;
      v_fee_pct := 0.60;
      v_fee := round(v_conv * v_fee_pct / 100, 2);
      v_conv := round(v_conv - v_fee, 2);
    end if;

    insert into public.affiliate_payouts
      (tenant_id, affiliate_advertiser_id, affiliate_user_id, currency, amount,
       commission_count, clawback_amount, details, status, method,
       group_id, payout_currency, fx_rate, fx_fee_pct, fx_fee_amount, payout_amount)
    values
      (v_tenant, v_aff, v_uid, v_cur, v_net, v_count, v_claw,
       case when jsonb_typeof(p_details) = 'object' then p_details else null end,
       'requested', 'bank',
       v_group,
       case when v_pay_cur = 'SAME' then v_cur else v_pay_cur end,
       case when v_pay_cur = 'SAME' or v_pay_cur = v_cur then null else v_rate end,
       v_fee_pct, v_fee, v_conv)
    returning id into v_payout;

    update public.referral_commissions rc
       set payout_id = v_payout
      from public.referral_links l
     where l.id = rc.referral_link_id
       and l.affiliate_advertiser_id = v_aff
       and coalesce(l.status, 'active') in ('active', 'pending')
       and coalesce(rc.status, 'unpaid') = 'unpaid'
       and rc.payout_id is null
       and upper(coalesce(rc.currency, 'EUR')) = v_cur;

    update public.referral_clawbacks cb
       set payout_id = v_payout
      from public.referral_links l
     where l.id = cb.referral_link_id
       and l.affiliate_advertiser_id = v_aff
       and coalesce(l.status, 'active') in ('active', 'pending')
       and cb.payout_id is null
       and upper(cb.currency) = v_cur;

    v_total := v_total + v_conv;
    v_rows := v_rows || jsonb_build_object(
      'payout_id', v_payout, 'currency', v_cur, 'amount', v_net,
      'pays_in', case when v_pay_cur = 'SAME' then v_cur else v_pay_cur end,
      'rate', case when v_pay_cur = 'SAME' or v_pay_cur = v_cur then null else v_rate end,
      'fee', v_fee, 'receives', v_conv, 'commissions', v_count);
  end loop;

  if not v_any then
    raise exception 'There is nothing waiting to be paid out in what you picked'
      using errcode = 'P0002';
  end if;

  insert into public.notifications (recipient_user_id, tenant_id, type, payload)
  select t.owner_id, t.id, 'affiliate_payout_requested',
         jsonb_build_object(
           'group_id', v_group,
           'amount', v_total,
           'currency', case when v_pay_cur = 'SAME' then 'MIXED' else v_pay_cur end,
           'client_code', (select tenant_client_code from public.advertisers where id = v_aff),
           'rows', v_rows)
    from public.tenants t
   where t.id = v_tenant and t.owner_id is not null;

  return jsonb_build_object('ok', true, 'group_id', v_group, 'rows', v_rows,
                            'total', v_total,
                            'pays_in', case when v_pay_cur = 'SAME' then null else v_pay_cur end);
end;
$blk1$;

-- ── C. AFHANDELEN DOET DE HELE GROEP ─────────────────────────────────
create or replace function public.affiliate_payout_decide(
  p_payout_id uuid,
  p_action text,
  p_reason text default null,
  p_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $blk2$
declare
  v_uid   uuid := auth.uid();
  v_row   public.affiliate_payouts;
  v_own   boolean;
  v_group uuid;
  v_n     int := 0;
  v_set   numeric(14,2) := 0;
  v_ask   numeric(14,2) := 0;
begin
  if v_uid is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;

  select p.* into v_row from public.affiliate_payouts p where p.id = p_payout_id for update;
  if v_row.id is null then
    raise exception 'Payout not found' using errcode = 'P0002';
  end if;

  select exists (
    select 1 from public.tenants t
     where t.id = v_row.tenant_id and t.owner_id = v_uid
  ) into v_own;
  if not v_own then
    raise exception 'Only the owner settles payouts' using errcode = '42501';
  end if;
  if v_row.status <> 'requested' then
    raise exception 'This payout was already answered' using errcode = '42501';
  end if;

  -- Samen aangevraagd is samen afgehandeld: anders staat de USD-helft
  -- van dezelfde overboeking morgen nog in de wachtrij.
  v_group := coalesce(v_row.group_id, v_row.id);

  if p_action = 'paid' then
    update public.referral_commissions rc
       set payout_id = null
      from public.affiliate_payouts p
     where p.id = rc.payout_id
       and coalesce(p.group_id, p.id) = v_group
       and p.status = 'requested'
       and coalesce(rc.status, 'unpaid') <> 'unpaid';

    select coalesce(sum(rc.amount), 0) into v_set
      from public.referral_commissions rc
      join public.affiliate_payouts p on p.id = rc.payout_id
     where coalesce(p.group_id, p.id) = v_group
       and p.status = 'requested'
       and coalesce(rc.status, 'unpaid') = 'unpaid';

    select coalesce(sum(p.amount), 0) into v_ask
      from public.affiliate_payouts p
     where coalesce(p.group_id, p.id) = v_group and p.status = 'requested';

    update public.referral_commissions rc
       set status = 'paid', paid_at = now()
      from public.affiliate_payouts p
     where p.id = rc.payout_id
       and coalesce(p.group_id, p.id) = v_group
       and p.status = 'requested'
       and coalesce(rc.status, 'unpaid') = 'unpaid';
    get diagnostics v_n = row_count;

    update public.affiliate_payouts
       set status = 'paid', paid_at = now(), decided_at = now(), decided_by = v_uid,
           reference = nullif(trim(coalesce(p_reference, '')), ''),
           reason = case
             when round(v_set, 2) <> round(v_ask, 2)
               then 'Let op: gevraagd ' || to_char(v_ask, 'FM999G999G990D00')
                    || ', werkelijk verrekend ' || to_char(v_set, 'FM999G999G990D00')
                    || ' (een commissie is na de aanvraag teruggedraaid)'
             else reason end
     where coalesce(group_id, id) = v_group and status = 'requested';

    insert into public.notifications (recipient_user_id, tenant_id, type, payload)
    select a.user_id, v_row.tenant_id, 'affiliate_payout_paid',
           jsonb_build_object('payout_id', v_row.id, 'group_id', v_group,
                              'amount', (select coalesce(sum(coalesce(payout_amount, amount)), 0)
                                           from public.affiliate_payouts
                                          where coalesce(group_id, id) = v_group),
                              'currency', coalesce(v_row.payout_currency, upper(v_row.currency)),
                              'reference', nullif(trim(coalesce(p_reference, '')), ''))
      from public.advertisers a
     where a.id = v_row.affiliate_advertiser_id and a.user_id is not null;

  elsif p_action = 'reject' then
    if length(trim(coalesce(p_reason, ''))) < 3 then
      raise exception 'Say why, so they know' using errcode = '22023';
    end if;
    update public.referral_commissions rc
       set payout_id = null
      from public.affiliate_payouts p
     where p.id = rc.payout_id and coalesce(p.group_id, p.id) = v_group and p.status = 'requested';
    update public.referral_clawbacks cb
       set payout_id = null
      from public.affiliate_payouts p
     where p.id = cb.payout_id and coalesce(p.group_id, p.id) = v_group and p.status = 'requested';
    update public.affiliate_payouts
       set status = 'rejected', decided_at = now(), decided_by = v_uid,
           reason = left(trim(p_reason), 500)
     where coalesce(group_id, id) = v_group and status = 'requested';

    insert into public.notifications (recipient_user_id, tenant_id, type, payload)
    select a.user_id, v_row.tenant_id, 'affiliate_payout_rejected',
           jsonb_build_object('payout_id', v_row.id, 'group_id', v_group,
                              'amount', v_row.amount,
                              'currency', upper(v_row.currency),
                              'reason', left(trim(p_reason), 500))
      from public.advertisers a
     where a.id = v_row.affiliate_advertiser_id and a.user_id is not null;
  else
    raise exception 'Unknown action %', p_action using errcode = '22023';
  end if;

  return jsonb_build_object('ok', true, 'commissions', v_n, 'settled', v_set, 'asked', v_ask);
end;
$blk2$;

-- ── D. INTREKKEN DOET OOK DE HELE GROEP ──────────────────────────────
create or replace function public.affiliate_payout_cancel(p_payout_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $blk3$
declare
  v_uid   uuid := auth.uid();
  v_row   public.affiliate_payouts;
  v_group uuid;
begin
  if v_uid is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;

  select p.* into v_row
    from public.affiliate_payouts p
    join public.advertisers a on a.id = p.affiliate_advertiser_id
   where p.id = p_payout_id and a.user_id = v_uid
   for update of p;
  if v_row.id is null then
    raise exception 'Payout not found' using errcode = 'P0002';
  end if;
  if v_row.status <> 'requested' then
    raise exception 'This payout has already been answered' using errcode = '42501';
  end if;

  v_group := coalesce(v_row.group_id, v_row.id);

  update public.referral_commissions rc
     set payout_id = null
    from public.affiliate_payouts p
   where p.id = rc.payout_id and coalesce(p.group_id, p.id) = v_group;
  update public.referral_clawbacks cb
     set payout_id = null
    from public.affiliate_payouts p
   where p.id = cb.payout_id and coalesce(p.group_id, p.id) = v_group;
  update public.affiliate_payouts
     set status = 'cancelled', decided_at = now()
   where coalesce(group_id, id) = v_group and status = 'requested';

  return jsonb_build_object('ok', true);
end;
$blk3$;

do $blk4$
begin
  execute 'revoke all on function public.affiliate_payout_request_multi(text[], text, jsonb) from public, anon';
  execute 'grant execute on function public.affiliate_payout_request_multi(text[], text, jsonb) to authenticated';
  insert into _p51 values (2, 'aanvragen met valutakeuze', 'affiliate_payout_request_multi(valuta[], uitbetaalvaluta, gegevens)');
  insert into _p51 values (3, 'afhandelen en intrekken', 'doen nu de hele groep in één keer');
exception when others then
  insert into _p51 values (2, 'aanvragen met valutakeuze', 'MISLUKT: ' || sqlerrm);
end
$blk4$;

-- ── E. DE KOERS DIE WE GEBRUIKEN (alleen lezen) ──────────────────────
do $blk5$
declare v_txt text;
begin
  select coalesce(string_agg('1 USD = ' || to_char(er.eur, 'FM990D000000') || ' EUR', ' · '), 'GEEN ACTIEVE KOERS')
    into v_txt
    from public.exchange_rates er
   where coalesce(er.is_active, true);
  insert into _p51 values (4, 'koers voor omrekenen (0,60% fee)', v_txt);
end
$blk5$;

select nr as "#", wat as "wat", uitkomst as "uitkomst" from _p51 order by nr;
