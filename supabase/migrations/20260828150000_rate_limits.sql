-- =====================================================================
-- Distributed rate limiter backed by Postgres
-- =====================================================================
-- Serverless Next.js runs across many instances, so an in-memory
-- Map won't work. We push the counter into Postgres via an atomic
-- RPC. The bucket table is compact (one row per key/window) and gets
-- cleaned up opportunistically.
-- =====================================================================

set search_path = public;

create table if not exists public.rate_limit_buckets (
  key         text primary key,
  count       integer not null,
  window_start timestamptz not null default now()
);

create index if not exists rate_limit_buckets_window_idx
  on public.rate_limit_buckets (window_start);

-- rate_limit_check
--
-- Atomic counter with sliding fixed window. Returns true when the
-- caller is allowed, false when the limit is hit.
--
-- Params:
--   p_key            :  arbitrary identifier ("ip:1.2.3.4:send-invite")
--   p_max_requests   :  ceiling within the window
--   p_window_seconds :  window length
create or replace function public.rate_limit_check(
  p_key            text,
  p_max_requests   integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now  timestamptz := clock_timestamp();
  v_row  public.rate_limit_buckets%rowtype;
  v_reset boolean := false;
begin
  if p_key is null or length(p_key) = 0 then
    return true; -- fail-open on malformed key
  end if;
  if p_max_requests <= 0 or p_window_seconds <= 0 then
    return true;
  end if;

  select * into v_row
    from public.rate_limit_buckets
   where key = p_key
   for update;

  if not found then
    insert into public.rate_limit_buckets (key, count, window_start)
         values (p_key, 1, v_now);
    return true;
  end if;

  -- Window expired -> reset.
  if v_now - v_row.window_start > make_interval(secs => p_window_seconds) then
    update public.rate_limit_buckets
       set count = 1,
           window_start = v_now
     where key = p_key;
    return true;
  end if;

  if v_row.count >= p_max_requests then
    return false;
  end if;

  update public.rate_limit_buckets
     set count = count + 1
   where key = p_key;
  return true;
end;
$$;

revoke all on function public.rate_limit_check(text, integer, integer) from public;
grant execute on function public.rate_limit_check(text, integer, integer) to authenticated, anon;

-- Opportunistic janitor — call from cron once a day.
create or replace function public.rate_limit_prune(p_older_than_seconds integer default 86400)
returns integer
language sql
security definer
set search_path = public
as $$
  with deleted as (
    delete from public.rate_limit_buckets
     where window_start < clock_timestamp() - make_interval(secs => p_older_than_seconds)
     returning 1
  )
  select count(*)::integer from deleted;
$$;

revoke all on function public.rate_limit_prune(integer) from public;
-- Restrict prune to admins only via Supabase cron.
