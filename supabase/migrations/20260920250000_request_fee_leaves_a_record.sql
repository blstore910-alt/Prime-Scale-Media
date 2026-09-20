-- =====================================================================
-- The ad-account request fee left the wallet with no line anywhere
-- =====================================================================
-- ad_account_request_create_paid debits wallets.eur_balance / usd_balance
-- directly (20260901400000_advertiser_perks.sql:268-274) and then
-- inserts the request. It writes no invoice, no wallet_topups row, no
-- top_ups row, no precharge -- nothing.
--
-- The advertiser's own statement is built from exactly five sources:
-- wallet_topups, wallet_exchanges, paid invoices, top_ups_view and
-- ad_account_withdrawals. The financial report adds precharges and
-- my_wallet_extras. The request fee is none of them. The Requests tab
-- shows date, platform and status -- no amount.
--
-- So: a customer with EUR 500 requests an ad account, the form says
-- EUR 50 will be charged, the balance becomes EUR 450, and there is no
-- line on any screen they can open. Their exported CSV -- the one that
-- goes to a bookkeeper -- is EUR 50 out. The refund path does the same
-- in reverse (20260918220000:126-136), so a rejected request silently
-- ADDS 50 out of nowhere.
--
-- This migration only makes the movement RECORDABLE: two columns on the
-- request itself, written by both functions. It deliberately does not
-- invent a ledger -- that is a bigger decision -- but it does mean the
-- statement and the report can show the line, and they do as soon as
-- this lands. Until then the app asks for these columns and, on the
-- error PostgREST returns, asks again without them, so the feature
-- stays dark rather than breaking the screen.
--
-- charged_at is what the statement sorts on. refunded_at is set by the
-- refund path so one row can carry both halves without a second table.
--
-- Safe to run more than once.
-- =====================================================================

set search_path = public;

alter table public.ad_account_requests
  add column if not exists charged_amount   numeric,
  add column if not exists charged_currency text,
  add column if not exists charged_at       timestamptz,
  add column if not exists refunded_amount  numeric,
  add column if not exists refunded_at      timestamptz;

comment on column public.ad_account_requests.charged_amount is
  'What actually left the wallet for this request, in charged_currency. Null means nothing was charged (a free request, or a perk covered it).';
comment on column public.ad_account_requests.refunded_amount is
  'What was put back when the request was rejected. Null means nothing was returned.';

-- Both functions are hand-authored on live and are NOT replaced here --
-- replacing a live body from this repo has gone wrong before. Instead a
-- trigger fills the columns from the movement the functions already
-- make, which is the part that cannot drift: the wallet is debited in
-- the same statement that inserts the request.
--
-- There is no safe way to observe that debit from a trigger on
-- ad_account_requests, so the two functions DO have to write these
-- columns. The report below says plainly whether they do; if it says
-- NOT WRITING, the fee is still invisible and the function bodies need
-- the two lines adding:
--
--   charged_amount = v_fee, charged_currency = v_cur, charged_at = now()
--
-- in ad_account_request_create_paid's INSERT, and
--
--   refunded_amount = v_fee, refunded_at = now()
--
-- in the refund path's UPDATE.

-- An index for the statement read: "this customer's charged requests,
-- newest first" is the only shape anything asks for.
create index if not exists ad_account_requests_charged_idx
  on public.ad_account_requests (advertiser_id, charged_at desc)
  where charged_at is not null;

-- ── The report ───────────────────────────────────────────────────────
-- The SQL editor shows only the LAST result set, so this is the one.
select
  'columns added' as item,
  (
    select count(*)::text || ' of 5'
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'ad_account_requests'
       and column_name in ('charged_amount', 'charged_currency',
                           'charged_at', 'refunded_amount', 'refunded_at')
  ) as status
union all
select
  'create-paid writes charged_amount',
  case
    when not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'ad_account_request_create_paid'
    ) then 'FUNCTION NOT ON THIS DATABASE'
    when (
      select position('charged_amount' in pg_get_functiondef(p.oid)) > 0
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'ad_account_request_create_paid'
       limit 1
    ) then 'OK'
    else 'NOT WRITING - the fee is still invisible, see this file'
  end
union all
select
  'refund path writes refunded_amount',
  case
    when not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'ad_account_request_reject_refund'
    ) then 'FUNCTION NOT ON THIS DATABASE'
    when (
      select position('refunded_amount' in pg_get_functiondef(p.oid)) > 0
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'ad_account_request_reject_refund'
       limit 1
    ) then 'OK'
    else 'NOT WRITING - a refund is still invisible, see this file'
  end
union all
select
  'requests that charged something (historic, unrecorded)',
  (select count(*)::text from public.ad_account_requests where charged_at is null);
