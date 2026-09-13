-- =====================================================================
-- CRITICAL: wallet top-up verification credits the wallet TWICE
-- =====================================================================
-- Two independent, both-ENABLED `after update of status` triggers each added
-- +amount on the same pending->completed edge:
--   trg_apply_wallet_topup_balance    -> _apply_wallet_topup_balance()          (repo, 20260830160000)
--   trg_apply_wallet_topup_on_update  -> apply_wallet_topup_to_wallet_balance() (hand-authored, live only)
-- A 1000 EUR top-up credited 2000. The mirror pair did the same on undo
-- (-2A), which is why a verify/undo round trip still netted correctly and
-- hid the defect. Verified by tracing the live pg_get_triggerdef output and
-- confirmed by an independent multi-agent review.
--
-- NO HISTORICAL CORRECTION IS NEEDED ON THIS DATABASE. Confirmed by:
--   select count(*) from public.audit_events
--    where table_name='wallet_topups' and action='UPDATE'
--      and before_data->>'status'='pending' and after_data->>'status'='completed';
--   -> 0 rows. No top-up has ever been approved, so no wallet was ever
--      double-credited. Re-run that query before applying; if it is NOT 0,
--      STOP and correct balances in the same window as this DDL (the fix
--      removes the compensating double-debit, so any legacy completed
--      top-up that is later undone would otherwise strand +amount).
--
-- WHY ONE TRIGGER INSTEAD OF FOUR
-- The previous design's correctness depended on AFTER-trigger firing order,
-- which Postgres resolves ALPHABETICALLY by trigger name ('s'ettle before
-- 'u'ndo). That is a naming coincidence guarding real money. This migration
-- collapses credit + debit + precharge settle + precharge reversal into a
-- SINGLE function where the order is explicit code.
--
-- It also carries the FULL bodies of everything it needs. The two
-- hand-authored functions exist only on live and appear in no repo
-- migration, so a migration that merely dropped the repo trigger would leave
-- any environment rebuilt from migrations (staging, DR restore) with NO
-- balance trigger at all — silently crediting nothing.
--
-- The redundant FUNCTIONS are dropped too, not just their triggers:
-- 20260830160000 and supabase/consolidated/all-migrations.sql still define
-- _apply_wallet_topup_balance, so leaving it in place lets a re-run
-- resurrect the double credit.
--
-- DELIBERATE BEHAVIOUR CHANGES vs the old pair:
--  * No "Insufficient balance to undo topup" abort. That RAISE rolled back
--    the entire UPDATE — status change, audit row, invoice and commission
--    reversal included — whenever the advertiser had spent the money. A
--    reversal is a correction of record and must not be blocked; the balance
--    is allowed to go negative and is visible as a receivable.
--  * Transition tests use IS DISTINCT FROM (NULL-safe), in ONE place.
--  * The precharge reversal credits back exactly what the settle debited
--    (see topup_settled_amount), instead of assuming outstanding == amount.
--
-- ⚠️ APPLY ON SUPABASE MANUALLY. Do not approve any pending top-up until it
--    is applied. Re-confirm the live trigger set first:
--      select tgname, tgenabled, pg_get_triggerdef(oid) from pg_trigger
--       where tgrelid='public.wallet_topups'::regclass and not tgisinternal;
-- =====================================================================

set search_path = public;

-- Remember what the settle branch actually took off the wallet, so the
-- reversal can put back exactly that (wallet_precharge_settle supports
-- partial settlement, so outstanding is not always == amount).
alter table public.wallet_precharges
  add column if not exists topup_settled_amount numeric;

-- ─────────────────────────────────────────────────────────────────
-- The single source of truth for wallet balance on a top-up status change.
-- ─────────────────────────────────────────────────────────────────
create or replace function public._wallet_topup_balance_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pc       public.wallet_precharges%rowtype;
  v_entered  boolean;
  v_left     boolean;
  v_cur      text;
  v_back     numeric;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  v_entered := (new.status = 'completed' and old.status is distinct from 'completed');
  v_left    := (old.status = 'completed' and new.status is distinct from 'completed');

  if not (v_entered or v_left) then
    return new;
  end if;

  -- ── Leaving 'completed' (undo to pending, or reversal to rejected) ──
  if v_left then
    v_cur := lower(coalesce(old.currency, ''));
    if old.wallet_id is null or old.amount is null then
      raise exception 'wallet_topup % has no wallet_id/amount to reverse', old.id
        using errcode = '22000';
    end if;
    if v_cur = 'usd' then
      update public.wallets
         set usd_balance = coalesce(usd_balance, 0) - old.amount, updated_at = now()
       where id = old.wallet_id;
    elsif v_cur = 'eur' then
      update public.wallets
         set eur_balance = coalesce(eur_balance, 0) - old.amount, updated_at = now()
       where id = old.wallet_id;
    else
      raise exception 'Unsupported currency "%" on wallet_topup %', old.currency, old.id
        using errcode = '22000';
    end if;
    -- NOTE: no floor check on purpose. A reversal must never be blocked by
    -- the advertiser having already spent the money; a negative balance is a
    -- visible receivable, not a reason to abort the correction.

    -- Re-open the precharge this top-up settled, crediting back exactly what
    -- the settle branch debited.
    select * into v_pc
      from public.wallet_precharges
     where source_wallet_topup_id = new.id
       and status = 'settled'
     for update;
    if found then
      v_back := coalesce(v_pc.topup_settled_amount, v_pc.amount);
      if lower(coalesce(v_pc.currency, '')) = 'usd' then
        update public.wallets
           set usd_balance = coalesce(usd_balance, 0) + v_back, updated_at = now()
         where id = v_pc.wallet_id;
      else
        update public.wallets
           set eur_balance = coalesce(eur_balance, 0) + v_back, updated_at = now()
         where id = v_pc.wallet_id;
      end if;
      update public.wallet_precharges
         set outstanding = v_back,
             status = 'outstanding',
             settled_at = null,
             topup_settled_amount = null,
             updated_at = now()
       where id = v_pc.id;
    end if;
  end if;

  -- ── Entering 'completed' (admin verify, or Wise auto-settle) ──
  if v_entered then
    v_cur := lower(coalesce(new.currency, ''));
    if new.wallet_id is null then
      raise exception 'wallet_topups.wallet_id is NULL for topup %', new.id
        using errcode = '22000';
    end if;
    if new.amount is null or new.amount <= 0 then
      raise exception 'wallet_topups.amount must be > 0 for topup % (got %)', new.id, new.amount
        using errcode = '22000';
    end if;
    if v_cur = 'usd' then
      update public.wallets
         set usd_balance = coalesce(usd_balance, 0) + new.amount, updated_at = now()
       where id = new.wallet_id;
    elsif v_cur = 'eur' then
      update public.wallets
         set eur_balance = coalesce(eur_balance, 0) + new.amount, updated_at = now()
       where id = new.wallet_id;
    else
      raise exception 'Unsupported currency "%" for topup %', new.currency, new.id
        using errcode = '22000';
    end if;

    -- Settle an outstanding advance on this same top-up: the arriving money
    -- repays it, so the net effect of verifying a precharged top-up is zero.
    select * into v_pc
      from public.wallet_precharges
     where source_wallet_topup_id = new.id
       and status = 'outstanding'
     for update;
    if found then
      if lower(coalesce(v_pc.currency, '')) = 'usd' then
        update public.wallets
           set usd_balance = coalesce(usd_balance, 0) - v_pc.outstanding, updated_at = now()
         where id = v_pc.wallet_id;
      else
        update public.wallets
           set eur_balance = coalesce(eur_balance, 0) - v_pc.outstanding, updated_at = now()
         where id = v_pc.wallet_id;
      end if;
      update public.wallet_precharges
         set topup_settled_amount = v_pc.outstanding,
             outstanding = 0,
             status = 'settled',
             settled_at = now(),
             updated_at = now()
       where id = v_pc.id;
    end if;
  end if;

  return new;
end;
$$;

-- ── Retire all four predecessors (functions too, or a re-run of
--    20260830160000 / consolidated/all-migrations.sql resurrects the bug) ──
drop trigger if exists trg_apply_wallet_topup_balance   on public.wallet_topups;
drop trigger if exists trg_apply_wallet_topup_on_update on public.wallet_topups;
drop trigger if exists trg_undo_wallet_topup_on_update  on public.wallet_topups;
drop trigger if exists trg_settle_precharge_on_topup    on public.wallet_topups;

drop function if exists public._apply_wallet_topup_balance();
drop function if exists public.apply_wallet_topup_to_wallet_balance();
drop function if exists public.undo_wallet_topup_from_wallet_balance();
drop function if exists public._settle_precharge_on_topup();

create trigger trg_wallet_topup_balance_sync
  after update of status on public.wallet_topups
  for each row execute function public._wallet_topup_balance_sync();

-- ─────────────────────────────────────────────────────────────────
-- POST-APPLY ASSERTION — exactly one balance trigger must remain.
-- Expect a single row: trg_wallet_topup_balance_sync (plus the unrelated
-- audit/log/notify/commission/invoice/touch triggers).
--   select tgname from pg_trigger
--    where tgrelid='public.wallet_topups'::regclass and not tgisinternal
--    order by tgname;
--
-- NON-DESTRUCTIVE PROOF (expect +amount exactly once, then ROLLBACK):
--   begin;
--     select eur_balance from public.wallets where id = '<wallet>';
--     select public.wallet_topup_admin_verify('<pending topup id>');
--     select eur_balance from public.wallets where id = '<wallet>';
--   rollback;
-- ─────────────────────────────────────────────────────────────────
