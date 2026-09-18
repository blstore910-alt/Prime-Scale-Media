-- =====================================================================
-- A deactivated customer is still billed, and paying revives them.
-- =====================================================================
-- ⚠️ APPLY ON SUPABASE MANUALLY.
--
-- THE LOOP. Deactivating an advertiser sets subscriptions.status =
-- 'inactive'. The billing run's GENERATE pass correctly skips that. Its
-- AUTO-DEBIT pass does not — it filters only `s.status <> 'cancelled'` —
-- so any invoice already unpaid at the moment of deactivation is still
-- taken out of their wallet.
--
-- And then whichever way that goes, the subscription comes BACK:
--
--   payment succeeds -> _on_subscription_invoice_paid sets
--                       status = case when 'cancelled' then ... else 'active'
--                       i.e. inactive -> ACTIVE
--   payment fails    -> the catch block sets status = 'past_due'
--
-- Both of those re-enter the GENERATE pass. So a customer you switched off
-- is invoiced again next month, and the month after, and each payment
-- switches them back on. Deactivation does not hold.
--
-- TWO CHANGES, BOTH NARROW:
--
--   1. The auto-debit pass skips 'inactive' as well as 'cancelled'. An
--      invoice raised before deactivation is left unpaid for a person to
--      decide about — which is what deactivation means.
--   2. The paid trigger keeps 'inactive' the way it already keeps
--      'cancelled'. Paying an invoice is not a request to be reactivated;
--      an admin reactivates, deliberately, from the subscriptions screen.
--
-- The past_due branch is left alone: it only fires for subscriptions the
-- debit pass still touches, and after change 1 that no longer includes
-- inactive ones.
--
-- ROLLBACK: re-apply 20260901400000_advertiser_perks.sql and
-- 20260913120000_fix_subscription_change_reconcile.sql.
-- =====================================================================

set search_path = public;

-- ── 1. The auto-debit pass ───────────────────────────────────────────
do $$
declare
  v_src text;
  v_name text;
begin
  select p.proname, pg_get_functiondef(p.oid) into v_name, v_src
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prosrc like '%invoice_pay_from_wallet%'
     and p.prosrc like '%s.status <> ''cancelled''%'
   limit 1;

  if v_src is null then
    raise notice 'No auto-debit loop with the old filter found — no change.';
  else
    execute replace(
      v_src,
      'and s.status <> ''cancelled''',
      'and s.status not in (''cancelled'', ''inactive'')'
    );
    raise notice 'Auto-debit now skips deactivated subscriptions (%).', v_name;
  end if;
end;
$$;

-- ── 2. The paid trigger ──────────────────────────────────────────────
do $$
declare
  v_src text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = '_on_subscription_invoice_paid'
   limit 1;

  if v_src is null then
    raise notice '_on_subscription_invoice_paid not found — no change.';
    return;
  end if;

  if position('when status = ''cancelled'' then status else ''active''' in v_src) = 0
  then
    raise notice 'Paid trigger written differently — no change made.';
    return;
  end if;

  execute replace(
    v_src,
    'when status = ''cancelled'' then status else ''active''',
    'when status in (''cancelled'', ''inactive'') then status else ''active'''
  );
  raise notice 'Paying an invoice no longer reactivates a deactivated plan.';
end;
$$;

-- ── Read back ────────────────────────────────────────────────────────
-- Both must be true. still_billable counts invoices that WOULD have been
-- debited from a deactivated customer before this — each one is a wallet
-- that was going to be charged next run.
select
  exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prosrc like '%invoice_pay_from_wallet%'
       and p.prosrc like '%not in (''cancelled'', ''inactive'')%'
  ) as autodebit_skips_inactive,
  exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = '_on_subscription_invoice_paid'
       and p.prosrc like '%''cancelled'', ''inactive''%'
  ) as paying_no_longer_reactivates;

select count(*) as was_still_billable
  from public.invoices i
  join public.subscriptions s on s.id = i.subscription_id
 where i.status = 'unpaid'
   and i.due_date is not null
   and i.due_date <= now()
   and s.status = 'inactive';
