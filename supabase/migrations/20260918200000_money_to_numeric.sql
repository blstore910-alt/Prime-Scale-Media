-- =====================================================================
-- Money stops being stored in floating point.
-- =====================================================================
-- ⚠️ APPLY ON SUPABASE MANUALLY, and read the whole header first. This is
-- the one migration in this project that rewrites stored values.
--
-- TAKE A BACKUP BEFORE RUNNING IT. Supabase → Database → Backups.
--
-- WHY. Twenty-one columns holding money are `real` — Postgres single
-- precision, a 24-bit mantissa. Two consequences, both silent:
--
--   * Above roughly 42,000 the gap between representable numbers exceeds
--     half a cent, so two amounts a cent apart become the same number.
--   * A running total loses a little on every addition and never gets it
--     back. referral_links.earnings_eur is updated as
--     `earnings_eur = earnings_eur + amount`, which is exactly that case.
--
-- No line of code is wrong, so no amount of code review finds it. It is a
-- property of the column type.
--
-- wallets.eur_balance and usd_balance are ALREADY numeric — the balances
-- themselves are safe. This is everything that feeds them.
--
-- WHAT IT DOES. numeric(14,2): up to 999,999,999,999.99, exact to the
-- cent. Existing values are rounded to the cent on the way in, which is
-- the honest conversion — a float holding 4000.3700000000001 was always
-- meant to be 4000.37.
--
-- THE VIEWS. top_ups_view, referral_links_with_details and
-- referral_commissions_with_details select these columns through, so
-- Postgres refuses to alter the type underneath them. Their definitions
-- are captured, the views dropped, the columns altered, and the views
-- recreated from the captured text — so they come back exactly as they
-- were, with the new type flowing through.
--
-- BEFORE YOU RUN IT: the application must tolerate these arriving as JSON
-- strings rather than numbers. wallets.eur_balance already does (it is
-- typed `number | string | null` and every read wraps it in Number()), and
-- the code audit for the rest is what gates this migration. Do not run it
-- until that audit is clean.
--
-- ROLLBACK: restore the backup. There is no reverse migration — going back
-- to `real` would re-introduce the rounding it just removed.
-- =====================================================================

set search_path = public;

-- ── 1. Capture the views that depend on these columns ────────────────
create table if not exists public._view_backup_20260918 (
  view_name text primary key,
  definition text not null,
  captured_at timestamptz not null default now()
);

do $blk0$
declare
  v text;
begin
  foreach v in array array[
    'top_ups_view',
    'referral_links_with_details',
    'referral_commissions_with_details'
  ] loop
    if exists (
      select 1 from pg_views where schemaname = 'public' and viewname = v
    ) then
      insert into public._view_backup_20260918 (view_name, definition)
      values (v, pg_get_viewdef(('public.' || v)::regclass, true))
      on conflict (view_name) do update
        set definition = excluded.definition, captured_at = now();
      execute format('drop view public.%I', v);
      raise notice 'captured and dropped view %', v;
    else
      raise notice 'view % not present — skipped', v;
    end if;
  end loop;
end;
$blk0$;

-- ── 2. The columns ───────────────────────────────────────────────────
-- Each guarded: a column already numeric is left alone, a column that does
-- not exist is skipped with a notice rather than failing the batch.
do $blk1$
declare
  r record;
  targets text[][] := array[
    array['ad_accounts',          'fee'],
    array['advertisers',          'startup_fee'],
    array['invitations',          'commission_amount'],
    array['invoices',             'sub_total'],
    array['invoices',             'total'],
    array['referral_commissions', 'amount'],
    array['referral_links',       'earnings_eur'],
    array['referral_links',       'earnings_usd'],
    array['subscriptions',        'amount'],
    array['top_ups',              'amount_received'],
    array['top_ups',              'amount_usd'],
    array['top_ups',              'fee_amount'],
    array['top_ups',              'topup_amount'],
    array['wallet_exchanges',     'fee_amount']
  ];
  i int;
  t text;
  c text;
  v_type text;
begin
  for i in 1 .. array_length(targets, 1) loop
    t := targets[i][1];
    c := targets[i][2];

    select data_type into v_type
      from information_schema.columns
     where table_schema = 'public' and table_name = t and column_name = c;

    if v_type is null then
      raise notice 'skip %.% — not present', t, c;
    elsif v_type = 'numeric' then
      raise notice 'skip %.% — already numeric', t, c;
    else
      execute format(
        'alter table public.%I alter column %I type numeric(14,2) using round(%I::numeric, 2)',
        t, c, c
      );
      raise notice 'converted %.% from % to numeric(14,2)', t, c, v_type;
    end if;
  end loop;
end;
$blk1$;

-- ── 3. Put the views back, exactly as they were ──────────────────────
do $blk2$
declare
  r record;
begin
  for r in
    select view_name, definition from public._view_backup_20260918
     order by view_name
  loop
    execute format('create view public.%I as %s', r.view_name, r.definition);
    raise notice 'recreated view %', r.view_name;
  end loop;
end;
$blk2$;

-- ── 4. Read back ─────────────────────────────────────────────────────
-- still_float must come back EMPTY. If a row appears, that column was in
-- use by something this migration did not know about — read the notices
-- above for which step skipped it.
select
  c.table_name,
  c.column_name,
  c.data_type
  from information_schema.columns c
 where c.table_schema = 'public'
   and c.data_type in ('real', 'double precision')
   and (c.column_name ilike '%amount%'
     or c.column_name ilike '%balance%'
     or c.column_name ilike '%total%'
     or c.column_name ilike '%fee%'
     or c.column_name ilike '%earnings%')
 order by c.table_name, c.column_name;

-- The views are back and still return rows.
select
  (select count(*) from public.top_ups_view)                  as top_ups_view_rows,
  (select count(*) from public.referral_links_with_details)    as links_view_rows,
  (select count(*) from public.referral_commissions_with_details)
                                                              as commissions_view_rows;

-- Once both of the above look right, the captured definitions are no
-- longer needed:
--     drop table public._view_backup_20260918;
-- Leave it until you are satisfied.
