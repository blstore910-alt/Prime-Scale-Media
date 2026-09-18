-- =====================================================================
-- What a plan gives you EVERY month, in the plan's own row.
-- =====================================================================
-- ⚠️ APPLY ON SUPABASE MANUALLY. Additive — one nullable column and a
-- seed. Nothing existing changes.
--
-- WHY. The renewal confirmation was about to list "2 ad accounts
-- included" and "3% top-up fee", derived from advertiser_plans. Both are
-- wrong on a RENEWAL:
--
--   * the included accounts are a ONE-TIME allocation at signup. Printing
--     it every month promises two more accounts this month, which is a
--     support ticket waiting to happen.
--   * the top-up fee is per AD ACCOUNT, not per plan. The account's own
--     fee overrides the plan's — that is the rule, enforced server-side
--     since 20260918 — so a flat "3%" can simply be untrue for the
--     account they are about to fund.
--
-- What a subscription actually buys, month after month, is the service:
-- the accounts stay live, support runs seven days a week, top-ups are
-- faster, the queue is prioritised, and it can be cancelled monthly. That
-- differs per plan and it is a commercial decision, so it belongs in the
-- plan row rather than in a component.
--
-- The seed matches the public pricing page as it reads today. Change it
-- there and here together, or the two drift — which is the thing this
-- column exists to prevent.
-- =====================================================================

set search_path = public;

alter table public.plans
  add column if not exists features text[];

comment on column public.plans.features is
  'What this plan gives every month, for the renewal confirmation. NOT the one-time signup allocation, and NOT a fee percentage — the ad account''s own fee overrides the plan''s.';

-- ── Seed, only where nothing has been written yet ────────────────────
update public.plans
   set features = array[
         'Support 7 days a week',
         'Faster top-ups + priority',
         'Cancel monthly'
       ],
       updated_at = now()
 where kind = 'tier'
   and features is null
   and lower(name) = 'prime';

update public.plans
   set features = array[
         'Support 7 days a week',
         'WhatsApp support',
         'Cancel monthly'
       ],
       updated_at = now()
 where kind = 'tier'
   and features is null
   and lower(name) = 'launch';

update public.plans
   set features = array[
         'Support 7 days a week',
         'Cancel monthly'
       ],
       updated_at = now()
 where kind = 'tier'
   and features is null
   and lower(name) = 'flex';

-- Anything else on a tier: a safe, true minimum rather than nothing.
update public.plans
   set features = array[
         'Your ad accounts stay live',
         'Support 7 days a week',
         'Cancel monthly'
       ],
       updated_at = now()
 where kind = 'tier'
   and features is null;

-- ── Read back ────────────────────────────────────────────────────────
select
  name,
  monthly_fee,
  currency,
  included_ad_accounts   as accounts_at_signup,
  topup_fee_pct          as default_fee_pct,
  features
  from public.plans
 where kind = 'tier'
 order by sort_order, name;
