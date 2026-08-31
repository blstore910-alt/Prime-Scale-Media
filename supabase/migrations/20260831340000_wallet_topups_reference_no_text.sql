-- =====================================================================
-- P0: wallet topup submission failed with a type mismatch
-- =====================================================================
--   column "reference_no" is of type bigint but expression is of type
--   character varying
--
-- wallet_topup_advertiser_create() generates the transfer reference with
-- lpad(...,10,'0') (text, keeps leading zeros) and copies the wallet's
-- reference into wallet_topups. In the live DB wallets.reference_no is
-- text but wallet_topups.reference_no was bigint, so the insert of a
-- varchar reference into a bigint column threw — every advertiser topup
-- request failed.
--
-- Make wallet_topups.reference_no text. It's an identifier the customer
-- puts in their bank-transfer description (leading zeros matter), never
-- an arithmetic value; the app already types it as string | number and
-- the Wise matcher compares via String(). Text is the correct type.
-- =====================================================================

alter table public.wallet_topups
  alter column reference_no type text using reference_no::text;
