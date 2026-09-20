-- =====================================================================
-- affiliate_application_submit — the button that could never write
-- =====================================================================
-- "Join the affiliate program" inserts a notification addressed to the
-- tenant owner. Two things made that impossible from a customer's
-- session, and both are RLS working exactly as designed:
--
--   * notifications has RLS on with notifications_select and
--     notifications_update_self and NO insert policy at all, so the
--     insert is refused with 42501; and
--   * the recipient lookup reads user_profiles, whose select policy is
--     self-or-tenant-admin — an advertiser matches neither, so the
--     lookup returns zero rows with NO error and the action reports
--     "There's nobody available to review applications right now."
--
-- Every advertiser, every time, since the button shipped.
--
-- The established pattern for this in the schema is a SECURITY DEFINER
-- function that fans out a notification (public.raise_integration_failure
-- does the same thing for integration failures). This is that, for the
-- one notification a CUSTOMER is allowed to cause.
--
-- What it will not let a caller do:
--   * write a notification to anybody but their own tenant's owner or
--     active admins — the recipients are resolved here, not passed in;
--   * put anything of their own choosing in the payload — the payload is
--     built from their own profile row;
--   * file more than one application per cooldown window;
--   * act as a profile that is not theirs.
--
-- Safe to run more than once.
-- =====================================================================

set search_path = public;

create or replace function public.affiliate_application_submit(
  p_profile_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $blk0$
declare
  v_uid         uuid := auth.uid();
  v_profile     record;
  v_adv         record;
  v_owner       uuid;
  v_recipients  uuid[] := array[]::uuid[];
  v_payload     jsonb;
  v_recent      int;
  v_cooldown    interval := interval '14 days';
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Please sign in and try again.');
  end if;

  -- The caller's own profile. p_profile_id only CHOOSES among the
  -- profiles that are already theirs — it can never name somebody
  -- else's, because user_id = v_uid is not optional.
  select p.id, p.tenant_id, p.user_id, p.full_name, p.email,
         p.is_active, p.status
    into v_profile
  from public.user_profiles p
  where p.user_id = v_uid
    and (p_profile_id is null or p.id = p_profile_id)
  order by (p.id = p_profile_id) desc nulls last
  limit 1;

  if v_profile.id is null or v_profile.tenant_id is null then
    return jsonb_build_object('ok', false, 'error', 'We could not find your account.');
  end if;
  if coalesce(v_profile.is_active, true) = false
     or coalesce(v_profile.status, 'active') = 'inactive' then
    return jsonb_build_object('ok', false, 'error', 'This account is inactive.');
  end if;

  select a.id, a.tenant_client_code
    into v_adv
  from public.advertisers a
  where a.user_id = v_uid
    and a.tenant_id = v_profile.tenant_id
  limit 1;

  -- Already an affiliate. Saying so beats filing a request an admin then
  -- has to work out is redundant.
  if v_adv.id is not null
     and exists (
       select 1 from public.referral_links rl
       where rl.affiliate_advertiser_id = v_adv.id
         and rl.status = 'active'
     ) then
    return jsonb_build_object(
      'ok', false, 'error', 'You are already on the affiliate program.'
    );
  end if;

  -- One per cooldown window. Not a rate limit against abuse — a guard
  -- against pressing twice because the first press gave nothing back,
  -- which is exactly the habit the old dead button taught.
  select count(*) into v_recent
  from public.notifications n
  where n.tenant_id = v_profile.tenant_id
    and n.type = 'affiliate_application'
    and n.created_at >= now() - v_cooldown
    and n.payload ->> 'applicant_profile_id' = v_profile.id::text;

  if v_recent > 0 then
    return jsonb_build_object('ok', true, 'already_sent', true);
  end if;

  -- ── THE OWNER, NOT EVERY ADMIN ─────────────────────────────────────
  -- Commission terms are the owner's decision and the dialog that sets
  -- them is super-admin-only, so an application in front of an employee
  -- admin is a request they cannot answer.
  select t.owner_id into v_owner
  from public.tenants t
  where t.id = v_profile.tenant_id;

  if v_owner is not null then
    select array_agg(p.user_id)
      into v_recipients
    from public.user_profiles p
    where p.tenant_id = v_profile.tenant_id
      and p.user_id = v_owner
      and coalesce(p.is_active, true) = true
      and coalesce(p.status, 'active') <> 'inactive';
  end if;

  -- Fall back to the active admins when the owner cannot be resolved or
  -- has been switched off. An application nobody receives is the exact
  -- failure this function exists to end, so it must not hang on one row.
  if v_recipients is null or array_length(v_recipients, 1) is null then
    select array_agg(distinct p.user_id)
      into v_recipients
    from public.user_profiles p
    where p.tenant_id = v_profile.tenant_id
      and p.role = 'admin'
      and coalesce(p.is_active, true) = true
      and coalesce(p.status, 'active') <> 'inactive';
  end if;

  if v_recipients is null or array_length(v_recipients, 1) is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'There is nobody available to review applications right now. Please contact us directly.'
    );
  end if;

  -- Built HERE, from the caller's own row. Nothing the caller sends
  -- reaches the payload, so an application cannot carry a crafted name
  -- into an admin's notification list.
  v_payload := jsonb_build_object(
    'applicant_profile_id', v_profile.id,
    'applicant_name', coalesce(v_profile.full_name, v_profile.email, 'An advertiser'),
    'applicant_email', v_profile.email,
    'advertiser_id', v_adv.id,
    'client_code', v_adv.tenant_client_code
  );

  insert into public.notifications
    (recipient_user_id, tenant_id, type, payload, is_read)
  select r, v_profile.tenant_id, 'affiliate_application', v_payload, false
  from unnest(v_recipients) as r;

  return jsonb_build_object('ok', true, 'already_sent', false);
end;
$blk0$;

-- ── EXECUTE IS GRANTED TO PUBLIC BY DEFAULT ──────────────────────────
-- Postgres grants EXECUTE on a new function to PUBLIC, and PostgREST
-- publishes every public function at /rest/v1/rpc/<name>. A SECURITY
-- DEFINER function left that way is callable by anyone who can reach the
-- API, signed in or not. Revoke first, then grant the one role that
-- should have it. (The function refuses a null auth.uid() as well — two
-- locks, because this one writes.)
revoke all on function public.affiliate_application_submit(uuid) from public;
revoke all on function public.affiliate_application_submit(uuid) from anon;
grant execute on function public.affiliate_application_submit(uuid) to authenticated;

comment on function public.affiliate_application_submit(uuid) is
  'A customer applies to the affiliate program. Resolves the recipients and builds the payload itself; the caller controls neither.';

-- ── The report ───────────────────────────────────────────────────────
-- The SQL editor shows only the LAST result set, so this is the one.
select
  'affiliate_application_submit' as item,
  case
    when exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'affiliate_application_submit'
        and p.prosecdef
    ) then 'OK (security definer)'
    else 'MISSING'
  end as status
union all
select
  'anon can execute it',
  case
    when has_function_privilege(
      'anon',
      'public.affiliate_application_submit(uuid)',
      'EXECUTE'
    ) then 'YES - REVOKE FAILED'
    else 'no (correct)'
  end
union all
select
  'authenticated can execute it',
  case
    when has_function_privilege(
      'authenticated',
      'public.affiliate_application_submit(uuid)',
      'EXECUTE'
    ) then 'yes (correct)'
    else 'NO - GRANT FAILED'
  end;
