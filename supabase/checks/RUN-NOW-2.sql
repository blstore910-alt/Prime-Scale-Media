-- =====================================================================
-- RONDE 3 — de database-helft. Deel 1 kost nu geld.
-- =====================================================================
-- Safe to run twice: every part inspects the live function first and
-- prints "already done - no change" if it is in.
--
--   DEEL 1  URGENT. The "one unpaid invoice" guard is applied and live,
--           and it silently stops billing any customer who has an unpaid
--           ADJUSTMENT. Revenue is being lost while this sits.
--   DEEL 2  A withdrawal takes its currency from the caller. Repeatable
--           gain of about $163 per $1,000 round trip.
--   DEEL 3  A repricing refund has no row lock, so two tabs pay it twice.
--   DEEL 4  Switching a customer's billing currency invoices next month
--           today and auto-debits it in seven days.
--   DEEL 5  integration_jobs has RLS on and no INSERT policy, so every
--           supplier-funding job is refused and the refusal is discarded.
--   DEEL 6  The yearly no-refund guard was spliced into the branch that
--           cannot refund, and verified itself by grepping for its own
--           string.
--
-- At the bottom, one row of booleans.
-- =====================================================================

set search_path = public;


-- =====================================================================
-- DEEL 1 — AN UNPAID ADJUSTMENT STOPS ALL BILLING.          [live, urgent]
-- =====================================================================
-- The guard that stops a second unpaid subscription invoice reads
--   i.subscription_id = r.id and (i.period_start = v_period
--                                 or i.status = 'unpaid')
-- and `change_subscription_amount` writes subscription_adjustment rows
-- with subscription_id set and NO period_start.
--
-- So: raise somebody's price mid-month, they cannot pay the adjustment
-- straight away, and from that night on the billing run sees the unpaid
-- row, hits `continue`, and never invoices them again. next_payment_date
-- does not advance either, because the paid trigger requires a
-- period_start. Ninety days later they have been billed once.
--
-- The fix tests period_start rather than type. Type is a vocabulary that
-- can grow; "has a period" is what the guard actually means — it exists
-- to stop TWO INVOICES FOR ONE PERIOD, and a row with no period cannot
-- be one of them.
do $blk1$
declare
  v_src  text;
  v_new  text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'subscription_billing_run'
   limit 1;

  if v_src is null then
    raise notice 'DEEL 1: subscription_billing_run not found.';
    return;
  end if;
  if position('i.period_start is not null' in v_src) > 0 then
    raise notice 'DEEL 1: already scoped to period invoices - no change.';
    return;
  end if;

  -- Two shapes, depending on whether the earlier type-filter landed.
  v_new := replace(
    v_src,
    '(i.status = ''unpaid'' and i.type = ''subscription'')',
    '(i.status = ''unpaid'' and i.period_start is not null)'
  );
  if v_new = v_src then
    v_new := replace(
      v_src,
      'i.status = ''unpaid''',
      '(i.status = ''unpaid'' and i.period_start is not null)'
    );
  end if;

  -- REFUSE TO REPORT SUCCESS ON A MISS. Two migrations today spliced
  -- correct text into the wrong place and then verified themselves by
  -- grepping for their own string, so both read back true while one had
  -- stopped billing customers. A replace that changed nothing is a
  -- failure, and it says so.
  if v_new = v_src then
    raise exception 'DEEL 1: the guard is written differently - fix it by hand, do not assume this ran.';
  end if;

  execute v_new;
  raise notice 'DEEL 1: an unpaid adjustment no longer stops the monthly invoice.';
end;
$blk1$;

-- Who this has been happening to. Every row here is a customer who has
-- not been invoiced since that adjustment was raised.
select
  a.tenant_client_code            as client,
  i.number                        as blocking_invoice,
  i.type,
  i.total,
  i.currency,
  i.created_at::date              as raised,
  s.next_payment_date::date       as stuck_since,
  s.amount                        as monthly,
  s.currency                      as monthly_currency
  from public.invoices i
  join public.subscriptions s on s.id = i.subscription_id
  left join public.advertisers a on a.id = s.advertiser_id
 where i.status = 'unpaid'
   and i.period_start is null
 order by i.created_at;


-- =====================================================================
-- DEEL 2 — A WITHDRAWAL TAKES ITS CURRENCY FROM THE CALLER.
-- =====================================================================
-- ad_account_withdrawal_request is granted to `authenticated` and checks
-- only that p_currency is one of USD/EUR. The server action derives it
-- correctly, but a customer can call the RPC straight from the browser
-- the way eleven of this app's own components do.
--
-- $1,000 on an ad account, requested as EUR 1,000, approved, credits
-- eur_balance by 1,000 — worth about $1,163. Repeatable, and the
-- withdrawals screen shows the account NAME, not its currency, so the
-- admin approving it has nothing on screen that disagrees.
--
-- An ad account is funded in USD by construction, which is why the
-- action hard-codes it. The RPC should not be taking the parameter at
-- all; until it can be dropped, it ignores it.
do $blk2$
declare
  v_src text;
  v_new text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'ad_account_withdrawal_request'
   limit 1;

  if v_src is null then
    raise notice 'DEEL 2: ad_account_withdrawal_request not found.';
    return;
  end if;
  if position('currency is not the caller''s to choose' in v_src) > 0 then
    raise notice 'DEEL 2: already fixed - no change.';
    return;
  end if;
  if position('begin' in v_src) = 0 then
    raise notice 'DEEL 2: cannot find the body - fix by hand.';
    return;
  end if;

  v_new := replace(
    v_src,
    'begin',
    'begin
  -- The currency is not the caller''s to choose. An ad account is funded
  -- in USD by construction; accepting EUR here and crediting eur_balance
  -- on approval turns 1,000 USD of account balance into 1,000 EUR of
  -- wallet, which is about 163 dollars of profit per round trip, and
  -- repeatable.
  p_currency := ''USD'';
',
    1
  );
  if v_new = v_src then
    raise exception 'DEEL 2: could not inject - fix by hand.';
  end if;

  execute v_new;
  raise notice 'DEEL 2: a withdrawal is USD, whatever the caller says.';
end;
$blk2$;

-- Anything already requested in EUR is worth a look before it is approved.
select
  w.id, w.amount, w.currency, w.status, w.created_at::date,
  a.tenant_client_code as client
  from public.ad_account_withdrawals w
  left join public.advertisers a on a.id = w.advertiser_id
 where upper(coalesce(w.currency, 'USD')) <> 'USD'
 order by w.created_at desc;


-- =====================================================================
-- DEEL 3 — A REPRICING REFUND CAN BE PAID TWICE.
-- =====================================================================
-- change_subscription_amount reads the subscription with no `for update`
-- and then decides a refund from a read-modify-write. Two tabs, or one
-- retried request, both read "nothing refunded yet" and both credit the
-- wallet. The clamp cannot catch it afterwards because there is no
-- unique index on the reference either.
--
-- The index is the durable half and goes in regardless: it makes a
-- second identical refund impossible even if the lock is ever lost.
create unique index if not exists wallet_adjustments_change_refund_uq
  on public.wallet_adjustments (reference)
  where reference like 'subscription_change_refund:%';

do $blk3$
declare
  v_src text;
  v_new text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'change_subscription_amount'
   limit 1;

  if v_src is null then
    raise notice 'DEEL 3: change_subscription_amount not found.';
    return;
  end if;
  if position('for update' in v_src) > 0 then
    raise notice 'DEEL 3: already takes a lock - only the index was added.';
    return;
  end if;
  if position('into v_sub' in v_src) = 0 then
    raise notice 'DEEL 3: subscription select written differently - add the lock by hand.';
    return;
  end if;

  -- The select into v_sub is the row two transactions race on.
  v_new := regexp_replace(
    v_src,
    '(into v_sub[^;]*)(;)',
    '\1 for update\2',
    ''
  );
  if v_new = v_src then
    raise exception 'DEEL 3: could not add the lock - do it by hand.';
  end if;

  execute v_new;
  raise notice 'DEEL 3: the subscription row is locked before the refund is decided.';
end;
$blk3$;

-- Refunds already paid twice, if any. Empty is what you want.
select reference, count(*) as times, sum(amount) as total
  from public.wallet_adjustments
 where reference like 'subscription_change_refund:%'
 group by reference
having count(*) > 1;


-- =====================================================================
-- DEEL 4 — A CURRENCY SWITCH BILLS NEXT MONTH TODAY.
-- =====================================================================
-- Switching a paid customer from EUR to USD falls to the branch that
-- invoices the NEXT period — correctly — but stamps due_date as
-- now() + 7 days. So a switch on 20 October raises the 5 November
-- invoice due 27 October, and the 27 October auto-debit takes it. The
-- customer is debited twice inside one month, the second time for a
-- month that has not started, while their card reads "Renews 5 Dec".
--
-- An invoice for a future period is due when that period starts.
do $blk4$
declare
  v_src text;
  v_new text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'change_subscription_amount'
   limit 1;

  if v_src is null then
    raise notice 'DEEL 4: function not found.';
    return;
  end if;
  if position('a future period is due when it starts' in v_src) > 0 then
    raise notice 'DEEL 4: already fixed.';
    return;
  end if;
  if position('now() + interval ''7 days''' in v_src) = 0 then
    raise notice 'DEEL 4: due_date written differently - fix by hand.';
    return;
  end if;

  v_new := replace(
    v_src,
    'now() + interval ''7 days''',
    '-- a future period is due when it starts, not seven days from today
     case when v_period > current_date
          then v_period::timestamptz
          else now() + interval ''7 days'' end'
  );
  if v_new = v_src then
    raise exception 'DEEL 4: replace matched nothing.';
  end if;

  execute v_new;
  raise notice 'DEEL 4: a future-period invoice is due when that period starts.';
end;
$blk4$;


-- =====================================================================
-- DEEL 5 — SUPPLIER FUNDING JOBS ARE REFUSED, SILENTLY.
-- =====================================================================
-- integration_jobs has row-level security ON and only a SELECT policy —
-- the original migration says so in as many words — so every insert from
-- enqueueSupplierTopupPush is refused with 42501. All four call sites
-- discard the result, so the admin sees success.
--
-- Today that is inert, because the auto-push flags are off. The first
-- real push is the one that would vanish: a completed top-up, the
-- customer's money taken, and no job to fund the ad account.
--
-- An INSERT policy for admins of the tenant, matching how every other
-- admin-written table in this schema is shaped.
do $blk5$
begin
  if to_regclass('public.integration_jobs') is null then
    raise notice 'DEEL 5: integration_jobs does not exist here.';
    return;
  end if;

  execute 'drop policy if exists integration_jobs_insert_admin on public.integration_jobs';
  execute $pol$
    create policy integration_jobs_insert_admin on public.integration_jobs
      for insert to authenticated
      with check (
        exists (
          select 1 from public.user_profiles up
           where up.user_id = auth.uid()
             and up.tenant_id = integration_jobs.tenant_id
             and up.role = 'admin'
             and coalesce(up.is_active, true)
        )
      )
  $pol$;
  raise notice 'DEEL 5: admins can enqueue a supplier job.';
end;
$blk5$;

select
  polname,
  case polcmd when 'r' then 'select' when 'a' then 'insert'
              when 'w' then 'update' when 'd' then 'delete'
              else 'all' end as command
  from pg_policy
 where polrelid = 'public.integration_jobs'::regclass
 order by polname;


-- =====================================================================
-- DEEL 6 — THE YEARLY NO-REFUND GUARD GUARDS NOTHING.
-- =====================================================================
-- It was spliced onto `v_period := coalesce(v_sub.next_payment_date...)`,
-- which sits inside the branch taken when there is NO paid current
-- period — the branch that moves no money. The wallet payout is in the
-- other branch entirely. And the migration verified itself by grepping
-- the function body for its own sentence, so it reported true.
--
-- Latent today: nothing in the app writes billing_period yet. It is
-- exactly the guard the yearly rollout will lean on, so it is worth
-- being in the right place before anybody leans on it.
do $blk6$
declare
  v_src text;
  v_new text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'change_subscription_amount'
   limit 1;

  if v_src is null then
    raise notice 'DEEL 6: function not found.';
    return;
  end if;
  if position('yearly terms are not refunded, and this is the branch' in v_src) > 0 then
    raise notice 'DEEL 6: already in the right place.';
    return;
  end if;

  -- Remove the misplaced copy, wherever it sits, then put one where the
  -- money actually moves: right after the admin check, before either
  -- branch is chosen.
  v_new := regexp_replace(
    v_src,
    'if coalesce\(v_sub\.billing_period[^;]*?end if;',
    '',
    'g'
  );

  if position('v_period := coalesce' in v_new) = 0 then
    raise notice 'DEEL 6: cannot find an insertion point - fix by hand.';
    return;
  end if;

  v_new := replace(
    v_new,
    'v_period := coalesce',
    'if coalesce(v_sub.billing_period, ''month'') = ''year'' and p_refund then
      raise exception ''A yearly plan runs to its end date - yearly terms are not refunded, and this is the branch that would have paid one.''
        using errcode = ''22000'';
    end if;
    v_period := coalesce',
    1
  );

  if v_new = v_src then
    raise exception 'DEEL 6: nothing changed - fix by hand.';
  end if;

  execute v_new;
  raise notice 'DEEL 6: the yearly refusal now sits where a refund is decided.';
end;
$blk6$;


-- =====================================================================
-- ALLES IN ÉÉN RIJ.
-- =====================================================================
select
  (select position('i.period_start is not null' in pg_get_functiondef(p.oid)) > 0
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='subscription_billing_run')
                                                as d1_billing_unblocked,
  (select position('not the caller''s to choose' in pg_get_functiondef(p.oid)) > 0
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='ad_account_withdrawal_request')
                                                as d2_withdrawal_is_usd,
  exists (select 1 from pg_indexes
           where schemaname='public'
             and indexname='wallet_adjustments_change_refund_uq')
                                                as d3_refund_unique,
  (select position('a future period is due when it starts' in pg_get_functiondef(p.oid)) > 0
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='change_subscription_amount')
                                                as d4_future_due_date,
  exists (select 1 from pg_policy
           where polrelid='public.integration_jobs'::regclass
             and polname='integration_jobs_insert_admin')
                                                as d5_jobs_insertable,
  (select position('this is the branch that would have paid one' in pg_get_functiondef(p.oid)) > 0
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='change_subscription_amount')
                                                as d6_yearly_guard_placed;
