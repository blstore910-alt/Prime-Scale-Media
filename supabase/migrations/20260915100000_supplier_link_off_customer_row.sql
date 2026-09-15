-- =====================================================================
-- Move supplier PROVENANCE off the customer-visible ad_accounts row
-- =====================================================================
-- Allocating a pooled account wrote this onto public.ad_accounts.metadata:
--
--   { source: 'supplier1',
--     supplier_external_id: '<the supplier's own account id>',
--     allocated_from_pool_id: '<uuid>' }
--
-- An advertiser can read their own ad_accounts rows through RLS, and the
-- advertiser SPA reads them with `select("*")` (components/advertiser/
-- adv-app.tsx). So the supplier's identity AND the supplier's internal id
-- for that account were being delivered to the customer's browser. The
-- supplier must never be visible to a customer under any name.
--
-- Nothing ever read these fields back — grep finds the write and no read —
-- so this is provenance we keep for ourselves. It belongs in the
-- admin-only table that already exists for exactly this class of data.
--
-- Read:  any admin of the tenant (super-admin is a tenant-owning admin).
-- Write: server-side only.
--
-- After this runs, `select * from ad_accounts` CANNOT return the supplier
-- link, no matter how the next query is written.
--
-- ⚠️ APPLY ON SUPABASE MANUALLY (git push ships only the frontend).
-- Safe to re-run. Carries over anything already written.
-- =====================================================================

set search_path = public;

alter table public.ad_account_costs
  add column if not exists supplier_source      text,
  add column if not exists supplier_external_id text,
  add column if not exists pool_id              uuid;

comment on column public.ad_account_costs.supplier_source is
  'Which provider this account came from (e.g. supplier1). Admin-only: never expose to an advertiser or affiliate.';
comment on column public.ad_account_costs.supplier_external_id is
  'The provider''s own id for this ad account. Admin-only.';
comment on column public.ad_account_costs.pool_id is
  'The supplier_pool row this account was allocated from. Admin-only.';

-- ---------------------------------------------------------------------
-- Carry over anything already leaked onto the customer row, then strip it.
-- ---------------------------------------------------------------------
insert into public.ad_account_costs (ad_account_id, tenant_id, supplier_source, supplier_external_id, pool_id)
select
  a.id,
  a.tenant_id,
  nullif(a.metadata->>'source', ''),
  nullif(a.metadata->>'supplier_external_id', ''),
  nullif(a.metadata->>'allocated_from_pool_id', '')::uuid
from public.ad_accounts a
where a.metadata ?| array['source', 'supplier_external_id', 'allocated_from_pool_id']
on conflict (ad_account_id) do update set
  supplier_source      = coalesce(public.ad_account_costs.supplier_source, excluded.supplier_source),
  supplier_external_id = coalesce(public.ad_account_costs.supplier_external_id, excluded.supplier_external_id),
  pool_id              = coalesce(public.ad_account_costs.pool_id, excluded.pool_id),
  updated_at           = now();

update public.ad_accounts
   set metadata = (metadata - 'source' - 'supplier_external_id' - 'allocated_from_pool_id')
 where metadata ?| array['source', 'supplier_external_id', 'allocated_from_pool_id'];

-- ---------------------------------------------------------------------
-- Verify. This block always raises, so the whole migration rolls back if
-- you run it to inspect — re-run without the block to apply for real is
-- NOT needed: the RAISE is a NOTICE, not an exception.
-- ---------------------------------------------------------------------
do $$
declare
  still_on_customer_row int;
  carried_over          int;
begin
  select count(*) into still_on_customer_row
    from public.ad_accounts
   where metadata ?| array['source', 'supplier_external_id', 'allocated_from_pool_id'];

  select count(*) into carried_over
    from public.ad_account_costs
   where supplier_source is not null
      or supplier_external_id is not null
      or pool_id is not null;

  raise notice 'leaky_ad_account_rows_must_be_0 = %, supplier_links_recorded = %',
    still_on_customer_row, carried_over;
end $$;

select
  (select count(*) from public.ad_accounts
    where metadata ?| array['source','supplier_external_id','allocated_from_pool_id'])
    as leaky_ad_account_rows_must_be_0,
  (select count(*) from public.ad_account_costs
    where supplier_source is not null or supplier_external_id is not null or pool_id is not null)
    as supplier_links_recorded;
