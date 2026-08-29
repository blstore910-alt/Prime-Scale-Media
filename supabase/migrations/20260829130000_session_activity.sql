-- =====================================================================
-- Session activity tracking
-- =====================================================================
-- Adds `last_seen_at` to user_profiles + a tiny SECURITY DEFINER RPC
-- that the app calls at most once every 5 minutes per user. Cheap,
-- and it gives incident response an answer to "was this account
-- active in the last hour?".
--
-- This is NOT a real presence system — no websockets, no real-time.
-- It's a low-frequency heartbeat.
-- =====================================================================

set search_path = public;

alter table public.user_profiles
  add column if not exists last_seen_at timestamptz;

create index if not exists user_profiles_last_seen_idx
  on public.user_profiles (last_seen_at desc)
  where last_seen_at is not null;

-- ---------------------------------------------------------------------
-- Called by /api/heartbeat. Updates AT MOST ONCE per 5 minutes per
-- profile — the "if" guard keeps us from thrashing the row on every
-- request, and the SECURITY DEFINER bypasses the update-column
-- allowlist RLS policy for exactly this one field.
-- ---------------------------------------------------------------------
create or replace function public.mark_session_seen()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return;
  end if;

  update public.user_profiles
     set last_seen_at = now()
   where user_id = v_uid
     and (last_seen_at is null or last_seen_at < now() - interval '5 minutes');
end;
$$;

revoke all on function public.mark_session_seen() from public;
grant execute on function public.mark_session_seen() to authenticated;
