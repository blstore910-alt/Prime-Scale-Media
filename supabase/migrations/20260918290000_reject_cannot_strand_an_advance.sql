-- =====================================================================
-- Rejecting a top-up can no longer leave an advance standing.
-- =====================================================================
-- ⚠️ APPLY ON SUPABASE MANUALLY.
--
-- THE HOLE. An admin precharges a pending top-up: the customer's wallet is
-- credited against a payment that has not cleared, and a row sits in
-- wallet_precharges as 'outstanding'. The payment then turns out to be
-- wrong and the admin rejects the top-up.
--
-- wallet_topup_admin_reject moves the row pending -> rejected. The balance
-- trigger only fires on entering or leaving 'completed', so it does
-- NOTHING. The customer keeps money for a payment we have just refused,
-- the advance stays outstanding for ever, and the only verb left is
-- "Settle" — which means *the money arrived*. Using it would be recording
-- something untrue in order to get the balance back.
--
-- Nothing anywhere says this happened.
--
-- THE FIX, and why it is a refusal rather than an automatic reversal.
-- Taking the advance back by force can push a wallet negative — the
-- customer may have spent it — and a negative balance is a worse state
-- than the one being fixed, arrived at without anybody deciding. So the
-- rejection is REFUSED while an advance is outstanding, and it says what
-- to do: cancel the advance (which returns it) or settle it (which
-- records that the money did arrive after all).
--
--   2. wallet_precharge_cancel — the verb that was missing. The table's
--      CHECK has allowed 'cancelled' since the day it was written and no
--      RPC ever set it. It takes the advance back out of the wallet and
--      refuses if that would go below zero, naming the shortfall, so the
--      admin knows exactly what they are dealing with.
--
-- ROLLBACK: re-apply 20260828120000_wallet_rpcs.sql.
-- =====================================================================

set search_path = public;

-- ── 1. A rejection refuses to strand an advance ──────────────────────
do $blk0$
declare
  v_src text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'wallet_topup_admin_reject'
   limit 1;

  if v_src is null then
    raise exception 'wallet_topup_admin_reject not found';
  end if;
  if position('outstanding advance' in v_src) > 0 then
    raise notice 'Already guarded — no change.';
    return;
  end if;
  if position('for update;' in v_src) = 0 then
    raise notice 'Cannot find the row lock — add the guard by hand.';
    return;
  end if;

  -- Immediately after the top-up row is locked, before anything is
  -- written.
  execute replace(
    v_src,
    'for update;',
    'for update;

  if exists (
    select 1 from public.wallet_precharges pc
     where pc.source_wallet_topup_id = v_topup.id
       and pc.status = ''outstanding''
  ) then
    raise exception ''This top-up has an outstanding advance on it. Cancel the advance first (that returns the credit) or settle it if the money did arrive — rejecting now would leave the customer holding money for a payment we refused.''
      using errcode = ''22000'';
  end if;
'
  );
  raise notice 'A rejection can no longer strand an advance.';
end;
$blk0$;

-- ── 2. The verb that was missing ─────────────────────────────────────
create or replace function public.wallet_precharge_cancel(
  p_precharge_id uuid,
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $blk1$
declare
  v_uid       uuid := auth.uid();
  v_admin_id  uuid;
  v_admin_ten uuid;
  v_pc_id     uuid;
  v_pc_adv    uuid;
  v_pc_cur    text;
  v_pc_out    numeric;
  v_pc_status text;
  v_pc_ten    uuid;
  v_wallet_id uuid;
  v_bal       numeric;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select up.id, up.tenant_id into v_admin_id, v_admin_ten
    from public.user_profiles up
   where up.user_id = v_uid
     and up.role = 'admin'
     and coalesce(up.is_active, true)
   limit 1;
  if not found then
    raise exception 'admins only' using errcode = '42501';
  end if;

  select pc.id, pc.advertiser_id, pc.currency, pc.outstanding, pc.status,
         pc.tenant_id
    into v_pc_id, v_pc_adv, v_pc_cur, v_pc_out, v_pc_status, v_pc_ten
    from public.wallet_precharges pc
   where pc.id = p_precharge_id
   for update;
  if not found then
    raise exception 'advance not found' using errcode = '42704';
  end if;
  if v_pc_ten <> v_admin_ten then
    raise exception 'not your tenant' using errcode = '42501';
  end if;
  if v_pc_status <> 'outstanding' then
    raise exception 'That advance is already %.', v_pc_status
      using errcode = '22000';
  end if;

  select w.id,
         case when upper(v_pc_cur) = 'USD'
              then coalesce(w.usd_balance, 0)
              else coalesce(w.eur_balance, 0) end
    into v_wallet_id, v_bal
    from public.wallets w
   where w.advertiser_id = v_pc_adv
   for update;
  if not found then
    raise exception 'That advertiser has no wallet.' using errcode = '42704';
  end if;

  -- REFUSE rather than go negative. A wallet below zero is a worse state
  -- than an outstanding advance, and arriving at it silently is how it
  -- would happen.
  if v_bal < v_pc_out then
    raise exception
      'Cancelling would take % % out of a wallet holding % — they are short %. They have spent part of the advance; settle it or raise an adjustment instead.',
      v_pc_out, v_pc_cur, v_bal, (v_pc_out - v_bal)
      using errcode = '22000';
  end if;

  if upper(v_pc_cur) = 'USD' then
    update public.wallets
       set usd_balance = coalesce(usd_balance, 0) - v_pc_out,
           updated_at = now()
     where id = v_wallet_id;
  else
    update public.wallets
       set eur_balance = coalesce(eur_balance, 0) - v_pc_out,
           updated_at = now()
     where id = v_wallet_id;
  end if;

  update public.wallet_precharges
     set status = 'cancelled',
         outstanding = 0,
         reason = coalesce(
           nullif(btrim(coalesce(p_reason, '')), ''),
           reason
         ),
         updated_at = now()
   where id = v_pc_id;

  return jsonb_build_object(
    'cancelled', v_pc_out,
    'currency', v_pc_cur
  );
end;
$blk1$;

revoke all on function public.wallet_precharge_cancel(uuid, text)
  from public, anon;
grant execute on function public.wallet_precharge_cancel(uuid, text)
  to authenticated;

-- ── Read back ────────────────────────────────────────────────────────
select
  (select position('outstanding advance' in pg_get_functiondef(p.oid)) > 0
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'wallet_topup_admin_reject')
                                                    as reject_is_guarded,
  to_regprocedure('public.wallet_precharge_cancel(uuid, text)') is not null
                                                    as cancel_exists;

-- Advances standing right now, and whether their top-up is still open.
-- Anything already rejected here is money a customer is holding for a
-- payment that was refused — each one needs a decision by hand.
select
  pc.id,
  a.tenant_client_code       as client,
  pc.currency,
  pc.outstanding,
  coalesce(t.status, 'no top-up attached') as topup_status
  from public.wallet_precharges pc
  left join public.advertisers a on a.id = pc.advertiser_id
  left join public.wallet_topups t on t.id = pc.source_wallet_topup_id
 where pc.status = 'outstanding'
 order by pc.outstanding desc;
