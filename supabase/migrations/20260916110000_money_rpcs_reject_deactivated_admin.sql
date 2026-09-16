-- =====================================================================
-- The remaining eight money RPCs reject a deactivated admin
-- =====================================================================
-- 20260916100000 fixed the three SHARED predicates, which closed table-level
-- access through RLS. These eight functions inline their own
-- `role = 'admin'` test instead of calling one of those, so none of them
-- inherited it:
--
--   change_subscription_amount   grant_advertiser_perk
--   invoice_pay_from_wallet      raise_integration_failure
--   revoke_advertiser_perk       top_up_admin_reject
--   top_up_admin_verify          wallet_admin_adjust
--
-- Between them they credit and debit wallets, verify and reject top-ups,
-- pay invoices, refund subscription changes and grant perks. A deactivated
-- admin can still call every one of them straight from the browser.
--
-- WHY THIS IS WRITTEN AS A LOOP AND NOT AS EIGHT FUNCTION BODIES
--
-- Because I would have to transcribe those bodies, and they run to hundreds
-- of lines. This project has already broken a live RPC once by rewriting it
-- from the repo's copy when the live one had diverged — and change_subscription_amount
-- is one of the eight. So instead Postgres reads back its OWN definition,
-- one condition is inserted into it, and the result is re-executed. Nothing
-- else in the body can change, because nothing else is touched.
--
-- Every replacement is guarded: the pattern must occur EXACTLY ONCE in that
-- function, or it is skipped and reported. A function that is skipped is
-- left exactly as it was — there is no partial edit.
--
-- The condition matches what the shared predicates now use:
--   coalesce(is_active, true) and coalesce(status, 'active') <> 'inactive'
-- "Never set" counts as active: a column added later without a backfill
-- means unknown, not deactivated.
--
-- ⚠️ APPLY ON SUPABASE MANUALLY. Safe to re-run — a function that already
-- carries the check is excluded by the WHERE clause below.
-- =====================================================================

set search_path = public;

do $$
declare
  f        record;
  src      text;
  pat      text;
  rep      text;
  hits     int;
  patched  int := 0;
  skipped  int := 0;
begin
  for f in
    select p.oid, p.proname
      from pg_proc p
      join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public'
       and p.prosecdef
       and p.prosrc ilike '%role%=%admin%'
       and p.prosrc not ilike '%is_active%'
     order by p.proname
  loop
    src := pg_get_functiondef(f.oid);

    -- Two styles exist in this schema. The qualified one MUST be tested
    -- first: "up.role = 'admin'" contains "role = 'admin'", so checking the
    -- bare form first would match inside the qualified one and produce
    -- "up.role = 'admin' AND COALESCE(is_active..." — unqualified column
    -- references inside a join that has two candidate tables.
    if position('up.role = ''admin''' in src) > 0 then
      pat := 'up.role = ''admin''';
      rep := 'up.role = ''admin'''
          || ' and coalesce(up.is_active, true)'
          || ' and coalesce(up.status, ''active'') <> ''inactive''';
    elsif position('role = ''admin''' in src) > 0 then
      pat := 'role = ''admin''';
      rep := 'role = ''admin'''
          || ' AND COALESCE(is_active, true)'
          || ' AND COALESCE(status, ''active'') <> ''inactive''';
    else
      raise notice 'SKIP % — no recognised admin check to extend', f.proname;
      skipped := skipped + 1;
      continue;
    end if;

    hits := (length(src) - length(replace(src, pat, ''))) / length(pat);
    if hits <> 1 then
      raise notice 'SKIP % — pattern found % times, expected exactly 1', f.proname, hits;
      skipped := skipped + 1;
      continue;
    end if;

    execute replace(src, pat, rep);
    raise notice 'patched %', f.proname;
    patched := patched + 1;
  end loop;

  raise notice '--- patched %, skipped % ---', patched, skipped;
end $$;

-- ---------------------------------------------------------------------
-- Verify. still_unguarded must be 0. If it is not, the notices above name
-- which functions were skipped and why — those need doing by hand.
-- ---------------------------------------------------------------------
select
  count(*) filter (where p.prosrc not ilike '%is_active%') as still_unguarded_must_be_0,
  count(*)                                                 as admin_functions_total,
  string_agg(p.proname, ', ') filter (where p.prosrc not ilike '%is_active%')
                                                           as names_if_any
from pg_proc p
join pg_namespace ns on ns.oid = p.pronamespace
where ns.nspname = 'public'
  and p.prosecdef
  and p.prosrc ilike '%role%=%admin%';
