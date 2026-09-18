-- =====================================================================
-- invitations.expires_at must be a timestamptz
-- =====================================================================
-- APPLIED ON LIVE 2026-09-17. Verified afterwards:
--     created_at   timestamp with time zone   NOT NULL   default now()
--     expires_at   timestamp with time zone   NOT NULL
-- Both are instants now, so an invite expires at the same moment wherever
-- the code runs. Nothing else to do here; this file is the record.
--
-- Found by supabase/checks/RUN-ME.sql on the same day: the column existed
-- but was NOT `timestamp with time zone`.
--
-- WHAT IS ACTUALLY WRONG, precisely — the check's own verdict overstated it
-- and this is the correction:
--
-- Every expiry comparison in the app happens in JavaScript, not SQL:
--     if (new Date(invitation.expires_at) < new Date()) → expired
-- (app/api/accept-invite/route.ts, .../signup/route.ts,
--  app/auth/sign-up/page.tsx, app/invite/accept/page.tsx)
--
-- So an expired link does NOT keep working indefinitely. What happens is
-- narrower and still wrong:
--
--   * send-invite writes `new Date(...).toISOString()` — an instant, with a
--     trailing Z.
--   * A `timestamp without time zone` column PARSES that literal and throws
--     the offset away, keeping the UTC wall clock.
--   * PostgREST then returns "2026-09-24T19:07:00" with no zone, and
--     `new Date()` on a zone-less date-time string parses it as LOCAL time
--     (ECMA-262 §21.4.3.2).
--
-- On a UTC server local IS UTC and the comparison is right. Anywhere else —
-- a developer machine, a future region change, a preview deployment — the
-- expiry moves by that machine's offset. An invite expires hours early or
-- hours late, and which one depends on where the code happens to run. That
-- is not a thing to leave to luck on a link that grants access to a tenant.
--
-- (It rewrote the column, which takes a brief ACCESS EXCLUSIVE lock on
-- `invitations` — a small table, and nothing else writes to it mid-invite.)
--
-- The conversion picks itself: a `timestamp` is interpreted AS UTC, which is
-- exactly what was written into it, and a `text` column is cast. Anything
-- else is left alone and reported rather than guessed at.
-- =====================================================================

set search_path = public;

do $blk0$
declare
  v_type text;
begin
  select data_type into v_type
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'invitations'
     and column_name = 'expires_at';

  if v_type is null then
    raise notice 'invitations.expires_at does not exist — nothing to convert';

  elsif v_type = 'timestamp with time zone' then
    raise notice 'invitations.expires_at is already timestamptz — nothing to do';

  elsif v_type = 'timestamp without time zone' then
    -- The stored wall clock IS the UTC instant that was written, so say so.
    -- (A plain ::timestamptz cast would instead read it as the SESSION's
    -- zone, which would move every existing expiry.)
    alter table public.invitations
      alter column expires_at type timestamptz
      using expires_at at time zone 'UTC';
    raise notice 'converted invitations.expires_at from timestamp to timestamptz (read as UTC)';

  elsif v_type in ('text', 'character varying') then
    alter table public.invitations
      alter column expires_at type timestamptz
      using expires_at::timestamptz;
    raise notice 'converted invitations.expires_at from % to timestamptz', v_type;

  else
    raise exception 'invitations.expires_at is % — not converting blindly. Look at it first.', v_type;
  end if;
end $blk0$;

-- Same question for created_at, for the same reason: it is what the invite
-- list sorts and ages by.
do $blk1$
declare
  v_type text;
begin
  select data_type into v_type
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'invitations'
     and column_name = 'created_at';

  if v_type = 'timestamp without time zone' then
    alter table public.invitations
      alter column created_at type timestamptz
      using created_at at time zone 'UTC';
    raise notice 'converted invitations.created_at to timestamptz (read as UTC)';
  else
    raise notice 'invitations.created_at is % — left alone', coalesce(v_type, 'absent');
  end if;
end $blk1$;

-- Read it back.
select column_name, data_type, is_nullable, column_default
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'invitations'
   and column_name in ('created_at', 'expires_at')
 order by column_name;
