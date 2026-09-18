-- =====================================================================
-- Clawback: money that came back takes its commission with it.
-- =====================================================================
-- ⚠️ APPLY ON SUPABASE MANUALLY.
--
-- WHAT IS WRONG. A referral commission accrues when a wallet top-up is
-- verified. The accrual trigger reverses itself if that top-up LEAVES
-- 'completed' — but neither a wallet refund nor an ad-account withdrawal
-- touches wallet_topups.status. They move the balance directly. So the
-- customer gets their money back and the affiliate keeps the commission on
-- it, for ever, and nothing anywhere says so. `grep clawback` across the
-- repo matched one line in a test plan.
--
-- THE RULE, as the owner chose it: PROPORTIONAL AND AUTOMATIC. A customer
-- who gets 40% of their money back takes 40% of that commission with them,
-- at the moment the refund or the withdrawal is approved.
--
-- HOW THE SHARE IS COMPUTED. Neither a refund nor a withdrawal names the
-- top-up it relates to — they are amounts, not reversals of a specific
-- payment. So the share is the returned amount against the advertiser's
-- whole completed top-up volume in that currency, and the clawback is that
-- share of what the affiliate earned on them. Capped at 100%, and never
-- more than is left unclawed.
--
-- WHY A SEPARATE TABLE. referral_commissions was authored by hand on the
-- live database and is not in this repo, so its constraints are unknown —
-- writing a negative row or a new status value there could violate a CHECK
-- nobody can see from here. referral_clawbacks is additive: it cannot
-- break anything that exists, and affiliate_referral_stats (rewritten
-- today, so it is ours) subtracts from it.
--
-- NOT A NOTIFICATION. The notification catalog has no affiliate entries
-- and nothing emits them, so a push would be a promise the app does not
-- keep. The clawback is a ROW — it shows on the affiliate's own screen in
-- their commission history, which is where a deduction belongs.
-- =====================================================================

set search_path = public;

-- ── 1. The record ────────────────────────────────────────────────────
create table if not exists public.referral_clawbacks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  referral_link_id uuid not null,
  advertiser_id uuid not null references public.advertisers(id) on delete cascade,

  amount numeric(14,2) not null check (amount > 0),
  currency text not null check (currency in ('USD', 'EUR')),

  -- What caused it, and which row. Kept as text + uuid rather than two
  -- nullable FKs so a third source can be added without a schema change.
  source text not null check (source in ('wallet_refund', 'ad_account_withdrawal')),
  source_id uuid not null,

  -- The arithmetic, kept so the figure can be explained to an affiliate
  -- months later without re-deriving it from data that has since moved.
  returned_amount numeric(14,2),
  topup_volume numeric(14,2),
  share numeric(6,4),

  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One clawback per source row. An approve that somehow fires twice
  -- cannot charge the affiliate twice.
  constraint referral_clawbacks_source_uq unique (source, source_id)
);

create index if not exists referral_clawbacks_link_idx
  on public.referral_clawbacks (referral_link_id);
create index if not exists referral_clawbacks_tenant_idx
  on public.referral_clawbacks (tenant_id, created_at desc);

alter table public.referral_clawbacks enable row level security;

drop policy if exists referral_clawbacks_select on public.referral_clawbacks;
create policy referral_clawbacks_select on public.referral_clawbacks
  for select using (
    -- An admin of the tenant, or the affiliate whose commission it is.
    exists (
      select 1 from public.user_profiles up
       where up.user_id = auth.uid()
         and up.tenant_id = referral_clawbacks.tenant_id
         and up.role = 'admin'
         and coalesce(up.is_active, true)
    )
    or exists (
      select 1
        from public.referral_links rl
        join public.advertisers aff on aff.id = rl.affiliate_advertiser_id
       where rl.id = referral_clawbacks.referral_link_id
         and aff.user_id = auth.uid()
    )
  );
-- No insert/update/delete policy: only the SECURITY DEFINER function below
-- writes here.

-- ── 2. The clawback itself ───────────────────────────────────────────
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

-- ── 3. Fire it when money goes back ──────────────────────────────────
-- Both in their own exception block: a clawback that fails must never
-- stop a refund or a withdrawal the customer is owed. Same reasoning as
-- the accrual trigger, which swallows its own errors for the same reason.
create or replace function public._clawback_on_wallet_refund()
returns trigger
language plpgsql
security definer
set search_path = public
as $blk1$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    begin
      perform public._claw_back_referral_commission(
        new.advertiser_id, new.amount, new.currency,
        'wallet_refund', new.id,
        'Wallet refund ' || coalesce(new.reference, new.id::text)
      );
    exception when others then
      raise warning 'clawback failed for wallet_refund %: %', new.id, sqlerrm;
    end;
  end if;
  return new;
end;
$blk1$;

drop trigger if exists trg_clawback_wallet_refund on public.wallet_refunds;
create trigger trg_clawback_wallet_refund
  after update on public.wallet_refunds
  for each row execute function public._clawback_on_wallet_refund();

create or replace function public._clawback_on_ad_account_withdrawal()
returns trigger
language plpgsql
security definer
set search_path = public
as $blk2$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    begin
      perform public._claw_back_referral_commission(
        new.advertiser_id, new.amount, new.currency,
        'ad_account_withdrawal', new.id,
        'Ad-account withdrawal ' || coalesce(new.reference, new.id::text)
      );
    exception when others then
      raise warning 'clawback failed for withdrawal %: %', new.id, sqlerrm;
    end;
  end if;
  return new;
end;
$blk2$;

drop trigger if exists trg_clawback_ad_account_withdrawal
  on public.ad_account_withdrawals;
create trigger trg_clawback_ad_account_withdrawal
  after update on public.ad_account_withdrawals
  for each row execute function public._clawback_on_ad_account_withdrawal();

-- ── 4. The stats RPC subtracts them ──────────────────────────────────
-- Clawbacks are per LINK, not per referred advertiser, and this function
-- returns one row per link — so they attach cleanly.
do $blk3$
declare
  v_src text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'affiliate_referral_stats'
   limit 1;

  if v_src is null then
    raise notice 'affiliate_referral_stats not found — apply 20260918160000 first.';
    return;
  end if;
  if position('unpaid_eur' in v_src) = 0 then
    raise notice 'affiliate_referral_stats is the older shape — apply 20260918160000 first, then this again.';
    return;
  end if;
  if position('referral_clawbacks' in v_src) > 0 then
    raise notice 'Already subtracting clawbacks — no change.';
    return;
  end if;

  execute replace(
    v_src,
    'coalesce(ea.earn_usd, 0)::numeric           as earnings_usd,
    coalesce(ea.earn_eur, 0)::numeric           as earnings_eur,
    coalesce(ea.unpaid_usd, 0)::numeric         as unpaid_usd,
    coalesce(ea.unpaid_eur, 0)::numeric         as unpaid_eur',
    'greatest(coalesce(ea.earn_usd, 0) - coalesce(cb.usd, 0), 0)::numeric   as earnings_usd,
    greatest(coalesce(ea.earn_eur, 0) - coalesce(cb.eur, 0), 0)::numeric   as earnings_eur,
    greatest(coalesce(ea.unpaid_usd, 0) - coalesce(cb.usd, 0), 0)::numeric as unpaid_usd,
    greatest(coalesce(ea.unpaid_eur, 0) - coalesce(cb.eur, 0), 0)::numeric as unpaid_eur'
  );
  raise notice 'affiliate_referral_stats now subtracts clawbacks (join pending).';
end;
$blk3$;

-- The lateral join the replacement above refers to. Added separately so
-- the edit stays a single textual swap.
do $blk4$
declare
  v_src text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'affiliate_referral_stats'
   limit 1;

  if v_src is null or position('cb.usd' in v_src) = 0 then
    raise notice 'Nothing to join — skipped.';
    return;
  end if;
  if position('referral_clawbacks cb' in v_src) > 0 then
    raise notice 'Join already present.';
    return;
  end if;

  execute replace(
    v_src,
    '  ) ea on true
  where d.affiliate_advertiser_id = v_aff',
    '  ) ea on true
  left join lateral (
    select
      sum(c.amount) filter (where c.currency = ''USD'') as usd,
      sum(c.amount) filter (where c.currency = ''EUR'') as eur
      from public.referral_clawbacks c
     where c.referral_link_id = d.id
  ) cb on true
  where d.affiliate_advertiser_id = v_aff'
  );
  raise notice 'Clawback join added.';
end;
$blk4$;

-- ── 5. Audit + updated_at, as CLAUDE.md requires of a money table ────
-- Every business change must be reconstructable from audit_events, and
-- optimistic concurrency depends on updated_at being bumped. Both lists
-- are hard-coded arrays inside their trigger functions, so both are
-- patched textually and both say so if the shape has moved.
do $blk5$
declare
  v_src text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = '_audit_row_change'
   limit 1;
  if v_src is null then
    raise notice '_audit_row_change not found — audit list not extended.';
  elsif position('referral_clawbacks' in v_src) > 0 then
    raise notice 'Already audited.';
  elsif position('''referral_commissions''' in v_src) = 0 then
    raise notice 'Audited list written differently — extend it by hand.';
  else
    execute replace(
      v_src,
      '''referral_commissions''',
      '''referral_commissions'',
    ''referral_clawbacks'''
    );
    raise notice 'referral_clawbacks is now audited.';
  end if;
end;
$blk5$;

do $blk6$
declare
  v_src text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = '_touch_updated_at'
   limit 1;
  if v_src is null then
    raise notice '_touch_updated_at not found.';
    return;
  end if;
end;
$blk6$;

-- The updated_at trigger is attached per table rather than listed, so it
-- is simply attached here.
drop trigger if exists trg_touch_referral_clawbacks on public.referral_clawbacks;
do $blk7$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = '_touch_updated_at'
  ) then
    execute 'create trigger trg_touch_referral_clawbacks
             before update on public.referral_clawbacks
             for each row execute function public._touch_updated_at()';
    raise notice 'updated_at trigger attached.';
  else
    raise notice 'No _touch_updated_at function — trigger not attached.';
  end if;
end;
$blk7$;

-- ── Read back ────────────────────────────────────────────────────────
select
  to_regclass('public.referral_clawbacks') is not null    as table_exists,
  (select count(*) from pg_trigger
    where tgname in ('trg_clawback_wallet_refund',
                     'trg_clawback_ad_account_withdrawal')) as triggers_installed,
  (select position('referral_clawbacks' in pg_get_functiondef(p.oid)) > 0
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'affiliate_referral_stats')
                                                          as stats_subtracts;

-- Money already returned that never took its commission with it. Each row
-- is a clawback that WOULD have happened had this existed — read them, and
-- decide deliberately whether to raise them by hand.
select
  'wallet_refund' as source, r.id, a.tenant_client_code as client,
  r.amount, r.currency, r.reviewed_at
  from public.wallet_refunds r
  join public.advertisers a on a.id = r.advertiser_id
 where r.status = 'approved'
   and exists (select 1 from public.referral_links rl
                where rl.referred_advertiser_id = r.advertiser_id)
union all
select
  'ad_account_withdrawal', w.id, a.tenant_client_code,
  w.amount, w.currency, w.reviewed_at
  from public.ad_account_withdrawals w
  join public.advertisers a on a.id = w.advertiser_id
 where w.status = 'approved'
   and exists (select 1 from public.referral_links rl
                where rl.referred_advertiser_id = w.advertiser_id)
 order by reviewed_at desc;
