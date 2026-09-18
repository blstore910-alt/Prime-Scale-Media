-- =====================================================================
-- Replace two functions that used a RECORD field inside a SQL statement.
-- =====================================================================
-- ⚠️ APPLY ON SUPABASE MANUALLY. Run this after 20260918230000.
--
-- `relation "v_admin" does not exist` — Postgres resolving `v_admin.id`
-- inside an UPDATE as relation.column rather than as a PL/pgSQL record
-- field. The refund function hit it on the way in; the clawback function
-- has the same shape and would have hit it at the first real clawback,
-- which is a worse place to find out.
--
-- Both are rewritten with plain scalar variables. Nothing about what they
-- DO has changed — same gates, same arithmetic, same idempotency.
-- =====================================================================

set search_path = public;

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
  -- SCALARS. A record variable's field cannot be referenced inside a SQL
  -- statement — Postgres resolves `v_link_id` as relation.column and
  -- reports `relation "v_link" does not exist`. Every value used inside a
  -- SELECT or an UPDATE below is its own variable.
  v_link_id     uuid;
  v_link_tenant uuid;
  v_cur      text := upper(coalesce(p_currency, 'EUR'));
  v_volume   numeric := 0;
  v_earned   numeric := 0;
  v_clawed   numeric := 0;
  v_share    numeric := 0;
  v_amount   numeric := 0;
begin
  if p_amount is null or p_amount <= 0 then
    return 0;
  end if;

  -- The link that refers THIS advertiser. If they were not referred there
  -- is nothing to claw back.
  select rl.id, rl.tenant_id into v_link_id, v_link_tenant
    from public.referral_links rl
   where rl.referred_advertiser_id = p_advertiser_id
   order by rl.created_at
   limit 1;
  if not found then
    return 0;
  end if;

  -- Everything they ever topped up successfully, in this currency.
  select coalesce(sum(wt.amount), 0) into v_volume
    from public.wallet_topups wt
    join public.wallets w on w.id = wt.wallet_id
   where w.advertiser_id = p_advertiser_id
     and wt.status = 'completed'
     and upper(coalesce(wt.currency, 'EUR')) = v_cur;

  if v_volume <= 0 then
    return 0;
  end if;

  select coalesce(sum(rc.amount), 0) into v_earned
    from public.referral_commissions rc
   where rc.referral_link_id = v_link_id
     and upper(coalesce(rc.currency, 'EUR')) = v_cur;

  select coalesce(sum(cb.amount), 0) into v_clawed
    from public.referral_clawbacks cb
   where cb.referral_link_id = v_link_id
     and cb.currency = v_cur;

  if v_earned - v_clawed <= 0 then
    return 0;
  end if;

  v_share := least(p_amount / v_volume, 1);
  v_amount := round((v_earned * v_share)::numeric, 2);
  -- Never more than is still standing.
  v_amount := least(v_amount, round((v_earned - v_clawed)::numeric, 2));
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
    return 0;   -- already clawed back for this row
  end if;

  -- Keep the running total on the link in step, the same figure the
  -- accrual trigger maintains.
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
