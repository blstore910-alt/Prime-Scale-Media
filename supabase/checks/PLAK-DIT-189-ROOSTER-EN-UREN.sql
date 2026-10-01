-- ════════════════════════════════════════════════════════════════════
-- PLAK 189 -- het rooster van de admins, en hun uren
-- ════════════════════════════════════════════════════════════════════
--
-- De eigenaar, 01-10: "tijdenschema met blokken, dagen en voorkeuren;
-- vullen en aanpassen; vastzetten voor weken of maanden; een admin maakt
-- het. Wie nu live moet zijn, klein bovenaan het dashboard. En de
-- inloguren en activiteit van admins -- alleen super admin (en misschien
-- een admin)."
--
--   staff_shifts              een dienst: wie, welke dag, van-tot.
--   staff_preferences         per admin: welke dagen, welk blok, hoeveel
--                             dagen per week, een notitie.
--   staff_schedule_settings   per tenant: wie het rooster maakt, wie de
--                             uren mag zien, tot welke datum het vastligt,
--                             en de dekking (bv. 09:00-21:00).
--   staff_activity_days       per admin per dag: eerst gezien, laatst
--                             gezien, actieve minuten. GEEN leesrecht
--                             voor de browser: alleen de server (en dus
--                             alleen wie het mag zien) leest dit.
--   staff_heartbeat()         de app roept dit elke minuut aan zolang een
--                             admin het tabblad open en zichtbaar heeft.
--
-- Schrijven gaat via server-acties met de service-sleutel, na de
-- rolcheck -- zoals de leverancier-tabellen van plak 185.
--
-- Twee keer plakken kan.

do $blk0$
begin
  create table if not exists public.staff_shifts (
    id          uuid primary key default gen_random_uuid(),
    tenant_id   uuid not null references public.tenants(id),
    profile_id  uuid not null references public.user_profiles(id) on delete cascade,
    day         date not null,
    start_time  time not null,
    end_time    time not null,
    note        text check (note is null or length(note) <= 200),
    created_by  uuid,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),
    check (end_time > start_time)
  );
  create index if not exists staff_shifts_day on public.staff_shifts (tenant_id, day);

  create table if not exists public.staff_preferences (
    id          uuid primary key default gen_random_uuid(),
    tenant_id   uuid not null references public.tenants(id),
    profile_id  uuid not null unique references public.user_profiles(id) on delete cascade,
    days        int[] not null default array[1, 2, 3, 4, 5],
    block       text not null default 'any' check (block in ('morning', 'late', 'full', 'any')),
    max_days    int not null default 5 check (max_days between 0 and 7),
    note        text check (note is null or length(note) <= 300),
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
  );

  create table if not exists public.staff_schedule_settings (
    tenant_id               uuid primary key references public.tenants(id),
    editor_profile_id       uuid references public.user_profiles(id) on delete set null,
    hours_viewer_profile_id uuid references public.user_profiles(id) on delete set null,
    locked_until            date,
    coverage_start          time not null default '09:00',
    coverage_end            time not null default '21:00',
    created_at              timestamptz not null default now(),
    updated_at              timestamptz not null default now(),
    check (coverage_end > coverage_start)
  );

  create table if not exists public.staff_activity_days (
    id              uuid primary key default gen_random_uuid(),
    tenant_id       uuid not null references public.tenants(id),
    profile_id      uuid not null references public.user_profiles(id) on delete cascade,
    day             date not null,
    first_seen      timestamptz not null default now(),
    last_seen       timestamptz not null default now(),
    active_minutes  int not null default 0,
    unique (profile_id, day)
  );
end
$blk0$;

do $blk1$
declare t text;
begin
  -- Rooster, voorkeuren, instellingen: elke admin van de tenant leest.
  foreach t in array array['staff_shifts', 'staff_preferences', 'staff_schedule_settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, public', t);
    execute format('revoke insert, update, delete, truncate on public.%I from authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (public._is_admin_of(tenant_id))', t || '_admin_read', t);
    execute format('drop trigger if exists %I on public.%I', 'trg_audit_' || t, t);
    execute format('create trigger %I after insert or delete or update on public.%I for each row execute function public._audit_row_change()', 'trg_audit_' || t, t);
    execute format('drop trigger if exists %I on public.%I', 'trg_touch_' || t, t);
    execute format('create trigger %I before update on public.%I for each row execute function public._touch_updated_at()', 'trg_touch_' || t, t);
  end loop;

  -- De uren: NIEMAND leest ze uit de browser. Geen policy = geen rij.
  alter table public.staff_activity_days enable row level security;
  revoke all on public.staff_activity_days from anon, public;
  revoke all on public.staff_activity_days from authenticated;
end
$blk1$;

-- ── DE HARTSLAG ──────────────────────────────────────────────────────
-- Elke minuut zolang het tabblad zichtbaar is. Een gat van meer dan drie
-- minuten telt niet als actief (tabblad dicht, laptop dicht).
create or replace function public.staff_heartbeat()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $blk2$
declare
  v_profile record;
  v_day date := (now() at time zone 'Europe/Amsterdam')::date;
begin
  select p.id, p.tenant_id into v_profile
    from public.user_profiles p
   where p.user_id = auth.uid() and p.role = 'admin' and p.tenant_id is not null
   limit 1;
  if v_profile.id is null then
    return;
  end if;

  insert into public.staff_activity_days as d (tenant_id, profile_id, day, first_seen, last_seen, active_minutes)
  values (v_profile.tenant_id, v_profile.id, v_day, now(), now(), 0)
  on conflict (profile_id, day) do update
     set active_minutes = d.active_minutes + case
           when now() - d.last_seen <= interval '3 minutes'
             then greatest(0, round(extract(epoch from (now() - d.last_seen)) / 60.0))::int
           else 0 end,
         last_seen = now();
end;
$blk2$;
revoke all on function public.staff_heartbeat() from public, anon;
grant execute on function public.staff_heartbeat() to authenticated, service_role;

-- ── RAPPORT ──────────────────────────────────────────────────────────
select
  (select count(*) from information_schema.tables
    where table_schema = 'public'
      and table_name in ('staff_shifts', 'staff_preferences', 'staff_schedule_settings', 'staff_activity_days')) as tabellen_van_4,
  has_table_privilege('anon', 'public.staff_shifts', 'select')                 as anon_leest,
  has_table_privilege('authenticated', 'public.staff_shifts', 'insert')        as browser_schrijft,
  has_table_privilege('authenticated', 'public.staff_activity_days', 'select') as browser_leest_uren,
  has_function_privilege('anon', 'public.staff_heartbeat()', 'execute')        as anon_hartslag,
  case when (select count(*) from information_schema.tables
              where table_schema = 'public'
                and table_name in ('staff_shifts', 'staff_preferences', 'staff_schedule_settings', 'staff_activity_days')) = 4
        and not has_table_privilege('anon', 'public.staff_shifts', 'select')
        and not has_table_privilege('authenticated', 'public.staff_shifts', 'insert')
        and not has_table_privilege('authenticated', 'public.staff_activity_days', 'select')
       then 'OK' else 'NIET GOED -- meld het' end                                as uitkomst;
