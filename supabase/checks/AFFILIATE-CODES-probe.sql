-- =====================================================================
-- READ-ONLY. Nothing here writes. Run it and paste the four results back.
-- =====================================================================
-- Affiliates need their own code series, PSM-AF293 upwards. Before that
-- can be written, three things have to be read off the live database
-- rather than guessed, because the client-code machinery was authored by
-- hand there and no migration in the repo contains it:
--
--   * how an advertiser's tenant_client_code is allocated today, so the
--     affiliate series can follow the same pattern instead of inventing
--     a second one;
--   * whether user_profiles already has somewhere to put a code;
--   * how many affiliates exist, and whether any already carry one.
-- =====================================================================

-- ── 1. Who allocates tenant_client_code? ─────────────────────────────
-- Every function whose body mentions it, and whether it is attached to a
-- trigger. This is the thing to copy.
select
  p.proname                                    as function_name,
  p.prosecdef                                  as security_definer,
  (select count(*) from pg_trigger t
    where t.tgfoid = p.oid and not t.tgisinternal) as triggers_using_it,
  length(p.prosrc)                             as body_chars
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and (p.prosrc ilike '%tenant_client_code%'
     or p.prosrc ilike '%last_client_code%')
 order by triggers_using_it desc, p.proname;

-- ── 2. What shape are the codes, and where does the counter stand? ────
select
  t.initials,
  t.last_client_code,
  (select count(*) from public.advertisers a where a.tenant_id = t.id)
                                               as advertisers,
  (select min(a.tenant_client_code) from public.advertisers a
    where a.tenant_id = t.id)                  as lowest_code,
  (select max(a.tenant_client_code) from public.advertisers a
    where a.tenant_id = t.id)                  as highest_code
  from public.tenants t
 order by t.initials;

-- ── 3. Is there anywhere to PUT an affiliate code already? ────────────
-- Any column on user_profiles or affiliates whose name suggests a code.
select
  table_name,
  column_name,
  data_type,
  is_nullable
  from information_schema.columns
 where table_schema = 'public'
   and table_name in ('user_profiles', 'affiliates', 'referral_links')
   and (column_name ilike '%code%' or column_name ilike '%ref%')
 order by table_name, column_name;

-- ── 4. How many affiliates are there, and do any have a code? ─────────
-- Standalone affiliates (role = 'affiliate') have no advertisers row, so
-- they have no tenant_client_code and render with no identifier at all.
select
  up.role,
  count(*)                                              as profiles,
  count(a.id)                                           as with_advertiser_row,
  count(a.tenant_client_code)                           as with_a_code
  from public.user_profiles up
  left join public.advertisers a on a.profile_id = up.id
 where up.role in ('affiliate', 'advertiser')
 group by up.role
 order by up.role;
