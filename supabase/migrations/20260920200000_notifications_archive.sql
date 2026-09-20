-- =====================================================================
-- notifications.archived_at -- put one aside without deleting it
-- =====================================================================
-- The only way to clear the list today is "delete all read", which is
-- all-or-nothing and destroys the row. An admin working a queue wants
-- the opposite: deal with this one, get it off the screen, and still be
-- able to find it in a week when somebody asks what the alert said.
--
-- One nullable timestamp. Null means it is in the list; set means it is
-- in the archive. Nothing is deleted, and un-archiving is writing null
-- back.
--
-- PER USER, and that is the whole point: notifications.recipient_user_id
-- already scopes every row to one person, so archiving is a private act.
-- One admin clearing their own queue does not clear anybody else's.
--
-- The app tolerates this column being absent -- it asks for it and, on
-- the error PostgREST returns, asks again without it and hides the
-- archive. So the code can ship before this file is pasted, which is the
-- ordinary state of affairs here.
--
-- Safe to run more than once.
-- =====================================================================

set search_path = public;

alter table public.notifications
  add column if not exists archived_at timestamptz;

comment on column public.notifications.archived_at is
  'Set when the recipient puts this notification aside. Null = in the list. Never deleted; un-archiving writes null back.';

-- The list reads "mine, not archived, newest first" on every page load,
-- and the archive reads the same rows the other way round. Partial, so
-- it stays small: the archived half is the half nobody is waiting on.
create index if not exists notifications_recipient_active_idx
  on public.notifications (recipient_user_id, created_at desc)
  where archived_at is null;

create index if not exists notifications_recipient_archived_idx
  on public.notifications (recipient_user_id, archived_at desc)
  where archived_at is not null;

-- ── The report ───────────────────────────────────────────────────────
-- The SQL editor shows only the LAST result set, so this is the one.
select
  'notifications.archived_at' as item,
  case
    when exists (
      select 1 from information_schema.columns
       where table_schema = 'public'
         and table_name = 'notifications'
         and column_name = 'archived_at'
    ) then 'OK'
    else 'MISSING'
  end as status
union all
select
  'index: mine, not archived',
  case
    when exists (
      select 1 from pg_indexes
       where schemaname = 'public'
         and indexname = 'notifications_recipient_active_idx'
    ) then 'OK' else 'MISSING'
  end
union all
select
  'index: mine, archived',
  case
    when exists (
      select 1 from pg_indexes
       where schemaname = 'public'
         and indexname = 'notifications_recipient_archived_idx'
    ) then 'OK' else 'MISSING'
  end
union all
select
  'notifications in the list now',
  (select count(*)::text from public.notifications where archived_at is null)
union all
select
  'notifications already archived',
  (select count(*)::text from public.notifications where archived_at is not null);
