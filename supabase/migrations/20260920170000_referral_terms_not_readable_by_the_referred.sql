-- =====================================================================
-- A referred customer could read what their referrer is paid
-- =====================================================================
-- referral_links_select (20260828140000_rls_templates.sql) grants the
-- row to the advertiser on EITHER side of it:
--
--     a.id in (affiliate_advertiser_id, referred_advertiser_id)
--
-- and the row carries commission_type, commission_pct,
-- commission_onetime, commission_monthly, commission_currency,
-- earnings_eur and earnings_usd.
--
-- So any referred customer could issue
--
--     GET /rest/v1/referral_links?select=*
--
-- from their own session and read the commercial terms PSM agreed with
-- their referrer, plus that referrer's running earnings off them.
-- Nothing renders it, which is exactly why looking at screens would
-- never have found it -- the rule is "including in the JSON behind the
-- page".
--
-- The referred arm is not used by the app. The only read keyed on
-- referred_advertiser_id is components/admin/users/user-affiliates.tsx,
-- an admin screen, which matches on the admin arm. The affiliate arm IS
-- used -- useIsAffiliate counts active links by affiliate_advertiser_id
-- -- and it stays.
--
-- Safe to run more than once.
-- =====================================================================

set search_path = public;

-- ── AND IT MUST NOT READ advertisers DIRECTLY ───────────────────────
--
-- The first version of this policy did `exists (select 1 from
-- public.advertisers ...)` inline, and that took the whole app down:
--
--     infinite recursion detected in policy for relation "advertisers"
--
-- `advertisers` carries a policy of its own that reads referral_links,
-- so a policy on referral_links that reads advertisers closes a cycle,
-- and Postgres refuses EVERY read of advertisers -- which is every
-- screen, because the session profile embeds it. Reading the repo's own
-- copy of the old policy was not enough: the live one had been
-- hand-authored differently, and replacing it is what closed the loop.
--
-- A SECURITY DEFINER function reads advertisers WITHOUT RLS, so there
-- is no second policy to evaluate and no cycle. STABLE, so the planner
-- may call it once per row rather than per reference.
create or replace function public._owns_advertiser(p_advertiser_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $blk0$
  select exists (
    select 1 from public.advertisers a
     where a.id = p_advertiser_id
       and a.user_id = auth.uid()
  );
$blk0$;

revoke all on function public._owns_advertiser(uuid) from public, anon;
grant execute on function public._owns_advertiser(uuid) to authenticated;

drop policy if exists referral_links_select on public.referral_links;
create policy referral_links_select on public.referral_links
  for select using (
    -- The AFFILIATE reads their own links. The referred customer does
    -- not: what we pay somebody else for introducing them is not
    -- theirs, and "who referred me" is already on their own profile
    -- (user_profiles.referred_by) without any commercial terms on it.
    public._owns_advertiser(referral_links.affiliate_advertiser_id)
    or public._is_admin_of(tenant_id)
  );

-- ── The report ───────────────────────────────────────────────────────
-- The SQL editor shows only the LAST result set, so this is the one.
select
  'referral_links_select exists' as item,
  case
    when exists (
      select 1 from pg_policies
       where schemaname = 'public'
         and tablename = 'referral_links'
         and policyname = 'referral_links_select'
    ) then 'OK' else 'MISSING'
  end as status
union all
select
  'the referred side can no longer read it',
  case
    when position('referred_advertiser_id' in coalesce((
      select qual from pg_policies
       where schemaname = 'public'
         and tablename = 'referral_links'
         and policyname = 'referral_links_select'
       limit 1), '')) = 0
    then 'OK'
    else 'STILL THERE - a referred customer can read their referrer''s terms'
  end
union all
select
  'advertisers is readable again (no recursion)',
  case
    when (select count(*) from public.advertisers) >= 0 then 'OK'
    else 'UNREACHABLE'
  end
union all
select
  'the affiliate side still can',
  case
    when position('affiliate_advertiser_id' in coalesce((
      select qual from pg_policies
       where schemaname = 'public'
         and tablename = 'referral_links'
         and policyname = 'referral_links_select'
       limit 1), '')) > 0
    then 'OK'
    else 'BROKEN - affiliates cannot read their own links'
  end
union all
select 'referral links on file',
  coalesce((select count(*)::text from public.referral_links), '0');
