-- ════════════════════════════════════════════════════════════════════
-- PLAK 165 — DE TWEEDE EIGENAAR MAG OOK BESLISSEN
-- ════════════════════════════════════════════════════════════════════
--
-- Gevonden tijdens test 3, reis 8, door de knop echt in te drukken.
--
-- ── WAT ER GEBEURDE ───────────────────────────────────────────────
--
-- Als Lasse (contact@primescalemedia.com) een affiliate-aanvraag
-- geweigerd: reden ingevuld, "Yes, refuse" ingedrukt, en het scherm
-- antwoordde
--
--   "Couldn't save that -- Only the account owner can decide this"
--
-- De aanvraag bleef staan. De app deed hier niets fout: hij zei
-- eerlijk wat er mis was. Maar Lasse IS eigenaar -- hij staat in
-- `tenant_owners` voor Prime Scale Media, naast Bart.
--
-- ── WAAROM HIJ TOCH GEWEIGERD WORDT ───────────────────────────────
--
-- Er zijn twee manieren waarop deze database "is dit de eigenaar?"
-- vraagt, en ze geven een ander antwoord:
--
--   public._in_owner_set(tenant, user)   -- staat in `tenant_owners`
--                                           OF is `tenants.owner_id`
--   t.owner_id = auth.uid()              -- alleen `tenants.owner_id`
--
-- De eerste is de bedoelde: eigenaarschap is een VERZAMELING, en
-- veertien RLS-policies leunen er al op. De tweede is de oude, en
-- `tenants.owner_id` is alleen Bart.
--
-- Gemeten: **dertien** functies toetsen nog op de oude manier en
-- **geen enkele** gebruikt de helper.
--
-- ── WAT DEZE PLAK DOET, EN WAT NIET ───────────────────────────────
--
-- Zeven BESLISSINGSfuncties gaan over op de helper -- de knoppen waar
-- een tweede eigenaar op moet kunnen drukken:
--
--   affiliate_application_decide   iemand wil affiliate worden
--   affiliate_upgrade_decide       een affiliate wil ook adverteren
--   referral_link_decide           een referral goed- of afkeuren
--   wallet_adjustment_approve      correctie op een wallet
--   wallet_adjustment_reject
--   wallet_refund_approve          geld terug naar een wallet
--   wallet_refund_reject
--
-- NIET aangeraakt, met opzet:
--
-- * `referral_link_assign`, `referral_commission_recalculate` en
--   `set_finance_reviewer` -- inrichting en bevoegdheden, geen
--   dagelijkse wachtrij. Kan alsnog, maar hoeft niet voor de acht
--   reizen.
-- * `_guard_self_reactivation`, `_notify_referral_pending` en
--   `_top_ups_insert_fee_floor` -- dat zijn TRIGGERS waar de
--   eigenaarstoets een UITZONDERING geeft (onder de fee-bodem mogen,
--   jezelf weer aanzetten). Die verbreden is een beleidsbesluit en
--   dus van de eigenaar, niet van mij.
--
-- ── HOE ────────────────────────────────────────────────────────────
--
-- Zeven losse blokken, EEN `execute` per functie -- de huisregel na
-- plak 124. Elk blok:
--
--   * slaat over als de functie de helper al gebruikt (opnieuw
--     draaien kan dus geen kwaad);
--   * WEIGERT met een exception als zijn patroon niet matcht, in
--     plaats van te gokken;
--   * zet er de revoke/grant achteraan, want Postgres geeft EXECUTE
--     aan PUBLIC op een net vervangen functie en PUBLIC bevat `anon`.
--
-- `pg_get_functiondef` geeft op deze database CRLF terug, dus alle
-- patronen matchen op `[[:space:]]` en niet op een spatie.
-- ════════════════════════════════════════════════════════════════════

-- De naam op de auditregel. In de SQL-editor is auth.uid() leeg.
select set_config(
  'request.headers',
  json_build_object('x-psm-actor',
                    '8bd9b91b-c07b-4aae-9bd5-2aff773ab082')::text,
  true);

-- ── 1. affiliate_application_decide ───────────────────────────────
do $blk1$
declare v_oid oid; v_def text; v_new text;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'affiliate_application_decide' limit 1;
  if v_oid is null then raise notice 'affiliate_application_decide bestaat niet'; return; end if;
  v_def := pg_get_functiondef(v_oid);
  if v_def ilike '%_in_owner_set%' then
    raise notice 'affiliate_application_decide gebruikt de helper al'; return;
  end if;
  v_new := regexp_replace(
    v_def,
    'where[[:space:]]+t\.id[[:space:]]*=[[:space:]]*v_adv\.tenant_id[[:space:]]+and[[:space:]]+t\.owner_id[[:space:]]*=[[:space:]]*auth\.uid\(\)',
    'where t.id = v_adv.tenant_id and public._in_owner_set(t.id, auth.uid())',
    'g');
  if v_new = v_def then
    raise exception 'affiliate_application_decide: patroon matchte niet -- NIET gewijzigd';
  end if;
  execute v_new;
end
$blk1$;
revoke all on function public.affiliate_application_decide(uuid, boolean, text) from public, anon;
grant execute on function public.affiliate_application_decide(uuid, boolean, text) to authenticated, service_role;

-- ── 2. affiliate_upgrade_decide ───────────────────────────────────
do $blk2$
declare v_oid oid; v_def text; v_new text;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'affiliate_upgrade_decide' limit 1;
  if v_oid is null then raise notice 'affiliate_upgrade_decide bestaat niet'; return; end if;
  v_def := pg_get_functiondef(v_oid);
  if v_def ilike '%_in_owner_set%' then
    raise notice 'affiliate_upgrade_decide gebruikt de helper al'; return;
  end if;
  v_new := regexp_replace(
    v_def,
    'where[[:space:]]+t\.id[[:space:]]*=[[:space:]]*v_adv\.tenant_id[[:space:]]+and[[:space:]]+t\.owner_id[[:space:]]*=[[:space:]]*auth\.uid\(\)',
    'where t.id = v_adv.tenant_id and public._in_owner_set(t.id, auth.uid())',
    'g');
  if v_new = v_def then
    raise exception 'affiliate_upgrade_decide: patroon matchte niet -- NIET gewijzigd';
  end if;
  execute v_new;
end
$blk2$;
revoke all on function public.affiliate_upgrade_decide(uuid, boolean, text) from public, anon;
grant execute on function public.affiliate_upgrade_decide(uuid, boolean, text) to authenticated, service_role;

-- ── 3. referral_link_decide ───────────────────────────────────────
do $blk3$
declare v_oid oid; v_def text; v_new text;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'referral_link_decide' limit 1;
  if v_oid is null then raise notice 'referral_link_decide bestaat niet'; return; end if;
  v_def := pg_get_functiondef(v_oid);
  if v_def ilike '%_in_owner_set%' then
    raise notice 'referral_link_decide gebruikt de helper al'; return;
  end if;
  v_new := regexp_replace(
    v_def,
    'where[[:space:]]+t\.id[[:space:]]*=[[:space:]]*v_link\.tenant_id[[:space:]]+and[[:space:]]+t\.owner_id[[:space:]]*=[[:space:]]*auth\.uid\(\)',
    'where t.id = v_link.tenant_id and public._in_owner_set(t.id, auth.uid())',
    'g');
  if v_new = v_def then
    raise exception 'referral_link_decide: patroon matchte niet -- NIET gewijzigd';
  end if;
  execute v_new;
end
$blk3$;
revoke all on function public.referral_link_decide(uuid, boolean, text) from public, anon;
grant execute on function public.referral_link_decide(uuid, boolean, text) to authenticated, service_role;

-- ── 4. wallet_adjustment_approve ──────────────────────────────────
do $blk4$
declare v_oid oid; v_def text; v_new text;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'wallet_adjustment_approve' limit 1;
  if v_oid is null then raise notice 'wallet_adjustment_approve bestaat niet'; return; end if;
  v_def := pg_get_functiondef(v_oid);
  if v_def ilike '%_in_owner_set%' then
    raise notice 'wallet_adjustment_approve gebruikt de helper al'; return;
  end if;
  v_new := regexp_replace(
    v_def,
    'where[[:space:]]+id[[:space:]]*=[[:space:]]*v_admin\.tenant_id[[:space:]]+and[[:space:]]+owner_id[[:space:]]*=[[:space:]]*auth\.uid\(\)',
    'where id = v_admin.tenant_id and public._in_owner_set(id, auth.uid())',
    'g');
  if v_new = v_def then
    raise exception 'wallet_adjustment_approve: patroon matchte niet -- NIET gewijzigd';
  end if;
  execute v_new;
end
$blk4$;
revoke all on function public.wallet_adjustment_approve(uuid) from public, anon;
grant execute on function public.wallet_adjustment_approve(uuid) to authenticated, service_role;

-- ── 5. wallet_adjustment_reject ───────────────────────────────────
do $blk5$
declare v_oid oid; v_def text; v_new text;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'wallet_adjustment_reject' limit 1;
  if v_oid is null then raise notice 'wallet_adjustment_reject bestaat niet'; return; end if;
  v_def := pg_get_functiondef(v_oid);
  if v_def ilike '%_in_owner_set%' then
    raise notice 'wallet_adjustment_reject gebruikt de helper al'; return;
  end if;
  v_new := regexp_replace(
    v_def,
    'where[[:space:]]+id[[:space:]]*=[[:space:]]*v_admin\.tenant_id[[:space:]]+and[[:space:]]+owner_id[[:space:]]*=[[:space:]]*auth\.uid\(\)',
    'where id = v_admin.tenant_id and public._in_owner_set(id, auth.uid())',
    'g');
  if v_new = v_def then
    raise exception 'wallet_adjustment_reject: patroon matchte niet -- NIET gewijzigd';
  end if;
  execute v_new;
end
$blk5$;
revoke all on function public.wallet_adjustment_reject(uuid, text) from public, anon;
grant execute on function public.wallet_adjustment_reject(uuid, text) to authenticated, service_role;

-- ── 6. wallet_refund_approve ──────────────────────────────────────
do $blk6$
declare v_oid oid; v_def text; v_new text;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'wallet_refund_approve' limit 1;
  if v_oid is null then raise notice 'wallet_refund_approve bestaat niet'; return; end if;
  v_def := pg_get_functiondef(v_oid);
  if v_def ilike '%_in_owner_set%' then
    raise notice 'wallet_refund_approve gebruikt de helper al'; return;
  end if;
  v_new := regexp_replace(
    v_def,
    'where[[:space:]]+id[[:space:]]*=[[:space:]]*v_admin\.tenant_id[[:space:]]+and[[:space:]]+owner_id[[:space:]]*=[[:space:]]*auth\.uid\(\)',
    'where id = v_admin.tenant_id and public._in_owner_set(id, auth.uid())',
    'g');
  if v_new = v_def then
    raise exception 'wallet_refund_approve: patroon matchte niet -- NIET gewijzigd';
  end if;
  execute v_new;
end
$blk6$;
revoke all on function public.wallet_refund_approve(uuid) from public, anon;
grant execute on function public.wallet_refund_approve(uuid) to authenticated, service_role;

-- ── 7. wallet_refund_reject ───────────────────────────────────────
do $blk7$
declare v_oid oid; v_def text; v_new text;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'wallet_refund_reject' limit 1;
  if v_oid is null then raise notice 'wallet_refund_reject bestaat niet'; return; end if;
  v_def := pg_get_functiondef(v_oid);
  if v_def ilike '%_in_owner_set%' then
    raise notice 'wallet_refund_reject gebruikt de helper al'; return;
  end if;
  v_new := regexp_replace(
    v_def,
    'where[[:space:]]+id[[:space:]]*=[[:space:]]*v_admin\.tenant_id[[:space:]]+and[[:space:]]+owner_id[[:space:]]*=[[:space:]]*auth\.uid\(\)',
    'where id = v_admin.tenant_id and public._in_owner_set(id, auth.uid())',
    'g');
  if v_new = v_def then
    raise exception 'wallet_refund_reject: patroon matchte niet -- NIET gewijzigd';
  end if;
  execute v_new;
end
$blk7$;
revoke all on function public.wallet_refund_reject(uuid, text) from public, anon;
grant execute on function public.wallet_refund_reject(uuid, text) to authenticated, service_role;

-- ── HET RAPPORT, HELEMAAL ONDERAAN ─────────────────────────────────
-- `om_te_zetten` hoort 7 te zijn en `nog_oud` 0.
-- `anon_mag_iets` MOET 0 zijn.
select
  'plak 165 geplaatst'                                              as wat,
  (select count(*)::text from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public'
      and p.proname in ('affiliate_application_decide','affiliate_upgrade_decide',
                        'referral_link_decide','wallet_adjustment_approve',
                        'wallet_adjustment_reject','wallet_refund_approve','wallet_refund_reject')
      and pg_get_functiondef(p.oid) ilike '%_in_owner_set%')        as om_te_zetten,
  (select count(*)::text from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public'
      and p.proname in ('affiliate_application_decide','affiliate_upgrade_decide',
                        'referral_link_decide','wallet_adjustment_approve',
                        'wallet_adjustment_reject','wallet_refund_approve','wallet_refund_reject')
      and pg_get_functiondef(p.oid) !~* '_in_owner_set')            as nog_oud,
  (select count(*)::text from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public'
      and p.proname in ('affiliate_application_decide','affiliate_upgrade_decide',
                        'referral_link_decide','wallet_adjustment_approve',
                        'wallet_adjustment_reject','wallet_refund_approve','wallet_refund_reject')
      and has_function_privilege('anon', p.oid, 'execute'))         as anon_mag_iets,
  (select count(*)::text from public.tenant_owners o
     join public.tenants t on t.id = o.tenant_id
    where t.name ilike '%prime%')                                   as eigenaren_prime_scale;
