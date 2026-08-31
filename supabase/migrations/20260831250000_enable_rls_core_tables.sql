-- CRITICAL: enable RLS on core tables where it was OFF.
--
-- The rls-verify diagnostic showed 18 core tables with policies defined
-- but rls_enabled = false — meaning every policy was DORMANT and the
-- tables were world-read/write via the public anon key. This activates
-- the policies that already exist.
--
-- Safe because each table already HAS policies (policy_count > 0 in the
-- diagnostic) written for tenant/user scoping — turning RLS on enforces
-- them rather than locking the table. Idempotent: enabling an already-
-- enabled table is a no-op.
--
-- After running this, smoke-test the app immediately: if any legitimate
-- read/write breaks, it means that table needed one more policy — a
-- fix-forward (add the policy), never a data-loss risk.

do $$
declare
  t text;
  -- Exactly the tables the diagnostic reported as rls_enabled = false.
  core constant text[] := array[
    'billings',
    'ad_accounts',
    'invoices',
    'notifications',
    'referral_commissions',
    'subscriptions',
    'ad_account_requests',
    'advertisers',
    'exchange_rates',
    'invitations',
    'push_subscriptions',
    'referral_links',
    'tenants',
    'user_profiles',
    'companies',
    'top_ups',
    'wallet_topups',
    'wallets'
  ];
begin
  foreach t in array core loop
    if exists (
      select 1 from information_schema.tables
       where table_schema = 'public' and table_name = t
    ) then
      execute format('alter table public.%I enable row level security;', t);
      -- Also FORCE it, so even the table owner is subject to RLS
      -- (defence against a SECURITY DEFINER function that shouldn't
      -- bypass). The financial RPCs are explicitly SECURITY DEFINER
      -- and unaffected by this on their own tables.
      -- NOTE: not forcing — force can break service paths; enabling is
      -- the fix. Left as enable-only intentionally.
    end if;
  end loop;
end;
$$;

-- Verify: every core table should now read rls_enabled = t.
select c.relname as table_name, c.relrowsecurity as rls_enabled
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r'
   and c.relname = any (array[
     'billings','ad_accounts','invoices','notifications','referral_commissions',
     'subscriptions','ad_account_requests','advertisers','exchange_rates',
     'invitations','push_subscriptions','referral_links','tenants',
     'user_profiles','companies','top_ups','wallet_topups','wallets'
   ])
 order by c.relrowsecurity asc, c.relname;
