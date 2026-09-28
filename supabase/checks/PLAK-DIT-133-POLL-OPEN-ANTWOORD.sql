-- ════════════════════════════════════════════════════════════════════
-- PLAK 133 — een poll waar mensen hun eigen woorden mogen gebruiken
-- ════════════════════════════════════════════════════════════════════
--
-- DRAAI EERST PLAK 129. Zonder `polls` doet deze niets (hij zegt dat
-- dan ook, in plaats van te struikelen).
--
-- De eigenaar, 28-09: "open answer moet ook mogelijk zijn en char
-- limited en veilig."
--
-- WAT ERBIJ KOMT
--
--   polls.kind              'choice' (kies er een) of 'open' (zeg het
--                           zelf). Bestaande polls worden 'choice',
--                           want dat zijn ze.
--   poll_votes.answer_text  wat iemand heeft getypt, maximaal 280
--                           tekens, afgedwongen door een CHECK.
--
-- CHAR LIMITED, EN NIET ALLEEN OP HET SCHERM. De teller in de kaart is
-- er voor de klant; de CHECK hieronder is de grens die telt, want
-- `poll_vote()` is rechtstreeks aanroepbaar en een lengte die alleen in
-- JavaScript staat is geen lengte.
--
-- VEILIG, en wel zo:
--
--   * de RPC knipt zelf af op 280 en haalt stuurtekens eruit, dus zelfs
--     een directe aanroep kan geen NUL-byte of een regeleinde in de
--     tabel krijgen. Een NUL-byte weigert Postgres sowieso, en dat zou
--     de klant een foutmelding geven die hij niet kan plaatsen; een
--     regeleinde breekt een CSV-export middenin een rij;
--   * er wordt NIETS ge-escaped bij het opslaan. React escapet wat hij
--     rendert, en bij de deur escapen zou `&amp;` in de database zetten
--     en dat aan de eigenaar laten zien. De tekst wordt opgeslagen
--     zoals hij is getypt en nergens als HTML uitgevoerd;
--   * nog steeds EEN antwoord per persoon (de unieke index uit plak
--     129), en opnieuw antwoorden vervangt;
--   * en nog steeds leest niemand andermans antwoord: `poll_votes`
--     heeft alleen de select-policy uit plak 129 -- je eigen rij, of
--     alles als je beheerder bent. Een open poll is dus NIET anoniem
--     voor de eigenaar, en dat hoort ook: hij moet erop kunnen
--     antwoorden. Voor de andere klanten is hij dat wel.
--
-- Plak dit hele bestand in de SQL editor. Onderaan staat EEN
-- rapporttabel.
-- ════════════════════════════════════════════════════════════════════

create temporary table if not exists _plak133 (
  n integer, stap text, uitkomst text
) on commit preserve rows;
truncate _plak133;

-- ── 1. de twee kolommen ─────────────────────────────────────────────
do $blk0$
begin
  if to_regclass('public.polls') is null then
    insert into _plak133 values (0, 'de kolommen',
      'AFGEBROKEN: polls bestaat niet -- draai eerst plak 129');
    return;
  end if;

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'polls' and column_name = 'kind'
  ) then
    alter table public.polls add column kind text not null default 'choice';
    alter table public.polls add constraint polls_kind_ck
      check (kind in ('choice', 'open', 'both'));
  end if;

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'poll_votes'
       and column_name = 'answer_text'
  ) then
    alter table public.poll_votes add column answer_text text;
    alter table public.poll_votes add constraint poll_votes_answer_len_ck
      check (answer_text is null or length(answer_text) <= 280);
  end if;

  -- Een keuzepoll heeft een option_id nodig, een open poll tekst. Niet
  -- allebei leeg: dat is een stem die niets zegt.
  if not exists (
    select 1 from pg_constraint where conname = 'poll_votes_says_something_ck'
  ) then
    alter table public.poll_votes add constraint poll_votes_says_something_ck
      check (
        coalesce(btrim(option_id), '') <> ''
        or coalesce(btrim(answer_text), '') <> ''
      );
  end if;

  insert into _plak133 values (0, 'de kolommen',
    'polls.kind en poll_votes.answer_text staan er, met hun checks');
exception when others then
  insert into _plak133 values (0, 'de kolommen', 'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk0$;

-- ── 2. option_id mag leeg zijn op een open poll ─────────────────────
do $blk1$
begin
  -- Hij is not null uit plak 129, en op een open poll is er geen
  -- antwoord om naar te wijzen.
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'poll_votes'
       and column_name = 'option_id' and is_nullable = 'NO'
  ) then
    alter table public.poll_votes alter column option_id drop not null;
    insert into _plak133 values (1, 'option_id', 'mag nu leeg zijn op een open poll');
  else
    insert into _plak133 values (1, 'option_id', 'stond al goed');
  end if;
exception when others then
  insert into _plak133 values (1, 'option_id', 'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk1$;

-- ── 3. stemmen, nu ook met woorden ──────────────────────────────────
do $blk2$
begin
  create or replace function public.poll_vote(
    p_poll_id uuid,
    p_option_id text default null,
    p_answer_text text default null
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
    v_kind    text;
    v_text    text;
    v_opt     text;
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

    -- Hoort deze persoon bij het publiek? Dezelfde regel als op het
    -- scherm, hier nog een keer, want een scherm is geen poort.
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

    v_kind := coalesce(v_poll.kind, 'choice');

    -- 280 tekens en geen stuurtekens, HIER en niet alleen op het
    -- scherm: deze functie is rechtstreeks aanroepbaar.
    v_text := left(btrim(regexp_replace(coalesce(p_answer_text, ''),
                                        '[[:cntrl:]]+', ' ', 'g')), 280);
    v_text := nullif(btrim(regexp_replace(v_text, '[ ]{2,}', ' ', 'g')), '');

    if v_kind = 'open' then
      -- Geen antwoorden om naar te wijzen; de tekst IS het antwoord.
      if v_text is null then
        return jsonb_build_object('ok', false, 'error', 'Write something first.');
      end if;
      v_opt := null;
    else
      -- 'choice' en 'both' eisen allebei een bestaand antwoord.
      if not exists (
        select 1 from jsonb_array_elements(v_poll.options) o
         where o->>'id' = p_option_id
      ) then
        return jsonb_build_object('ok', false, 'error', 'That answer is not on this poll.');
      end if;
      v_opt := p_option_id;
      -- Bij 'both' mag er tekst bij, en die is optioneel: iemand die
      -- alleen kiest heeft al geantwoord. Bij 'choice' hoort er geen
      -- tekst te zijn, ook niet als iemand hem meestuurt.
      if v_kind <> 'both' then
        v_text := null;
      end if;
    end if;

    insert into public.poll_votes
      (poll_id, tenant_id, profile_id, user_id, option_id, answer_text)
    values
      (v_poll.id, v_poll.tenant_id, v_profile.id, auth.uid(), v_opt, v_text)
    on conflict (poll_id, profile_id) do update
      set option_id = excluded.option_id,
          answer_text = excluded.answer_text,
          updated_at = now();

    return jsonb_build_object('ok', true, 'option_id', v_opt, 'answer_text', v_text);
  end;
  $fn$;

  -- De oude tweeargumentige versie gaat weg, anders staan er twee
  -- naast elkaar en kiest PostgREST er een.
  if to_regprocedure('public.poll_vote(uuid, text)') is not null then
    drop function public.poll_vote(uuid, text);
  end if;

  revoke all on function public.poll_vote(uuid, text, text) from public, anon;
  grant execute on function public.poll_vote(uuid, text, text) to authenticated, service_role;

  insert into _plak133 values (2, 'stemmen',
    'poll_vote(uuid, text, text) -- knipt zelf af op 280 en haalt stuurtekens eruit');
exception when others then
  insert into _plak133 values (2, 'stemmen', 'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk2$;

-- ── controle ────────────────────────────────────────────────────────
do $blk3$
declare
  v_kind  boolean;
  v_ans   boolean;
  v_fn3   boolean;
  v_fn2   boolean;
  v_anon  boolean;
  v_write boolean;
begin
  select exists (select 1 from information_schema.columns
     where table_schema='public' and table_name='polls' and column_name='kind') into v_kind;
  select exists (select 1 from information_schema.columns
     where table_schema='public' and table_name='poll_votes' and column_name='answer_text') into v_ans;
  select to_regprocedure('public.poll_vote(uuid, text, text)') is not null into v_fn3;
  select to_regprocedure('public.poll_vote(uuid, text)') is not null into v_fn2;
  select has_function_privilege('anon', 'public.poll_vote(uuid, text, text)', 'execute') into v_anon;
  select has_table_privilege('authenticated', 'public.poll_votes', 'insert') into v_write;

  insert into _plak133 values (3, 'stand van zaken',
    'polls.kind: ' || v_kind::text
    || ' | answer_text: ' || v_ans::text
    || ' | nieuwe RPC: ' || v_fn3::text
    || ' | oude RPC weg: ' || (not v_fn2)::text
    || ' | anon mag stemmen: ' || coalesce(v_anon, false)::text || ' (moet false)'
    || ' | klant mag zelf inserten: ' || coalesce(v_write, false)::text || ' (moet false)');
exception when others then
  insert into _plak133 values (3, 'stand van zaken', 'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk3$;

-- ════════════════════════════════════════════════════════════════════
-- HET RAPPORT — de editor toont alleen deze laatste tabel.
-- ════════════════════════════════════════════════════════════════════
select n as "#", stap as "wat", uitkomst as "uitkomst"
  from _plak133 order by n;
