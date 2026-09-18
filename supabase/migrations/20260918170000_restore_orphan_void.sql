-- =====================================================================
-- Restore the orphan-void scope that today's migration overwrote.
-- =====================================================================
-- ⚠️ APPLY ON SUPABASE MANUALLY. THIS IS A REGRESSION FIX FOR SOMETHING
-- THAT IS LIVE RIGHT NOW.
--
-- WHAT HAPPENED. 20260918130000_two_more_role_only_gates.sql rebuilt
-- change_subscription_amount to add an is_active check on the caller. Its
-- header says the body was "generated from 20260917200000 by script" —
-- but the live body by then was 20260917220000, which is NEWER. So the
-- generated copy carried the OLD void clause and, on being applied, put it
-- back:
--
--     where subscription_id = p_subscription_id and status = 'unpaid'
--
-- instead of the scoped version that also catches the ORPHAN invoice — the
-- one raised at signup with no subscription_id.
--
-- WHAT THAT COSTS. Lower a customer's plan from €200 to €5: the new €5
-- invoice is issued, and the orphan €200 stays unpaid. It is the newest
-- unpaid subscription invoice, so it becomes dueSubInvoice and the
-- advertiser's own screen offers "Pay now" on €200 they no longer owe. One
-- press and it comes out of their wallet.
--
-- THIS FILE takes the CURRENT live function and restores only the void
-- clause. The is_active gate that 20260918130000 added is kept — that is
-- the part of it that was wanted.
--
-- ROLLBACK: re-apply 20260918130000_two_more_role_only_gates.sql (which
-- reintroduces the bug above — do not).
-- =====================================================================

set search_path = public;

do $blk0$
declare
  v_src text;
  v_new text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'change_subscription_amount'
   limit 1;

  if v_src is null then
    raise exception 'change_subscription_amount not found — nothing to patch';
  end if;

  -- Only the narrow clause, and only if it is the narrow one. If the
  -- scoped version is already live this is a no-op and says so.
  if position(
       'where subscription_id = p_subscription_id and status = ''unpaid'''
       in v_src
     ) = 0
  then
    raise notice 'Already scoped (or written differently) — no change made.';
    return;
  end if;

  v_new := replace(
    v_src,
    'where subscription_id = p_subscription_id and status = ''unpaid''',
    'where status = ''unpaid''
       and (
         subscription_id = p_subscription_id
         or (
           subscription_id is null
           and type = ''subscription''
           and advertiser_id = v_sub.advertiser_id
           and tenant_id = v_sub.tenant_id
         )
       )'
  );

  execute v_new;
  raise notice 'Orphan-void scope restored.';
end;
$blk0$;

-- ── Read back ────────────────────────────────────────────────────────
-- scoped_now must be true. orphans_outstanding is how many unpaid
-- subscription invoices currently carry no subscription_id — each one is a
-- customer who could be shown "Pay now" on a superseded amount until their
-- plan is next changed.
select
  (pg_get_functiondef(p.oid) like '%subscription_id is null%')
                                                     as scoped_now,
  (pg_get_functiondef(p.oid) like '%is_active%')     as active_gate_kept
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname = 'change_subscription_amount';

select count(*) as orphans_outstanding
  from public.invoices
 where status = 'unpaid'
   and type = 'subscription'
   and subscription_id is null;
