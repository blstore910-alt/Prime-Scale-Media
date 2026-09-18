-- =====================================================================
-- RONDE 4 — de database-helft. Vooral: regels die alleen in code stonden.
-- =====================================================================
-- Safe to run twice. Nothing here fails on data that is already dirty —
-- every constraint counts the duplicates FIRST and skips with a notice
-- and a list, rather than aborting the script.
--
--   DEEL 1  "One per advertiser" is written in TypeScript in five places
--           and nowhere in the database. Every one of them is a
--           check-then-act, so two tabs beat all five.
--   DEEL 2  affiliate_referral_stats hands the affiliate every referred
--           customer's EMAIL address. Nothing renders it; it is in the
--           RPC's return type, which is why a select('*') sweep could
--           never see it.
--
-- The diagnostics are at the end, where they cannot block a fix.
-- =====================================================================

set search_path = public;


-- =====================================================================
-- DEEL 1 — DE REGELS DIE ALLEEN IN CODE STONDEN
-- =====================================================================
-- Four sweeps have now found the same shape five separate times: a rule
-- enforced by SELECT-then-INSERT in a server action, which two requests
-- a few milliseconds apart both pass. Today alone that produced a second
-- subscription billing EUR 198 a month for a EUR 99 plan, two wallet
-- rows with two different payment references, and two pending
-- withdrawals against one balance.
--
-- A unique index is the only version of that rule that cannot be raced.
-- Each one below is created ONLY when the data is already clean; where
-- it is not, it says so and lists the rows, and nothing is broken.

-- ── 1a. One wallet per advertiser ────────────────────────────────────
-- Two wallets means two payment references, and the customer quotes
-- whichever one they were shown. adv-app reads it with .maybeSingle(),
-- which THROWS on two rows — so the balance shows as a dash for ever and
-- the self-heal never fires, because on an error the value is undefined
-- rather than null.
do $blk1a$
declare
  v_dupes int;
begin
  select count(*) into v_dupes from (
    select advertiser_id from public.wallets
     group by advertiser_id having count(*) > 1
  ) d;

  if v_dupes > 0 then
    raise warning '1a: % advertisers have more than one wallet - index NOT created. See the list at the bottom.', v_dupes;
    return;
  end if;

  create unique index if not exists wallets_one_per_advertiser_uq
    on public.wallets (advertiser_id);
  raise notice '1a: one wallet per advertiser is now a database rule.';
end;
$blk1a$;

-- ── 1b. One profile per person per tenant ────────────────────────────
-- The signup confirm route is an unguarded check-then-insert chain in a
-- GET handler, and a GET is retried by link-scanners, by a double click
-- and by the browser. Its two siblings were hardened; this one was not.
do $blk1b$
declare
  v_dupes int;
begin
  select count(*) into v_dupes from (
    select user_id, tenant_id from public.user_profiles
     where user_id is not null and tenant_id is not null
     group by user_id, tenant_id having count(*) > 1
  ) d;

  if v_dupes > 0 then
    raise warning '1b: % (user, tenant) pairs have more than one profile - index NOT created.', v_dupes;
    return;
  end if;

  create unique index if not exists user_profiles_one_per_tenant_uq
    on public.user_profiles (user_id, tenant_id)
    where user_id is not null and tenant_id is not null;
  raise notice '1b: one profile per person per tenant is now a database rule.';
end;
$blk1b$;

-- ── 1c. One BILLABLE subscription per advertiser ─────────────────────
-- Partial, on the exact set the billing run collects from. An advertiser
-- may have any number of stopped or draft subscriptions; what they may
-- not have is two that raise invoices.
--
-- This is the one that was costing money today: both guards in the
-- server action tested `status = 'active'` while the run bills `active`
-- AND `past_due`.
do $blk1c$
declare
  v_dupes int;
begin
  select count(*) into v_dupes from (
    select advertiser_id from public.subscriptions
     where status in ('active', 'past_due')
     group by advertiser_id having count(*) > 1
  ) d;

  if v_dupes > 0 then
    raise warning '1c: % advertisers have two billable subscriptions - index NOT created. They are being charged twice; see the list at the bottom.', v_dupes;
    return;
  end if;

  create unique index if not exists subscriptions_one_billable_uq
    on public.subscriptions (advertiser_id)
    where status in ('active', 'past_due');
  raise notice '1c: one billable subscription per advertiser is now a database rule.';
end;
$blk1c$;

-- ── 1d. One live referral link per referred advertiser ───────────────
-- Partial again: a rejected link is history and may sit beside a new
-- one. Two LIVE links means the accrual and the clawback can resolve
-- different rows, which is a fault this sweep has already found twice.
do $blk1d$
declare
  v_dupes int;
begin
  if to_regclass('public.referral_links') is null then
    raise notice '1d: referral_links does not exist here.';
    return;
  end if;

  select count(*) into v_dupes from (
    select referred_advertiser_id from public.referral_links
     where coalesce(status, 'active') in ('active', 'pending')
     group by referred_advertiser_id having count(*) > 1
  ) d;

  if v_dupes > 0 then
    raise warning '1d: % advertisers have two live referral links - index NOT created.', v_dupes;
    return;
  end if;

  create unique index if not exists referral_links_one_live_uq
    on public.referral_links (referred_advertiser_id)
    where coalesce(status, 'active') in ('active', 'pending');
  raise notice '1d: one live referral link per advertiser is now a database rule.';
end;
$blk1d$;

-- ── 1e. Nobody refers themselves ─────────────────────────────────────
-- Three creation paths check this and the table does not. All three
-- compare advertiser ids, so a link written by any other means pays
-- somebody commission on their own top-ups, for ever, silently.
do $blk1e$
begin
  if to_regclass('public.referral_links') is null then return; end if;
  if exists (
    select 1 from pg_constraint
     where conname = 'referral_links_not_self_chk'
  ) then
    raise notice '1e: already constrained.';
    return;
  end if;
  if exists (
    select 1 from public.referral_links
     where affiliate_advertiser_id = referred_advertiser_id
  ) then
    raise warning '1e: a self-referral already exists - constraint NOT added. See the list at the bottom.';
    return;
  end if;

  alter table public.referral_links
    add constraint referral_links_not_self_chk
    check (affiliate_advertiser_id is distinct from referred_advertiser_id);
  raise notice '1e: a self-referral is now impossible.';
end;
$blk1e$;


-- =====================================================================
-- DEEL 2 — DE AFFILIATE KRIJGT ELK E-MAILADRES
-- =====================================================================
-- affiliate_referral_stats declares `referred_advertiser_email` in its
-- returns table and selects it. It is SECURITY DEFINER and granted to
-- `authenticated`, so row-level security cannot trim it — and the hook
-- that calls it is mounted in BOTH the affiliate app and the advertiser
-- app, so every affiliate and every advertiser-as-affiliate receives the
-- email address of everyone who signed up under their code.
--
-- Nothing renders it. The screens print the name and the client code;
-- the CSV exports name and code. That is exactly why three sweeps framed
-- around "payload width on customer screens" could not see it — the
-- width is in the RPC's signature.
--
-- A referral link is shareable publicly, so these are not necessarily
-- people the affiliate has ever met.
do $blk2$
declare
  v_src text;
  v_new text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'affiliate_referral_stats'
   limit 1;

  if v_src is null then
    raise notice 'DEEL 2: affiliate_referral_stats not found.';
    return;
  end if;
  if position('referred_advertiser_email' in v_src) = 0 then
    raise notice 'DEEL 2: the email is already gone - no change.';
    return;
  end if;

  -- Both halves: the column in `returns table (...)` and the expression
  -- in the select list. Dropping only one of them is a function that
  -- will not compile, and PL/pgSQL would accept it and fail at call time.
  v_new := regexp_replace(
    v_src,
    '[ \t]*referred_advertiser_email[ \t]+text[ \t]*,[ \t]*\n',
    '',
    'g'
  );
  v_new := regexp_replace(
    v_new,
    '[ \t]*[a-z_]+\.referred_advertiser_email[ \t]*,[ \t]*\n',
    '',
    'g'
  );

  if v_new = v_src then
    raise exception 'DEEL 2: the email is written differently - remove it by hand rather than assuming this ran.';
  end if;

  execute v_new;
  raise notice 'DEEL 2: the affiliate no longer receives referred customers'' email addresses.';
end;
$blk2$;


-- =====================================================================
-- DEEL 3 — TWEE DINGEN DIE MET DE HAND MOETEN. Bewust geen tekstchirurgie.
-- =====================================================================
-- change_subscription_amount has been patched by pg_get_functiondef +
-- replace() three times this evening. Two of those spliced correct text
-- into the wrong context and then verified themselves by grepping for
-- their own string, so both read back `true` while one had stopped
-- billing customers. A fourth pass on the same function, for a change
-- that needs a LOOP rather than a substitution, is how that happens
-- again.
--
-- So these two are written down precisely and left for somebody reading
-- the function. The queries below show whether either has bitten yet.
--
-- ── 3a. A DOWNGRADE VOIDS EVERY UNCOLLECTED ADJUSTMENT ───────────────
--
-- In 20260918130000, the "cheaper" branch voids all unpaid
-- subscription_adjustment invoices raised since the paid period invoice
-- — not just the part being reversed.
--
--   100 paid -> repriced to 150 -> a 50 adjustment, unpaid
--             -> repriced to 120 -> delta is -30, so 30 should be
--                cancelled. All 50 is voided instead.
--   The period is now priced 120 with 100 collected and no open
--   invoice: 20 is never billed. Three steps lose 50.
--
-- It cannot self-correct: the paid invoice still holds period_start, so
-- the billing run's dedup skips that period for ever.
--
-- THE FIX: void adjustments oldest-first only until their running total
-- reaches -v_delta, and re-raise the remainder as a new unpaid
-- adjustment. A loop, not a single UPDATE.
--
-- ── 3b. A REVERSAL CANNOT FIND A DEACTIVATED LINK ────────────────────
--
-- In 20260918100000, accrual and reversal share one lookup that requires
-- status = 'active'. So:
--
--   link active at 10% -> a 1,000 top-up is verified -> 100 commission
--   -> an admin rejects the link -> the bank reverses the transfer and
--   the top-up is undone -> the balance is correctly debited 1,000, the
--   trigger finds no active link, and returns silently.
--
-- 100 of payable commission survives on money we never received, and it
-- will never be re-created, so it cannot self-correct either.
--
-- THE FIX: on the REVERSE path, resolve the link from the stored
-- referral_commissions row (by source_wallet_topup_id) rather than by
-- status, and subtract that row's own amount with
-- `delete ... returning amount` instead of recomputing it.


-- =====================================================================
-- ALLES IN ÉÉN RIJ
-- =====================================================================
select
  exists (select 1 from pg_indexes
           where schemaname='public' and indexname='wallets_one_per_advertiser_uq')
                                                as a_one_wallet,
  exists (select 1 from pg_indexes
           where schemaname='public' and indexname='user_profiles_one_per_tenant_uq')
                                                as b_one_profile,
  exists (select 1 from pg_indexes
           where schemaname='public' and indexname='subscriptions_one_billable_uq')
                                                as c_one_billable_sub,
  exists (select 1 from pg_indexes
           where schemaname='public' and indexname='referral_links_one_live_uq')
                                                as d_one_live_link,
  exists (select 1 from pg_constraint
           where conname='referral_links_not_self_chk')
                                                as e_no_self_referral,
  (select position('referred_advertiser_email' in pg_get_functiondef(p.oid)) = 0
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='affiliate_referral_stats')
                                                as f_email_removed;


-- =====================================================================
-- WAT ER TE ZIEN IS — alleen lezen, na alle wijzigingen
-- =====================================================================
-- Anything an index refused to be created over is listed here. Each of
-- these is a real duplicate that somebody has to decide about; the
-- constraint goes in afterwards and then it cannot happen again.

-- ── Advertisers with more than one wallet ────────────────────────────
select a.tenant_client_code as client, count(*) as wallets,
       string_agg(w.id::text, ', ') as wallet_ids
  from public.wallets w
  left join public.advertisers a on a.id = w.advertiser_id
 group by a.tenant_client_code, w.advertiser_id
having count(*) > 1;

-- ── People with two profiles in one tenant ───────────────────────────
select user_id, tenant_id, count(*) as profiles
  from public.user_profiles
 where user_id is not null and tenant_id is not null
 group by user_id, tenant_id
having count(*) > 1;

-- ── Advertisers being billed twice, right now ────────────────────────
select
  a.tenant_client_code as client,
  count(*)             as billable_subscriptions,
  sum(s.amount)        as total_per_cycle,
  string_agg(s.status || ' ' || coalesce(s.amount::text,'?'), ' + ') as detail
  from public.subscriptions s
  left join public.advertisers a on a.id = s.advertiser_id
 where s.status in ('active','past_due')
 group by a.tenant_client_code, s.advertiser_id
having count(*) > 1;

-- ── Two live referral links on one advertiser ────────────────────────
select
  a.tenant_client_code as referred,
  count(*)             as live_links
  from public.referral_links rl
  left join public.advertisers a on a.id = rl.referred_advertiser_id
 where coalesce(rl.status,'active') in ('active','pending')
 group by a.tenant_client_code, rl.referred_advertiser_id
having count(*) > 1;

-- ── Anyone referring themselves ──────────────────────────────────────
select rl.id, a.tenant_client_code as both_sides
  from public.referral_links rl
  left join public.advertisers a on a.id = rl.referred_advertiser_id
 where rl.affiliate_advertiser_id = rl.referred_advertiser_id;


-- ── 3a. Periods that were under-billed by a downgrade ────────────────
-- A paid period invoice whose subscription now costs MORE than what was
-- collected for it, with no open invoice for the difference. Empty is
-- what you want.
select
  a.tenant_client_code           as client,
  i.number                       as paid_invoice,
  i.total                        as collected,
  s.amount                       as priced_at,
  round(s.amount - i.total, 2)   as never_billed,
  i.currency,
  i.period_start::date           as period
  from public.invoices i
  join public.subscriptions s on s.id = i.subscription_id
  left join public.advertisers a on a.id = s.advertiser_id
 where i.status = 'paid'
   and i.period_start is not null
   and i.type = 'subscription'
   and s.amount > i.total
   and not exists (
     select 1 from public.invoices o
      where o.subscription_id = s.id
        and o.status = 'unpaid'
   )
 order by (s.amount - i.total) desc;

-- ── 3b. Commission standing on money that came back ──────────────────
-- Commission rows whose source top-up is no longer completed. Each one
-- is payable against a payment we do not have.
select
  c.id,
  c.amount,
  c.currency,
  c.status,
  c.created_at::date            as accrued,
  t.status                      as source_topup_status
  from public.referral_commissions c
  left join public.wallet_topups t on t.id = c.source_wallet_topup_id
 where c.status <> 'paid'
   and (t.id is null or t.status <> 'completed')
 order by c.created_at desc;
