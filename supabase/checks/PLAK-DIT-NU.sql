-- =====================================================================
-- Everything from tonight that is NOT on live yet — one paste
-- =====================================================================
-- Three migrations, in order, with one report at the bottom. Safe to
-- run more than once; each block is guarded.
--
-- Already applied earlier tonight and NOT repeated here:
--   20260920190000  a change always works in our favour
--   20260920200000  notifications.archived_at
--   20260920210000  three RPCs closed to `authenticated`
--   20260920220000  deposits belong to a tenant
--
-- What is in here:
--   1. The deposit tenant stays CHOSEN, not guessed. A no-op on this
--      database as it stands, because you already corrected the flag by
--      hand -- it only clears a flag on a tenant holding no deposits.
--   2. The clawback measures against lifetime earnings again. MY
--      REGRESSION from earlier tonight: it was clawing a share of the
--      REMAINDER, so a customer who took back every euro left the
--      affiliate holding 25% of the commission.
--   3. The ad-account request fee becomes recordable, so EUR 50 leaving
--      a wallet can finally appear on the customer's own statement.
--
-- THE THIRD ONE IS HALF A FIX AND THE REPORT SAYS SO. Two functions
-- have to write the new columns, and their bodies exist only on this
-- database. If the report's last two lines say NOT WRITING, send me
-- those two bodies and I will write the exact replacement.
-- =====================================================================

set search_path = public;

-- =====================================================================
-- 1. The deposit tenant is chosen, never inferred
-- =====================================================================
update public.tenants t
   set receives_bank_deposits = false
 where t.receives_bank_deposits
   and not exists (
     select 1 from public.wise_incoming_transfers w
      where w.tenant_id = t.id
   );

comment on column public.tenants.receives_bank_deposits is
  'True for the ONE tenant whose bank account the deposit webhook reads. SET THIS BY HAND -- it decides who can read every incoming bank transfer, and it must never be inferred from activity, because a test tenant out-runs a real one.';

-- =====================================================================
-- 2. The clawback measures against lifetime, not the remainder
-- =====================================================================
create or replace function public._claw_back_referral_commission(
  p_advertiser_id uuid,
  p_amount numeric,
  p_currency text,
  p_source text,
  p_source_id uuid,
  p_reason text default null
) returns numeric
language plpgsql
security definer
set search_path = public
as $blk0$
declare
  v_link_id     uuid;
  v_link_tenant uuid;
  v_src_cur   text := upper(coalesce(p_currency, 'EUR'));
  v_cur       text;
  v_volume    numeric := 0;
  v_gross_eur numeric := 0;
  v_gross_usd numeric := 0;
  v_claw_eur  numeric := 0;
  v_claw_usd  numeric := 0;
  v_stand_eur numeric := 0;
  v_stand_usd numeric := 0;
  v_gross     numeric := 0;
  v_stand     numeric := 0;
  v_share     numeric := 0;
  v_amount    numeric := 0;
begin
  if p_amount is null or p_amount <= 0 then
    return 0;
  end if;

  select rl.id, rl.tenant_id into v_link_id, v_link_tenant
    from public.referral_links rl
   where rl.referred_advertiser_id = p_advertiser_id
   order by rl.created_at
   limit 1;
  if not found then
    return 0;
  end if;

  if p_source = 'ad_account_withdrawal' then
    select coalesce(sum(t.topup_amount), 0) into v_volume
      from public.top_ups t
     where t.advertiser_id = p_advertiser_id
       and t.status = 'completed'
       and coalesce(t.is_deleted, false) = false;
  else
    select coalesce(sum(wt.amount), 0) into v_volume
      from public.wallet_topups wt
      join public.wallets w on w.id = wt.wallet_id
     where w.advertiser_id = p_advertiser_id
       and wt.status = 'completed'
       and upper(coalesce(wt.currency, 'EUR')) = v_src_cur;
  end if;

  if v_volume <= 0 then
    return 0;
  end if;

  select
    coalesce(sum(case when upper(coalesce(rc.currency, 'EUR')) = 'EUR'
                      then rc.amount else 0 end), 0),
    coalesce(sum(case when upper(coalesce(rc.currency, 'EUR')) = 'USD'
                      then rc.amount else 0 end), 0)
    into v_gross_eur, v_gross_usd
    from public.referral_commissions rc
   where rc.referral_link_id = v_link_id;

  select
    coalesce(sum(case when upper(coalesce(cb.currency, 'EUR')) = 'EUR'
                      then cb.amount else 0 end), 0),
    coalesce(sum(case when upper(coalesce(cb.currency, 'EUR')) = 'USD'
                      then cb.amount else 0 end), 0)
    into v_claw_eur, v_claw_usd
    from public.referral_clawbacks cb
   where cb.referral_link_id = v_link_id;

  v_stand_eur := v_gross_eur - v_claw_eur;
  v_stand_usd := v_gross_usd - v_claw_usd;

  if v_src_cur = 'USD' and v_stand_usd > 0 then
    v_cur := 'USD'; v_gross := v_gross_usd; v_stand := v_stand_usd;
  elsif v_src_cur = 'EUR' and v_stand_eur > 0 then
    v_cur := 'EUR'; v_gross := v_gross_eur; v_stand := v_stand_eur;
  elsif v_stand_eur > 0 then
    v_cur := 'EUR'; v_gross := v_gross_eur; v_stand := v_stand_eur;
  elsif v_stand_usd > 0 then
    v_cur := 'USD'; v_gross := v_gross_usd; v_stand := v_stand_usd;
  else
    return 0;
  end if;

  -- The share multiplies LIFETIME gross, capped at what is still
  -- standing. Netting first and multiplying the remainder -- which is
  -- what it did -- loses money on every withdrawal after the first.
  v_share  := least(p_amount / v_volume, 1);
  v_amount := round((v_gross * v_share)::numeric, 2);
  v_amount := least(v_amount, round(v_stand::numeric, 2));
  if v_amount <= 0 then
    return 0;
  end if;

  insert into public.referral_clawbacks
    (tenant_id, referral_link_id, advertiser_id, amount, currency,
     source, source_id, returned_amount, topup_volume, share, reason)
  values
    (v_link_tenant, v_link_id, p_advertiser_id, v_amount, v_cur,
     p_source, p_source_id, round(p_amount::numeric, 2),
     round(v_volume::numeric, 2), round(v_share, 4), p_reason)
  on conflict (source, source_id) do nothing;

  if not found then
    return 0;
  end if;

  if v_cur = 'USD' then
    update public.referral_links
       set earnings_usd = greatest(coalesce(earnings_usd, 0) - v_amount, 0),
           updated_at = now()
     where id = v_link_id;
  else
    update public.referral_links
       set earnings_eur = greatest(coalesce(earnings_eur, 0) - v_amount, 0),
           updated_at = now()
     where id = v_link_id;
  end if;

  return v_amount;
end;
$blk0$;

revoke all on function public._claw_back_referral_commission(uuid, numeric, text, text, uuid, text)
  from public, anon, authenticated;

-- =====================================================================
-- 3. The request fee can leave a record
-- =====================================================================
alter table public.ad_account_requests
  add column if not exists charged_amount   numeric,
  add column if not exists charged_currency text,
  add column if not exists charged_at       timestamptz,
  add column if not exists refunded_amount  numeric,
  add column if not exists refunded_at      timestamptz;

comment on column public.ad_account_requests.charged_amount is
  'What actually left the wallet for this request, in charged_currency. Null means nothing was charged.';

create index if not exists ad_account_requests_charged_idx
  on public.ad_account_requests (advertiser_id, charged_at desc)
  where charged_at is not null;

-- =====================================================================
-- The report — the SQL editor shows only the LAST result set
-- =====================================================================
select 1 as sort, 'deposit tenant' as item,
  coalesce((select name from public.tenants where receives_bank_deposits limit 1),
           'NONE - new deposits will arrive unassigned') as status
union all
select 2, 'deposits on that tenant',
  coalesce((select count(*)::text from public.wise_incoming_transfers w
             where w.tenant_id = (select id from public.tenants
                                   where receives_bank_deposits limit 1)), '0')
union all
select 3, 'clawback: share measures lifetime',
  case when position('v_gross * v_share' in pg_get_functiondef(
    'public._claw_back_referral_commission(uuid,numeric,text,text,uuid,text)'::regprocedure
  )) > 0 then 'OK' else 'NOT APPLIED' end
union all
select 4, 'clawback: capped at what is standing',
  case when position('least(v_amount, round(v_stand' in pg_get_functiondef(
    'public._claw_back_referral_commission(uuid,numeric,text,text,uuid,text)'::regprocedure
  )) > 0 then 'OK' else 'NOT APPLIED' end
union all
select 5, 'request-fee columns',
  (select count(*)::text || ' of 5' from information_schema.columns
    where table_schema='public' and table_name='ad_account_requests'
      and column_name in ('charged_amount','charged_currency','charged_at',
                          'refunded_amount','refunded_at'))
union all
select 6, 'create-paid WRITES charged_amount',
  case
    when not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                      where n.nspname='public' and p.proname='ad_account_request_create_paid')
      then 'FUNCTION NOT HERE'
    when (select position('charged_amount' in pg_get_functiondef(p.oid)) > 0
            from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.proname='ad_account_request_create_paid' limit 1)
      then 'OK'
    else 'NOT WRITING - send me this function body'
  end
union all
select 7, 'refund path WRITES refunded_amount',
  case
    when not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                      where n.nspname='public' and p.proname='ad_account_request_reject_refund')
      then 'FUNCTION NOT HERE'
    when (select position('refunded_amount' in pg_get_functiondef(p.oid)) > 0
            from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.proname='ad_account_request_reject_refund' limit 1)
      then 'OK'
    else 'NOT WRITING - send me this function body'
  end
order by sort;
