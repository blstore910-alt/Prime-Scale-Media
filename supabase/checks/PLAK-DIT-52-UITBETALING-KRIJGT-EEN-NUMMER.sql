-- ════════════════════════════════════════════════════════════════════
--  PLAK 52 — elke uitbetaling krijgt een nummer: Payout #1, #2, #3
--
--  De eigenaar, 22-09: "wat is die rare payout naam, het moet gewoon een
--  nummer hebben, Payout #1 ofzo" — en daarna een factuur met de
--  referral-verdiensten, automatisch aangemaakt met zijn bedrijfsgegevens.
--  Dit blok is het nummer; de factuur wordt daarop gebouwd.
--
--    payout_no    doorlopend per tenant, één nummer per AANVRAAG — ook
--                 als die uit twee valuta bestaat, want het is één
--                 overboeking en straks één factuur.
--
--  Bestaande rijen krijgen met terugwerkende kracht een nummer, op
--  volgorde van aanvraagdatum.
--
--  Plak alles in één keer. Onderaan komt ÉÉN tabel.
-- ════════════════════════════════════════════════════════════════════

drop table if exists _p52;
create temp table _p52(nr int, wat text, uitkomst text);

alter table public.affiliate_payouts
  add column if not exists payout_no integer;

-- ── A. WAT ER AL IS, OP VOLGORDE VAN AANVRAAG ────────────────────────
do $blk0$
declare v_n int;
begin
  with g as (
    select coalesce(group_id, id) as grp,
           tenant_id,
           min(requested_at) as at
      from public.affiliate_payouts
     group by 1, 2
  ), numbered as (
    select grp, tenant_id,
           row_number() over (partition by tenant_id order by at, grp) as no
      from g
  )
  update public.affiliate_payouts p
     set payout_no = n.no
    from numbered n
   where coalesce(p.group_id, p.id) = n.grp
     and p.tenant_id = n.tenant_id
     and p.payout_no is null;
  get diagnostics v_n = row_count;

  -- GEEN unique index op (tenant, nummer): een aanvraag in twee valuta
  -- is twee rijen met HETZELFDE nummer -- dat is de bedoeling. Het
  -- nummer wordt uniek gehouden door de advisory lock hieronder.
  create index if not exists affiliate_payouts_no_idx
    on public.affiliate_payouts (tenant_id, payout_no);

  insert into _p52 values (1, 'nummers voor bestaande uitbetalingen', v_n::text || ' rijen genummerd');
exception when others then
  insert into _p52 values (1, 'nummers voor bestaande uitbetalingen', 'MISLUKT: ' || sqlerrm);
end
$blk0$;

-- ── B. HET VOLGENDE NUMMER, ZONDER GATEN EN ZONDER BOTSING ───────────
create or replace function public._next_payout_no(p_tenant uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $blk1$
declare
  v_no int;
begin
  -- Eén aanvrager tegelijk per tenant: twee affiliates die op dezelfde
  -- seconde drukken krijgen anders hetzelfde nummer.
  perform pg_advisory_xact_lock(hashtext('affiliate_payout_no:' || p_tenant::text));
  select coalesce(max(payout_no), 0) + 1 into v_no
    from public.affiliate_payouts
   where tenant_id = p_tenant;
  return v_no;
end;
$blk1$;

-- ── C. DE AANVRAAGFUNCTIE ZET HET NUMMER ─────────────────────────────
--  Dit is de functie uit plak 51, met drie regels erbij: het nummer
--  wordt één keer per aanvraag genomen en op elke rij van de groep
--  geschreven. Voluit, niet met tekstvervanging op de live functie --
--  dat laatste faalt stil als er één spatie anders staat.
create or replace function public.affiliate_payout_request_multi(
  p_currencies text[],
  p_payout_currency text default 'SAME',   -- 'EUR' | 'USD' | 'SAME'
  p_details jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $blk5$
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
  v_no      int;
  v_eur     numeric(14,2) := 0;   -- alles op één schaal, voor de ondergrens
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

  -- Eén nummer voor de hele aanvraag: het is één overboeking.
  v_no := public._next_payout_no(v_tenant);

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
       group_id, payout_currency, fx_rate, fx_fee_pct, fx_fee_amount, payout_amount, payout_no)
    values
      (v_tenant, v_aff, v_uid, v_cur, v_net, v_count, v_claw,
       case when jsonb_typeof(p_details) = 'object' then p_details else null end,
       'requested', 'bank',
       v_group,
       case when v_pay_cur = 'SAME' then v_cur else v_pay_cur end,
       case when v_pay_cur = 'SAME' or v_pay_cur = v_cur then null else v_rate end,
       v_fee_pct, v_fee, v_conv, v_no)
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
    -- Waarde van deze poot in euro's, voor de ondergrens hieronder.
    v_eur := v_eur + case
      when v_cur = 'EUR' then v_net
      when v_rate is not null and v_rate > 0 then round(v_net * v_rate, 2)
      else v_net  -- geen koers: dollars tellen één op één mee
    end;
    v_rows := v_rows || jsonb_build_object(
      'payout_id', v_payout, 'payout_no', v_no, 'currency', v_cur, 'amount', v_net,
      'pays_in', case when v_pay_cur = 'SAME' then v_cur else v_pay_cur end,
      'rate', case when v_pay_cur = 'SAME' or v_pay_cur = v_cur then null else v_rate end,
      'fee', v_fee, 'receives', v_conv, 'commissions', v_count);
  end loop;

  if not v_any then
    raise exception 'There is nothing waiting to be paid out in what you picked'
      using errcode = 'P0002';
  end if;

  -- DE ONDERGRENS (eigenaar, 22-09: minimaal 200 euro per uitbetaling).
  -- Op waarde, niet per potje: EUR 120 + USD 100 haalt het wel.
  if v_eur < 200 then
    raise exception 'A payout starts at EUR 200. You have about EUR % ready.',
      to_char(v_eur, 'FM999G999G990D00')
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

  return jsonb_build_object('ok', true, 'group_id', v_group, 'payout_no', v_no, 'rows', v_rows,
                            'total', v_total,
                            'pays_in', case when v_pay_cur = 'SAME' then null else v_pay_cur end);
end;
$blk5$;

do $blk6$
begin
  execute 'revoke all on function public.affiliate_payout_request_multi(text[], text, jsonb) from public, anon';
  execute 'grant execute on function public.affiliate_payout_request_multi(text[], text, jsonb) to authenticated';
  execute 'revoke all on function public._next_payout_no(uuid) from public, anon, authenticated';
  insert into _p52 values (2, 'nummer bij nieuwe aanvragen', 'elke aanvraag krijgt Payout #n (ook bij twee valuta) en gaat pas vanaf EUR 200');
exception when others then
  insert into _p52 values (2, 'nummer bij nieuwe aanvragen', 'MISLUKT: ' || sqlerrm);
end
$blk6$;

-- ── D. WAT ER NU STAAT (alleen lezen) ────────────────────────────────
do $blk4$
declare v_txt text;
begin
  select coalesce(string_agg('#' || p.payout_no::text || ' ' ||
                             coalesce(a.tenant_client_code, '?') || ' ' ||
                             upper(coalesce(p.payout_currency, p.currency)) || ' ' ||
                             to_char(coalesce(p.payout_amount, p.amount), 'FM999G999G990D00') ||
                             ' (' || p.status || ')', ' · ' order by p.payout_no), 'nog geen uitbetalingen')
    into v_txt
    from public.affiliate_payouts p
    left join public.advertisers a on a.id = p.affiliate_advertiser_id;
  insert into _p52 values (4, 'uitbetalingen met nummer', v_txt);
end
$blk4$;

select nr as "#", wat as "wat", uitkomst as "uitkomst" from _p52 order by nr;
