-- =====================================================================
-- NOODREM LOS. Zet precies terug wat FREEZE-MONEY.sql heeft weggehaald.
-- =====================================================================
-- Safe to run twice: the second run finds an empty list.
--
-- It restores FROM THE RECORD, not from a list of names. That is the
-- whole point of writing it down: re-granting a remembered set would
-- widen anything that was deliberately server-only before the freeze,
-- and a money function quietly opened during an incident recovery is a
-- worse outcome than the incident.
--
-- Afterwards, set MAINTENANCE_MODE back to false in Vercel. This gives
-- the database back; that gives the app back.
-- =====================================================================

set search_path = public;

do $blk1$
declare
  r   record;
  v_n int := 0;
begin
  if to_regclass('public._money_freeze') is null then
    raise notice 'No freeze record here - nothing was ever frozen.';
    return;
  end if;

  for r in select * from public._money_freeze order by id loop
    -- The function may have been replaced since the freeze. A signature
    -- that no longer resolves is skipped, loudly, rather than aborting
    -- the whole restore and leaving the rest locked.
    begin
      execute format('grant execute on function %s to %I', r.signature, r.grantee);
      v_n := v_n + 1;
      raise notice 'restored: %  -> %', r.signature, r.grantee;
    exception when others then
      raise warning 'could not restore % -> % : %', r.signature, r.grantee, sqlerrm;
    end;
  end loop;

  delete from public._money_freeze;

  if v_n = 0 then
    raise notice 'Nothing to restore.';
  else
    raise notice '% grants restored.', v_n;
  end if;
end;
$blk1$;


-- =====================================================================
-- CONTROLE - het moet er weer uitzien zoals ervoor
-- =====================================================================
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
    '(server only)')                 as open_to
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

select count(*) as still_recorded_as_frozen from public._money_freeze;
