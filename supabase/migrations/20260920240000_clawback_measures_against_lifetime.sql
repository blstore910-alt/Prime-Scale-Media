-- =====================================================================
-- The clawback stopped short of 100%
-- =====================================================================
-- MY OWN REGRESSION, from 20260920150000 earlier tonight. The rule, set
-- out in 20260918230000's own header, is:
--
--   "A customer who gets 40% of their money back takes 40% of that
--    commission with them."
--
-- The 09-18 version computed the share against LIFETIME earnings and
-- then capped it at what was still standing. My rewrite netted the
-- clawbacks off FIRST and multiplied the REMAINDER by the share. The
-- denominator -- lifetime gross funding -- was never reduced, so a
-- decaying numerator against a fixed denominator loses money on every
-- withdrawal after the first:
--
--   Referred customer funds EUR 10,000, all of it onto ad accounts.
--   Affiliate on 10% has earned EUR 1,000.
--
--   Withdrawal 1 of 5,000 -> share 0.5 -> claws 500.  Standing 500.
--   Withdrawal 2 of 5,000 -> share 0.5 -> claws 250.  Standing 250.
--
-- Every euro is back and only 750 of 1,000 was recovered. Three
-- withdrawals of 3,333 leave 421.75 standing. The affiliate keeps
-- commission on money the customer took back, and nothing reports it.
--
-- Fixed: the share multiplies LIFETIME gross for that currency, and the
-- result is capped at what is still standing so it can never claw more
-- than was ever granted. Same two figures the 09-18 version used, with
-- the currency handling from tonight kept.
--
--   Withdrawal 1 -> round(1000 * 0.5) = 500, cap 1000 -> 500.
--   Withdrawal 2 -> round(1000 * 0.5) = 500, cap 500  -> 500.  Total 1000.
--
-- The rest of the function is unchanged from what is live: the same
-- denominator rules, the same currency selection, the same idempotency
-- on (source, source_id).
--
-- Safe to run more than once.
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
  v_link_id     uuid;
  v_link_tenant uuid;
  v_src_cur   text := upper(coalesce(p_currency, 'EUR'));
  v_cur       text;
  v_volume    numeric := 0;
  -- LIFETIME gross per currency, which is what the share is measured
  -- against, and the running clawbacks, which are only the cap.
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

  -- ── THE DENOMINATOR IN THE SAME UNIT AS THE AMOUNT ────────────────
  --
  -- An ad-account withdrawal is USD by trigger, so it is measured
  -- against what ever went ONTO ad accounts -- top_ups.topup_amount is
  -- USD for every payment currency. A wallet refund carries its own
  -- wallet's currency, so that side keeps the wallet-top-up
  -- denominator it always had.
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

  -- Lifetime gross, per currency. upper() on both sides: a lower-case
  -- row used to miss its own history.
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

  -- Claw back from the currency the affiliate actually holds. The
  -- source currency first when there is something standing there;
  -- otherwise the other one.
  if v_src_cur = 'USD' and v_stand_usd > 0 then
    v_cur := 'USD'; v_gross := v_gross_usd; v_stand := v_stand_usd;
  elsif v_src_cur = 'EUR' and v_stand_eur > 0 then
    v_cur := 'EUR'; v_gross := v_gross_eur; v_stand := v_stand_eur;
  elsif v_stand_eur > 0 then
    v_cur := 'EUR'; v_gross := v_gross_eur; v_stand := v_stand_eur;
  elsif v_stand_usd > 0 then
    v_cur := 'USD'; v_gross := v_gross_usd; v_stand := v_stand_usd;
  else
    return 0;   -- nothing standing in either currency
  end if;

  -- ── THE SHARE MULTIPLIES LIFETIME, NOT THE REMAINDER ──────────────
  -- and the cap is what is still standing, so it can never claw more
  -- than was ever granted.
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
    return 0;   -- already clawed back for this row
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

-- ── The report ───────────────────────────────────────────────────────
-- The SQL editor shows only the LAST result set, so this is the one.
select
  'share measures lifetime, not the remainder' as item,
  case
    when position('v_gross * v_share' in pg_get_functiondef(
      'public._claw_back_referral_commission(uuid,numeric,text,text,uuid,text)'::regprocedure
    )) > 0 then 'OK'
    else 'NOT APPLIED'
  end as status
union all
select
  'capped at what is still standing',
  case
    when position('least(v_amount, round(v_stand' in pg_get_functiondef(
      'public._claw_back_referral_commission(uuid,numeric,text,text,uuid,text)'::regprocedure
    )) > 0 then 'OK'
    else 'NOT APPLIED'
  end
union all
select
  'clawbacks recorded so far',
  (select count(*)::text from public.referral_clawbacks)
union all
select
  'links where clawbacks already exceed commissions',
  (
    select count(*)::text from (
      select rl.id
        from public.referral_links rl
        left join public.referral_commissions rc on rc.referral_link_id = rl.id
        left join public.referral_clawbacks  cb on cb.referral_link_id = rl.id
       group by rl.id
      having coalesce(sum(distinct cb.amount), 0)
           > coalesce(sum(distinct rc.amount), 0)
    ) x
  );
