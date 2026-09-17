-- =====================================================================
-- Where did an unlinked subscription invoice come from?
-- =====================================================================
-- Read-only. Nothing here writes. Run it whenever you like; it is only
-- worth running while an orphan still exists, so run it BEFORE
-- 20260917220000 if you want the full story (that migration voids them,
-- it does not delete them, so the audit trail survives either way).
--
-- WHAT WE KNOW: invoice 0005-117 is type 'subscription', unpaid, with
-- subscription_id, period_start and due_date all null. Every path in this
-- repo that inserts a type='subscription' invoice sets subscription_id —
-- the billing engine, the change-amount RPC, both reissue branches. And
-- no TypeScript path can write that type at all: the admin create-invoice
-- action allow-lists eight columns and its two callers hard-code
-- 'manual_invoice' and 'ad_account_fee'.
--
-- So either a function on live differs from this repo, or a person wrote
-- the row by hand. These four queries say which.
-- =====================================================================

-- 1. WHO wrote it. invoices is in the _audit_row_change list, so the
--    INSERT is recorded with the actor. actor_user_id null with a service
--    role or SQL-editor context is what a hand-written row looks like; a
--    real admin action carries their user id.
select
  e.occurred_at,
  e.action,
  e.actor_user_id,
  u.email                             as actor_email,
  e.row_id,
  e.after_data -> 'type'              as inv_type,
  e.after_data -> 'total'             as inv_total,
  e.after_data -> 'subscription_id'   as inv_subscription_id,
  e.after_data -> 'due_date'          as inv_due_date
  from public.audit_events e
  left join public.user_profiles u on u.user_id = e.actor_user_id
 where e.table_name = 'invoices'
   -- row_id is TEXT and invoices.id is a uuid, so the cast is required.
   and e.row_id in (
     select id::text from public.invoices
      where type = 'subscription' and subscription_id is null
   )
 order by e.occurred_at;

-- 2. Every orphan, with the subscription that existed at the time. If
--    created_at is BEFORE the subscription's created_at, the invoice was
--    raised before there was anything to link it to — which points at a
--    signup path, not at the billing engine.
select
  i.id,
  a.tenant_client_code,
  i.number,
  i.type,
  i.status,
  i.total,
  i.created_at           as invoice_created,
  s.id                   as subscription_id,
  s.created_at           as subscription_created,
  s.amount               as subscription_amount,
  s.status               as subscription_status
  from public.invoices i
  join public.advertisers a on a.id = i.advertiser_id
  left join public.subscriptions s on s.advertiser_id = i.advertiser_id
 where i.type = 'subscription'
   and i.subscription_id is null
 order by i.created_at;

-- 3. Which FUNCTIONS on live insert into invoices — and which of them do
--    it without naming subscription_id. Anything listed with
--    names_subscription_id = false is a candidate for having made this
--    row, including a function this repo has never seen.
select
  p.proname,
  (p.prosrc ilike '%insert into public.invoices%'
   or p.prosrc ilike '%insert into invoices%')            as inserts_invoices,
  p.prosrc ilike '%subscription_id%'                      as names_subscription_id,
  pg_get_function_identity_arguments(p.oid)               as args
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and (p.prosrc ilike '%insert into public.invoices%'
        or p.prosrc ilike '%insert into invoices%')
 order by names_subscription_id, p.proname;

-- 4. The state we actually care about, before and after. Every advertiser
--    with more than ONE unpaid subscription invoice. After
--    20260917220000 this must return no rows.
select
  a.tenant_client_code,
  count(*)                                    as unpaid_subscription_invoices,
  min(i.created_at)                           as oldest,
  max(i.created_at)                           as newest,
  count(*) filter (where i.subscription_id is null) as of_which_unlinked
  from public.invoices i
  join public.advertisers a on a.id = i.advertiser_id
 where i.type = 'subscription'
   and i.status = 'unpaid'
 group by a.tenant_client_code
 having count(*) > 1
 order by a.tenant_client_code;
