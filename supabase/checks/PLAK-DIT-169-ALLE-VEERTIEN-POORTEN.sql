-- ════════════════════════════════════════════════════════════════════
-- PLAK 169 — ALLE VEERTIEN POORTEN IN EEN KEER
-- ════════════════════════════════════════════════════════════════════
--
-- De eigenaar, 30-09: "we hebben nu al 100x tenant owner melding
-- gehaald komt steeds weer."
--
-- Terecht. Plak 165, 166 en 167 repareerden er samen dertien, en het
-- bleef terugkomen. Dat lag aan mijn manier van zoeken, niet aan de
-- app: ik zocht elke ronde op de SCHRIJFWIJZE van de vergelijking, en
-- die bestaat in vier vormen --
--
--     owner_id = auth.uid()
--     select owner_id into v_owner ... if v_owner = v_uid
--     ... if v_owner <> v_uid
--     t.owner_id = up.user_id
--
-- Elke ronde ving er een paar. Deze plak zoekt niet meer op de vorm
-- maar op wat de functie AANRAAKT: elke functie die `tenants` en
-- `owner_id` gebruikt, de helper niet kent, en een exception gooit met
-- "owner" / "eigenaar" / "super-admin" / "Forbidden" erin. Dat zijn er
-- **veertien**, en ze staan hieronder allemaal.
--
-- ── WAT ER NIET IN ZIT, EN WAAROM ─────────────────────────────────
--
-- Vijftien andere functies lezen `tenants.owner_id` ook, maar niet om
-- iets tegen te houden: ze kiezen er de ONTVANGER van een melding mee
-- (notify_topup_created, _book_topup_commission, en zo). Die blijven
-- zoals ze zijn. Of een melding naar beide eigenaren moet is een
-- aparte vraag, en het antwoord daarop is beleid.
--
-- ── TWEE VORMEN, TWEE INGREPEN ────────────────────────────────────
--
-- **A. Zeven functies halen de eigenaar eerst op.** Daar raak ik de
-- vergelijking NIET aan -- die staat in vier smaken en dat is precies
-- de reden dat het misging. In plaats daarvan verandert de LEES:
--
--     select owner_id into v_owner from public.tenants where id = X;
--  -> select case when public._in_owner_set(id, auth.uid())
--                 then auth.uid() else owner_id end
--       into v_owner from public.tenants where id = X;
--
-- Zit de beller in de ownerset, dan komt hij als zichzelf terug en
-- klopt elke vergelijking eronder vanzelf -- `= v_uid`, `<> v_caller`,
-- `is null or <>`, wat er ook staat. Voor ieder ander verandert er
-- niets.
--
-- **B. Zeven functies toetsen inline.** Daar komt de ownerset met een
-- `or` naast de bestaande toets (of met `and not` bij de ontkende).
--
-- Bij allebei geldt: de oude toets blijft staan. Deze plak kan dus
-- niemand buitensluiten die er nu langs komt -- hij laat er alleen
-- iemand bij.
--
-- ── EN DE CONTROLE WORDT BREDER ───────────────────────────────────
--
-- `npm run ochtend` telde op de vorm en zag er daardoor 11 van de 30.
-- In de commit bij deze plak telt controle 13 op hetzelfde brede
-- patroon als hierboven: elke POORT die de helper niet kent. Na deze
-- plak hoort dat 0 te zijn. Wordt het 1, dan is er een nieuwe
-- bijgeschreven -- en dat zie je dan 's ochtends.
--
-- Veertien blokken, EEN `execute` per functie (huisregel na plak 124),
-- elk weigert als zijn patroon niet matcht, en elk heeft zijn revoke.
-- ════════════════════════════════════════════════════════════════════

select set_config(
  'request.headers',
  json_build_object('x-psm-actor',
                    '8bd9b91b-c07b-4aae-9bd5-2aff773ab082')::text,
  true);


-- ── 1. _guard_admin_status_is_owners ──
do $blk1$
declare v_oid oid; v_def text; v_new text;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = '_guard_admin_status_is_owners' limit 1;
  if v_oid is null then raise notice '_guard_admin_status_is_owners bestaat niet'; return; end if;
  v_def := pg_get_functiondef(v_oid);
  if v_def ilike '%_in_owner_set%' then
    raise notice '_guard_admin_status_is_owners kent de ownerset al'; return;
  end if;
  v_new := regexp_replace(v_def, 'select[[:space:]]+(t\.)?owner_id[[:space:]]+into[[:space:]]+v_owner[[:space:]]+from[[:space:]]+(public\.)?tenants[[:space:]]+(t[[:space:]]+)?where[[:space:]]+(t\.)?id[[:space:]]*=[[:space:]]*new\.tenant_id', 'select case when public._in_owner_set(id, auth.uid()) then auth.uid() else owner_id end into v_owner from public.tenants where id = new.tenant_id', 'gi');
  if v_new = v_def then
    raise exception '_guard_admin_status_is_owners: patroon matchte niet -- NIET gewijzigd';
  end if;
  execute v_new;
end
$blk1$;
revoke all on function public._guard_admin_status_is_owners() from public, anon;
grant execute on function public._guard_admin_status_is_owners() to service_role;

-- ── 2. _guard_commission_columns ──
do $blk2$
declare v_oid oid; v_def text; v_new text;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = '_guard_commission_columns' limit 1;
  if v_oid is null then raise notice '_guard_commission_columns bestaat niet'; return; end if;
  v_def := pg_get_functiondef(v_oid);
  if v_def ilike '%_in_owner_set%' then
    raise notice '_guard_commission_columns kent de ownerset al'; return;
  end if;
  v_new := regexp_replace(v_def, 'select[[:space:]]+(t\.)?owner_id[[:space:]]+into[[:space:]]+v_owner[[:space:]]+from[[:space:]]+(public\.)?tenants[[:space:]]+(t[[:space:]]+)?where[[:space:]]+(t\.)?id[[:space:]]*=[[:space:]]*new\.tenant_id', 'select case when public._in_owner_set(id, auth.uid()) then auth.uid() else owner_id end into v_owner from public.tenants where id = new.tenant_id', 'gi');
  if v_new = v_def then
    raise exception '_guard_commission_columns: patroon matchte niet -- NIET gewijzigd';
  end if;
  execute v_new;
end
$blk2$;
revoke all on function public._guard_commission_columns() from public, anon;
grant execute on function public._guard_commission_columns() to service_role;

-- ── 3. _guard_owner_stays_in ──
do $blk3$
declare v_oid oid; v_def text; v_new text;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = '_guard_owner_stays_in' limit 1;
  if v_oid is null then raise notice '_guard_owner_stays_in bestaat niet'; return; end if;
  v_def := pg_get_functiondef(v_oid);
  if v_def ilike '%_in_owner_set%' then
    raise notice '_guard_owner_stays_in kent de ownerset al'; return;
  end if;
  v_new := regexp_replace(v_def, 'select[[:space:]]+(t\.)?owner_id[[:space:]]+into[[:space:]]+v_owner[[:space:]]+from[[:space:]]+(public\.)?tenants[[:space:]]+(t[[:space:]]+)?where[[:space:]]+(t\.)?id[[:space:]]*=[[:space:]]*new\.tenant_id', 'select case when public._in_owner_set(id, auth.uid()) then auth.uid() else owner_id end into v_owner from public.tenants where id = new.tenant_id', 'gi');
  if v_new = v_def then
    raise exception '_guard_owner_stays_in: patroon matchte niet -- NIET gewijzigd';
  end if;
  execute v_new;
end
$blk3$;
revoke all on function public._guard_owner_stays_in() from public, anon;
grant execute on function public._guard_owner_stays_in() to service_role;

-- ── 4. _guard_user_profile_lockout ──
do $blk4$
declare v_oid oid; v_def text; v_new text;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = '_guard_user_profile_lockout' limit 1;
  if v_oid is null then raise notice '_guard_user_profile_lockout bestaat niet'; return; end if;
  v_def := pg_get_functiondef(v_oid);
  if v_def ilike '%_in_owner_set%' then
    raise notice '_guard_user_profile_lockout kent de ownerset al'; return;
  end if;
  v_new := regexp_replace(v_def, 'select[[:space:]]+(t\.)?owner_id[[:space:]]+into[[:space:]]+v_owner[[:space:]]+from[[:space:]]+(public\.)?tenants[[:space:]]+(t[[:space:]]+)?where[[:space:]]+(t\.)?id[[:space:]]*=[[:space:]]*old\.tenant_id', 'select case when public._in_owner_set(id, auth.uid()) then auth.uid() else owner_id end into v_owner from public.tenants where id = old.tenant_id', 'gi');
  if v_new = v_def then
    raise exception '_guard_user_profile_lockout: patroon matchte niet -- NIET gewijzigd';
  end if;
  execute v_new;
end
$blk4$;
revoke all on function public._guard_user_profile_lockout() from public, anon;
grant execute on function public._guard_user_profile_lockout() to service_role;

-- ── 5. _guard_user_profile_role ──
do $blk5$
declare v_oid oid; v_def text; v_new text;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = '_guard_user_profile_role' limit 1;
  if v_oid is null then raise notice '_guard_user_profile_role bestaat niet'; return; end if;
  v_def := pg_get_functiondef(v_oid);
  if v_def ilike '%_in_owner_set%' then
    raise notice '_guard_user_profile_role kent de ownerset al'; return;
  end if;
  v_new := regexp_replace(v_def, 'select[[:space:]]+(t\.)?owner_id[[:space:]]+into[[:space:]]+v_owner[[:space:]]+from[[:space:]]+(public\.)?tenants[[:space:]]+(t[[:space:]]+)?where[[:space:]]+(t\.)?id[[:space:]]*=[[:space:]]*new\.tenant_id', 'select case when public._in_owner_set(id, auth.uid()) then auth.uid() else owner_id end into v_owner from public.tenants where id = new.tenant_id', 'gi');
  if v_new = v_def then
    raise exception '_guard_user_profile_role: patroon matchte niet -- NIET gewijzigd';
  end if;
  execute v_new;
end
$blk5$;
revoke all on function public._guard_user_profile_role() from public, anon;
grant execute on function public._guard_user_profile_role() to service_role;

-- ── 6. fee_change_decide ──
do $blk6$
declare v_oid oid; v_def text; v_new text;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'fee_change_decide' limit 1;
  if v_oid is null then raise notice 'fee_change_decide bestaat niet'; return; end if;
  v_def := pg_get_functiondef(v_oid);
  if v_def ilike '%_in_owner_set%' then
    raise notice 'fee_change_decide kent de ownerset al'; return;
  end if;
  v_new := regexp_replace(v_def, 'select[[:space:]]+(t\.)?owner_id[[:space:]]+into[[:space:]]+v_owner[[:space:]]+from[[:space:]]+(public\.)?tenants[[:space:]]+(t[[:space:]]+)?where[[:space:]]+(t\.)?id[[:space:]]*=[[:space:]]*v_prof\.tenant_id', 'select case when public._in_owner_set(id, auth.uid()) then auth.uid() else owner_id end into v_owner from public.tenants where id = v_prof.tenant_id', 'gi');
  if v_new = v_def then
    raise exception 'fee_change_decide: patroon matchte niet -- NIET gewijzigd';
  end if;
  execute v_new;
end
$blk6$;
revoke all on function public.fee_change_decide(uuid, boolean, text) from public, anon;
grant execute on function public.fee_change_decide(uuid, boolean, text) to authenticated, service_role;

-- ── 7. top_up_admin_verify ──
do $blk7$
declare v_oid oid; v_def text; v_new text;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'top_up_admin_verify' limit 1;
  if v_oid is null then raise notice 'top_up_admin_verify bestaat niet'; return; end if;
  v_def := pg_get_functiondef(v_oid);
  if v_def ilike '%_in_owner_set%' then
    raise notice 'top_up_admin_verify kent de ownerset al'; return;
  end if;
  v_new := regexp_replace(v_def, 'select[[:space:]]+(t\.)?owner_id[[:space:]]+into[[:space:]]+v_owner[[:space:]]+from[[:space:]]+(public\.)?tenants[[:space:]]+(t[[:space:]]+)?where[[:space:]]+(t\.)?id[[:space:]]*=[[:space:]]*v_topup\.tenant_id', 'select case when public._in_owner_set(id, auth.uid()) then auth.uid() else owner_id end into v_owner from public.tenants where id = v_topup.tenant_id', 'gi');
  if v_new = v_def then
    raise exception 'top_up_admin_verify: patroon matchte niet -- NIET gewijzigd';
  end if;
  execute v_new;
end
$blk7$;
revoke all on function public.top_up_admin_verify(uuid, numeric) from public, anon;
grant execute on function public.top_up_admin_verify(uuid, numeric) to authenticated, service_role;

-- ── 8. _top_ups_insert_fee_floor ──
do $blk8$
declare v_oid oid; v_def text; v_new text;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = '_top_ups_insert_fee_floor' limit 1;
  if v_oid is null then raise notice '_top_ups_insert_fee_floor bestaat niet'; return; end if;
  v_def := pg_get_functiondef(v_oid);
  if v_def ilike '%_in_owner_set%' then
    raise notice '_top_ups_insert_fee_floor kent de ownerset al'; return;
  end if;
  v_new := regexp_replace(v_def, 't\.owner_id[[:space:]]*=[[:space:]]*auth\.uid\(\)', '(t.owner_id = auth.uid() or public._in_owner_set(t.id, auth.uid()))', 'g');
  if v_new = v_def then
    raise exception '_top_ups_insert_fee_floor: patroon matchte niet -- NIET gewijzigd';
  end if;
  execute v_new;
end
$blk8$;
revoke all on function public._top_ups_insert_fee_floor() from public, anon;
grant execute on function public._top_ups_insert_fee_floor() to service_role;

-- ── 9. account_deletion_decide ──
do $blk9$
declare v_oid oid; v_def text; v_new text;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'account_deletion_decide' limit 1;
  if v_oid is null then raise notice 'account_deletion_decide bestaat niet'; return; end if;
  v_def := pg_get_functiondef(v_oid);
  if v_def ilike '%_in_owner_set%' then
    raise notice 'account_deletion_decide kent de ownerset al'; return;
  end if;
  v_new := regexp_replace(v_def, 't\.owner_id[[:space:]]*=[[:space:]]*v_uid', '(t.owner_id = v_uid or public._in_owner_set(t.id, v_uid))', 'g');
  if v_new = v_def then
    raise exception 'account_deletion_decide: patroon matchte niet -- NIET gewijzigd';
  end if;
  execute v_new;
end
$blk9$;
revoke all on function public.account_deletion_decide(uuid, boolean, text) from public, anon;
grant execute on function public.account_deletion_decide(uuid, boolean, text) to authenticated, service_role;

-- ── 10. change_subscription_amount ──
do $blk10$
declare v_oid oid; v_def text; v_new text;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'change_subscription_amount' limit 1;
  if v_oid is null then raise notice 'change_subscription_amount bestaat niet'; return; end if;
  v_def := pg_get_functiondef(v_oid);
  if v_def ilike '%_in_owner_set%' then
    raise notice 'change_subscription_amount kent de ownerset al'; return;
  end if;
  v_new := regexp_replace(v_def, 't\.owner_id[[:space:]]*=[[:space:]]*up\.user_id', '(t.owner_id = up.user_id or public._in_owner_set(t.id, up.user_id))', 'g');
  if v_new = v_def then
    raise exception 'change_subscription_amount: patroon matchte niet -- NIET gewijzigd';
  end if;
  execute v_new;
end
$blk10$;
revoke all on function public.change_subscription_amount(uuid, numeric, text, boolean) from public, anon;
grant execute on function public.change_subscription_amount(uuid, numeric, text, boolean) to authenticated, service_role;

-- ── 11. fee_change_request ──
do $blk11$
declare v_oid oid; v_def text; v_new text;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'fee_change_request' limit 1;
  if v_oid is null then raise notice 'fee_change_request bestaat niet'; return; end if;
  v_def := pg_get_functiondef(v_oid);
  if v_def ilike '%_in_owner_set%' then
    raise notice 'fee_change_request kent de ownerset al'; return;
  end if;
  v_new := regexp_replace(v_def, 't\.owner_id[[:space:]]*<>[[:space:]]*v_uid', '(t.owner_id <> v_uid and not public._in_owner_set(t.id, v_uid))', 'g');
  if v_new = v_def then
    raise exception 'fee_change_request: patroon matchte niet -- NIET gewijzigd';
  end if;
  execute v_new;
end
$blk11$;
revoke all on function public.fee_change_request(uuid, numeric, text) from public, anon;
grant execute on function public.fee_change_request(uuid, numeric, text) to authenticated, service_role;

-- ── 12. referral_commission_recalculate ──
do $blk12$
declare v_oid oid; v_def text; v_new text;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'referral_commission_recalculate' limit 1;
  if v_oid is null then raise notice 'referral_commission_recalculate bestaat niet'; return; end if;
  v_def := pg_get_functiondef(v_oid);
  if v_def ilike '%_in_owner_set%' then
    raise notice 'referral_commission_recalculate kent de ownerset al'; return;
  end if;
  v_new := regexp_replace(v_def, 't\.owner_id[[:space:]]*=[[:space:]]*auth\.uid\(\)', '(t.owner_id = auth.uid() or public._in_owner_set(t.id, auth.uid()))', 'g');
  if v_new = v_def then
    raise exception 'referral_commission_recalculate: patroon matchte niet -- NIET gewijzigd';
  end if;
  execute v_new;
end
$blk12$;
revoke all on function public.referral_commission_recalculate(uuid) from public, anon;
grant execute on function public.referral_commission_recalculate(uuid) to authenticated, service_role;

-- ── 13. referral_link_assign ──
do $blk13$
declare v_oid oid; v_def text; v_new text;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'referral_link_assign' limit 1;
  if v_oid is null then raise notice 'referral_link_assign bestaat niet'; return; end if;
  v_def := pg_get_functiondef(v_oid);
  if v_def ilike '%_in_owner_set%' then
    raise notice 'referral_link_assign kent de ownerset al'; return;
  end if;
  v_new := regexp_replace(v_def, 't\.owner_id[[:space:]]*=[[:space:]]*auth\.uid\(\)', '(t.owner_id = auth.uid() or public._in_owner_set(t.id, auth.uid()))', 'g');
  if v_new = v_def then
    raise exception 'referral_link_assign: patroon matchte niet -- NIET gewijzigd';
  end if;
  execute v_new;
end
$blk13$;
revoke all on function public.referral_link_assign(uuid, uuid) from public, anon;
grant execute on function public.referral_link_assign(uuid, uuid) to authenticated, service_role;

-- ── 14. set_finance_reviewer ──
do $blk14$
declare v_oid oid; v_def text; v_new text;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'set_finance_reviewer' limit 1;
  if v_oid is null then raise notice 'set_finance_reviewer bestaat niet'; return; end if;
  v_def := pg_get_functiondef(v_oid);
  if v_def ilike '%_in_owner_set%' then
    raise notice 'set_finance_reviewer kent de ownerset al'; return;
  end if;
  v_new := regexp_replace(v_def, 't\.owner_id[[:space:]]*=[[:space:]]*auth\.uid\(\)', '(t.owner_id = auth.uid() or public._in_owner_set(t.id, auth.uid()))', 'g');
  if v_new = v_def then
    raise exception 'set_finance_reviewer: patroon matchte niet -- NIET gewijzigd';
  end if;
  execute v_new;
end
$blk14$;
revoke all on function public.set_finance_reviewer(uuid, boolean) from public, anon;
grant execute on function public.set_finance_reviewer(uuid, boolean) to authenticated, service_role;

-- ── HET RAPPORT, HELEMAAL ONDERAAN ─────────────────────────────────
-- `poorten_nog_oud` hoort **0** te zijn. Dat is hetzelfde getal dat
-- `npm run ochtend` onder controle 13 laat zien.
-- `anon_mag` hoort 0. `meldingen_ongemoeid` hoort 15 -- die raken we
-- met opzet niet aan; die kiezen alleen een ontvanger.
select
  'plak 169 geplaatst'                                             as wat,
  (select count(*)::text from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.prokind='f'
      and pg_get_functiondef(p.oid) ilike '%owner_id%'
      and pg_get_functiondef(p.oid) ilike '%tenants%'
      and pg_get_functiondef(p.oid) !~* '_in_owner_set'
      and pg_get_functiondef(p.oid) ~* 'raise exception[^;]{0,200}(owner|eigenaar|super-admin|Forbidden)')
                                                                    as poorten_nog_oud,
  (select count(*)::text from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.prokind='f'
      and pg_get_functiondef(p.oid) ilike '%_in_owner_set%'
      and has_function_privilege('anon', p.oid, 'execute'))         as anon_mag,
  (select count(*)::text from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.prokind='f'
      and pg_get_functiondef(p.oid) ilike '%owner_id%'
      and pg_get_functiondef(p.oid) ilike '%tenants%'
      and pg_get_functiondef(p.oid) !~* '_in_owner_set')            as meldingen_ongemoeid;
