-- =====================================================================
-- What is ACTUALLY on live — one script, short answers
-- =====================================================================
-- Every sweep tonight ended with "I cannot tell from the repo". This
-- answers as many of those as can be answered with a yes/no, so only
-- the genuinely long function bodies have to be pasted back.
--
-- Read-only. Changes nothing.
-- =====================================================================

set search_path = public;

with facts(sort, item, status) as (

  -- ── 1. THE CANCEL-INVOICE CONTROL ─────────────────────────────────
  select 1, 'invoices.notes exists (the Cancel reason needs it)',
    case when exists (
      select 1 from information_schema.columns
       where table_schema='public' and table_name='invoices'
         and column_name='notes'
    ) then 'YES' else 'NO - reasons are not being saved' end

  -- ── 2. BILLED TWICE: is the one-billable-plan index live? ─────────
  union all select 2, 'subscriptions: one billable plan enforced by an index',
    case when exists (
      select 1 from pg_indexes
       where schemaname='public' and tablename='subscriptions'
         and indexdef ilike '%status%' and indexdef ilike '%unique%'
    ) then 'YES' else 'NO - two active plans would bill twice' end

  -- ── 3. A SECOND PAID-INVOICE TRIGGER? ─────────────────────────────
  -- If two triggers both roll next_payment_date forward, every paid
  -- invoice skips a month, for every customer, for ever.
  union all select 3, 'triggers on public.invoices',
    coalesce((
      select string_agg(p.proname, ' + ' order by p.proname)
        from pg_trigger t
        join pg_proc p on p.oid = t.tgfoid
        join pg_class c on c.oid = t.tgrelid
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname='public' and c.relname='invoices'
         and not t.tgisinternal
    ), 'none')

  -- ── 4. DOES THE COLLECT LOOP SKIP A PAUSED PLAN? ──────────────────
  union all select 4, 'billing run skips paused/inactive when collecting',
    case
      when not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                        where n.nspname='public' and p.proname='subscription_billing_run')
        then 'FUNCTION NOT HERE'
      when (select position('''paused''' in pg_get_functiondef(p.oid)) > 0
              from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname='subscription_billing_run' limit 1)
        then 'YES'
      else 'NO - a paused customer is still auto-debited'
    end

  -- ── 5. DOES AN UNPAID ADJUSTMENT STOP ALL FUTURE INVOICING? ───────
  union all select 5, 'billing run filters the duplicate check by type',
    case
      when not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                        where n.nspname='public' and p.proname='subscription_billing_run')
        then 'FUNCTION NOT HERE'
      when (select position('i.type = ''subscription''' in pg_get_functiondef(p.oid)) > 0
              from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname='subscription_billing_run' limit 1)
        then 'YES'
      else 'NO - one unpaid adjustment may stall monthly invoicing'
    end

  -- ── 6. A SECOND BILLING ENGINE IN pg_cron? ────────────────────────
  union all select 6, 'pg_cron jobs',
    coalesce((
      select string_agg(jobname, ' | ' order by jobname)
        from cron.job
    ), 'none / cron schema not readable')

  -- ── 7. DO THE TWO REFERRAL VIEWS RESPECT RLS? ─────────────────────
  -- A view runs as its OWNER unless security_invoker is on. If this is
  -- NO, any signed-in user can read every commission in every tenant.
  union all select 7, 'referral views read as the caller (security_invoker)',
    coalesce((
      select string_agg(
               c.relname || '=' ||
               case when array_to_string(coalesce(c.reloptions, '{}'), ',')
                         ilike '%security_invoker=on%'
                    then 'YES' else 'NO' end,
               ' | ' order by c.relname)
        from pg_class c join pg_namespace n on n.oid=c.relnamespace
       where n.nspname='public'
         and c.relname in ('referral_links_with_details',
                           'referral_commissions_with_details',
                           'top_ups_view')
    ), 'views not found')

  -- ── 8. IS ANY ADVERTISER CARRYING TWO REFERRAL LINKS? ─────────────
  -- Commission could accrue on one and be clawed back from the other.
  union all select 8, 'advertisers with more than one referral link',
    (select count(*)::text from (
       select referred_advertiser_id from public.referral_links
        group by 1 having count(*) > 1) x)

  -- ── 9. IS THE REQUEST FEE RECORDED ANYWHERE? ──────────────────────
  union all select 9, 'ad-account request fee writes charged_amount',
    case
      when not exists (select 1 from information_schema.columns
                        where table_schema='public' and table_name='ad_account_requests'
                          and column_name='charged_amount')
        then 'COLUMN MISSING - run 20260920250000 first'
      when not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                        where n.nspname='public' and p.proname='ad_account_request_create_paid')
        then 'FUNCTION NOT HERE'
      when (select position('charged_amount' in pg_get_functiondef(p.oid)) > 0
              from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname='ad_account_request_create_paid' limit 1)
        then 'YES'
      else 'NO - the fee still leaves no line on any screen'
    end

  -- ── 10. WHAT STATUS VALUES DO PROFILES ACTUALLY CARRY? ────────────
  -- Anything other than active/inactive now prints as itself rather
  -- than as a green "Active" pill.
  union all select 10, 'user_profiles status values in use',
    coalesce((
      select string_agg(x.s || '=' || x.n::text, ' | ' order by x.n desc)
        from (select coalesce(status,'(null)') as s, count(*) as n
                from public.user_profiles group by 1) x
    ), 'none')

  -- ── 11. IS MONEY STILL STORED AS float? ───────────────────────────
  union all select 11, 'money columns still `real`/double (float rounding)',
    coalesce((
      select string_agg(table_name || '.' || column_name, ', '
                        order by table_name, column_name)
        from information_schema.columns
       where table_schema='public'
         and data_type in ('real','double precision')
         and column_name in ('amount','total','sub_total','balance',
                             'eur_balance','usd_balance','topup_amount',
                             'earnings_eur','earnings_usd','monthly_fee')
    ), 'none - all numeric')

  -- ── 12. CAN ANY ADMIN REPRICE A SUBSCRIPTION? ─────────────────────
  union all select 12, 'change_subscription_amount callable by authenticated',
    case when exists (
      select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='change_subscription_amount'
         and has_function_privilege('authenticated', p.oid, 'execute')
    ) then 'YES - the owner-only rule lives only in the server action'
      else 'NO - closed' end

  -- ── 13. AND wise_confirm_suggestion? ──────────────────────────────
  union all select 13, 'wise_confirm_suggestion callable by authenticated',
    case when exists (
      select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='wise_confirm_suggestion'
         and has_function_privilege('authenticated', p.oid, 'execute')
    ) then 'YES - bypasses the twin-credit and maintenance checks'
      else 'NO - closed' end

  -- ── 14. HOW MANY DEPOSITS STILL MATCH NOTHING ─────────────────────
  union all select 14, 'bank deposits by status',
    coalesce((
      select string_agg(x.s || '=' || x.n::text, ' | ' order by x.n desc)
        from (select coalesce(status,'(null)') as s, count(*) as n
                from public.wise_incoming_transfers group by 1) x
    ), 'none')

  -- ── 15. AND HOW MANY OF THOSE REFERENCES COULD EVER MATCH ─────────
  -- The app writes a 10-digit zero-padded reference_no. A deposit
  -- quoting anything else can never match automatically.
  union all select 15, 'deposits whose reference is 10 digits (matchable)',
    (select count(*)::text || ' of ' ||
            (select count(*)::text from public.wise_incoming_transfers)
       from public.wise_incoming_transfers
      where reference ~ '\d{10}')
)
select item, status from facts order by sort;
