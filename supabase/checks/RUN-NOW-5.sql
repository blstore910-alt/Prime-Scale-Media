-- =====================================================================
-- RONDE 7 — twee soorten geld die op het rapport ontbreken.
-- =====================================================================
-- Safe to run twice. It creates one read-only function and grants it.
-- Nothing is dropped, nothing is altered, no row is written.
--
-- WHAT IS MISSING. The customer's financial report reads eight sources:
-- wallet top-ups, ad-account funding, withdrawals, fees, invoices,
-- advances, exchanges and commissions. Two more move real money in a
-- customer's wallet and appear nowhere:
--
--   wallet_refunds      money we send back out of their wallet
--   wallet_adjustments  a signed correction an admin approved
--
-- Both tables are admin-read-only by design (refunds_admin_read,
-- adjustments_admin_read), so the customer cannot read their own. That is
-- the right default for tables carrying `reason`, `requested_by` and
-- `reviewed_by` — an internal note and two members of staff. It is the
-- wrong answer for the AMOUNTS, which are the customer's own money: a
-- report that omits them reconciles to the wrong number, and the customer
-- has no way to see that 500 EUR left their wallet.
--
-- So: a function, not a policy. A policy is all-or-nothing per row and
-- would hand over the note and the staff ids with it. This returns six
-- columns and stops.
--
-- ALSO: approved rows only. A pending refund is an admin still deciding;
-- showing it promises money that may be refused. A rejected one never
-- happened.
--
-- The app tolerates this function's ABSENCE — until you paste it, those
-- two kinds are simply not in the report and nothing reports an error.
-- =====================================================================

set search_path = public;

do $blk0$
begin
  if to_regclass('public.wallet_refunds') is null
     and to_regclass('public.wallet_adjustments') is null then
    raise notice 'Neither table exists here - nothing to expose.';
  end if;
end;
$blk0$;

create or replace function public.my_wallet_extras(p_advertiser_id uuid)
returns table (
  kind       text,
  row_id     uuid,
  at         timestamptz,
  amount     numeric,
  currency   text,
  status     text,
  reference  text
)
language plpgsql
security definer
set search_path = public
as $blk1$
begin
  -- ── IT HAS TO BE THEIR OWN ────────────────────────────────────────
  -- SECURITY DEFINER means row-level security is off inside this body,
  -- so the ownership check IS the security. auth.uid() is the session's,
  -- never the caller's claim.
  --
  -- One person can hold an advertiser row in more than one tenant (the
  -- app has a profile switcher for exactly that), so this asks whether
  -- THIS advertiser row belongs to them, rather than picking one.
  if not exists (
    select 1
      from public.advertisers a
     where a.id = p_advertiser_id
       and a.user_id = auth.uid()
  ) then
    raise exception 'Not your advertiser' using errcode = '42501';
  end if;

  if to_regclass('public.wallet_refunds') is not null then
    return query
      select
        'refund'::text,
        r.id,
        r.created_at,
        -- Out of the wallet, so negative from the customer's side. The
        -- report's whole sign convention is "+ arrived, - left".
        -abs(r.amount)::numeric,
        r.currency::text,
        r.status::text,
        r.reference::text
        from public.wallet_refunds r
       where r.advertiser_id = p_advertiser_id
         and r.status = 'approved';
  end if;

  if to_regclass('public.wallet_adjustments') is not null then
    return query
      select
        'adjustment'::text,
        j.id,
        j.created_at,
        -- delta is already signed: +50 adds, -50 removes.
        j.delta::numeric,
        j.currency::text,
        j.status::text,
        j.reference::text
        from public.wallet_adjustments j
       where j.advertiser_id = p_advertiser_id
         and j.status = 'approved';
  end if;
end;
$blk1$;

-- The function does its own authorization, so `authenticated` is right
-- and `anon` is not. Revoke first: a re-run must not widen it.
revoke execute on function public.my_wallet_extras(uuid) from public, anon;
grant  execute on function public.my_wallet_extras(uuid) to authenticated;


-- =====================================================================
-- CONTROLE — alleen lezen
-- =====================================================================
select
  p.oid::regprocedure                        as full_signature,
  p.prosecdef                                as security_definer,
  coalesce(
    array_to_string(
      array(
        select distinct a.grantee
          from information_schema.routine_privileges a
         where a.specific_schema = 'public'
           and a.routine_name = 'my_wallet_extras'
         order by 1
      ), ', '),
    '(none)')                                as granted_to
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname = 'my_wallet_extras';

-- Hoeveel er te zien komt. If both are zero, nothing changes on any
-- customer's report and that is a fine outcome.
select
  (select count(*) from public.wallet_refunds     where status = 'approved') as approved_refunds,
  (select count(*) from public.wallet_adjustments where status = 'approved') as approved_adjustments;
