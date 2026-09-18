-- =====================================================================
-- Stamp the tenant on bank deposits that never got one.
-- =====================================================================
-- Run it in the Supabase SQL editor. It reads first, writes once, and
-- prints what it did. Nothing here can move money.
--
-- THE PROBLEM. A deposit is inserted with tenant_id = NULL whenever the
-- webhook could not match it to a top-up — which is the normal case,
-- since most arrive without a readable reference. Every write that later
-- matched one set the status and left the tenant alone.
--
-- Under the live policy (20260918140000), a NULL-tenant row reads as:
--
--     (tenant_id is not null and _is_admin_of(tenant_id))
--     or (tenant_id is null and _is_active_owner())
--
-- so it is visible to the owner of ANY tenant, and invisible to a
-- non-owner admin of the tenant that actually owns it. The payer's name,
-- IBAN, reference and amount are exposed to people with no business
-- seeing them, and the queue hides itself from the person who has to work
-- it — including the tab badge, which then shows a confident 0.
--
-- The code no longer creates these (both match paths now stamp the
-- tenant). This is the existing rows.
--
-- WHAT IT CAN AND CANNOT DECIDE. A deposit that points at a top-up knows
-- whose money it is: the top-up's tenant. A deposit that points at
-- nothing does not, and this migration does NOT guess — an unmatched
-- deposit is left NULL, because inventing an owner for money we cannot
-- attribute is a worse fault than the one being fixed.
-- =====================================================================

-- ── 1. What is about to change ───────────────────────────────────────
select
  count(*) filter (where t.tenant_id is null)                as null_tenant_rows,
  count(*) filter (where t.tenant_id is null
                     and t.suggested_topup_id is not null)   as fixable_now,
  count(*) filter (where t.tenant_id is null
                     and t.suggested_topup_id is null)       as unattributable,
  count(*) filter (where t.tenant_id is null
                     and t.status in ('confirmed','completed','matched'))
                                                             as null_but_settled
  from public.wise_incoming_transfers t;

-- ── 2. The write ─────────────────────────────────────────────────────
-- Only rows that point at a top-up, and only from that top-up's own
-- tenant. No row already carrying a tenant is touched.
with stamped as (
  update public.wise_incoming_transfers t
     set tenant_id = w.tenant_id
    from public.wallet_topups w
   where t.suggested_topup_id = w.id
     and t.tenant_id is null
     and w.tenant_id is not null
  returning t.id
)
select count(*) as rows_stamped from stamped;

-- ── 3. Read back ─────────────────────────────────────────────────────
-- fixable_now should now be 0. unattributable is expected to stay: those
-- are deposits nobody has claimed yet, and they are the ones the review
-- panel exists to work through.
select
  count(*) filter (where tenant_id is null)                  as still_null,
  count(*) filter (where tenant_id is null
                     and suggested_topup_id is not null)     as still_fixable,
  count(*)                                                   as total_deposits
  from public.wise_incoming_transfers;
