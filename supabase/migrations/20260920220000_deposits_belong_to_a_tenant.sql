-- =====================================================================
-- Every incoming bank deposit belongs to a tenant
-- =====================================================================
-- Read off production 2026-09-20: two tenants ("Prime Scale Media" and
-- "PSM E2E Test") and 244 deposits with tenant_id NULL -- which is all
-- of them, because the webhook has no tenant to assign and never did.
--
-- The read policy says:
--
--   (tenant_id is not null and _is_admin_of(tenant_id))
--   or (tenant_id is null and _is_active_owner())
--
-- and _is_active_owner() takes no tenant argument: it is "owner of ANY
-- tenant". So the owner of the E2E test tenant can read every real
-- customer's bank transfer -- payer name, payer IBAN, amount,
-- reference, bank description -- for all 244 of them. Those credentials
-- live in an e2e config.
--
-- The write half is open too: matchWiseToTopup explicitly accepts a
-- null-tenant deposit and stamps its OWN tenant onto it, so the wrong
-- tenant can also claim one.
--
-- THE FIX IS TO GIVE A DEPOSIT ITS TENANT AT ARRIVAL, not to widen the
-- policy. One deployment holds one set of bank credentials, so the
-- money lands in one legal entity, which belongs to one tenant. Say
-- which, once, and every row that arrives afterwards carries it.
--
--   1. tenants.receives_bank_deposits -- exactly one tenant, the one
--      whose bank account the webhook is reading.
--   2. A BEFORE INSERT trigger that stamps it when the row arrives with
--      none. No app change: it catches the webhook and anything else.
--   3. The 244 existing rows are backfilled to it.
--   4. The policy's "null means everybody's owner" arm is replaced by
--      "null means the deposit tenant's owner", so a row that somehow
--      still arrives without one is visible to exactly one person
--      rather than to every tenant owner.
--
-- WHICH TENANT: the one that has actually taken money, measured by
-- wallet_topups. The report below prints the name it chose. If that is
-- wrong, one update fixes it:
--
--   update public.tenants set receives_bank_deposits = (name = 'Your Co');
--
-- Safe to run more than once. The backfill only touches NULL rows, so
-- a second run moves nothing.
-- =====================================================================

set search_path = public;

-- ── 1. Which tenant the bank account belongs to ──────────────────────
alter table public.tenants
  add column if not exists receives_bank_deposits boolean not null default false;

comment on column public.tenants.receives_bank_deposits is
  'True for the ONE tenant whose bank account the deposit webhook reads. Incoming transfers with no tenant are stamped with it, and are visible only to its owner.';

-- Pick it only if nobody has picked yet, so a later run cannot undo a
-- correction made by hand.
do $blk0$
declare
  v_tenant uuid;
begin
  if exists (select 1 from public.tenants where receives_bank_deposits) then
    return;
  end if;

  -- The tenant that has actually taken money. Ties and empties fall back
  -- to the oldest tenant, which is the real one on any deployment where
  -- a test tenant was added later.
  select t.id into v_tenant
    from public.tenants t
    left join public.wallet_topups w on w.tenant_id = t.id
   group by t.id, t.created_at
   order by count(w.id) desc, t.created_at asc
   limit 1;

  if v_tenant is not null then
    update public.tenants
       set receives_bank_deposits = (id = v_tenant);
  end if;
end;
$blk0$;

-- ── 2. Stamp it on arrival ───────────────────────────────────────────
create or replace function public._wise_deposit_default_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $blk1$
begin
  if new.tenant_id is null then
    select id into new.tenant_id
      from public.tenants
     where receives_bank_deposits
     limit 1;
  end if;
  return new;
end;
$blk1$;

drop trigger if exists wise_deposit_default_tenant on public.wise_incoming_transfers;
create trigger wise_deposit_default_tenant
  before insert on public.wise_incoming_transfers
  for each row execute function public._wise_deposit_default_tenant();

-- ── 3. The 244 already here ──────────────────────────────────────────
update public.wise_incoming_transfers
   set tenant_id = (select id from public.tenants where receives_bank_deposits limit 1)
 where tenant_id is null
   and exists (select 1 from public.tenants where receives_bank_deposits);

-- ── 4. The policy ────────────────────────────────────────────────────
-- Same shape as before, except the null arm now names ONE tenant's
-- owner instead of every tenant's owner. After the backfill there
-- should be no null rows left; the arm stays so that a row arriving
-- before somebody sets the flag is not invisible to everyone.
drop policy if exists wise_incoming_admin_read on public.wise_incoming_transfers;
create policy wise_incoming_admin_read on public.wise_incoming_transfers
  for select to authenticated
  using (
    (tenant_id is not null and public._is_admin_of(tenant_id))
    or (
      tenant_id is null
      and exists (
        select 1 from public.tenants t
         where t.receives_bank_deposits
           and t.owner_id = auth.uid()
      )
    )
  );

-- ── The report ───────────────────────────────────────────────────────
-- The SQL editor shows only the LAST result set, so this is the one.
select
  'deposit tenant' as item,
  coalesce(
    (select name from public.tenants where receives_bank_deposits limit 1),
    'NONE CHOSEN - see the header of this file'
  ) as status
union all
select
  'tenants flagged (must be 1)',
  (select count(*)::text from public.tenants where receives_bank_deposits)
union all
select
  'deposits still without a tenant',
  (select count(*)::text from public.wise_incoming_transfers where tenant_id is null)
union all
select
  'deposits now on the deposit tenant',
  (
    select count(*)::text from public.wise_incoming_transfers w
     where w.tenant_id = (select id from public.tenants where receives_bank_deposits limit 1)
  )
union all
select
  'stamp-on-arrival trigger',
  case
    when exists (
      select 1 from pg_trigger
       where tgname = 'wise_deposit_default_tenant'
         and not tgisinternal
    ) then 'OK' else 'MISSING'
  end
union all
select
  'policy no longer says "any tenant owner"',
  case
    when exists (
      select 1 from pg_policies
       where schemaname = 'public'
         and tablename = 'wise_incoming_transfers'
         and policyname = 'wise_incoming_admin_read'
         and qual not like '%_is_active_owner%'
    ) then 'OK' else 'STILL OPEN'
  end;
