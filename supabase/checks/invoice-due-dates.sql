-- =====================================================================
-- Where do invoice due dates and the first billing date come from?
-- =====================================================================
-- Read-only. Run each statement separately — the Supabase SQL editor only
-- shows the result of the last one.
--
-- The rule we want:
--
--   * the FIRST subscription invoice is due within 3 DAYS of signup, not a
--     month. A new advertiser who pays nothing for a month is a month of
--     work and exposure before anyone finds out whether they intended to
--     pay at all.
--   * every invoice after that is due 7 DAYS after it is issued.
--   * the Pay button stays available either way — a due date is when we
--     expect the money, not when we stop accepting it.
--
-- What the app shows today is `subscriptions.next_payment_date`, which for
-- the account created on 16 Sep read 16 Oct. So something is adding a month
-- at creation. That something is in the DATABASE, not in the app: no code in
-- this repo writes next_payment_date. This finds it before anything is
-- changed, because this project has broken a live RPC once already by
-- rewriting it from the repo's copy when the live one had diverged.
-- =====================================================================

-- 1. Which functions touch next_payment_date or due_date at all?
select
  p.proname                        as function_name,
  pg_get_function_identity_arguments(p.oid) as args,
  p.prosecdef                      as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and (p.prosrc ilike '%next_payment_date%' or p.prosrc ilike '%due_date%')
order by p.proname;

-- ---------------------------------------------------------------------
-- 2. The lines that set them, so the interval is visible without dumping
--    hundreds of lines of function body.
-- ---------------------------------------------------------------------
-- select
--   p.proname as function_name,
--   l.lineno,
--   trim(l.line) as line
-- from pg_proc p
-- join pg_namespace n on n.oid = p.pronamespace
-- cross join lateral unnest(string_to_array(p.prosrc, E'\n'))
--   with ordinality as l(line, lineno)
-- where n.nspname = 'public'
--   and (l.line ilike '%next_payment_date%'
--     or l.line ilike '%due_date%'
--     or l.line ilike '%interval%')
--   and (p.prosrc ilike '%next_payment_date%' or p.prosrc ilike '%due_date%')
-- order by p.proname, l.lineno;

-- ---------------------------------------------------------------------
-- 3. What the columns actually hold right now, newest first. If due_date
--    is NULL on every row, the app is deriving it from the subscription
--    and there is only one place to change.
-- ---------------------------------------------------------------------
-- select
--   i.id,
--   i.number,
--   i.type,
--   i.status,
--   i.created_at,
--   i.due_date,
--   i.due_date::date - i.created_at::date as days_to_pay,
--   a.tenant_client_code
-- from public.invoices i
-- left join public.advertisers a on a.id = i.advertiser_id
-- order by i.created_at desc
-- limit 20;

-- ---------------------------------------------------------------------
-- 4. And the subscriptions, to see the month that is being added.
-- ---------------------------------------------------------------------
-- select
--   s.id,
--   s.status,
--   s.amount,
--   s.currency,
--   s.start_date,
--   s.next_payment_date,
--   s.next_payment_date::date - s.start_date::date as days_until_first_payment,
--   a.tenant_client_code
-- from public.subscriptions s
-- left join public.advertisers a on a.id = s.advertiser_id
-- order by s.start_date desc
-- limit 20;

-- ---------------------------------------------------------------------
-- Once these come back, the change is one interval in one function, plus a
-- backfill decision for subscriptions that already exist. Do NOT rewrite the
-- function from the repo copy — read the live definition, change the
-- interval in it, and re-execute that.
-- ---------------------------------------------------------------------
