-- =====================================================================
-- PSM — one paste, one row, five answers
-- =====================================================================
-- These five checks were written as separate files and, five sessions
-- later, none of them had been run — because five pastes is five
-- decisions and one paste is none. They are together now.
--
-- Paste the WHOLE file into the Supabase SQL editor and run it. The editor
-- shows only the last statement's result, so this is a single query
-- returning a single row. Read it left to right.
--
-- Nothing here writes. Safe on a live tenant, at any time.
--
-- Every column named *_must_be_0 has to be 0. Every column named *_ok has
-- to be true. `verdict` says it in words.
-- =====================================================================

with
-- 1. Top-ups stored with a zero amount.
--    prepareTopupObject was once handed a rate ROW where it expected a
--    LIST of rates, so the conversion produced 0 and a bulk run stored
--    $0.00 against real money received. amount_received survived, which is
--    what makes an affected row recognisable — and repairable.
zero_amounts as (
  select count(*) as bad
    from public.top_ups
   where coalesce(amount_received, 0) > 0
     and (coalesce(amount_usd, 0) = 0
       or coalesce(topup_amount, 0) = 0)
),

-- 2. RLS actually on for the integration tables.
--    integration_jobs is the queue that pushes money to the supplier. If
--    RLS is off, any authenticated client can insert into it.
integration_rls as (
  select count(*) as bad
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname in ('integration_jobs', 'integration_events')
     and c.relrowsecurity = false
),

-- 3. Invitation expiry is a real timestamp.
--    The app compares it in JavaScript, not SQL, so a zone-less column does
--    not make an expired link live forever — it makes the expiry land on the
--    wrong hour, by whatever offset the machine running the code happens to
--    have. On a UTC server it is right by luck. See
--    supabase/migrations/20260917160000_invitation_expiry_timestamptz.sql,
--    which corrects this comment's earlier, overstated version.
invite_expiry as (
  select count(*) as bad
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'invitations'
     and column_name = 'expires_at'
     and data_type <> 'timestamp with time zone'
),
invite_expiry_present as (
  select count(*) as n
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'invitations'
     and column_name = 'expires_at'
),

-- 4. A profile that should be an advertiser but has no advertisers row.
--    No wallet, no ad accounts, no subscription possible — the account
--    cannot be used at all, and the screen can only say so after the fact.
orphan_advertisers as (
  select count(*) as bad
    from public.user_profiles up
   where up.role = 'advertiser'
     and not exists (
       select 1 from public.advertisers a where a.profile_id = up.id
     )
),

-- 5. First invoice due in 3 days, later ones in 7.
--    Reported as the number of PAID-BY-DATE functions we would have to
--    change; a count of 0 means no function mentions a due date at all,
--    which is itself the answer (the term is set in app code or by a
--    column default, not by a function).
due_date_fns as (
  select count(*) as n
    from pg_proc p
    join pg_namespace n2 on n2.oid = p.pronamespace
   where n2.nspname = 'public'
     and p.prosrc ilike '%due_date%'
),

-- 6. What top_ups.source actually contains.
--    It was being rendered to ADVERTISERS — a column in the read-only
--    history a deactivated user sees, and a labelled row in the
--    top-up-completed notification. Removed from both on 2026-09-17, but
--    this says whether a supplier name was ever shown. Anything here that
--    names a supplier means it WAS.
source_values as (
  select string_agg(distinct coalesce(source, '(null)'), ', ') as vals
    from public.top_ups
)

select
  (select vals from source_values)      as topup_source_values_read_by_eye,
  (select bad from zero_amounts)        as zero_amount_topups_must_be_0,
  (select bad from integration_rls)     as integration_tables_without_rls_must_be_0,
  case when (select n from invite_expiry_present) = 0
       then false else (select bad from invite_expiry) = 0
  end                                   as invite_expiry_is_timestamptz_ok,
  (select bad from orphan_advertisers)  as advertisers_without_a_record_must_be_0,
  (select n from due_date_fns)          as functions_mentioning_due_date,
  case
    when (select bad from zero_amounts) > 0
      then 'FAIL: top-ups stored with a zero amount against real money received'
    when (select bad from integration_rls) > 0
      then 'FAIL: RLS is OFF on an integration table — any client can queue a supplier push'
    when (select n from invite_expiry_present) = 0
      then 'FAIL: invitations has no expires_at column at all'
    when (select bad from invite_expiry) > 0
      then 'FAIL: invitations.expires_at is not timestamptz — the expiry moves by the running machine''s UTC offset. See 20260917160000.'
    when (select bad from orphan_advertisers) > 0
      then 'FAIL: an advertiser profile with no advertisers row — no wallet, no accounts, unusable'
    else 'PASS — and see functions_mentioning_due_date before changing the invoice term'
  end                                   as verdict;
