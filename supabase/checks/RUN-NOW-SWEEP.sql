-- =====================================================================
-- THE SWEEP'S DATABASE HALF. One paste, eleven parts.
-- =====================================================================
-- Six read-only agents walked the app this evening. Everything they found
-- that lives in TypeScript is already fixed and deployed. What is left is
-- what only the database can answer, and it is the more serious half.
--
-- Run it top to bottom in the Supabase SQL editor. Every part is
-- idempotent and every part reads back what it did, so you can see it
-- landed rather than trusting that it did. Nothing here deletes anything.
--
-- ORDER MATTERS ONLY IN ONE PLACE: part 1 first. It is the leak that is
-- open right now to anybody with a login.
--
-- STILL OUTSTANDING SEPARATELY (not in this file, run them too):
--   20260918220000_refund_rejected_request_fee.sql   -- rejecting is
--       BROKEN on production until this lands: the action now says so
--       instead of showing a Postgres error, but no request can be
--       rejected until you paste it.
--   20260918240000_scalar_not_record.sql             -- the clawback is
--       installed and failing silently without it.
--   20260918300000_plan_price_per_currency.sql       -- the $225 price.
-- =====================================================================

set search_path = public;


-- =====================================================================
-- DEEL 1 — THE VIEWS HAND OUT EVERY TENANT'S ROWS.       [worst of these]
-- =====================================================================
-- A Postgres view runs with the permissions of whoever OWNS it unless it
-- is told otherwise. These three are owned by the migration runner, so
-- they read their base tables with row-level security switched off — and
-- the word `security_invoker` appears nowhere in this repository.
--
-- That matters because the browser reads them directly:
--   components/topups/use-topups.ts        .from("top_ups_view").select("*")
--   components/commissions/use-commissions.ts
-- with no tenant and no advertiser predicate, because the developer
-- assumed RLS was underneath. It is not.
--
-- Worse, one of those readers is on /inactive — so a DEACTIVATED
-- advertiser, someone we have switched off, can read every tenant's
-- top-ups.
--
-- This is the same argument this project already made for itself in
-- 20260915110000_owner_only_bank_rls.sql: a guard in the app is not a
-- boundary when the table underneath it is open.
do $blk1$
declare
  v_name text;
begin
  foreach v_name in array array[
    'top_ups_view',
    'referral_links_with_details',
    'referral_commissions_with_details'
  ] loop
    if to_regclass('public.' || v_name) is null then
      raise notice 'DEEL 1: % does not exist here — skipped.', v_name;
      continue;
    end if;
    execute format('alter view public.%I set (security_invoker = on)', v_name);
    raise notice 'DEEL 1: % now reads as the caller.', v_name;
  end loop;
end;
$blk1$;

-- Read back: `true` means the view now obeys the policies on its base
-- tables. Anything not true is still handing out rows.
select
  c.relname                                            as view_name,
  coalesce(
    (select option_value = 'true'
       from pg_options_to_table(c.reloptions)
      where option_name = 'security_invoker'),
    false
  )                                                    as reads_as_caller
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'v'
   and c.relname in ('top_ups_view',
                     'referral_links_with_details',
                     'referral_commissions_with_details')
 order by c.relname;


-- =====================================================================
-- DEEL 2 — ANY USER CAN BOOTSTRAP ANY OTHER USER'S WALLET.
-- =====================================================================
-- ensure_advertiser_and_wallet(p_profile_id) is SECURITY DEFINER, granted
-- to `authenticated`, and never checks that the profile belongs to the
-- caller. Post another profile's id and you get back their advertiser_id
-- and wallet_id — and if the rows are missing, you CREATE them, in
-- whatever tenant that profile sits in.
--
-- Both legitimate callers (accept-invite, signup) have already proved
-- ownership before they call it. So the check costs them nothing.
do $blk2$
declare
  v_src text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'ensure_advertiser_and_wallet'
   limit 1;

  if v_src is null then
    raise notice 'DEEL 2: function not found — nothing changed.';
    return;
  end if;
  if position('is not yours' in v_src) > 0 then
    raise notice 'DEEL 2: already guarded.';
    return;
  end if;

  -- Fold the check in right after the profile row is read. The anchor is
  -- the profile lookup; if it is written differently, say so loudly
  -- rather than patching something we have not understood.
  if position('from public.user_profiles' in v_src) = 0 then
    raise notice 'DEEL 2: cannot find the profile lookup — add the check by hand.';
    return;
  end if;

  execute replace(
    v_src,
    'begin',
    'begin
  if auth.uid() is not null
     and not exists (
       select 1 from public.user_profiles up
        where up.id = p_profile_id and up.user_id = auth.uid()
     )
  then
    raise exception ''That profile is not yours.'' using errcode = ''42501'';
  end if;
'
  );
  raise notice 'DEEL 2: a profile id that is not yours is now refused.';
end;
$blk2$;

select
  position('is not yours' in pg_get_functiondef(p.oid)) > 0
    as bootstrap_is_guarded
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'ensure_advertiser_and_wallet';


-- =====================================================================
-- DEEL 3 — THE INVITE TOKEN HANDS THE CUSTOMER OUR COMMISSION TERMS.
-- =====================================================================
-- get_invite_by_token returns `to_jsonb(i)` — EVERY column of the
-- invitation — to `anon`. The signup page passes the whole object into a
-- client component, so the invitee's browser receives commission_type,
-- commission_rate, commission_amount and affiliate_id: what we pay the
-- affiliate who referred them. Plus monthly_fee, topup_fee_pct and the
-- raw token.
--
-- This is the same fault as advertisers(*) leaking commission terms,
-- which lib/types/advertiser-columns.ts was written about.
--
-- Seven fields is what the signup form actually uses.
do $blk3$
declare
  v_src text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'get_invite_by_token'
   limit 1;

  if v_src is null then
    raise notice 'DEEL 3: function not found.';
    return;
  end if;
  if position('jsonb_build_object' in v_src) > 0 then
    raise notice 'DEEL 3: already narrowed.';
    return;
  end if;
  if position('to_jsonb(i)' in v_src) = 0 then
    raise notice 'DEEL 3: written differently — narrow it by hand.';
    return;
  end if;

  execute replace(
    v_src,
    'to_jsonb(i)',
    'jsonb_build_object(
       ''id'', i.id,
       ''email'', i.email,
       ''role'', i.role,
       ''status'', i.status,
       ''tenant_id'', i.tenant_id,
       ''expires_at'', i.expires_at,
       ''full_name'', i.full_name
     )'
  );
  raise notice 'DEEL 3: the token now returns seven fields, not the row.';
end;
$blk3$;

select
  position('jsonb_build_object' in pg_get_functiondef(p.oid)) > 0
    as invite_token_is_narrowed
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'get_invite_by_token';


-- =====================================================================
-- DEEL 4 — A USER CAN MOVE THEMSELVES INTO ANOTHER TENANT.
-- =====================================================================
-- The user_profiles update policy is `user_id = auth.uid()` in both USING
-- and WITH CHECK. That holds before AND after changing tenant_id — so any
-- signed-in person can run
--   .from('user_profiles').update({tenant_id:'<someone else>'})
-- and then satisfy every bare tenant-membership policy in the app:
-- bank_accounts (beneficiary IBAN and SWIFT), plans, exchange_rates,
-- tax_rates, ad_account_types.
--
-- The INSERT version of this was closed in 20260913140000. The UPDATE
-- path was left open.
--
-- A policy cannot express "this column may not change", so it is a
-- trigger. An admin moving somebody deliberately still can: the trigger
-- allows it when the caller is an admin of the tenant being left.
create or replace function public._pin_profile_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $blk4$
begin
  if new.tenant_id is distinct from old.tenant_id then
    if not exists (
      select 1 from public.user_profiles up
       where up.user_id = auth.uid()
         and up.tenant_id = old.tenant_id
         and up.role = 'admin'
         and coalesce(up.is_active, true)
    ) then
      raise exception
        'A profile cannot change tenant. Ask an admin of the tenant it is in.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$blk4$;

drop trigger if exists trg_pin_profile_tenant on public.user_profiles;
create trigger trg_pin_profile_tenant
  before update on public.user_profiles
  for each row execute function public._pin_profile_tenant();

select
  to_regprocedure('public._pin_profile_tenant()') is not null as fn_exists,
  exists (
    select 1 from pg_trigger
     where tgname = 'trg_pin_profile_tenant'
       and tgrelid = 'public.user_profiles'::regclass
  )                                                           as trigger_on;


-- =====================================================================
-- DEEL 5 — A CANCELLED INVOICE IS STILL PAYABLE.
-- =====================================================================
-- invoice_pay_from_wallet short-circuits on 'paid' and nothing else, so a
-- VOIDED invoice falls straight through to the debit and flips void →
-- paid.
--
-- How it happens without anybody doing anything odd: the customer has
-- Billing open with INV-1 unpaid. An admin changes their plan, which
-- voids INV-1 and issues INV-2 at the new price. The customer presses Pay
-- on the row still on their screen. INV-1 is collected, INV-2 is
-- collected too, and one period is paid twice — and a paid invoice cannot
-- be marked unpaid, so there is no undo.
--
-- The admin table already refuses to pay a void invoice. Only the
-- customer's own path does not.
do $blk5$
declare
  v_src text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'invoice_pay_from_wallet'
   limit 1;

  if v_src is null then
    raise notice 'DEEL 5: invoice_pay_from_wallet not found.';
    return;
  end if;
  if position('was cancelled' in v_src) > 0 then
    raise notice 'DEEL 5: already refuses a void invoice.';
    return;
  end if;
  if position('''paid''' in v_src) = 0 then
    raise notice 'DEEL 5: cannot find the paid check — add the void one by hand.';
    return;
  end if;

  -- Immediately after the row is locked and before any money moves.
  if position('for update;' in v_src) = 0 then
    raise notice 'DEEL 5: no row lock found — add the check by hand.';
    return;
  end if;

  execute replace(
    v_src,
    'for update;',
    'for update;

  if v_inv.status = ''void'' then
    raise exception ''This invoice was cancelled — there is nothing to pay on it. If a newer one replaced it, pay that.''
      using errcode = ''22000'';
  end if;
'
  );
  raise notice 'DEEL 5: a cancelled invoice can no longer be paid.';
end;
$blk5$;

select
  position('was cancelled' in pg_get_functiondef(p.oid)) > 0
    as void_invoice_refused
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'invoice_pay_from_wallet';

-- And the ones that already exist: a void invoice with money against it.
select
  i.number, i.status, i.total, i.currency, i.paid_at
  from public.invoices i
 where i.status = 'void' and i.paid_at is not null
 order by i.paid_at desc
 limit 20;


-- =====================================================================
-- DEEL 6 — THE BILLING RUN CHARGES CUSTOMERS WE SWITCHED OFF,
--          AND THEN SWITCHES THEM BACK ON.
-- =====================================================================
-- The auto-debit loop filters `s.status <> 'cancelled'`. The app has no
-- such status — its vocabulary is active | past_due | inactive | paused,
-- and deactivating somebody writes 'inactive'. So the filter excludes
-- nothing that exists.
--
-- Sequence: the run raises a €200 invoice, due in seven days. Three days
-- later an admin deactivates the customer — they can no longer log in.
-- On day eight the loop passes the filter, takes €200 out of their
-- wallet, and the paid-invoice trigger sets the subscription back to
-- ACTIVE and rolls the date forward a month. Next month it bills them
-- again. Nobody pressed anything.
do $blk6$
declare
  v_src text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'subscription_billing_run'
   limit 1;

  if v_src is null then
    raise notice 'DEEL 6: subscription_billing_run not found.';
    return;
  end if;
  if position('in (''active'', ''past_due'')' in v_src) > 0 then
    raise notice 'DEEL 6: already collects only from live subscriptions.';
    return;
  end if;
  if position('<> ''cancelled''' in v_src) = 0 then
    raise notice 'DEEL 6: filter written differently — change it by hand.';
    return;
  end if;

  execute replace(
    v_src,
    '<> ''cancelled''',
    'in (''active'', ''past_due'')'
  );
  raise notice 'DEEL 6: deactivated and paused customers are no longer debited.';
end;
$blk6$;

-- And the other half: paying an invoice must not resurrect a subscription
-- somebody deliberately switched off. Only a past_due one comes back.
do $blk6b$
declare
  v_src text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = '_on_subscription_invoice_paid'
   limit 1;

  if v_src is null then
    raise notice 'DEEL 6b: trigger function not found.';
    return;
  end if;
  if position('status = ''past_due''' in v_src) > 0 then
    raise notice 'DEEL 6b: already only revives a past_due subscription.';
    return;
  end if;
  if position('status = ''active''' in v_src) = 0 then
    raise notice 'DEEL 6b: no reactivation found — nothing to guard.';
    return;
  end if;

  execute replace(
    v_src,
    'status = ''active''',
    'status = case when status = ''past_due'' then ''active'' else status end'
  );
  raise notice 'DEEL 6b: paying no longer reactivates a switched-off customer.';
end;
$blk6b$;

select
  position('in (''active'', ''past_due'')' in pg_get_functiondef(p.oid)) > 0
    as run_skips_inactive
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'subscription_billing_run';

-- Who would have been charged tonight. Anything here with a status other
-- than active/past_due is somebody the old filter would have debited.
select
  a.tenant_client_code as client,
  s.status,
  s.amount,
  s.currency,
  s.next_payment_date
  from public.subscriptions s
  left join public.advertisers a on a.id = s.advertiser_id
 where s.next_payment_date <= now() + interval '7 days'
 order by s.next_payment_date;


-- =====================================================================
-- DEEL 7 — THE CLAWBACK LOOKS UP A DIFFERENT LINK THAN THE ACCRUAL.
-- =====================================================================
-- Commission is ACCRUED against the referral link with
-- `status='active' order by created_at limit 1`. It is CLAWED BACK from
-- the link with `order by created_at limit 1` — no status filter.
--
-- So an advertiser whose first link was rejected and whose second is
-- active: the accrual pays on link B, the clawback goes looking at link
-- A, finds nothing earned, and returns zero. The commission stands on
-- money that came back to us. No clawback row, no warning, nothing on any
-- screen.
--
-- The accrual's own comment names this exact shape as the expected case.
do $blk7$
declare
  v_src text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = '_claw_back_referral_commission'
   limit 1;

  if v_src is null then
    raise notice 'DEEL 7: clawback not installed — run 20260918230000 first.';
    return;
  end if;
  if position('coalesce(rl.status' in v_src) > 0 then
    raise notice 'DEEL 7: already filters on the active link.';
    return;
  end if;
  if position('order by rl.created_at' in v_src) = 0 then
    raise notice 'DEEL 7: link lookup written differently — fix by hand.';
    return;
  end if;

  execute replace(
    v_src,
    'order by rl.created_at',
    'and coalesce(rl.status, ''active'') = ''active''
       order by rl.created_at'
  );
  raise notice 'DEEL 7: the clawback and the accrual now agree on the link.';
end;
$blk7$;

select
  position('coalesce(rl.status' in pg_get_functiondef(p.oid)) > 0
    as clawback_matches_accrual
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = '_claw_back_referral_commission';

-- Advertisers with more than one referral link — the population this
-- affects. If this is empty, nothing has gone wrong yet.
select
  a.tenant_client_code as referred,
  count(*)             as links,
  count(*) filter (where coalesce(rl.status,'active') = 'active') as active
  from public.referral_links rl
  join public.advertisers a on a.id = rl.referred_advertiser_id
 group by a.tenant_client_code
having count(*) > 1;


-- =====================================================================
-- DEEL 8 — AN UNPAID ADJUSTMENT STOPS ALL FUTURE MONTHLY BILLING.
-- =====================================================================
-- The guard that stops a second unpaid subscription invoice reads
--   i.subscription_id = r.id and (i.period_start = v_period or i.status = 'unpaid')
-- with no type filter. Raising somebody's plan mid-month creates a
-- subscription_ADJUSTMENT invoice with subscription_id set and status
-- unpaid — so while that sits there, the billing run skips that
-- subscription on every pass and the monthly invoice is never raised at
-- all.
--
-- Quiet revenue loss: the customer is not billed and nothing says so.
do $blk8$
declare
  v_src text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'subscription_billing_run'
   limit 1;

  if v_src is null then
    raise notice 'DEEL 8: subscription_billing_run not found.';
    return;
  end if;
  if position('i.status = ''unpaid'' and i.type = ''subscription''' in v_src) > 0 then
    raise notice 'DEEL 8: already type-aware.';
    return;
  end if;
  if position('i.status = ''unpaid''' in v_src) = 0 then
    raise notice 'DEEL 8: guard written differently — fix by hand.';
    return;
  end if;

  execute replace(
    v_src,
    'i.status = ''unpaid''',
    '(i.status = ''unpaid'' and i.type = ''subscription'')'
  );
  raise notice 'DEEL 8: an unpaid adjustment no longer blocks the monthly invoice.';
end;
$blk8$;

-- Subscriptions currently blocked by an unpaid non-subscription invoice.
select
  a.tenant_client_code as client,
  i.number,
  i.type,
  i.total,
  i.status,
  s.next_payment_date
  from public.invoices i
  join public.subscriptions s on s.id = i.subscription_id
  left join public.advertisers a on a.id = s.advertiser_id
 where i.status = 'unpaid'
   and i.type <> 'subscription';


-- =====================================================================
-- DEEL 9 — THREE FUNCTIONS RESOLVE AN ADVERTISER WITHOUT THE TENANT.
-- =====================================================================
-- `select ... from advertisers where user_id = v_uid limit 1` with no
-- tenant filter and no ordering. A person who holds an advertiser row in
-- tenant A and accepts an invite into tenant B gets an arbitrary row —
-- so tenant B's invite writes a subscription and a referral link against
-- tenant A's advertiser, and bills the wrong tenant.
--
-- The service-role branch of the same function two lines above DOES
-- filter. Only the authenticated one does not.
--
-- Reported here rather than patched blind: the three call sites differ
-- enough that a string replace would be guessing. This query shows
-- whether anybody is actually in the position to trip it.
select
  up.user_id,
  count(distinct a.tenant_id) as tenants_with_an_advertiser_row,
  string_agg(distinct t.initials, ', ') as which
  from public.advertisers a
  join public.user_profiles up on up.user_id = a.user_id
  join public.tenants t on t.id = a.tenant_id
 group by up.user_id
having count(distinct a.tenant_id) > 1;
-- Empty result = nobody can trip it today. Not empty = fix the three
-- functions before the next invite goes out:
--   20260901500000_referral_link_from_invite.sql : create_subscription_from_invite
--   20260901400000_advertiser_perks.sql          : ad_account_request_create_paid
--   20260831150000_ad_account_withdrawals.sql    : ad_account_withdrawal_request


-- =====================================================================
-- DEEL 10 — THE AUDIT LOG'S "NO WRITES" POLICY DENIES NOTHING.
-- =====================================================================
-- audit_events_no_writes is PERMISSIVE with `using (false)`. Permissive
-- policies are OR'd together, so a branch that is always false adds
-- nothing — it denies exactly as much as no policy at all. The real
-- protection today is the REVOKE beside it, and the comment above the
-- policy describes behaviour the statement does not implement.
--
-- Latent rather than live: the first permissive write policy anybody adds
-- silently breaks append-only on the financial audit log — which is also
-- where supplier cost re-enters, via the ad_account_costs audit trigger.
drop policy if exists audit_events_no_writes on public.audit_events;
create policy audit_events_no_writes on public.audit_events
  as restrictive for all
  using (false) with check (false);

select
  polname,
  case when polpermissive then 'PERMISSIVE (denies nothing)'
       else 'RESTRICTIVE (denies)' end as kind
  from pg_policy
 where polrelid = 'public.audit_events'::regclass;


-- =====================================================================
-- DEEL 11 — IS `admins` ACTUALLY PROTECTED?
-- =====================================================================
-- Two policies were created on public.admins, but no migration in the
-- tree ever enables row-level security on it — and policies on a table
-- with RLS off are dormant. Nothing in the app reads the table, which is
-- why it has gone unnoticed.
--
-- Read first, then decide: the ALTER is commented out because switching
-- RLS on for a table whose policies were never exercised can lock out a
-- reader we have not found.
select
  c.relname,
  c.relrowsecurity as rls_on,
  (select count(*) from pg_policy p where p.polrelid = c.oid) as policies
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname = 'admins';

-- If rls_on is false and policies is 2, run this:
-- alter table public.admins enable row level security;


-- =====================================================================
-- THE ONE NUMBER AT THE END
-- =====================================================================
-- Everything above, in one row. All true is the goal.
select
  coalesce((select option_value = 'true'
              from pg_class c
              join pg_namespace n on n.oid = c.relnamespace,
                   pg_options_to_table(c.reloptions)
             where n.nspname='public' and c.relname='top_ups_view'
               and option_name='security_invoker'), false)
                                                     as views_read_as_caller,
  (select position('is not yours' in pg_get_functiondef(p.oid)) > 0
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='ensure_advertiser_and_wallet')
                                                     as bootstrap_guarded,
  (select position('jsonb_build_object' in pg_get_functiondef(p.oid)) > 0
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='get_invite_by_token')
                                                     as invite_narrowed,
  exists (select 1 from pg_trigger
           where tgname='trg_pin_profile_tenant'
             and tgrelid='public.user_profiles'::regclass)
                                                     as tenant_pinned,
  (select position('was cancelled' in pg_get_functiondef(p.oid)) > 0
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='invoice_pay_from_wallet')
                                                     as void_refused,
  (select position('in (''active'', ''past_due'')' in pg_get_functiondef(p.oid)) > 0
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='subscription_billing_run')
                                                     as run_skips_inactive,
  (select position('coalesce(rl.status' in pg_get_functiondef(p.oid)) > 0
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='_claw_back_referral_commission')
                                                     as clawback_agrees,
  (select not polpermissive from pg_policy
    where polrelid='public.audit_events'::regclass
      and polname='audit_events_no_writes')          as audit_restrictive;
