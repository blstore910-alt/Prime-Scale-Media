-- =====================================================================
-- Keep what Wise actually tells us about a deposit
-- =====================================================================
-- ⚠️ APPLY ON SUPABASE MANUALLY. One column, nullable, no backfill, no
-- behaviour change on its own.
--
-- WHY. Every deposit in the review queue reads "no reference" — 231 of
-- them, 0 with a reference — and the only other thing on the row is
-- `Wise: 63309216:2026-09-17T19:01:32Z`, which is OUR OWN idempotency
-- key (balanceId:occurredAt:amount), not anything the payer wrote. So an
-- admin looking at a payment has the amount, the time, and nothing else
-- to recognise it by.
--
-- Wise's balance statement carries more than the reference field we read:
-- each line has a `details.description` — the human string Wise itself
-- shows, typically "Received money from SOMEBODY with reference XYZ" —
-- and often a sender name. For SEPA payments the payer's reference text
-- frequently lands ONLY in that description, which is why
-- details.paymentReference comes back null while the reference is sitting
-- right there in prose.
--
-- This column stores it. lib/integrations/wise-api.ts also now mines it
-- for a reference as a fallback, so a payment whose reference Wise only
-- reports in words can still match automatically.
--
-- ROLLBACK:
--     alter table public.wise_incoming_transfers drop column if exists description;
-- =====================================================================

alter table public.wise_incoming_transfers
  add column if not exists description text;

comment on column public.wise_incoming_transfers.description is
  'The human-readable line Wise reports for this credit (details.description on the balance statement). Not our own text - see note for that.';

-- Read it back: the column exists and is nullable.
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'wise_incoming_transfers'
   and column_name = 'description';
