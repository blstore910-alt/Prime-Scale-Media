-- ════════════════════════════════════════════════════════════════════
-- PLAK 188 -- het affiliateprogramma aan/uit per plan of community
-- ════════════════════════════════════════════════════════════════════
--
-- De eigenaar, 01-10: "affiliate programma aan/uit per community met
-- een knop".
--
--   plans.affiliate_enabled   standaard aan. Uit = klanten op dit plan
--                             zien geen "Earn" en geen aanmeldknop.
--   affiliate_application_submit
--                             weigert de aanmelding als het plan van de
--                             klant het programma uit heeft. Wie al
--                             affiliate IS, houdt het.
--
-- Twee keer plakken kan.

do $blk0$
begin
  alter table public.plans add column if not exists affiliate_enabled boolean not null default true;
end;
$blk0$;

-- De weigering, vlak voor "set affiliate_status = 'applied'". Text surgery
-- op de live definitie: een execute, alleen als hij er nog niet in zit.
do $blk1$
declare
  v_oid oid := 'public.affiliate_application_submit(uuid)'::regprocedure;
  v_def text := pg_get_functiondef(v_oid);
  v_new text;
begin
  if position('affiliate_enabled' in v_def) > 0 then
    return;
  end if;
  v_new := regexp_replace(
    v_def,
    '(update public\.advertisers[[:space:]]+set affiliate_status = ''applied'')',
    '-- Plak 188: het programma staat uit op het plan van deze klant.' || chr(10) ||
    '  if v_adv.id is not null and exists (' || chr(10) ||
    '    select 1 from public.advertiser_plans ap join public.plans pl on pl.id = ap.plan_id' || chr(10) ||
    '     where ap.advertiser_id = v_adv.id and pl.affiliate_enabled = false' || chr(10) ||
    '  ) then' || chr(10) ||
    '    return jsonb_build_object(''ok'', false, ''error'', ''The affiliate program is not available on your plan.'');' || chr(10) ||
    '  end if;' || chr(10) || chr(10) || '  \1'
  );
  if v_new = v_def then
    raise exception 'plak 188: anker "update public.advertisers set affiliate_status" niet gevonden';
  end if;
  execute v_new;
end;
$blk1$;

revoke all on function public.affiliate_application_submit(uuid) from public, anon;
grant execute on function public.affiliate_application_submit(uuid) to authenticated, service_role;

-- ── RAPPORT ──────────────────────────────────────────────────────────
select 'plans.affiliate_enabled' as wat,
       (select count(*) from information_schema.columns
         where table_schema = 'public' and table_name = 'plans' and column_name = 'affiliate_enabled')::text as uitkomst
union all
select 'aanmelding weigert bij uit',
       (position('affiliate_enabled' in pg_get_functiondef('public.affiliate_application_submit(uuid)'::regprocedure)) > 0)::text
union all
select 'anon mag niet',
       has_function_privilege('anon', 'public.affiliate_application_submit(uuid)', 'execute')::text
union all
select 'plannen met programma aan',
       (select count(*) filter (where affiliate_enabled) || ' van ' || count(*) from public.plans);
