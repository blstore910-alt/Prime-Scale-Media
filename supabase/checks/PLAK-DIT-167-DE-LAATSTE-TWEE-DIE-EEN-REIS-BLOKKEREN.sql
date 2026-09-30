-- ════════════════════════════════════════════════════════════════════
-- PLAK 167 — DE LAATSTE TWEE DIE EEN REIS BLOKKEREN
-- ════════════════════════════════════════════════════════════════════
--
-- Derde en laatste vervolg op 165. En de reden dat er een derde nodig
-- is, is opnieuw mijn eigen sweep.
--
-- ── DRIE SPELLINGEN, DRIE KEER HALF GEVONDEN ──────────────────────
--
-- Dezelfde toets staat in deze database op drie manieren:
--
--   1.  owner_id = auth.uid()                 <- plak 165 zocht hierop
--   2.  select owner_id into v_owner ...
--       if v_owner = v_uid                    <- plak 166
--   3.  if v_owner <> v_uid                   <- DEZE
--
-- De derde is een ONTKENDE vergelijking, en mijn patroon zocht op `=`.
-- Opnieuw geteld met een patroon dat de operator niet uitmaakt
-- (`=`, `<>`, `!=`, `is distinct from`): dertien over.
--
-- Dat is drie sweeps op dezelfde foutsoort die alle drie te krap
-- waren. Daarom zet deze plak er ook een TELLER op -- zie onderaan --
-- zodat een vierde spelling meteen opvalt in plaats van pas als
-- iemand op een knop drukt.
--
-- ── WAT DEZE TWEE KOSTEN, GEMETEN ─────────────────────────────────
--
-- Als Lasse, vanmiddag op productie:
--
--   advertiser_plan_set
--       Een abonnement aanmaken lukte, maar het scherm zei
--       "Created, but not complete -- The plan's included accounts
--       and top-up rate were not saved onto this customer: Alleen de
--       eigenaar zet een plan op een klant". De klant heeft dan een
--       abonnement zonder zijn eigen inbegrepen accounts en zonder
--       zijn eigen opwaardeerfee.
--
--   affiliate_payout_min_set
--       De uitbetaaldrempel per affiliate verlagen. Dat is stap 4 van
--       reis 7 en zonder die stap is de reis niet af te maken zonder
--       EUR 200 echte commissie op te bouwen.
--
-- ── WAT ER BLIJFT STAAN, EN WAAROM ────────────────────────────────
--
-- Elf. Geen daarvan zit op een van de acht reizen:
--
-- * `account_deletion_decide`, `account_deletion_request_submit` --
--   GDPR-verwijdering. Dat is de zwaarste knop die er is en de
--   ondergrens "alleen de hoofdeigenaar" is daar verdedigbaar.
-- * `fee_change_request`, `fee_change_decide` -- de fee-wijzigingsweg.
-- * `referral_link_assign`, `referral_commission_recalculate`,
--   `set_finance_reviewer` -- inrichting.
-- * `_guard_admin_status_is_owners`, `_guard_self_reactivation`,
--   `_notify_referral_pending`, `_top_ups_insert_fee_floor` --
--   TRIGGERS waar de eigenaarstoets een UITZONDERING geeft (onder de
--   fee-bodem mogen, jezelf weer aanzetten). Verbreden geeft de
--   tweede eigenaar een bevoegdheid erbij, en dat is een besluit van
--   de eigenaar.
--
-- Twee blokken, EEN `execute` per functie, allebei met een revoke, en
-- allebei weigeren ze als hun patroon niet matcht. De oude toets
-- blijft staan met de ownerset ernaast, dus niemand die er nu langs
-- komt raakt buitengesloten.
-- ════════════════════════════════════════════════════════════════════

select set_config(
  'request.headers',
  json_build_object('x-psm-actor',
                    '8bd9b91b-c07b-4aae-9bd5-2aff773ab082')::text,
  true);

-- ── 1. advertiser_plan_set — het plan op de klant ────────────────
do $blk1$
declare v_oid oid; v_def text; v_new text;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'advertiser_plan_set' limit 1;
  if v_oid is null then raise notice 'advertiser_plan_set bestaat niet'; return; end if;
  v_def := pg_get_functiondef(v_oid);
  if v_def ilike '%_in_owner_set%' then
    raise notice 'advertiser_plan_set kent de ownerset al'; return;
  end if;
  v_new := regexp_replace(
    v_def,
    'if[[:space:]]+v_owner[[:space:]]+is[[:space:]]+null[[:space:]]+or[[:space:]]+v_owner[[:space:]]*<>[[:space:]]*v_uid[[:space:]]+then',
    'if not ((v_owner is not null and v_owner = v_uid)'
    || ' or public._in_owner_set(v_prof.tenant_id, v_uid)) then',
    'g');
  if v_new = v_def then
    raise exception 'advertiser_plan_set: patroon matchte niet -- NIET gewijzigd';
  end if;
  execute v_new;
end
$blk1$;
revoke all on function public.advertiser_plan_set(uuid, uuid) from public, anon;
grant execute on function public.advertiser_plan_set(uuid, uuid) to authenticated, service_role;

-- ── 2. affiliate_payout_min_set — stap 4 van reis 7 ──────────────
do $blk2$
declare v_oid oid; v_def text; v_new text;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'affiliate_payout_min_set' limit 1;
  if v_oid is null then raise notice 'affiliate_payout_min_set bestaat niet'; return; end if;
  v_def := pg_get_functiondef(v_oid);
  if v_def ilike '%_in_owner_set%' then
    raise notice 'affiliate_payout_min_set kent de ownerset al'; return;
  end if;
  v_new := regexp_replace(
    v_def,
    'if[[:space:]]+v_owner[[:space:]]+is[[:space:]]+null[[:space:]]+or[[:space:]]+v_owner[[:space:]]*<>[[:space:]]*v_uid[[:space:]]+then',
    'if not ((v_owner is not null and v_owner = v_uid)'
    || ' or public._in_owner_set(v_tenant, v_uid)) then',
    'g');
  if v_new = v_def then
    raise exception 'affiliate_payout_min_set: patroon matchte niet -- NIET gewijzigd';
  end if;
  execute v_new;
end
$blk2$;
revoke all on function public.affiliate_payout_min_set(uuid, numeric) from public, anon;
grant execute on function public.affiliate_payout_min_set(uuid, numeric) to authenticated, service_role;

-- ── HET RAPPORT, HELEMAAL ONDERAAN ─────────────────────────────────
-- `omgezet` hoort 2 te zijn, `anon_mag` 0, en `nog_oud` **11** -- dat
-- getal staat vanaf nu ook in `npm run ochtend`, zodat een vierde
-- spelling meteen opvalt in plaats van pas bij een knopdruk.
select
  'plak 167 geplaatst'                                             as wat,
  (select count(*)::text from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public'
      and p.proname in ('advertiser_plan_set','affiliate_payout_min_set')
      and pg_get_functiondef(p.oid) ilike '%_in_owner_set%')       as omgezet,
  (select count(*)::text from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public'
      and p.proname in ('advertiser_plan_set','affiliate_payout_min_set')
      and has_function_privilege('anon', p.oid, 'execute'))        as anon_mag,
  (select count(*)::text from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.prokind = 'f'
      and pg_get_functiondef(p.oid) ~* '(owner_id|v_owner)[[:space:]]*(=|<>|!=|is distinct from|is not distinct from)[[:space:]]*(auth\.uid\(\)|v_uid)'
      and pg_get_functiondef(p.oid) !~* '_in_owner_set')           as nog_oud_hoort_11;
