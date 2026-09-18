-- =====================================================================
-- What is holding those columns at `real`? READ-ONLY.
-- =====================================================================
-- The conversion did not happen and the views came back, which is what a
-- rolled-back transaction looks like. Something depends on one of those
-- columns that the migration did not know to drop first — Postgres will
-- not change a column's type underneath a dependent object.
--
-- My migration captured three views. This asks the database for ALL of
-- them, rather than me guessing a fourth.
--
-- Run it and paste back all four results.
-- =====================================================================

-- ── 1. Every object that depends on one of those columns ─────────────
-- Views, materialised views, rules — anything that would block an ALTER.
with targets(tbl, col) as (
  values
    ('ad_accounts','fee'),
    ('advertisers','startup_fee'),
    ('invitations','commission_amount'),
    ('invoices','sub_total'),
    ('invoices','total'),
    ('referral_commissions','amount'),
    ('referral_links','earnings_eur'),
    ('referral_links','earnings_usd'),
    ('subscriptions','amount'),
    ('top_ups','amount_received'),
    ('top_ups','amount_usd'),
    ('top_ups','fee_amount'),
    ('top_ups','topup_amount'),
    ('wallet_exchanges','fee_amount')
)
select distinct
  t.tbl                              as base_table,
  t.col                              as base_column,
  dependent.relname                  as depends_on_it,
  case dependent.relkind
    when 'v' then 'view'
    when 'm' then 'materialised view'
    when 'r' then 'table'
    else dependent.relkind::text
  end                                as kind
  from targets t
  join pg_class base
    on base.relname = t.tbl
  join pg_namespace bn
    on bn.oid = base.relnamespace and bn.nspname = 'public'
  join pg_attribute a
    on a.attrelid = base.oid and a.attname = t.col and a.attnum > 0
  join pg_depend d
    on d.refobjid = base.oid and d.refobjsubid = a.attnum
  join pg_rewrite rw
    on rw.oid = d.objid
  join pg_class dependent
    on dependent.oid = rw.ev_class
 where dependent.relname <> t.tbl
 order by 1, 2, 3;

-- ── 2. Generated columns and check constraints on them ───────────────
-- A generated column or a CHECK that mentions the column also blocks it.
select
  c.relname   as table_name,
  con.conname as constraint_name,
  pg_get_constraintdef(con.oid) as definition
  from pg_constraint con
  join pg_class c on c.oid = con.conrelid
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relname in ('ad_accounts','advertisers','invitations','invoices',
                     'referral_commissions','referral_links','subscriptions',
                     'top_ups','wallet_exchanges')
   and (pg_get_constraintdef(con.oid) ilike '%amount%'
     or pg_get_constraintdef(con.oid) ilike '%total%'
     or pg_get_constraintdef(con.oid) ilike '%fee%'
     or pg_get_constraintdef(con.oid) ilike '%earnings%')
 order by 1, 2;

-- ── 3. Did the backup table survive, and what is in it? ──────────────
-- If the transaction rolled back this is empty or absent — which tells us
-- the whole thing was undone rather than half-applied.
select
  to_regclass('public._view_backup_20260918') is not null as backup_exists,
  coalesce(
    (select count(*) from public._view_backup_20260918), -1
  )                                                       as rows_captured;

-- ── 4. Do those views actually hold rows, or are they simply empty? ───
-- 0 rows in all three may be perfectly correct — there may be no
-- ad-account top-ups and no referrals yet. This says which.
select
  (select count(*) from public.top_ups)             as top_ups_rows,
  (select count(*) from public.referral_links)      as referral_links_rows,
  (select count(*) from public.referral_commissions) as commissions_rows;
