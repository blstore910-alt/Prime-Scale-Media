-- =====================================================================
-- Switched off means switched off
-- =====================================================================
-- PASTE THIS BEFORE ANYTHING ELSE TONIGHT. Two live holes, both of
-- which mean "we deactivated them" is not true on this database today.
--
-- ── 1. A DISMISSED ADMIN CAN STILL LOCK THE OWNER OUT ────────────────
--
-- 20260916100000 hardened `_is_admin_of` so a deactivated admin stops
-- being an admin, and said why. One day later 20260917120000 added a
-- NEW helper, `_psm_admin_of`, for the user_profiles UPDATE policy --
-- renamed only because create-or-replace cannot rename a parameter --
-- and copied the OLD, unchecked body into it. The hardening was never
-- carried across, and that file header says APPLIED ON LIVE
-- 2026-09-17.
--
-- So: the owner dismisses an employee admin on /admins. Their Supabase
-- session is not revoked. From the console on any page still open:
--
--     supabase.from('user_profiles')
--       .update({ is_active: false, status: 'inactive' })
--       .eq(id, THE OWNERS PROFILE ID)
--
-- user_profiles_update passes, because _psm_admin_of only asks "role =
-- admin, same tenant". _guard_user_profile_role fires only on a `role`
-- change. _guard_self_reactivation fires only when new.user_id =
-- auth.uid(). The write lands, and the owner is locked out of their own
-- company by somebody they just dismissed. The same call switches a
-- second dismissed admin back on.
--
-- ── 2. A DEACTIVATED CUSTOMER CAN RE-ADMIT THEMSELVES ────────────────
--
-- Four links, each fine on its own:
--   20260913140000  a user may self-INSERT a profile when _invited_to()
--   ...             _invited_to matches status in ('pending','accepted')
--                   -- permanently true once they have ever accepted
--   20260831240000  the role trigger returns early for 'advertiser'
--   20260913180000  _guard_self_reactivation is BEFORE UPDATE only
-- and no unique index on (user_id, tenant_id) anywhere.
--
-- /inactive renders an authenticated shell, so from its console a
-- switched-off advertiser inserts a SECOND profile for themselves with
-- is_active true, posts switchToProfile (which checks only "is it
-- yours" and "is it active" -- both now true), and the whole advertiser
-- app comes back: wallet, top-ups, ad-account requests.
--
-- ── WHAT THIS DOES ───────────────────────────────────────────────────
--
-- 1. Carries the hardening onto _psm_admin_of. Same shape as
--    _is_admin_of, deliberately, so the next person reading them sees
--    one rule twice rather than two rules.
-- 2. A BEFORE INSERT trigger on user_profiles refusing a second profile
--    for a (user_id, tenant_id) that already has one. Additive: it
--    touches no policy and no existing row, and it can be dropped in
--    one line. A trigger rather than a unique index because a unique
--    index fails outright if duplicates already exist -- the report at
--    the bottom counts them instead, so you find out rather than the
--    paste failing.
--
-- Safe to run more than once.
-- =====================================================================

set search_path = public;

-- ── 1. A deactivated admin is not an admin, in BOTH helpers ──────────
create or replace function public._psm_admin_of(p_tenant uuid)
returns boolean
language sql
stable
security definer           -- so the subquery does not recurse through this policy
set search_path = public
as $blk0$
  select exists (
    select 1
    from public.user_profiles up
    where up.user_id = auth.uid()
      and up.tenant_id = p_tenant
      and up.role = 'admin'
      -- The two lines 20260916100000 added to _is_admin_of and this
      -- copy never received. Without them "deactivated" is a label on
      -- a screen and nothing else.
      and coalesce(up.is_active, true)
      and coalesce(up.status, 'active') <> 'inactive'
  );
$blk0$;
revoke all on function public._psm_admin_of(uuid) from public, anon;
grant execute on function public._psm_admin_of(uuid) to authenticated;

-- ── 2. One profile per person per tenant ─────────────────────────────
create or replace function public._one_profile_per_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $blk1$
declare
  v_existing uuid;
begin
  if new.user_id is null or new.tenant_id is null then
    return new;
  end if;

  select up.id into v_existing
    from public.user_profiles up
   where up.user_id = new.user_id
     and up.tenant_id = new.tenant_id
   limit 1;

  if v_existing is not null then
    raise exception
      'This person already has a profile in this organisation. A second one cannot be created -- change the existing one instead.'
      using errcode = '23505';
  end if;

  return new;
end;
$blk1$;

drop trigger if exists trg_one_profile_per_tenant on public.user_profiles;
create trigger trg_one_profile_per_tenant
  before insert on public.user_profiles
  for each row execute function public._one_profile_per_tenant();

-- =====================================================================
-- The report -- the SQL editor shows only the LAST result set
-- =====================================================================
select 1 as sort,
  'dismissed admin can still write profiles' as item,
  case
    when not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'public' and p.proname = '_psm_admin_of')
      then 'FUNCTION NOT HERE - the update policy may use another name; send me it'
    when position('is_active' in pg_get_functiondef(
           'public._psm_admin_of(uuid)'::regprocedure)) > 0
      then 'CLOSED'
    else 'STILL OPEN - this paste did not land'
  end as status
union all
select 2, 'the other helper, for comparison',
  case
    when not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'public' and p.proname = '_is_admin_of')
      then 'FUNCTION NOT HERE'
    when position('is_active' in pg_get_functiondef(
           'public._is_admin_of(uuid)'::regprocedure)) > 0
      then 'CLOSED (was already)'
    else 'STILL OPEN - this one too'
  end
union all
select 3, 'which helper the UPDATE policy actually calls',
  coalesce((
    select string_agg(policyname || ' -> ' ||
             case
               when qual ilike '%_psm_admin_of%' then '_psm_admin_of'
               when qual ilike '%_is_admin_of%'  then '_is_admin_of'
               else 'neither - read the policy by hand'
             end, ' | ' order by policyname)
      from pg_policies
     where schemaname = 'public' and tablename = 'user_profiles' and cmd = 'UPDATE'
  ), 'no UPDATE policy on user_profiles')
union all
select 4, 'second-profile guard',
  case when exists (select 1 from pg_trigger
                     where tgname = 'trg_one_profile_per_tenant' and not tgisinternal)
       then 'ON' else 'NOT APPLIED' end
union all
-- If this is above 0, somebody already has two profiles in one tenant.
-- That is either a real duplicate to clean up, or the hole in 2 having
-- already been used. Either way it wants looking at BY HAND -- the
-- trigger above only stops the next one.
select 5, 'people who ALREADY hold two profiles in one tenant',
  (select count(*)::text from (
     select user_id, tenant_id from public.user_profiles
      where user_id is not null and tenant_id is not null
      group by 1, 2 having count(*) > 1) x)
union all
select 6, 'deactivated admins who still hold a live session risk',
  (select count(*)::text || ' of ' ||
          (select count(*)::text from public.user_profiles where role = 'admin')
     from public.user_profiles
    where role = 'admin'
      and (coalesce(is_active, true) = false
           or coalesce(status, 'active') = 'inactive'))
union all
-- What user_profiles.status actually holds, which no file in the repo
-- can answer -- there is no `create table user_profiles` in it. The
-- app lockout names four values; anything else here means a customer
-- is treated as active by the app and as deactivated by /inactive.
select 7, 'user_profiles.status values in use',
  coalesce((
    select string_agg(x.s || '=' || x.n::text, ' | ' order by x.n desc)
      from (select coalesce(status, '(null)') as s, count(*) as n
              from public.user_profiles group by 1) x
  ), 'none')
order by sort;
