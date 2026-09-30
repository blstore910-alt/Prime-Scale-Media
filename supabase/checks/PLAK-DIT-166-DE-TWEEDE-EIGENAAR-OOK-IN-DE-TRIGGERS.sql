-- ════════════════════════════════════════════════════════════════════
-- PLAK 166 — DE TWEEDE EIGENAAR, OOK IN DE TRIGGERS
-- ════════════════════════════════════════════════════════════════════
--
-- Vervolg op plak 165, en de reden dat er een vervolg nodig is, is een
-- fout in MIJN sweep.
--
-- ── WAT ER MIS WAS MET DE VORIGE TELLING ──────────────────────────
--
-- Plak 165 zocht naar functies met letterlijk
--
--   owner_id = auth.uid()
--
-- en vond er dertien. Maar de helft van deze database schrijft het
-- anders op:
--
--   select t.owner_id into v_owner from public.tenants t where ...;
--   if v_owner is not null and v_owner = v_uid then
--
-- De LEES bevat `owner_id` maar geen vergelijking, en de VERGELIJKING
-- bevat geen `owner_id`. Allebei de helften glipten los langs het
-- patroon. Exact dezelfde blinde vlek zat in
-- `tests/lib/one-owner-check.test.ts` aan de TypeScript-kant, waar
-- `const ownerId = ...` hem uitschakelde -- daar vandaag ook
-- rechtgezet.
--
-- Opnieuw geteld, nu op allebei de vormen: **twaalf** functies toetsen
-- nog op de oude manier.
--
-- ── WAT DIT KOSTTE, VANDAAG, GEMETEN ──────────────────────────────
--
-- Als Lasse (staat in `tenant_owners`, staat NIET in
-- `tenants.owner_id`):
--
--   "Only the super-admin can start or remove a subscription."
--       -> een abonnement aanmaken lukt niet
--
-- En de volgende die hij tegen zou komen:
--
--   "Only the owner settles payouts"
--       -> een affiliate-uitbetaling beslissen lukt niet
--
-- Dat laatste is de LAATSTE stap van reis 7.
--
-- ── WAT DEZE PLAK DOET ────────────────────────────────────────────
--
--   affiliate_payout_decide            een uitbetaling beslissen
--   _subscription_rows_are_the_owners  een abonnement starten/stoppen
--   _money_columns_are_the_owners      wat een klant per maand betaalt
--   _fee_is_the_owners                 de fee op een ad-account
--
-- De oude toets blijft staan en de ownerset komt ERNAAST met een `or`.
-- Daarmee kan deze plak niemand buitensluiten die er nu langs komt:
-- hij laat er alleen iemand bij. En als `tenant_owners` ooit
-- onleesbaar is, valt hij terug op precies het gedrag van vandaag.
--
-- NIET aangeraakt, met opzet -- dat blijven de acht van
-- docs/NEXT_SESSION_FIRST.md:
--
-- * `referral_link_assign`, `referral_commission_recalculate`,
--   `set_finance_reviewer`, `account_deletion_decide`,
--   `account_deletion_request_submit` -- inrichting en GDPR, geen
--   dagelijkse wachtrij;
-- * `_guard_self_reactivation`, `_notify_referral_pending`,
--   `_top_ups_insert_fee_floor` -- daar geeft de eigenaarstoets een
--   UITZONDERING (onder de fee-bodem mogen, jezelf weer aanzetten).
--   Die verbreden geeft de tweede eigenaar een bevoegdheid erbij, en
--   dat is een besluit van de eigenaar, niet van mij.
--
-- Vier blokken, EEN `execute` per functie (huisregel na plak 124), elk
-- met een revoke erachter, en elk weigert als zijn patroon niet matcht.
-- `pg_get_functiondef` geeft CRLF, dus alles matcht op `[[:space:]]`.
-- ════════════════════════════════════════════════════════════════════

select set_config(
  'request.headers',
  json_build_object('x-psm-actor',
                    '8bd9b91b-c07b-4aae-9bd5-2aff773ab082')::text,
  true);

-- ── 1. affiliate_payout_decide — de laatste stap van reis 7 ───────
do $blk1$
declare v_oid oid; v_def text; v_new text;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'affiliate_payout_decide' limit 1;
  if v_oid is null then raise notice 'affiliate_payout_decide bestaat niet'; return; end if;
  v_def := pg_get_functiondef(v_oid);
  if v_def ilike '%_in_owner_set%' then
    raise notice 'affiliate_payout_decide kent de ownerset al'; return;
  end if;
  v_new := regexp_replace(
    v_def,
    'where[[:space:]]+t\.id[[:space:]]*=[[:space:]]*v_row\.tenant_id[[:space:]]+and[[:space:]]+t\.owner_id[[:space:]]*=[[:space:]]*v_uid',
    'where t.id = v_row.tenant_id and (t.owner_id = v_uid or public._in_owner_set(t.id, v_uid))',
    'g');
  if v_new = v_def then
    raise exception 'affiliate_payout_decide: patroon matchte niet -- NIET gewijzigd';
  end if;
  execute v_new;
end
$blk1$;
revoke all on function public.affiliate_payout_decide(uuid, text, text, text) from public, anon;
grant execute on function public.affiliate_payout_decide(uuid, text, text, text) to authenticated, service_role;

-- ── 2. _subscription_rows_are_the_owners ─────────────────────────
do $blk2$
declare v_oid oid; v_def text; v_new text;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = '_subscription_rows_are_the_owners' limit 1;
  if v_oid is null then raise notice 'trigger bestaat niet'; return; end if;
  v_def := pg_get_functiondef(v_oid);
  if v_def ilike '%_in_owner_set%' then
    raise notice '_subscription_rows_are_the_owners kent de ownerset al'; return;
  end if;
  v_new := regexp_replace(
    v_def,
    'if[[:space:]]+v_owner[[:space:]]+is[[:space:]]+not[[:space:]]+null[[:space:]]+and[[:space:]]+v_owner[[:space:]]*=[[:space:]]*v_uid[[:space:]]+then',
    'if (v_owner is not null and v_owner = v_uid) or public._in_owner_set(v_tenant, v_uid) then',
    'g');
  if v_new = v_def then
    raise exception '_subscription_rows_are_the_owners: patroon matchte niet -- NIET gewijzigd';
  end if;
  execute v_new;
end
$blk2$;
revoke all on function public._subscription_rows_are_the_owners() from public, anon;
grant execute on function public._subscription_rows_are_the_owners() to service_role;

-- ── 3. _money_columns_are_the_owners ─────────────────────────────
do $blk3$
declare v_oid oid; v_def text; v_new text;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = '_money_columns_are_the_owners' limit 1;
  if v_oid is null then raise notice 'trigger bestaat niet'; return; end if;
  v_def := pg_get_functiondef(v_oid);
  if v_def ilike '%_in_owner_set%' then
    raise notice '_money_columns_are_the_owners kent de ownerset al'; return;
  end if;
  v_new := regexp_replace(
    v_def,
    'if[[:space:]]+v_owner[[:space:]]+is[[:space:]]+not[[:space:]]+null[[:space:]]+and[[:space:]]+v_owner[[:space:]]*=[[:space:]]*v_uid[[:space:]]+then',
    'if (v_owner is not null and v_owner = v_uid)'
    || ' or public._in_owner_set((j_new->>''tenant_id'')::uuid, v_uid) then',
    'g');
  if v_new = v_def then
    raise exception '_money_columns_are_the_owners: patroon matchte niet -- NIET gewijzigd';
  end if;
  execute v_new;
end
$blk3$;
revoke all on function public._money_columns_are_the_owners() from public, anon;
grant execute on function public._money_columns_are_the_owners() to service_role;

-- ── 4. _fee_is_the_owners ────────────────────────────────────────
do $blk4$
declare v_oid oid; v_def text; v_new text;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = '_fee_is_the_owners' limit 1;
  if v_oid is null then raise notice 'trigger bestaat niet'; return; end if;
  v_def := pg_get_functiondef(v_oid);
  if v_def ilike '%_in_owner_set%' then
    raise notice '_fee_is_the_owners kent de ownerset al'; return;
  end if;
  v_new := regexp_replace(
    v_def,
    'if[[:space:]]+v_owner[[:space:]]+is[[:space:]]+not[[:space:]]+null[[:space:]]+and[[:space:]]+v_owner[[:space:]]*=[[:space:]]*v_uid[[:space:]]+then',
    'if (v_owner is not null and v_owner = v_uid) or public._in_owner_set(new.tenant_id, v_uid) then',
    'g');
  if v_new = v_def then
    raise exception '_fee_is_the_owners: patroon matchte niet -- NIET gewijzigd';
  end if;
  execute v_new;
end
$blk4$;
revoke all on function public._fee_is_the_owners() from public, anon;
grant execute on function public._fee_is_the_owners() to service_role;

-- ── HET RAPPORT, HELEMAAL ONDERAAN ─────────────────────────────────
-- `omgezet` hoort 4 te zijn, `anon_mag_iets` 0, en `nog_oud_totaal`
-- hoort op 8 te staan: dat zijn de vijf inrichtings-/GDPR-functies en
-- de drie UITZONDERINGS-triggers die met opzet blijven.
select
  'plak 166 geplaatst'                                             as wat,
  (select count(*)::text from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public'
      and p.proname in ('affiliate_payout_decide','_subscription_rows_are_the_owners',
                        '_money_columns_are_the_owners','_fee_is_the_owners')
      and pg_get_functiondef(p.oid) ilike '%_in_owner_set%')       as omgezet,
  (select count(*)::text from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public'
      and p.proname in ('affiliate_payout_decide','_subscription_rows_are_the_owners',
                        '_money_columns_are_the_owners','_fee_is_the_owners')
      and has_function_privilege('anon', p.oid, 'execute'))        as anon_mag_iets,
  (select count(*)::text from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.prokind = 'f'
      and pg_get_functiondef(p.oid) ~* 'owner[_a-z]*[[:space:]]*=[[:space:]]*v_uid|owner_id[[:space:]]*=[[:space:]]*auth\.uid'
      and pg_get_functiondef(p.oid) !~* '_in_owner_set')           as nog_oud_totaal,
  (select count(*)::text from public.tenant_owners o
     join public.tenants t on t.id = o.tenant_id
    where t.name ilike '%prime%')                                  as eigenaren;
