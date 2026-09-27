-- ════════════════════════════════════════════════════════════════════
-- PLAK 105 — drie dingen rond de medewerker-admin
-- ════════════════════════════════════════════════════════════════════
--
-- Blok 3. Gevonden door de agents, daarna elk zelf nagemeten op de live
-- database met Admin 1 -- de eerste niet-eigenaar admin die deze tenant
-- ooit heeft gehad.
--
-- ── 1. ZIJN BEL KAN NOOIT RINKELEN ─────────────────────────────────
--
-- Vier triggers maken de meldingen voor nieuw werk:
--
--   notify_wallet_topup_created
--   notify_topup_created
--   notify_ad_account_request_created
--   notify_user_profile_created
--
-- Alle vier doen `select t.owner_id into v_recipient` en schrijven
-- precies EEN rij. Geen enkele noemt role = 'admin'. Nagemeten:
--
--   Bart             EIGENAAR     44 meldingen
--   E2E Super Admin  EIGENAAR     18 meldingen
--   Admin 1          medewerker    0
--   E2E Admin        medewerker    0
--
-- En ondertussen heeft die medewerker wel een bel in de topbalk, een
-- meldingenscherm met "Your latest alerts and updates", en een
-- voorkeurenvenster dat hem precies deze soorten aanbiedt om aan of uit
-- te zetten. Alle drie werken; er komt alleen nooit iets in.
--
-- Dat is niet alleen leeg, het is de verkeerde kant op: de eigenaar
-- krijgt een ping voor werk dat de balie doet, en de balie hoort het
-- niet. Vanaf nu gaat het naar ELKE actieve admin van de tenant, de
-- eigenaar inbegrepen -- dat is hij ook.
--
-- ── 2. EEN ADMIN KAN EEN ANDERE ADMIN UITZETTEN ────────────────────
--
-- `toggleAdminStatus` is assertSuperAdmin en `updateUserProfile`
-- weigert adminrijen. Geen van beide is een grens -- nagemeten:
--
--   grant   : authenticated mag UPDATE op user_profiles, en op de
--             kolommen is_active, status, role, tenant_id
--   beleid  : user_profiles_update = (user_id = auth.uid())
--             OR _psm_admin_of(tenant_id)  -> een medewerker matcht
--   triggers: _guard_user_profile_role stopt alleen een ROLwijziging,
--             _guard_owner_stays_in alleen de rij van de eigenaar,
--             _guard_self_reactivation alleen jezelf, en
--             _guard_user_profile_lockout begint met
--             `if public._is_admin_of(new.tenant_id) then return new`
--
-- Rolverhoging is dus WEL dicht (dat heb ik in de trigger nagekeken).
-- Aan- en uitzetten niet -- inclusief het terugzetten van een admin die
-- de eigenaar net heeft uitgeschakeld. `admin_user_manage` staat in
-- lib/permissions.ts als SUPER_ADMIN_ONLY.
--
-- ── 3. DE AFWIJSREDEN VAN EEN AD-ACCOUNT-TOPUP IS ONLEESBAAR ───────
--
-- Het afwijsvenster zegt tegen de admin: "your reason is shown to
-- them." De reden is verplicht op drie lagen en wordt opgeslagen in
-- top_ups.rejection_reason -- en `top_ups_view`, de bron voor zowel de
-- wachtrij van de admin als de lijst van de klant, HEEFT DIE KOLOM
-- NIET. Nagemeten: er staat een afgewezen rij met een reden erin, en
-- niemand kan hem lezen. De wallet-topup ernaast doet dit wel goed
-- ("Told the customer: ...").
--
-- Plak dit hele bestand in de SQL editor. Onderaan staat EEN
-- rapporttabel.
-- ════════════════════════════════════════════════════════════════════

create temporary table if not exists _plak105 (
  n integer, stap text, uitkomst text
) on commit preserve rows;
truncate _plak105;

-- ── 1. de meldingen naar elke actieve admin ────────────────────────
--
-- Een helper, zodat de vier triggers niet elk hun eigen idee krijgen
-- van wie "de balie" is. SECURITY DEFINER omdat hij vanuit een trigger
-- draait die zelf al onder de rechten van de schrijver loopt.
do $blk0$
begin
  create or replace function public._admin_recipients(p_tenant uuid)
  returns setof uuid
  language sql
  stable
  security definer
  set search_path to 'public'
  as $fn$
    select distinct up.user_id
      from public.user_profiles up
     where up.tenant_id = p_tenant
       and up.role = 'admin'
       and coalesce(up.is_active, true) = true
       and coalesce(up.status, 'active') <> 'inactive'
       and coalesce(up.status, '') <> 'pending_erasure'
       and up.user_id is not null
  $fn$;

  revoke all on function public._admin_recipients(uuid) from public, anon;
  grant execute on function public._admin_recipients(uuid)
    to authenticated, service_role;

  insert into _plak105 values (0, 'helper _admin_recipients',
    'aangemaakt; anon eraf');
exception when others then
  insert into _plak105 values (0, 'helper _admin_recipients',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk0$;

-- De vier triggerfuncties krijgen dezelfde behandeling: waar ze nu EEN
-- rij invoegen voor de eigenaar, voegen ze er een in PER actieve admin.
-- Tekstchirurgie op de live definitie, want deze functies staan niet in
-- supabase/migrations.
do $blk1$
declare
  v_name text;
  v_src  text;
  v_new  text;
  v_done text := '';
  v_skip text := '';
begin
  foreach v_name in array array[
    'notify_wallet_topup_created',
    'notify_topup_created',
    'notify_ad_account_request_created',
    'notify_user_profile_created'
  ] loop
    select pg_get_functiondef(p.oid) into v_src
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = v_name
     limit 1;

    if v_src is null then
      v_skip := v_skip || v_name || ' (bestaat niet) ';
      continue;
    end if;
    if position('_admin_recipients' in v_src) > 0 then
      v_skip := v_skip || v_name || ' (al gedaan) ';
      continue;
    end if;

    -- De enige plek waar de ontvanger wordt gekozen. Elke van de vier
    -- schrijft dit letterlijk zo; pg_get_functiondef geeft CRLF terug op
    -- deze database, dus matchen op [[:space:]] en niet op chr(10).
    v_new := regexp_replace(
      v_src,
      'select[[:space:]]+t\\.owner_id[[:space:]]+into[[:space:]]+v_recipient_user_id',
      'select t.owner_id into v_recipient_user_id',
      'g');

    -- En na de bestaande insert er een per admin bij. We hangen hem aan
    -- het eind van de functie, vlak voor `return new`, zodat de
    -- bestaande regel ongemoeid blijft -- de eigenaar hield zijn melding
    -- ook al voordat hij admin heette.
    v_new := regexp_replace(
      v_new,
      '(return[[:space:]]+new;[[:space:]]*end)',
      'begin' || chr(10) ||
      '    insert into public.notifications (recipient_user_id, tenant_id, type, payload)' || chr(10) ||
      '    select r, v_tenant_id, v_type, v_payload' || chr(10) ||
      '      from public._admin_recipients(v_tenant_id) r' || chr(10) ||
      '     where r <> coalesce(v_recipient_user_id, ''00000000-0000-0000-0000-000000000000''::uuid);' || chr(10) ||
      '  exception when others then null;' || chr(10) ||
      '  end;' || chr(10) ||
      '  \1',
      '');

    if v_new = v_src then
      v_skip := v_skip || v_name || ' (patroon niet gevonden) ';
      continue;
    end if;

    begin
      execute v_new;
      v_done := v_done || v_name || ' ';
    exception when others then
      v_skip := v_skip || v_name || ' (' || sqlstate || ') ';
    end;
  end loop;

  insert into _plak105 values (1, 'meldingen naar elke actieve admin',
    'aangepast: ' || coalesce(nullif(v_done, ''), 'geen') ||
    ' || overgeslagen: ' || coalesce(nullif(v_skip, ''), 'geen'));
exception when others then
  insert into _plak105 values (1, 'meldingen naar elke actieve admin',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk1$;

-- ── 2. een admin aan- of uitzetten is van de eigenaar ──────────────
do $blk2$
begin
  create or replace function public._guard_admin_status_is_owners()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public'
  as $fn$
  declare
    v_owner uuid;
  begin
    -- Alleen adminrijen, en alleen als er echt iets aan de toegang
    -- verandert. Een naamswijziging op een admin blijft gewoon mogelijk.
    if coalesce(old.role::text, '') <> 'admin' then
      return new;
    end if;
    if new.is_active is not distinct from old.is_active
       and new.status is not distinct from old.status then
      return new;
    end if;
    -- Een service-role schrijf (de invite-route, het aanmaken van een
    -- admin) heeft geen auth.uid() en wordt hier niet tegengehouden.
    if auth.uid() is null then
      return new;
    end if;

    select owner_id into v_owner from public.tenants where id = new.tenant_id;
    if v_owner is null or v_owner <> auth.uid() then
      raise exception
        'Only the account owner can switch an admin on or off.'
        using errcode = '42501';
    end if;
    return new;
  end;
  $fn$;

  drop trigger if exists a4_guard_admin_status on public.user_profiles;
  create trigger a4_guard_admin_status
    before update on public.user_profiles
    for each row execute function public._guard_admin_status_is_owners();

  revoke all on function public._guard_admin_status_is_owners() from public, anon;
  grant execute on function public._guard_admin_status_is_owners()
    to authenticated, service_role;

  insert into _plak105 values (2, 'een admin aan/uitzetten',
    'alleen de eigenaar; rolwijziging was al dicht');
exception when others then
  insert into _plak105 values (2, 'een admin aan/uitzetten',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk2$;

-- ── 3. de afwijsreden in top_ups_view ──────────────────────────────
--     De view is met de hand geschreven op deze database. We voegen
--     alleen de kolom toe die er niet in zit; de rest blijft zoals hij
--     is. De app leest hem met een terugval, dus tot deze plak draait
--     verandert er niets op het scherm.
do $blk3$
declare
  v_def text;
begin
  select pg_get_viewdef('public.top_ups_view'::regclass, true) into v_def;

  if v_def is null then
    insert into _plak105 values (3, 'afwijsreden in top_ups_view',
      'view bestaat niet - overgeslagen');
    return;
  end if;
  if position('rejection_reason' in v_def) > 0 then
    insert into _plak105 values (3, 'afwijsreden in top_ups_view',
      'stond er al');
    return;
  end if;

  -- De view selecteert uit top_ups met alias t (nagelopen). We hangen de
  -- kolom achter de laatste geselecteerde uitdrukking, vlak voor FROM.
  execute 'create or replace view public.top_ups_view as ' ||
    regexp_replace(v_def, '[[:space:]]+FROM[[:space:]]',
      ', t.rejection_reason' || chr(10) || '  FROM ', 'i');

  insert into _plak105 values (3, 'afwijsreden in top_ups_view',
    'kolom toegevoegd');
exception when others then
  insert into _plak105 values (3, 'afwijsreden in top_ups_view',
    'NIETS GEWIJZIGD - ' || sqlstate || ': ' || sqlerrm ||
    ' || de view is met de hand geschreven; stuur me `select ' ||
    'pg_get_viewdef(''public.top_ups_view''::regclass, true);` dan ' ||
    'lever ik hem uitgeschreven');
end
$blk3$;

-- ── controle ───────────────────────────────────────────────────────
do $blk4$
declare
  v_n      integer;
  v_trig   integer;
  v_kolom  integer;
begin
  select count(*) into v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('notify_wallet_topup_created','notify_topup_created',
                       'notify_ad_account_request_created','notify_user_profile_created')
     and pg_get_functiondef(p.oid) like '%_admin_recipients%';

  select count(*) into v_trig
    from pg_trigger where tgname = 'a4_guard_admin_status' and not tgisinternal;

  select count(*) into v_kolom
    from information_schema.columns
   where table_name = 'top_ups_view' and column_name = 'rejection_reason';

  insert into _plak105 values (4, 'stand van zaken',
    'triggers die de balie aanschrijven: ' || v_n || '/4 | ' ||
    'adminstatus-slot: ' || v_trig || '/1 | ' ||
    'rejection_reason in de view: ' || v_kolom || '/1');
exception when others then
  insert into _plak105 values (4, 'stand van zaken',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk4$;

-- ── en wie er vanaf nu een ping krijgt ─────────────────────────────
do $blk5$
declare v text;
begin
  select coalesce(string_agg(up.full_name || ' (' ||
           case when t.owner_id = up.user_id then 'eigenaar' else 'medewerker' end ||
           ', nu ' || (select count(*) from public.notifications nn
                        where nn.recipient_user_id = up.user_id) || ')', ' | '
           order by up.full_name), 'niemand')
    into v
    from public.user_profiles up
    left join public.tenants t on t.id = up.tenant_id
   where up.role = 'admin'
     and coalesce(up.is_active, true)
     and coalesce(up.status, 'active') <> 'inactive';
  insert into _plak105 values (5, 'krijgt voortaan nieuw werk binnen', v);
exception when others then
  insert into _plak105 values (5, 'krijgt voortaan nieuw werk binnen',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk5$;

-- ════════════════════════════════════════════════════════════════════
-- HET RAPPORT — de editor toont alleen deze laatste tabel.
--
-- Regel 1 en 3 doen tekstchirurgie op definities die met de hand op deze
-- database staan. Zegt een van de twee "patroon niet gevonden" of
-- "NIETS GEWIJZIGD", stuur me dan de melding -- dan schrijf ik hem
-- voluit in plaats van hem te laten raden.
-- ════════════════════════════════════════════════════════════════════
select n as "#", stap as "wat", uitkomst as "uitkomst"
  from _plak105 order by n;
