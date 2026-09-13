-- =====================================================================
-- CRITICAL money fix: undoing a precharged, verified top-up loses the advance
-- =====================================================================
-- Two AFTER UPDATE OF status triggers run on wallet_topups:
--   _apply_wallet_topup_balance  (+amount on ->completed, -amount on undo)
--   _settle_precharge_on_topup   (settles a linked precharge on ->completed)
--
-- Verify nets to zero for a precharged top-up: balance +A, settle -A, so the
-- wallet keeps the +A advance and the precharge is marked 'settled'.
-- But UNDO (completed -> pending, or -> rejected) only ran the balance
-- trigger (-A); the settle trigger's guard fires ONLY on ->completed, so it
-- no-oped and the 'settled' precharge was never reopened. Net: the wallet
-- loses the entire advance A, and the precharge still reads 'settled'.
--
--   Pending EUR1000. Precharge: +1000 (outstanding). Verify: +1000 -1000 ->
--   1000 (settled). Undo: -1000 -> 0. Correct is 1000 + outstanding 1000.
--   The EUR1000 advance is destroyed.
--
-- Fix: extend _settle_precharge_on_topup to also handle the reversal —
-- when a top-up leaves 'completed', re-credit the amount of the precharge
-- that THIS top-up settled and reopen it ('outstanding'), cancelling the
-- balance trigger's -A so the wallet is unchanged and the advance is owed
-- again (the top-up is pending/rejected again).
--
-- ⚠️ APPLY ON SUPABASE MANUALLY (git push ships only the frontend). The live
-- triggers are hand-authored — confirm they match this repo before applying,
-- and TEST: precharge a pending top-up -> verify -> undo, and check the wallet
-- balance is unchanged and the precharge is 'outstanding' again.
-- =====================================================================

set search_path = public;

create or replace function public._settle_precharge_on_topup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pc public.wallet_precharges%rowtype;
begin
  -- ── Settle on completion (unchanged behaviour) ──
  if tg_op = 'UPDATE'
     and new.status = 'completed'
     and old.status is distinct from 'completed' then
    select * into v_pc
      from public.wallet_precharges
     where source_wallet_topup_id = new.id
       and status = 'outstanding'
     for update;
    if not found then
      return new;
    end if;

    -- Debit the settled portion back off the wallet (the balance trigger
    -- already credited the full topup amount just now).
    if v_pc.currency = 'USD' then
      update public.wallets set usd_balance = coalesce(usd_balance,0) - v_pc.outstanding,
             updated_at = now() where id = v_pc.wallet_id;
    else
      update public.wallets set eur_balance = coalesce(eur_balance,0) - v_pc.outstanding,
             updated_at = now() where id = v_pc.wallet_id;
    end if;

    update public.wallet_precharges
       set outstanding = 0, status = 'settled', settled_at = now(), updated_at = now()
     where id = v_pc.id;

    return new;
  end if;

  -- ── Reversal: a verified precharged top-up is undone or rejected ──
  -- The balance trigger removes -amount, but on verify the settle had netted
  -- that credit to zero, so without re-crediting here the wallet loses the
  -- whole advance. Re-credit the settled amount and reopen the precharge so
  -- the advance is outstanding again (the top-up is no longer completed).
  if tg_op = 'UPDATE'
     and old.status = 'completed'
     and new.status is distinct from 'completed' then
    select * into v_pc
      from public.wallet_precharges
     where source_wallet_topup_id = new.id
       and status = 'settled'
     for update;
    if not found then
      return new;
    end if;

    if v_pc.currency = 'USD' then
      update public.wallets set usd_balance = coalesce(usd_balance,0) + v_pc.amount,
             updated_at = now() where id = v_pc.wallet_id;
    else
      update public.wallets set eur_balance = coalesce(eur_balance,0) + v_pc.amount,
             updated_at = now() where id = v_pc.wallet_id;
    end if;

    update public.wallet_precharges
       set outstanding = v_pc.amount, status = 'outstanding', settled_at = null, updated_at = now()
     where id = v_pc.id;

    return new;
  end if;

  return new;
end;
$$;
