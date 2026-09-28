-- ════════════════════════════════════════════════════════════════════
-- PLAK 129 — POLLS: de eigenaar stelt iedereen een vraag
-- ════════════════════════════════════════════════════════════════════
--
-- De eigenaar, 28-09: "bouw ook de poll systeem dat super admin
-- makkelijk een poll kan maken voor alle users."
--
-- WAT HET IS
--
-- Twee tabellen. `polls` draagt de vraag, de antwoorden en wie hij
-- bereikt; `poll_votes` draagt precies EEN stem per persoon per poll,
-- afgedwongen door een unieke index en niet door de app.
--
-- EEN STEM PER PERSOON, EN DE DATABASE ZEGT HET
--
-- `unique (poll_id, profile_id)`. Een app-check op "heb je al gestemd"
-- verliest van twee tabbladen; deze niet. Opnieuw stemmen VERVANGT je
-- antwoord in plaats van te weigeren -- van gedachten veranderen is
-- normaal, en een tweede rij is het niet.
--
-- WIE ZIET WAT
--
-- Iedereen in de tenant leest een OPEN poll en zijn eigen stem. Niemand
-- leest andermans stem: de uitslag komt uit `poll_results`, een view
-- die alleen aantallen teruggeeft. Dat is geen preutsheid maar de enige
-- manier waarop "anoniem" waar is -- met leesrecht op de rijen kan
-- iedere klant met de publieke sleutel uitlezen wie wat stemde.
--
-- De eigenaar ziet de uitslag ook terwijl de poll nog loopt, want hij
-- moet hem kunnen sluiten op wat hij ziet. De klant ziet de uitslag pas
-- nadat hij zelf heeft gestemd; anders stuurt de stand de stem.
--
-- SCHRIJVEN GAAT VIA EEN RPC, zoals CLAUDE.md eist voor elke mutatie op
-- een zakelijke tabel. `poll_vote(poll_id, option_id)` toetst zelf of
-- de poll open is, of het antwoord bestaat en of de stemmer bij het
-- publiek hoort. `authenticated` heeft GEEN insert op poll_votes.
--
-- En de revokes staan in hetzelfde blok als de create, want Supabase
-- geeft `anon` standaard arwdDxtm op alles in public.
--
-- Plak dit hele bestand in de SQL editor. Onderaan staat EEN
-- rapporttabel.
-- ════════════════════════════════════════════════════════════════════

create temporary table if not exists _plak129 (
  n integer, stap text, uitkomst text
) on commit preserve rows;
truncate _plak129;

-- ── 1. de tabellen ──────────────────────────────────────────────────
do $blk0$
begin
  if to_regclass('public.polls') is null then
    create table public.polls (
      id          uuid primary key default gen_random_uuid(),
      tenant_id   uuid not null,
      question    text not null check (length(btrim(question)) between 1 and 200),
      -- [{"id":"o1","label":"Meta"}, ...]. De id's zijn positioneel en
      -- bewegen niet als een label wordt gecorrigeerd, zodat een
      -- getypte fout herstellen geen stemmen weggooit.
      options     jsonb not null,
      audience    text not null default 'everyone'
                    check (audience in ('everyone', 'advertisers', 'affiliates')),
      status      text not null default 'draft'
                    check (status in ('draft', 'open', 'closed')),
      closes_at   timestamptz,
      created_by  uuid,
      created_at  timestamptz not null default now(),
      updated_at  timestamptz not null default now(),
      constraint polls_options_shape check (
        jsonb_typeof(options) = 'array'
        and jsonb_array_length(options) between 2 and 8
      )
    );
    create index polls_tenant_idx on public.polls (tenant_id, status, created_at desc);
  end if;

  if to_regclass('public.poll_votes') is null then
    create table public.poll_votes (
      id          uuid primary key default gen_random_uuid(),
      poll_id     uuid not null references public.polls(id) on delete cascade,
      tenant_id   uuid not null,
      profile_id  uuid not null,
      user_id     uuid,
      option_id   text not null,
      created_at  timestamptz not null default now(),
      updated_at  timestamptz not null default now()
    );
    -- EEN stem per persoon. In de database, niet in de app.
    create unique index poll_votes_one_each on public.poll_votes (poll_id, profile_id);
    create index poll_votes_poll_idx on public.poll_votes (poll_id, option_id);
  end if;

  alter table public.polls enable row level security;
  alter table public.poll_votes enable row level security;
  revoke all on public.polls from anon, public;
  revoke all on public.poll_votes from anon, public;
  grant select on public.polls to authenticated;
  -- Alleen SELECT, en de policy hieronder beperkt dat tot je eigen
  -- stem. Schrijven doet uitsluitend de RPC.
  grant select on public.poll_votes to authenticated;
  grant select, insert, update, delete on public.polls to service_role;
  grant select, insert, update, delete on public.poll_votes to service_role;

  insert into _plak129 values (0, 'de tabellen',
    'polls en poll_votes staan er, RLS aan, anon eraf');
exception when others then
  insert into _plak129 values (0, 'de tabellen', 'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk0$;

-- ── 2. wie mag wat lezen ────────────────────────────────────────────
do $blk1$
begin
  drop policy if exists polls_select on public.polls;
  create policy polls_select on public.polls
    for select to authenticated
    using (
      public._is_admin_of(tenant_id)
      or (
        status = 'open'
        and exists (
          select 1 from public.user_profiles up
           where up.user_id = auth.uid()
             and up.tenant_id = polls.tenant_id
             and coalesce(up.is_active, true)
        )
      )
    );

  drop policy if exists poll_votes_select on public.poll_votes;
  create policy poll_votes_select on public.poll_votes
    for select to authenticated
    using (
      -- Je eigen stem, zodat het scherm weet dat je al hebt gestemd.
      exists (
        select 1 from public.user_profiles up
         where up.id = poll_votes.profile_id
           and up.user_id = auth.uid()
      )
      -- En de beheerder, die de uitslag moet kunnen sluiten.
      or public._is_admin_of(tenant_id)
    );

  insert into _plak129 values (1, 'wie mag lezen',
    'een open poll voor iedereen in de tenant, je eigen stem voor jou, alles voor een beheerder');
exception when others then
  insert into _plak129 values (1, 'wie mag lezen', 'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk1$;

-- ── 3. de uitslag zonder de stemmers ────────────────────────────────
do $blk2$
begin
  -- security_invoker IN de statement, want create or replace view zet
  -- reloptions leeg en laat hem anders stil vallen (CLAUDE.md).
  create or replace view public.poll_results
    with (security_invoker = on)
    as
    select v.poll_id,
           v.option_id,
           count(*)::bigint as votes
      from public.poll_votes v
     group by v.poll_id, v.option_id;

  revoke all on public.poll_results from anon, public;
  grant select on public.poll_results to authenticated;

  insert into _plak129 values (2, 'de uitslag',
    'poll_results geeft alleen aantallen -- niemand leest wie wat stemde');
exception when others then
  insert into _plak129 values (2, 'de uitslag', 'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk2$;

-- ── 4. stemmen ──────────────────────────────────────────────────────
do $blk3$
begin
  create or replace function public.poll_vote(
    p_poll_id uuid,
    p_option_id text
  )
  returns jsonb
  language plpgsql
  security definer
  set search_path to 'public'
  as $fn$
  declare
    v_poll    public.polls%rowtype;
    v_profile public.user_profiles%rowtype;
    v_aff     boolean := false;
  begin
    select * into v_poll from public.polls where id = p_poll_id;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'That poll is not there any more.');
    end if;

    select * into v_profile
      from public.user_profiles
     where user_id = auth.uid()
       and tenant_id = v_poll.tenant_id
       and coalesce(is_active, true)
     limit 1;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'You are not in this organisation.');
    end if;

    if v_poll.status <> 'open'
       or (v_poll.closes_at is not null and v_poll.closes_at <= now()) then
      return jsonb_build_object('ok', false, 'error', 'This poll is closed.');
    end if;

    -- Het antwoord moet er echt zijn. Anders zou een gepost id een
    -- rij maken die in geen enkele uitslag terugkomt.
    if not exists (
      select 1 from jsonb_array_elements(v_poll.options) o
       where o->>'id' = p_option_id
    ) then
      return jsonb_build_object('ok', false, 'error', 'That answer is not on this poll.');
    end if;

    -- Hoort deze persoon bij het publiek? Dezelfde regel als op het
    -- scherm (lib/pure-poll.ts), hier nog een keer, omdat een scherm
    -- geen poort is.
    select exists (
      select 1 from public.advertisers a
       where a.profile_id = v_profile.id
         and a.affiliate_status = 'approved'
    ) into v_aff;

    if v_poll.audience = 'advertisers'
       and lower(v_profile.role::text) not in ('advertiser', 'admin') then
      return jsonb_build_object('ok', false, 'error', 'This poll is not for you.');
    end if;
    if v_poll.audience = 'affiliates'
       and lower(v_profile.role::text) not in ('affiliate', 'admin')
       and not v_aff then
      return jsonb_build_object('ok', false, 'error', 'This poll is not for you.');
    end if;

    -- Van gedachten veranderen is normaal; een tweede rij is het niet.
    insert into public.poll_votes
      (poll_id, tenant_id, profile_id, user_id, option_id)
    values
      (v_poll.id, v_poll.tenant_id, v_profile.id, auth.uid(), p_option_id)
    on conflict (poll_id, profile_id) do update
      set option_id = excluded.option_id,
          updated_at = now();

    return jsonb_build_object('ok', true, 'option_id', p_option_id);
  end;
  $fn$;

  revoke all on function public.poll_vote(uuid, text) from public, anon;
  grant execute on function public.poll_vote(uuid, text) to authenticated, service_role;

  insert into _plak129 values (3, 'stemmen',
    'poll_vote(uuid, text) -- toetst open, bestaand antwoord en publiek; opnieuw stemmen vervangt');
exception when others then
  insert into _plak129 values (3, 'stemmen', 'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk3$;

-- ── 5. de bijwerkstempel ────────────────────────────────────────────
do $blk4$
begin
  if to_regprocedure('public._touch_updated_at()') is not null then
    drop trigger if exists polls_touch on public.polls;
    create trigger polls_touch before update on public.polls
      for each row execute function public._touch_updated_at();
    insert into _plak129 values (4, 'updated_at', 'trigger op polls gezet');
  else
    insert into _plak129 values (4, 'updated_at',
      '_touch_updated_at bestaat niet -- overgeslagen');
  end if;
exception when others then
  insert into _plak129 values (4, 'updated_at', 'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk4$;

-- ── controle ────────────────────────────────────────────────────────
do $blk5$
declare
  v_anon_p  boolean;
  v_anon_v  boolean;
  v_ins     boolean;
  v_fn      boolean;
  v_uniq    integer;
begin
  select has_table_privilege('anon', 'public.polls', 'select') into v_anon_p;
  select has_table_privilege('anon', 'public.poll_votes', 'select') into v_anon_v;
  select has_table_privilege('authenticated', 'public.poll_votes', 'insert') into v_ins;
  select has_function_privilege('authenticated', 'public.poll_vote(uuid, text)', 'execute')
    into v_fn;
  select count(*) into v_uniq from pg_indexes
   where schemaname = 'public' and indexname = 'poll_votes_one_each';

  insert into _plak129 values (5, 'stand van zaken',
    'anon leest polls: ' || v_anon_p::text || ' (moet false)'
    || ' | anon leest stemmen: ' || v_anon_v::text || ' (moet false)'
    || ' | klant mag zelf inserten: ' || v_ins::text || ' (moet false)'
    || ' | klant mag stemmen via de RPC: ' || v_fn::text || ' (moet true)'
    || ' | een-stem-per-persoon: ' || v_uniq || ' van 1');
exception when others then
  insert into _plak129 values (5, 'stand van zaken', 'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk5$;

-- ════════════════════════════════════════════════════════════════════
-- HET RAPPORT — de editor toont alleen deze laatste tabel.
-- ════════════════════════════════════════════════════════════════════
select n as "#", stap as "wat", uitkomst as "uitkomst"
  from _plak129 order by n;
