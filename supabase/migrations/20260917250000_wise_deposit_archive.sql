-- =====================================================================
-- Put an old deposit away without pretending it never happened
-- =====================================================================
-- ⚠️ APPLY ON SUPABASE MANUALLY. One nullable column and one index. No
-- behaviour change on its own.
--
-- WHY. The deposit feed is 231 rows deep and most of them are old test
-- payments of 0.01 that will never match anything. There was no way to
-- put one aside: the only tool was the "Show N more deposits with nothing
-- to confirm" fold, which hides EVERY quiet row including the ones that
-- still need a person. So the queue could not be worked down, and the one
-- deposit that mattered sat in a list of two hundred that did not.
--
-- Archiving is NOT a status. status says what happened to the MONEY —
-- unmatched, suggested, confirmed — and overloading it with a housekeeping
-- flag would mean an archived deposit losing the record of whether it was
-- ever credited. A separate timestamp keeps both facts, and keeps them
-- reversible: archived_at = null is the whole of unarchiving.
--
-- It also has to be easy to find again, which is why it is a timestamp and
-- not a delete: the panel's Archived toggle lists them newest-first, every
-- row keeps its amount, date, reference, sender, note and status, and
-- Unarchive is one click.
--
-- ROLLBACK:
--     alter table public.wise_incoming_transfers drop column if exists archived_at;
-- =====================================================================

alter table public.wise_incoming_transfers
  add column if not exists archived_at timestamptz;

comment on column public.wise_incoming_transfers.archived_at is
  'When an admin put this deposit aside. Housekeeping only - never a money state; see status for that. Null means it is in the live queue.';

-- The panel asks for "not archived, newest first" on every load.
create index if not exists wise_incoming_archived_idx
  on public.wise_incoming_transfers (archived_at, created_at desc);

-- Read it back: the column and the index exist.
select
  (select count(*) from information_schema.columns
    where table_schema = 'public'
      and table_name = 'wise_incoming_transfers'
      and column_name = 'archived_at')                    as column_added,
  (select count(*) from pg_indexes
    where schemaname = 'public'
      and indexname = 'wise_incoming_archived_idx')       as index_added;
