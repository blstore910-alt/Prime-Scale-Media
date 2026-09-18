-- =====================================================================
-- RONDE 5 — en deel 1 kan iedereen op internet vandaag gebruiken.
-- =====================================================================
-- Safe to run twice. Every part checks the live state first.
--
--   DEEL 1  rate_limit_check is SECURITY DEFINER, granted to `anon`,
--           and takes the bucket key from the caller. Anyone — not
--           signed in, no account — can lock a named customer out of
--           top-ups, ad-account requests and withdrawals, for the hour,
--           renewed for ever.
--   DEEL 2  A second-tenant invite attaches its plan and subscription to
--           the FIRST tenant's advertiser, so tenant A's customer is
--           billed into tenant B's books.
--   DEEL 3  Three tables that decide what a customer is charged carry no
--           audit trigger, and clawbacks were created after the loop ran.
--
-- ⚠️ AND ONE THING THAT IS NOT SQL. The cron routes now require
-- CRON_SECRET. They used to accept any request carrying an
-- `x-vercel-cron` header — a header the CALLER supplies — with the
-- service-role client and the billing run behind it. Set CRON_SECRET in
-- Vercel (Production) or the nightly billing run will not fire. Closed
-- is the right default; unset is not.
--
-- Diagnostics are at the end, where they cannot block a fix.
-- =====================================================================

set search_path = public;


-- =====================================================================
-- DEEL 1 — ANYONE CAN LOCK OUT ANY CUSTOMER.              [live, no auth]
-- =====================================================================
-- rate_limit_check(p_key, p_max_requests, p_window_seconds) is SECURITY
-- DEFINER and granted to `authenticated` AND `anon`. p_key is
-- unvalidated beyond "not empty".
--
-- The publishable anon key is in every page's JavaScript bundle, so
-- anybody can POST to /rest/v1/rpc/rate_limit_check with
--
--   {"p_key":"financial-request:user:<a customer's uuid>",
--    "p_max_requests":1,"p_window_seconds":3600}
--
-- thirty times, and that named customer cannot top up, request an ad
-- account or withdraw for the hour. Renew it hourly and they never can.
-- `signup:ip:<ip>` and `accept-invite:ip:<ip>` need no uuid at all.
--
-- Every caller in this app is SERVER-SIDE — lib/rate-limit.ts uses the
-- server client, and the anonymous routes that need it run on the server
-- too. So nothing legitimate loses anything.
do $blk1$
begin
  if to_regprocedure('public.rate_limit_check(text, integer, integer)') is null then
    raise notice 'DEEL 1: rate_limit_check not found with that signature.';
    return;
  end if;

  revoke execute on function public.rate_limit_check(text, integer, integer)
    from public, anon, authenticated;
  grant execute on function public.rate_limit_check(text, integer, integer)
    to service_role;

  raise notice 'DEEL 1: rate limiting is server-side only now.';
end;
$blk1$;

-- Read back: `anon` and `authenticated` must NOT appear.
select
  p.proname,
  coalesce(
    array_to_string(
      array(
        select distinct a.grantee
          from information_schema.routine_privileges a
         where a.specific_schema = 'public'
           and a.routine_name = p.proname
      ), ', '),
    '(none)')                              as granted_to
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'rate_limit_check';


-- =====================================================================
-- DEEL 2 — A SECOND-TENANT INVITE BILLS THE FIRST TENANT'S CUSTOMER.
-- =====================================================================
-- create_subscription_from_invite resolves the caller's advertiser as
--
--   select * into v_adv from public.advertisers where user_id = v_uid limit 1;
--
-- with no tenant filter and no ordering. The branch four lines above it,
-- for the service-role path, DOES filter on the invite's tenant — the
-- author knew.
--
-- The same email in two tenants is the app's designed model (there is a
-- profile switcher, and a redirect loop was fixed this morning for
-- exactly those people). So: somebody is already an advertiser in tenant
-- A; tenant B invites them with a plan; they accept. The accept route
-- correctly creates tenant B's advertiser and wallet — and then this RPC
-- picks tenant A's row. advertiser_plans is upserted onto tenant A's
-- advertiser carrying tenant B's fees, and the subscription is written
-- with tenant A's advertiser_id and tenant B's tenant_id.
--
-- From the next billing run, tenant A's customer is charged into tenant
-- B's books and their wallet is auto-debited; every top-up they make is
-- then priced from tenant B's plan. Tenant B's actual new advertiser
-- gets no plan at all, so their Request button never works.
do $blk2$
declare
  v_src text;
  v_new text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'create_subscription_from_invite'
   limit 1;

  if v_src is null then
    raise notice 'DEEL 2: create_subscription_from_invite not found.';
    return;
  end if;
  if position('a.tenant_id = v_inv.tenant_id' in v_src) > 0
     and position('where user_id = v_uid limit 1' in v_src) = 0 then
    raise notice 'DEEL 2: already tenant-scoped - no change.';
    return;
  end if;
  if position('where user_id = v_uid limit 1' in v_src) = 0 then
    raise notice 'DEEL 2: the lookup is written differently - fix by hand.';
    return;
  end if;

  v_new := replace(
    v_src,
    'where user_id = v_uid limit 1',
    'where user_id = v_uid and tenant_id = v_inv.tenant_id order by created_at desc limit 1'
  );

  if v_new = v_src then
    raise exception 'DEEL 2: replace matched nothing - do not assume this ran.';
  end if;

  execute v_new;
  raise notice 'DEEL 2: an invite can only attach to an advertiser in its own tenant.';
end;
$blk2$;

select
  (select position('tenant_id = v_inv.tenant_id order by' in pg_get_functiondef(p.oid)) > 0
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.proname='create_subscription_from_invite')
                                           as invite_is_tenant_scoped;


-- =====================================================================
-- DEEL 3 — THE TABLES THAT DECIDE WHAT A CUSTOMER PAYS ARE UNAUDITED.
-- =====================================================================
-- CLAUDE.md's rule is that every business change is reconstructable from
-- audit_events. Three of the tables that most decide what somebody is
-- charged are not in the audited list: advertiser_plans (their rate),
-- advertiser_perks (waivers and discounts) and tax_rates.
--
-- referral_clawbacks IS in the list, but it was created three weeks
-- after the loop ran and the loop's own `if exists` guard skipped it
-- silently — so clawbacks, which take money back off an affiliate, leave
-- no audit row at all.
--
-- This matters beyond bookkeeping: granting a topup_fee_waiver sets the
-- rate to zero unconditionally, and grantPerk is gated on ANY active
-- admin — so an employee refused at the owner-only verify floor can
-- reach the same outcome through a perk, permanently, with nothing
-- naming who did it.
do $blk3$
declare
  v_tbl text;
begin
  if to_regprocedure('public._audit_row_change()') is null then
    raise notice 'DEEL 3: _audit_row_change not found.';
    return;
  end if;

  foreach v_tbl in array array[
    'advertiser_plans',
    'advertiser_perks',
    'tax_rates',
    'referral_clawbacks',
    'referral_links',
    'referral_commissions'
  ] loop
    if to_regclass('public.' || v_tbl) is null then
      raise notice 'DEEL 3: % does not exist here.', v_tbl;
      continue;
    end if;

    execute format(
      'drop trigger if exists trg_audit_%I on public.%I', v_tbl, v_tbl);
    execute format(
      'create trigger trg_audit_%I after insert or update or delete on public.%I
         for each row execute function public._audit_row_change()',
      v_tbl, v_tbl);
    raise notice 'DEEL 3: % is audited.', v_tbl;
  end loop;
end;
$blk3$;

select
  c.relname                                as table_name,
  exists (
    select 1 from pg_trigger t
     where t.tgrelid = c.oid
       and t.tgname = 'trg_audit_' || c.relname
  )                                        as audited
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relname in ('advertiser_plans','advertiser_perks','tax_rates',
                     'referral_clawbacks','referral_links',
                     'referral_commissions')
 order by c.relname;


-- =====================================================================
-- ALLES IN ÉÉN RIJ
-- =====================================================================
select
  not exists (
    select 1 from information_schema.routine_privileges
     where specific_schema = 'public'
       and routine_name = 'rate_limit_check'
       and grantee in ('anon', 'authenticated')
  )                                                 as a_rate_limit_closed,
  (select position('tenant_id = v_inv.tenant_id order by' in pg_get_functiondef(p.oid)) > 0
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='create_subscription_from_invite')
                                                    as b_invite_scoped,
  (select count(*) from pg_trigger t
     join pg_class c on c.oid = t.tgrelid
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname='public'
      and t.tgname like 'trg_audit_%'
      and c.relname in ('advertiser_plans','advertiser_perks','tax_rates',
                        'referral_clawbacks'))      as c_newly_audited_of_4;


-- =====================================================================
-- WAT ER TE ZIEN IS — alleen lezen, na alle wijzigingen
-- =====================================================================

-- ── People who hold an advertiser row in more than one tenant ────────
-- These are the ones DEEL 2 protects. Not a fault by itself — the app is
-- built for it — but each one was a chance for the wrong row to win.
select
  up.user_id,
  count(distinct a.tenant_id)              as tenants,
  string_agg(distinct t.initials, ', ')    as which
  from public.advertisers a
  join public.user_profiles up on up.user_id = a.user_id
  join public.tenants t on t.id = a.tenant_id
 group by up.user_id
having count(distinct a.tenant_id) > 1;

-- ── Subscriptions whose tenant does not match their advertiser's ─────
-- If DEEL 2 has already bitten, the row is here. Each one is a customer
-- being billed into the wrong tenant's books.
select
  s.id                                     as subscription_id,
  s.amount,
  s.currency,
  s.status,
  ts.initials                              as subscription_tenant,
  ta.initials                              as advertiser_tenant,
  a.tenant_client_code                     as client
  from public.subscriptions s
  join public.advertisers a on a.id = s.advertiser_id
  left join public.tenants ts on ts.id = s.tenant_id
  left join public.tenants ta on ta.id = a.tenant_id
 where s.tenant_id is distinct from a.tenant_id;

-- ── Fee waivers currently in force, and who granted them ─────────────
-- A waiver sets the top-up fee to zero for as long as it lives. Worth
-- reading once now, because until DEEL 3 landed nothing recorded who
-- created one.
select
  a.tenant_client_code                     as client,
  p.kind,
  p.amount,
  p.starts_at::date                        as from_date,
  p.expires_at::date                       as until,
  p.created_at::date                       as granted
  from public.advertiser_perks p
  left join public.advertisers a on a.id = p.advertiser_id
 where coalesce(p.active, true)
   and p.kind in ('topup_fee_waiver', 'topup_discount', 'subscription_waiver')
 order by p.created_at desc;
