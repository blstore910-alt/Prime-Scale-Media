-- =====================================================================
-- Watertight FROM A LINE, rather than pretending the past is clean.
-- =====================================================================
-- READ-ONLY. Nothing here writes.
--
-- WHY A LINE. PSM0001–PSM0004 were edited by hand while the app was being
-- built, before there was any discipline about it. Those balances cannot
-- be made to reconcile retroactively, and forcing them to would be worse
-- than leaving them: a check taught to look away from its own first
-- finding is not a check.
--
-- So: pick a moment, prove everything after it, and keep what came before
-- visible instead of hidden. PSM0005 is the first advertiser created under
-- the current rules, which makes their creation a natural line.
--
-- CHANGE THE DATE BELOW and run. Everything is measured against it.
-- =====================================================================

-- ── The line. Edit this. ─────────────────────────────────────────────
-- Default: the moment PSM0005's wallet was created. Set it to a fixed
-- timestamp instead if you want a date you can quote later — folklore is
-- not a baseline.
create temporary view _baseline as
select coalesce(
         -- w.created_at, qualified: advertisers has one too, and an
         -- unqualified min(created_at) across the join is ambiguous.
         (select min(w.created_at)
            from public.wallets w
            join public.advertisers a on a.id = w.advertiser_id
           where a.tenant_client_code = 'PSM0005'),
         now() - interval '30 days'
       ) as since;

select since as baseline_from, now() as checked_at from _baseline;

-- ── 1. Every balance change SINCE the line, and what explains it ─────
-- A move is explained when a business event of the same size sits within
-- five minutes of it: a verified top-up, an adjustment, a precharge, a
-- refund, an ad-account withdrawal coming back, or an exchange.
--
-- WHAT YOU WANT TO SEE: nothing in the `explained_by` column reading
-- 'NOTHING'. Every other value is a real event with a name.
with moves as (
  select
    e.occurred_at,
    e.row_id::uuid                                          as wallet_id,
    e.actor_profile_id,
    coalesce((e.after_data->>'eur_balance')::numeric,0)
      - coalesce((e.before_data->>'eur_balance')::numeric,0) as d_eur,
    coalesce((e.after_data->>'usd_balance')::numeric,0)
      - coalesce((e.before_data->>'usd_balance')::numeric,0) as d_usd
    from public.audit_events e, _baseline b
   where e.table_name = 'wallets'
     and e.action = 'UPDATE'
     and e.occurred_at >= b.since
),
real_moves as (
  select * from moves where d_eur <> 0 or d_usd <> 0
)
select
  m.occurred_at,
  a.tenant_client_code                       as client,
  round(m.d_eur, 2)                          as eur,
  round(m.d_usd, 2)                          as usd,
  coalesce(
    (select 'top-up ' || t.id::text
       from public.wallet_topups t
      where t.wallet_id = m.wallet_id
        and t.status = 'completed'
        and t.updated_at between m.occurred_at - interval '5 minutes'
                             and m.occurred_at + interval '5 minutes'
      limit 1),
    (select 'adjustment ' || adj.id::text
       from public.wallet_adjustments adj
      where adj.advertiser_id = w.advertiser_id
        and adj.updated_at between m.occurred_at - interval '5 minutes'
                               and m.occurred_at + interval '5 minutes'
      limit 1),
    (select 'precharge ' || pc.id::text
       from public.wallet_precharges pc
      where pc.advertiser_id = w.advertiser_id
        and pc.updated_at between m.occurred_at - interval '5 minutes'
                              and m.occurred_at + interval '5 minutes'
      limit 1),
    (select 'refund ' || rf.id::text
       from public.wallet_refunds rf
      where rf.advertiser_id = w.advertiser_id
        and rf.updated_at between m.occurred_at - interval '5 minutes'
                              and m.occurred_at + interval '5 minutes'
      limit 1),
    (select 'withdrawal ' || wd.id::text
       from public.ad_account_withdrawals wd
      where wd.advertiser_id = w.advertiser_id
        and wd.updated_at between m.occurred_at - interval '5 minutes'
                              and m.occurred_at + interval '5 minutes'
      limit 1),
    (select 'exchange ' || ex.id::text
       from public.wallet_exchanges ex
      where ex.wallet_id = m.wallet_id
        and ex.created_at between m.occurred_at - interval '5 minutes'
                              and m.occurred_at + interval '5 minutes'
      limit 1),
    (select 'invoice paid ' || i.id::text
       from public.invoices i
      where i.advertiser_id = w.advertiser_id
        and i.status = 'paid'
        and i.updated_at between m.occurred_at - interval '5 minutes'
                             and m.occurred_at + interval '5 minutes'
      limit 1),
    'NOTHING'
  )                                          as explained_by,
  m.actor_profile_id                         as who
  from real_moves m
  join public.wallets w on w.id = m.wallet_id
  left join public.advertisers a on a.id = w.advertiser_id
 order by m.occurred_at desc;

-- ── 2. The same thing as one number ──────────────────────────────────
-- unexplained_moves must be 0. That is the whole test.
with moves as (
  select
    e.occurred_at,
    e.row_id::uuid as wallet_id,
    coalesce((e.after_data->>'eur_balance')::numeric,0)
      - coalesce((e.before_data->>'eur_balance')::numeric,0) as d_eur,
    coalesce((e.after_data->>'usd_balance')::numeric,0)
      - coalesce((e.before_data->>'usd_balance')::numeric,0) as d_usd
    from public.audit_events e, _baseline b
   where e.table_name='wallets' and e.action='UPDATE'
     and e.occurred_at >= b.since
),
real_moves as (select * from moves where d_eur<>0 or d_usd<>0)
select
  count(*) as moves_since_baseline,
  count(*) filter (
    where not exists (
      select 1 from public.wallet_topups t
       where t.wallet_id = real_moves.wallet_id and t.status='completed'
         and t.updated_at between real_moves.occurred_at - interval '5 minutes'
                              and real_moves.occurred_at + interval '5 minutes')
      and not exists (
      select 1 from public.wallet_adjustments adj
        join public.wallets w2 on w2.advertiser_id = adj.advertiser_id
       where w2.id = real_moves.wallet_id
         and adj.updated_at between real_moves.occurred_at - interval '5 minutes'
                                and real_moves.occurred_at + interval '5 minutes')
      and not exists (
      select 1 from public.wallet_precharges pc
        join public.wallets w3 on w3.advertiser_id = pc.advertiser_id
       where w3.id = real_moves.wallet_id
         and pc.updated_at between real_moves.occurred_at - interval '5 minutes'
                               and real_moves.occurred_at + interval '5 minutes')
      and not exists (
      select 1 from public.invoices i
        join public.wallets w4 on w4.advertiser_id = i.advertiser_id
       where w4.id = real_moves.wallet_id and i.status='paid'
         and i.updated_at between real_moves.occurred_at - interval '5 minutes'
                              and real_moves.occurred_at + interval '5 minutes')
      and not exists (
      select 1 from public.ad_account_withdrawals wd
        join public.wallets w5 on w5.advertiser_id = wd.advertiser_id
       where w5.id = real_moves.wallet_id
         and wd.updated_at between real_moves.occurred_at - interval '5 minutes'
                               and real_moves.occurred_at + interval '5 minutes')
      and not exists (
      select 1 from public.wallet_exchanges ex
       where ex.wallet_id = real_moves.wallet_id
         and ex.created_at between real_moves.occurred_at - interval '5 minutes'
                               and real_moves.occurred_at + interval '5 minutes')
  ) as unexplained_moves
  from real_moves;

-- ── 3. What predates the line, stated rather than hidden ─────────────
-- These are not clean and are not going to be. Knowing how many there are
-- is the point: the line is only honest if what is behind it is counted.
select
  count(*)                                   as moves_before_baseline,
  min(e.occurred_at)                         as earliest,
  max(e.occurred_at)                         as latest
  from public.audit_events e, _baseline b
 where e.table_name='wallets' and e.action='UPDATE'
   and e.occurred_at < b.since
   and (coalesce((e.after_data->>'eur_balance')::numeric,0)
        <> coalesce((e.before_data->>'eur_balance')::numeric,0)
     or coalesce((e.after_data->>'usd_balance')::numeric,0)
        <> coalesce((e.before_data->>'usd_balance')::numeric,0));
