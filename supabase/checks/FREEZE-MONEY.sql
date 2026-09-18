-- =====================================================================
-- NOODREM. Zet alle geld-RPCs stil. Alleen draaien tijdens een incident.
-- =====================================================================
-- Paired with UNFREEZE-MONEY.sql, which puts back exactly what this took
-- away. Safe to run twice: the second run finds nothing left to revoke.
--
-- WHY THIS EXISTS. MAINTENANCE_MODE=true in Vercel freezes every
-- mutation SERVER ACTION - maintenanceGuard() is the first line of each
-- one. It does not touch the RPCs the BROWSER calls directly, and most
-- of those move money:
--
--   top_up_create_for_advertiser   a customer funds an ad account
--   wallet_exchange                EUR <-> USD inside a wallet
--   invoice_pay_from_wallet        an invoice paid from the balance
--   wallet_topup_admin_verify      a deposit credited
--   wallet_topup_admin_reject      / undo
--   top_up_admin_verify            / reject
--   wallet_admin_adjust            a signed correction
--   wallet_create_for_advertiser   a new wallet
--
-- So during the incident where you most need writes to stop, they carry
-- on. This closes that gap the only way that does not mean rewriting
-- sixteen money functions under pressure: it takes EXECUTE away, and
-- writes down what it took so it can be given back exactly.
--
-- WHAT THE CUSTOMER SEES. A blunt "permission denied for function ..."
-- toast. That is the right trade for an hour: set MAINTENANCE_MODE=true
-- in Vercel FIRST so the banner explains it, then run this. Order
-- matters - the banner is the explanation, this is the lock.
--
-- service_role is never touched, so the cron and the server actions keep
-- working and you can still put things right.
-- =====================================================================

set search_path = public;

-- Where we write down what was taken away. Not a business table: no
-- audit trigger, no updated_at, nothing reads it but UNFREEZE.
create table if not exists public._money_freeze (
  id         bigserial primary key,
  signature  text        not null,
  grantee    text        not null,
  frozen_at  timestamptz not null default now()
);

do $blk1$
declare
  v_names text[] := array[
    'top_up_create_for_advertiser',
    'wallet_exchange',
    'invoice_pay_from_wallet',
    'wallet_topup_admin_verify',
    'wallet_topup_admin_reject',
    'wallet_topup_admin_undo',
    'top_up_admin_verify',
    'top_up_admin_reject',
    'wallet_admin_adjust',
    'wallet_admin_set_min_topup',
    'wallet_create_for_advertiser',
    'wallet_precharge_create',
    'wallet_precharge_settle',
    'wallet_precharge_cancel',
    'wallet_refund_request',
    'wallet_adjustment_request'
  ];
  r     record;
  v_n   int := 0;
begin
  for r in
    select
      p.oid::regprocedure::text       as sig,
      -- grantee oid 0 is PUBLIC, which has no pg_roles row. A function
      -- whose proacl is NULL carries the DEFAULT acl, and the default
      -- for a function is EXECUTE to PUBLIC - so skipping the null case
      -- would leave the most open functions untouched.
      coalesce(g.rolname, 'public')   as grantee
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      cross join lateral aclexplode(
        coalesce(p.proacl, acldefault('f', p.proowner))
      ) a
      left join pg_roles g on g.oid = a.grantee
     where n.nspname = 'public'
       and p.proname = any(v_names)
       and a.privilege_type = 'EXECUTE'
       and coalesce(g.rolname, 'public') in ('public', 'anon', 'authenticated')
  loop
    insert into public._money_freeze (signature, grantee)
      values (r.sig, r.grantee);
    execute format('revoke execute on function %s from %I', r.sig, r.grantee);
    v_n := v_n + 1;
    raise notice 'frozen: %  (was executable by %)', r.sig, r.grantee;
  end loop;

  if v_n = 0 then
    raise notice 'Nothing left to freeze - either it is already frozen, or these functions are named differently here.';
  else
    raise notice '% grants revoked. service_role is untouched.', v_n;
  end if;
end;
$blk1$;


-- =====================================================================
-- CONTROLE - wat kan er nu nog
-- =====================================================================
-- Every row should read (server only). Anything still listing
-- authenticated or anon did not match the name list above - tell me.
select
  p.oid::regprocedure                as fn,
  coalesce(
    nullif(
      array_to_string(
        array(
          select coalesce(g.rolname, 'public')
            from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
            left join pg_roles g on g.oid = a.grantee
           where a.privilege_type = 'EXECUTE'
             and coalesce(g.rolname, 'public') in ('public','anon','authenticated')
           order by 1
        ), ', '),
      ''),
    '(server only)')                 as still_open_to
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in (
     'top_up_create_for_advertiser','wallet_exchange','invoice_pay_from_wallet',
     'wallet_topup_admin_verify','wallet_topup_admin_reject','wallet_topup_admin_undo',
     'top_up_admin_verify','top_up_admin_reject','wallet_admin_adjust',
     'wallet_admin_set_min_topup','wallet_create_for_advertiser',
     'wallet_precharge_create','wallet_precharge_settle','wallet_precharge_cancel',
     'wallet_refund_request','wallet_adjustment_request')
 order by 1;

-- En wat er precies is weggehaald, zodat UNFREEZE het terug kan zetten.
select signature, grantee, frozen_at
  from public._money_freeze
 order by frozen_at desc, signature;
