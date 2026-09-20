-- =====================================================================
-- The deposit tenant is CHOSEN, never inferred
-- =====================================================================
-- 20260920220000 picked the tenant that "has actually taken money,
-- measured by wallet_topups", on the reasoning that a test tenant would
-- have fewer. On this database it has MORE -- e2e runs create top-ups
-- every time they run, and real customers do not. So the heuristic
-- picked "PSM E2E Test", and the backfill in that same file stamped
-- every deposit that had no tenant with it.
--
-- Read off production immediately afterwards:
--
--   name               vlag   deposits   amount
--   PSM E2E Test       false       257   499394.48
--   Prime Scale Media  true          1         5.00
--
-- Nothing was lost -- tenant_id is a label, not a location, and no
-- amount or status was touched -- but the label is wrong, and it is the
-- label the read policy now trusts. So this file does two things:
--
--   1. REMOVES THE GUESS. A tenant that has never been chosen by a
--      person gets no flag. If no tenant is flagged, deposits arrive
--      with tenant_id NULL exactly as they did before, and the policy's
--      null arm shows them to nobody rather than to the wrong somebody.
--      Nothing is silently attributed again.
--
--   2. Leaves the MOVE to a human, below, because which of those 257
--      rows are real is a question about a bank statement and not about
--      this database. The repair is one statement and it is written out
--      for you.
--
-- The lesson, written down because it cost an hour: a heuristic that
-- picks between a production tenant and a test tenant will pick the one
-- that ran more tests. "Measured by activity" is exactly backwards for
-- telling those two apart.
--
-- Safe to run more than once.
-- =====================================================================

set search_path = public;

-- ── 1. No tenant is the deposit tenant until somebody says so ────────
-- Deliberately NOT conditional: 20260920220000's do-block may have set
-- this on whichever tenant it liked, and that value carries no
-- authority. Clearing it costs one statement and a person then decides.
update public.tenants
   set receives_bank_deposits = false
 where receives_bank_deposits;

comment on column public.tenants.receives_bank_deposits is
  'True for the ONE tenant whose bank account the deposit webhook reads. SET THIS BY HAND -- it decides who can read every incoming bank transfer, and it must never be inferred from activity, because a test tenant out-runs a real one.';

-- ── 2. The trigger stays, and now does nothing until you choose ──────
-- With no tenant flagged, select..limit 1 returns NULL and the row
-- keeps the NULL it arrived with. That is the behaviour from before
-- either migration, which is the safe place to sit.
create or replace function public._wise_deposit_default_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $blk0$
begin
  if new.tenant_id is null then
    select id into new.tenant_id
      from public.tenants
     where receives_bank_deposits
     limit 1;
  end if;
  return new;
end;
$blk0$;

-- ── The report, and what to run next ─────────────────────────────────
-- The SQL editor shows only the LAST result set, so this is the one.
--
-- WHEN YOU HAVE DECIDED, two statements:
--
--   update public.tenants
--      set receives_bank_deposits = (name = 'Prime Scale Media');
--
--   update public.wise_incoming_transfers
--      set tenant_id = (select id from public.tenants
--                        where receives_bank_deposits limit 1)
--    where tenant_id = (select id from public.tenants
--                        where name = 'PSM E2E Test');
--
-- Run the SECOND only for rows that are genuinely ours. Check a handful
-- of sender_name / reference values against the bank first.
select
  t.name as item,
  'deposits: ' || count(w.id)::text
    || ' · ' || coalesce(sum(w.amount_cents) / 100.0, 0)::text
    || ' · flagged: ' || t.receives_bank_deposits::text as status
from public.tenants t
left join public.wise_incoming_transfers w on w.tenant_id = t.id
group by t.id, t.name, t.receives_bank_deposits
union all
select
  'deposits with no tenant',
  count(*)::text
from public.wise_incoming_transfers
where tenant_id is null
union all
select
  'a tenant has been chosen',
  case
    when exists (select 1 from public.tenants where receives_bank_deposits)
      then 'YES'
    else 'NO - deposits stay unassigned and are visible to nobody until you choose'
  end;
