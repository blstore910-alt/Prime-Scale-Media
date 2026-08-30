-- =====================================================================
-- RLS policy TEMPLATES  ⚠️  MANUAL REVIEW REQUIRED — NOT AUTO-RUN
-- =====================================================================
-- This file is EXCLUDED from supabase/consolidated/all-migrations.sql
-- because it references specific tables (`affiliates`, `topup_logs`,
-- etc) that may not exist in every deployment yet. Running it as-is
-- against an incomplete schema fails at the first missing table.
--
-- HOW TO APPLY:
-- 1. Open your Supabase SQL Editor.
-- 2. Copy the blocks below one table at a time.
-- 3. Skip blocks for tables you don't have.
-- 4. Adjust the specific policy shapes to match your app's real
--    permission model (the shapes here match the P0/P1 sweep default:
--    writes via SECURITY DEFINER RPCs, reads tenant-scoped).
--
-- ALTERNATIVE (recommended for initial deploy): use Supabase's
-- "Run and enable RLS" prompt when running the core consolidated
-- SQL — that adds default deny-all policies to every new table.
-- Writes are already gated by SECURITY DEFINER RPCs, so deny-all
-- is safe (and stricter than the templates below).
--
-- Every block is idempotent (DROP IF EXISTS + CREATE) and can be
-- rerun safely.
-- =====================================================================

set search_path = public;

-- Helper: return the caller's active user_profiles row id.
create or replace function public._current_profile()
returns table (id uuid, role text, tenant_id uuid)
language sql
security definer
set search_path = public
stable
as $$
  select up.id, up.role, up.tenant_id
    from public.user_profiles up
   where up.user_id = auth.uid()
   order by up.created_at asc
   limit 1;
$$;
revoke all on function public._current_profile() from public;
grant execute on function public._current_profile() to authenticated;

create or replace function public._is_admin_of(tenant uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.user_profiles up
     where up.user_id = auth.uid()
       and up.tenant_id = tenant
       and up.role = 'admin'
  );
$$;
revoke all on function public._is_admin_of(uuid) from public;
grant execute on function public._is_admin_of(uuid) to authenticated;

create or replace function public._is_super_admin_of(tenant uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
      from public.tenants t
      join public.user_profiles up on up.tenant_id = t.id
     where t.id = tenant
       and t.owner_id = auth.uid()
       and up.user_id = auth.uid()
       and up.role = 'admin'
  );
$$;
revoke all on function public._is_super_admin_of(uuid) from public;
grant execute on function public._is_super_admin_of(uuid) to authenticated;

-- Advertiser: caller is advertiser and this row is theirs.
create or replace function public._is_own_advertiser(advertiser uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.advertisers a
     where a.id = advertiser
       and a.user_id = auth.uid()
  );
$$;
revoke all on function public._is_own_advertiser(uuid) from public;
grant execute on function public._is_own_advertiser(uuid) to authenticated;

-- =====================================================================
-- tenants
-- =====================================================================
alter table public.tenants enable row level security;

drop policy if exists tenants_select on public.tenants;
create policy tenants_select on public.tenants
  for select using (
    -- Everyone in the tenant can read the tenant row.
    exists (
      select 1 from public.user_profiles up
       where up.user_id = auth.uid()
         and up.tenant_id = tenants.id
    )
    -- Public read of tenant.slug is used at signup — see below.
    or owner_id = auth.uid()
  );

drop policy if exists tenants_insert on public.tenants;
create policy tenants_insert on public.tenants
  for insert with check (
    -- Only signed-in users; must set themselves as owner.
    auth.uid() is not null and owner_id = auth.uid()
    -- Server action prevents duplicate ownership; RLS just enforces
    -- that owner_id matches the caller.
  );

drop policy if exists tenants_update on public.tenants;
create policy tenants_update on public.tenants
  for update using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Deletes disallowed; drop of tenant is a rare admin op done
-- out-of-band. No policy = deny.

-- =====================================================================
-- user_profiles
-- =====================================================================
alter table public.user_profiles enable row level security;

drop policy if exists user_profiles_select_self on public.user_profiles;
create policy user_profiles_select_self on public.user_profiles
  for select using (
    user_id = auth.uid()
    or _is_admin_of(tenant_id)
  );

drop policy if exists user_profiles_insert on public.user_profiles;
create policy user_profiles_insert on public.user_profiles
  for insert with check (
    -- Only via server code paths: user_id must equal caller, or
    -- caller is admin of the target tenant (invite accept flow uses
    -- SECURITY DEFINER which bypasses this).
    user_id = auth.uid()
    or _is_admin_of(tenant_id)
  );

drop policy if exists user_profiles_update on public.user_profiles;
create policy user_profiles_update on public.user_profiles
  for update using (
    user_id = auth.uid()
    or _is_admin_of(tenant_id)
  )
  with check (
    user_id = auth.uid()
    or _is_admin_of(tenant_id)
  );

-- =====================================================================
-- advertisers
-- =====================================================================
alter table public.advertisers enable row level security;

drop policy if exists advertisers_select on public.advertisers;
create policy advertisers_select on public.advertisers
  for select using (
    user_id = auth.uid()
    or _is_admin_of(tenant_id)
  );

drop policy if exists advertisers_update on public.advertisers;
create policy advertisers_update on public.advertisers
  for update using (_is_admin_of(tenant_id))
  with check (_is_admin_of(tenant_id));

-- insert: usually happens via a trigger on user_profiles or via
-- SECURITY DEFINER. No policy = deny from anon.

-- =====================================================================
-- affiliates
-- =====================================================================
alter table public.affiliates enable row level security;

drop policy if exists affiliates_select on public.affiliates;
create policy affiliates_select on public.affiliates
  for select using (
    user_id = auth.uid()
    or _is_admin_of(tenant_id)
  );

drop policy if exists affiliates_update on public.affiliates;
create policy affiliates_update on public.affiliates
  for update using (_is_admin_of(tenant_id))
  with check (_is_admin_of(tenant_id));

-- =====================================================================
-- wallets
-- =====================================================================
alter table public.wallets enable row level security;

drop policy if exists wallets_select on public.wallets;
create policy wallets_select on public.wallets
  for select using (
    _is_own_advertiser(advertiser_id)
    or _is_admin_of(tenant_id)
  );

-- No insert/update from client — RPCs are SECURITY DEFINER so they
-- bypass RLS entirely. Anon writes are refused by absence of policy.

-- =====================================================================
-- wallet_topups
-- =====================================================================
alter table public.wallet_topups enable row level security;

drop policy if exists wallet_topups_select on public.wallet_topups;
create policy wallet_topups_select on public.wallet_topups
  for select using (
    _is_own_advertiser(advertiser_id)
    or _is_admin_of(tenant_id)
  );

-- Writes: RPCs only.

-- =====================================================================
-- top_ups
-- =====================================================================
alter table public.top_ups enable row level security;

drop policy if exists top_ups_select on public.top_ups;
create policy top_ups_select on public.top_ups
  for select using (
    _is_own_advertiser(advertiser_id)
    or _is_admin_of(tenant_id)
  );

drop policy if exists top_ups_insert_admin on public.top_ups;
create policy top_ups_insert_admin on public.top_ups
  for insert with check (_is_admin_of(tenant_id));

drop policy if exists top_ups_update_admin on public.top_ups;
create policy top_ups_update_admin on public.top_ups
  for update using (_is_admin_of(tenant_id))
  with check (_is_admin_of(tenant_id));

-- =====================================================================
-- topup_logs (write-once, read by admin)
-- =====================================================================
alter table public.topup_logs enable row level security;

drop policy if exists topup_logs_select on public.topup_logs;
create policy topup_logs_select on public.topup_logs
  for select using (
    exists (
      select 1 from public.top_ups tu
       where tu.id = topup_logs.top_up_id
         and (_is_own_advertiser(tu.advertiser_id) or _is_admin_of(tu.tenant_id))
    )
  );

drop policy if exists topup_logs_insert_admin on public.topup_logs;
create policy topup_logs_insert_admin on public.topup_logs
  for insert with check (
    exists (
      select 1 from public.top_ups tu
       where tu.id = topup_logs.top_up_id
         and _is_admin_of(tu.tenant_id)
    )
  );

-- =====================================================================
-- invoices
-- =====================================================================
alter table public.invoices enable row level security;

drop policy if exists invoices_select on public.invoices;
create policy invoices_select on public.invoices
  for select using (
    _is_own_advertiser(advertiser_id)
    or _is_admin_of(tenant_id)
  );

drop policy if exists invoices_insert_admin on public.invoices;
create policy invoices_insert_admin on public.invoices
  for insert with check (_is_admin_of(tenant_id));

drop policy if exists invoices_update_admin on public.invoices;
create policy invoices_update_admin on public.invoices
  for update using (_is_admin_of(tenant_id))
  with check (_is_admin_of(tenant_id));

-- =====================================================================
-- companies + billings
-- =====================================================================
alter table public.companies enable row level security;

drop policy if exists companies_select on public.companies;
create policy companies_select on public.companies
  for select using (
    _is_own_advertiser(advertiser_id)
    or _is_admin_of(tenant_id)
  );

drop policy if exists companies_insert_owner on public.companies;
create policy companies_insert_owner on public.companies
  for insert with check (
    _is_own_advertiser(advertiser_id)
  );

drop policy if exists companies_update_owner on public.companies;
create policy companies_update_owner on public.companies
  for update using (
    _is_own_advertiser(advertiser_id) or _is_admin_of(tenant_id)
  )
  with check (
    _is_own_advertiser(advertiser_id) or _is_admin_of(tenant_id)
  );

alter table public.billings enable row level security;

drop policy if exists billings_select on public.billings;
create policy billings_select on public.billings
  for select using (
    exists (
      select 1 from public.companies c
       where c.id = billings.company_id
         and (_is_own_advertiser(c.advertiser_id) or _is_admin_of(c.tenant_id))
    )
  );

drop policy if exists billings_write_owner on public.billings;
create policy billings_write_owner on public.billings
  for all using (
    exists (
      select 1 from public.companies c
       where c.id = billings.company_id
         and _is_own_advertiser(c.advertiser_id)
    )
  )
  with check (
    exists (
      select 1 from public.companies c
       where c.id = billings.company_id
         and _is_own_advertiser(c.advertiser_id)
    )
  );

-- =====================================================================
-- subscriptions
-- =====================================================================
alter table public.subscriptions enable row level security;

drop policy if exists subscriptions_select on public.subscriptions;
create policy subscriptions_select on public.subscriptions
  for select using (
    _is_own_advertiser(advertiser_id)
    or _is_admin_of(tenant_id)
  );

drop policy if exists subscriptions_write_admin on public.subscriptions;
create policy subscriptions_write_admin on public.subscriptions
  for all using (_is_admin_of(tenant_id))
  with check (_is_admin_of(tenant_id));

-- =====================================================================
-- exchange_rates (admin write, tenant-scoped read)
-- =====================================================================
alter table public.exchange_rates enable row level security;

drop policy if exists exchange_rates_select on public.exchange_rates;
create policy exchange_rates_select on public.exchange_rates
  for select using (
    exists (
      select 1 from public.user_profiles up
       where up.user_id = auth.uid()
         and up.tenant_id = exchange_rates.tenant_id
    )
  );

drop policy if exists exchange_rates_write_admin on public.exchange_rates;
create policy exchange_rates_write_admin on public.exchange_rates
  for all using (_is_admin_of(tenant_id))
  with check (_is_admin_of(tenant_id));

-- =====================================================================
-- referral_commissions + referral_links
-- =====================================================================
alter table public.referral_commissions enable row level security;

drop policy if exists referral_commissions_select on public.referral_commissions;
create policy referral_commissions_select on public.referral_commissions
  for select using (
    -- Affiliates see their own commissions; admins see tenant's.
    exists (
      select 1 from public.advertisers a
       where a.id = referral_commissions.affiliate_advertiser_id
         and a.user_id = auth.uid()
    )
    or _is_admin_of(tenant_id)
  );

drop policy if exists referral_commissions_write_admin on public.referral_commissions;
create policy referral_commissions_write_admin on public.referral_commissions
  for all using (_is_admin_of(tenant_id))
  with check (_is_admin_of(tenant_id));

alter table public.referral_links enable row level security;

drop policy if exists referral_links_select on public.referral_links;
create policy referral_links_select on public.referral_links
  for select using (
    -- Referrer or referred advertiser can read; admins too.
    exists (
      select 1 from public.advertisers a
       where a.id in (
             referral_links.affiliate_advertiser_id,
             referral_links.referred_advertiser_id
           )
         and a.user_id = auth.uid()
    )
    or _is_admin_of(tenant_id)
  );

drop policy if exists referral_links_write_admin on public.referral_links;
create policy referral_links_write_admin on public.referral_links
  for all using (_is_admin_of(tenant_id))
  with check (_is_admin_of(tenant_id));

-- =====================================================================
-- ad_accounts + ad_account_requests
-- =====================================================================
alter table public.ad_accounts enable row level security;

drop policy if exists ad_accounts_select on public.ad_accounts;
create policy ad_accounts_select on public.ad_accounts
  for select using (
    _is_own_advertiser(advertiser_id)
    or _is_admin_of(tenant_id)
  );

drop policy if exists ad_accounts_write_admin on public.ad_accounts;
create policy ad_accounts_write_admin on public.ad_accounts
  for all using (_is_admin_of(tenant_id))
  with check (_is_admin_of(tenant_id));

alter table public.ad_account_requests enable row level security;

drop policy if exists ad_account_requests_select on public.ad_account_requests;
create policy ad_account_requests_select on public.ad_account_requests
  for select using (
    _is_own_advertiser(advertiser_id)
    or _is_admin_of(tenant_id)
  );

drop policy if exists ad_account_requests_insert_owner on public.ad_account_requests;
create policy ad_account_requests_insert_owner on public.ad_account_requests
  for insert with check (
    _is_own_advertiser(advertiser_id)
  );

drop policy if exists ad_account_requests_update_admin on public.ad_account_requests;
create policy ad_account_requests_update_admin on public.ad_account_requests
  for update using (_is_admin_of(tenant_id))
  with check (_is_admin_of(tenant_id));

-- =====================================================================
-- notifications + push_subscriptions
-- =====================================================================
alter table public.notifications enable row level security;

drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select using (recipient_user_id = auth.uid());

drop policy if exists notifications_update_self on public.notifications;
create policy notifications_update_self on public.notifications
  for update using (recipient_user_id = auth.uid())
  with check (recipient_user_id = auth.uid());

alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_all_self on public.push_subscriptions;
create policy push_subscriptions_all_self on public.push_subscriptions
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- =====================================================================
-- invitations
-- =====================================================================
alter table public.invitations enable row level security;

drop policy if exists invitations_select_admin on public.invitations;
create policy invitations_select_admin on public.invitations
  for select using (
    _is_admin_of(tenant_id)
    -- Also let the invited person read their own invitation by email
    or (email is not null and email = (
      select email from auth.users where id = auth.uid()
    ))
  );

drop policy if exists invitations_write_admin on public.invitations;
create policy invitations_write_admin on public.invitations
  for all using (_is_admin_of(tenant_id))
  with check (_is_admin_of(tenant_id));
