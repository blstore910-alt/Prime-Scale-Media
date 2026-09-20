-- =====================================================================
-- Three SECURITY DEFINER functions handed to every signed-in user
-- =====================================================================
-- Each of these is `security definer` (so it bypasses RLS), granted
-- `execute` to `authenticated` (so any signed-in customer can call it
-- straight over /rest/v1/rpc), and checks NOTHING about who is asking.
-- Two of them take an id and act on whatever that id points at.
--
--   ensure_advertiser_and_wallet(p_profile_id uuid)
--     Reads any user_profiles row, creates the advertisers + wallets
--     rows in THAT profile's tenant, and returns both ids. An advertiser
--     in tenant B could pass a tenant-A profile id and be handed that
--     advertiser's advertiser_id and wallet_id -- the two parameters
--     nearly every money RPC takes. Profile ids are not secret: they
--     appear in audit_events.actor_profile_id and in logs.
--
--   create_subscription_from_invite(p_invite_id uuid)
--     Reads any invitation by id with no ownership, status or expiry
--     check, upserts advertiser_plans with `on conflict do update` --
--     overwriting monthly_fee, included_ad_accounts and topup_fee_pct --
--     and inserts a subscription. Replaying your own invite id (it is in
--     the JSON get_invite_by_token hands out) resets your own top-up fee
--     to the invited terms; another tenant's id writes a subscription
--     into their books.
--
--   subscription_resume_skips_paused_months(p_subscription_id uuid)
--     Walks any subscription's next_payment_date forward, up to 600
--     months, for anybody who asks. Nothing in the app calls it; it is
--     reachable only by hand, and nothing would notice.
--
-- THE FIX IS THE GRANT, NOT THE BODY. Every legitimate caller of the
-- first two is a server route, and both now use the service client
-- (accept-invite already did for one of them; the other was moved in the
-- same commit as this file). The third has no caller at all. So the
-- grant to `authenticated` is simply withdrawn.
--
-- Deliberately NOT a `create or replace` with a guard bolted on. The
-- live bodies of these functions are hand-authored and are not
-- guaranteed to match the copies in this repo -- replacing one from the
-- repo took production down earlier today. A revoke cannot do that: it
-- touches no code, and if a body on live differs from what is written
-- above, the revoke is still correct.
--
-- `service_role` keeps execute, which is what the server routes use.
-- `postgres` owns them and is unaffected either way.
--
-- WHAT BREAKS IF THIS IS WRONG: accepting an invite would fail with
-- "permission denied for function". Both call sites run as the service
-- role, so it should not -- but that is the symptom to look for, and
-- re-granting is one line.
--
-- Safe to run more than once.
-- =====================================================================

set search_path = public;

revoke execute on function public.ensure_advertiser_and_wallet(uuid)
  from public, anon, authenticated;
grant execute on function public.ensure_advertiser_and_wallet(uuid)
  to service_role;

revoke execute on function public.create_subscription_from_invite(uuid)
  from public, anon, authenticated;
grant execute on function public.create_subscription_from_invite(uuid)
  to service_role;

revoke execute on function public.subscription_resume_skips_paused_months(uuid)
  from public, anon, authenticated;
grant execute on function public.subscription_resume_skips_paused_months(uuid)
  to service_role;

-- ── The report ───────────────────────────────────────────────────────
-- The SQL editor shows only the LAST result set, so this is the one.
-- `authenticated` is every signed-in customer; it must appear for none
-- of the three.
with checked(fn) as (
  values
    ('ensure_advertiser_and_wallet'),
    ('create_subscription_from_invite'),
    ('subscription_resume_skips_paused_months')
)
select
  c.fn as item,
  case
    when not exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = c.fn
    ) then 'NOT ON THIS DATABASE - nothing to revoke'
    when has_function_privilege(
      'authenticated',
      (
        select p.oid from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = c.fn
        limit 1
      ),
      'execute'
    ) then 'STILL OPEN to every signed-in user'
    else 'OK - closed'
  end as status
from checked c
union all
select
  'service_role can still run them',
  case
    when (
      select count(*) from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in (
          'ensure_advertiser_and_wallet',
          'create_subscription_from_invite',
          'subscription_resume_skips_paused_months'
        )
        and has_function_privilege('service_role', p.oid, 'execute')
    ) >= 1 then 'OK'
    else 'CHECK - the server routes need this'
  end;
