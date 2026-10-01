-- ════════════════════════════════════════════════════════════════════
-- PLAK 196 -- een uitnodiging zonder plan is geen gratis plan (server)
-- ════════════════════════════════════════════════════════════════════
--
-- Test 4, 01-10, T4-0: uitgenodigd zonder plan (EUR 0) -> een
-- advertiser_plans-rij ZONDER plan_id. ad_account_request_create_paid
-- telde elke rij van EUR 0 als "gratis plan" (zoals NSA) en liet de
-- aanvraag door. Het scherm is in 6921ffca al rechtgezet; dit is de
-- server: een gratis plan telt alleen als er ook een plan aan hangt.
--
-- Text surgery op de live definitie, één execute. Twee keer plakken kan.

do $blk0$
declare
  v_oid oid := 'public.ad_account_request_create_paid'::regproc;
  v_def text := pg_get_functiondef(v_oid);
  v_new text;
begin
  if position('ap0.plan_id is not null' in v_def) > 0 then
    return;
  end if;
  v_new := replace(v_def,
    'coalesce(ap0.monthly_fee, 0) <= 0)',
    'coalesce(ap0.monthly_fee, 0) <= 0 and ap0.plan_id is not null)');
  if v_new = v_def then
    raise exception 'plak 196: anker niet gevonden';
  end if;
  execute v_new;
end;
$blk0$;

-- De handtekening weer dicht voor anon (create or replace geeft PUBLIC
-- execute terug).
do $blk1$
declare
  v_sig text;
begin
  select p.oid::regprocedure::text into v_sig from pg_proc p where p.proname = 'ad_account_request_create_paid' limit 1;
  execute format('revoke all on function %s from public, anon', v_sig);
  execute format('grant execute on function %s to authenticated, service_role', v_sig);
end;
$blk1$;

-- ── RAPPORT ──────────────────────────────────────────────────────────
select
  position('ap0.plan_id is not null' in pg_get_functiondef('public.ad_account_request_create_paid'::regproc)) > 0 as hersteld,
  has_function_privilege('anon', (select p.oid from pg_proc p where p.proname = 'ad_account_request_create_paid' limit 1), 'execute') as anon_mag;
