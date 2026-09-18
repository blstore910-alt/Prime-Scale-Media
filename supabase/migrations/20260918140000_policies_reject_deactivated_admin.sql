-- =====================================================================
-- 33 policies still let a deactivated admin work
-- =====================================================================
-- ⚠️ APPLY ON SUPABASE MANUALLY. Read this header first — it is long
-- because this migration touches every admin-readable table in the app.
--
-- WHY THESE WERE MISSED
-- Both deactivation migrations (20260916100000, 20260916110000) operate on
-- pg_proc. They patched the helper predicates and the money RPCs and never
-- touched a single POLICY — and 33 policies do not call a helper at all.
-- Each inlines its own copy:
--
--     exists (select 1 from user_profiles up
--              where up.user_id = auth.uid()
--                and up.tenant_id = <table>.tenant_id
--                and up.role = 'admin')
--
-- Role, tenant, nothing else. So an admin whose access had been removed
-- kept every table those policies cover — wallets, top-ups, invoices,
-- subscriptions, advertisers, supplier accounts, audit events — by
-- talking to PostgREST directly with a session that had not expired yet.
-- The app refuses them at the door; this is the window.
--
-- WHAT THIS CHANGES
-- Every one of them now calls the patched helper instead of carrying its
-- own copy:
--
--     _is_admin_of(tenant)        admin of that tenant, still active
--     _is_super_admin_of(tenant)  …and the owner of it
--     _is_active_admin()          an active admin, where the row has no tenant
--     _is_active_owner()          an active admin who owns their own tenant
--
-- The last two are new, and exist only because four policies compare
-- against auth.uid() with no tenant column to hand.
--
-- EVERY NON-ADMIN BRANCH IS PRESERVED VERBATIM. Four of these policies OR
-- an admin branch together with a CUSTOMER branch — a withdrawal, a perk,
-- a plan, a precharge, each readable by the advertiser it belongs to — and
-- one lets an invitee find their own invitation by email. Those halves are
-- copied across unchanged, because rewriting one of them by feel is how
-- you lock a customer out of their own record.
--
-- WHAT IT DOES NOT CHANGE: who may do what, for anybody active. An active
-- admin has exactly the access they had ten minutes ago.
--
-- ROLLBACK: each policy's original expression is in the comment above it,
-- verbatim from pg_policies. Paste the old one back over the new one.
-- =====================================================================

set search_path = public;

-- ── Two helpers for the rows with no tenant to compare against ───────

-- An active admin, anywhere. Used where the policy identifies the row by
-- auth.uid() rather than by tenant (the `admins` table).
create or replace function public._is_active_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $blk0$
  select exists (
    select 1 from public.user_profiles up
     where up.user_id = auth.uid()
       and up.role = 'admin'
       and coalesce(up.is_active, true)
       and coalesce(up.status, 'active') <> 'inactive'
  );
$blk0$;

-- An active admin who owns their own tenant. Used where a table has no
-- tenant_id at all and the original policy joined tenants to test
-- owner_id (audit stats, rate-limit buckets, unassigned Wise deposits).
create or replace function public._is_active_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $blk1$
  select exists (
    select 1
      from public.user_profiles up
      join public.tenants t on t.id = up.tenant_id
     where up.user_id = auth.uid()
       and up.role = 'admin'
       and t.owner_id = auth.uid()
       and coalesce(up.is_active, true)
       and coalesce(up.status, 'active') <> 'inactive'
  );
$blk1$;

revoke all on function public._is_active_admin() from public, anon;
revoke all on function public._is_active_owner() from public, anon;
grant execute on function public._is_active_admin() to authenticated;
grant execute on function public._is_active_owner() to authenticated;

-- =====================================================================
-- A. Pure tenant-admin gates — the whole policy WAS the admin check
-- =====================================================================

-- ad_account_costs: our cost per ad account. Admin-readable by decision
-- (the owner's rule is that super-admin AND admin may see supplier fees);
-- the write side is owner-only elsewhere and is not touched here.
drop policy if exists ad_account_costs_admin_read on public.ad_account_costs;
create policy ad_account_costs_admin_read on public.ad_account_costs
  for select to authenticated
  using (public._is_admin_of(tenant_id));

drop policy if exists "Enable ALL for admins" on public.ad_account_requests;
create policy "Enable ALL for admins" on public.ad_account_requests
  for all to authenticated
  using (public._is_admin_of(tenant_id))
  with check (public._is_admin_of(tenant_id));

drop policy if exists ad_account_types_admin_write on public.ad_account_types;
create policy ad_account_types_admin_write on public.ad_account_types
  for all to authenticated
  using (public._is_admin_of(tenant_id))
  with check (public._is_admin_of(tenant_id));

drop policy if exists "Enable ALL for admins" on public.ad_accounts;
create policy "Enable ALL for admins" on public.ad_accounts
  for all to authenticated
  using (public._is_admin_of(tenant_id))
  with check (public._is_admin_of(tenant_id));

drop policy if exists bank_senders_admin_read on public.advertiser_bank_senders;
create policy bank_senders_admin_read on public.advertiser_bank_senders
  for select to authenticated
  using (public._is_admin_of(tenant_id));

drop policy if exists "Allow ALL for admins" on public.advertisers;
create policy "Allow ALL for admins" on public.advertisers
  for all to authenticated
  using (public._is_admin_of(tenant_id))
  with check (public._is_admin_of(tenant_id));

drop policy if exists affiliates_admin_all on public.affiliates;
create policy affiliates_admin_all on public.affiliates
  for all to authenticated
  using (public._is_admin_of(tenant_id))
  with check (public._is_admin_of(tenant_id));

drop policy if exists fee_defaults_admin_all on public.fee_defaults;
create policy fee_defaults_admin_all on public.fee_defaults
  for all to authenticated
  using (public._is_admin_of(tenant_id))
  with check (public._is_admin_of(tenant_id));

drop policy if exists integration_jobs_admin_read on public.integration_jobs;
create policy integration_jobs_admin_read on public.integration_jobs
  for select to authenticated
  using (public._is_admin_of(tenant_id));

drop policy if exists "Enable ALL for admin" on public.invoices;
create policy "Enable ALL for admin" on public.invoices
  for all to authenticated
  using (public._is_admin_of(tenant_id))
  with check (public._is_admin_of(tenant_id));

drop policy if exists plans_admin_write on public.plans;
create policy plans_admin_write on public.plans
  for all to authenticated
  using (public._is_admin_of(tenant_id))
  with check (public._is_admin_of(tenant_id));

drop policy if exists "Enable ALL for admins" on public.subscriptions;
create policy "Enable ALL for admins" on public.subscriptions
  for all to authenticated
  using (public._is_admin_of(tenant_id))
  with check (public._is_admin_of(tenant_id));

drop policy if exists supplier_ad_accounts_admin_write on public.supplier_ad_accounts;
create policy supplier_ad_accounts_admin_write on public.supplier_ad_accounts
  for all to authenticated
  using (public._is_admin_of(tenant_id))
  with check (public._is_admin_of(tenant_id));

drop policy if exists supplier_ad_accounts_read on public.supplier_ad_accounts;
create policy supplier_ad_accounts_read on public.supplier_ad_accounts
  for select to authenticated
  using (public._is_admin_of(tenant_id));

drop policy if exists "Enable ALL for admins" on public.top_ups;
create policy "Enable ALL for admins" on public.top_ups
  for all to authenticated
  using (public._is_admin_of(tenant_id))
  with check (public._is_admin_of(tenant_id));

drop policy if exists adjustments_admin_read on public.wallet_adjustments;
create policy adjustments_admin_read on public.wallet_adjustments
  for select to authenticated
  using (public._is_admin_of(tenant_id));

drop policy if exists refunds_admin_read on public.wallet_refunds;
create policy refunds_admin_read on public.wallet_refunds
  for select to authenticated
  using (public._is_admin_of(tenant_id));

drop policy if exists "Enable ALL for admin" on public.wallet_topups;
create policy "Enable ALL for admin" on public.wallet_topups
  for all to authenticated
  using (public._is_admin_of(tenant_id))
  with check (public._is_admin_of(tenant_id));

-- wallets: three separate policies, one per command. INSERT has only a
-- WITH CHECK, as it did before.
drop policy if exists "Admin SELECT" on public.wallets;
create policy "Admin SELECT" on public.wallets
  for select to authenticated
  using (public._is_admin_of(tenant_id));

drop policy if exists "Admin INSERT" on public.wallets;
create policy "Admin INSERT" on public.wallets
  for insert to authenticated
  with check (public._is_admin_of(tenant_id));

drop policy if exists "Admin DELETE" on public.wallets;
create policy "Admin DELETE" on public.wallets
  for delete to authenticated
  using (public._is_admin_of(tenant_id));

-- =====================================================================
-- B. A CUSTOMER branch OR'd with the admin one — the customer half is
--    copied across exactly as it was
-- =====================================================================

-- was: (exists advertisers a where a.id = advertiser_id and a.user_id = auth.uid())
--      OR (exists user_profiles up … role = 'admin')
drop policy if exists withdrawals_read on public.ad_account_withdrawals;
create policy withdrawals_read on public.ad_account_withdrawals
  for select to authenticated
  using (
    exists (
      select 1 from public.advertisers a
       where a.id = ad_account_withdrawals.advertiser_id
         and a.user_id = auth.uid()
    )
    or public._is_admin_of(tenant_id)
  );

drop policy if exists advertiser_perks_read on public.advertiser_perks;
create policy advertiser_perks_read on public.advertiser_perks
  for select to authenticated
  using (
    exists (
      select 1 from public.advertisers a
       where a.id = advertiser_perks.advertiser_id
         and a.user_id = auth.uid()
    )
    or public._is_admin_of(tenant_id)
  );

drop policy if exists advertiser_plans_read_own on public.advertiser_plans;
create policy advertiser_plans_read_own on public.advertiser_plans
  for select to authenticated
  using (
    exists (
      select 1 from public.advertisers a
       where a.id = advertiser_plans.advertiser_id
         and a.user_id = auth.uid()
    )
    or public._is_admin_of(tenant_id)
  );

drop policy if exists precharge_read on public.wallet_precharges;
create policy precharge_read on public.wallet_precharges
  for select to authenticated
  using (
    exists (
      select 1 from public.advertisers a
       where a.id = wallet_precharges.advertiser_id
         and a.user_id = auth.uid()
    )
    or public._is_admin_of(tenant_id)
  );

-- An invitee finds their own invitation by the email on their JWT. That
-- half is what makes an invite link work at all, and it is untouched.
drop policy if exists invitations_select_admin on public.invitations;
create policy invitations_select_admin on public.invitations
  for select to public
  using (
    public._is_admin_of(tenant_id)
    or (
      email is not null
      and lower(email::text) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );

-- =====================================================================
-- C. Owner-only reads — admin AND owner of that tenant
-- =====================================================================

-- was: admin of this tenant AND tenants.owner_id = auth.uid()
--      — which is exactly _is_super_admin_of.
drop policy if exists audit_events_read on public.audit_events;
create policy audit_events_read on public.audit_events
  for select to authenticated
  using (public._is_super_admin_of(tenant_id));

-- No tenant column on either of these, so the original tested "an admin
-- who owns their own tenant" with no row to compare against.
drop policy if exists audit_events_monthly_stats_super_admin_read
  on public.audit_events_monthly_stats;
create policy audit_events_monthly_stats_super_admin_read
  on public.audit_events_monthly_stats
  for select to public
  using (public._is_active_owner());

drop policy if exists rate_limit_buckets_super_admin_read on public.rate_limit_buckets;
create policy rate_limit_buckets_super_admin_read on public.rate_limit_buckets
  for select to public
  using (public._is_active_owner());

-- =====================================================================
-- D. The three odd shapes
-- =====================================================================

-- `admins`: the row belongs to the caller AND the caller is an admin.
-- There is no tenant in the predicate, hence _is_active_admin().
drop policy if exists "Only admin can read his data" on public.admins;
create policy "Only admin can read his data" on public.admins
  for select to authenticated
  using (admins.user_id = auth.uid() and public._is_active_admin());

drop policy if exists "Only admin can update his data" on public.admins;
create policy "Only admin can update his data" on public.admins
  for update to authenticated
  using (admins.user_id = auth.uid() and public._is_active_admin())
  with check (admins.user_id = auth.uid() and public._is_active_admin());

-- topup_logs has no tenant of its own; it reaches one through its top-up.
drop policy if exists "Admins can manage topup_logs in tenant" on public.topup_logs;
create policy "Admins can manage topup_logs in tenant" on public.topup_logs
  for all to authenticated
  using (
    exists (
      select 1 from public.top_ups tu
       where tu.id = topup_logs.topup_id
         and public._is_admin_of(tu.tenant_id)
    )
  )
  with check (
    exists (
      select 1 from public.top_ups tu
       where tu.id = topup_logs.topup_id
         and public._is_admin_of(tu.tenant_id)
    )
  );

-- A Wise deposit whose tenant we could not determine at ingest belongs to
-- nobody in particular, so only an owner may see it. Both halves kept.
drop policy if exists wise_incoming_admin_read on public.wise_incoming_transfers;
create policy wise_incoming_admin_read on public.wise_incoming_transfers
  for select to authenticated
  using (
    (tenant_id is not null and public._is_admin_of(tenant_id))
    or (tenant_id is null and public._is_active_owner())
  );

-- =====================================================================
-- Read it back
-- =====================================================================
-- policies_role_only must be 0. If it is not, the remainder are policies
-- this migration did not name — list them with
-- supabase/checks/POLICY-DEFINITIONS.sql and they can be added.
--
-- The three sample counts are the sanity check that nothing was locked
-- out: run them while signed in as an ACTIVE admin and each should be the
-- number you would expect to see on the matching screen.
select
  (select count(*) from pg_policies
    where schemaname = 'public'
      and (qual ilike '%role%admin%' or with_check ilike '%role%admin%')
      and coalesce(qual,'') || coalesce(with_check,'') not ilike '%is_active%')
                                                     as policies_role_only,
  (select count(*) from pg_policies
    where schemaname = 'public'
      and (qual ilike '%_is_admin_of%' or with_check ilike '%_is_admin_of%'))
                                                     as policies_using_helper,
  (select count(*) from public.wallets)              as wallets_visible,
  (select count(*) from public.invoices)             as invoices_visible,
  (select count(*) from public.wallet_topups)        as wallet_topups_visible;
