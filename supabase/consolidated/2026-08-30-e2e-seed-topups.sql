-- ═══════════════════════════════════════════════════════════════════
-- E2E sample data: wallet topups so the wallet + admin queues look
-- alive during manual and Playwright inspection.
--
-- Creates (idempotent by fixed IDs):
--   - 2 completed USD wallet topups on the advertiser's wallet
--     ($500 + $250 = $750 total balance)
--   - 1 completed EUR wallet topup (€300 balance)
--   - 1 pending USD wallet topup ($100) — shows up in super-admin
--     /wallet-topups queue for manual approve testing
--
-- Notes on triggers:
--   Insert-side notify trigger (notify_wallet_topup_created) requires
--   a recipient which service-role can't derive. Disable USER
--   triggers on wallet_topups for the seed transaction, then credit
--   the wallet balance directly (bypassing trg_apply_wallet_topup_
--   balance). Re-enable triggers at the end so ordinary app writes
--   are unaffected.
--
-- Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════

alter table public.wallet_topups disable trigger user;

do $$
declare
  v_wallet_id uuid;
  v_usd_total numeric := 0;
  v_eur_total numeric := 0;
begin
  select w.id into v_wallet_id
    from public.wallets w
    join public.advertisers a on a.id = w.advertiser_id
   where a.profile_id = 'a4444444-4444-4444-4444-444444444444';
  if v_wallet_id is null then
    raise notice 'Advertiser wallet not found — run wire-fixture first';
    return;
  end if;

  -- Completed USD #1: 500
  insert into public.wallet_topups (id, wallet_id, currency, amount, status, reference_no)
  values ('a1111111-b111-c111-d111-e11111111111', v_wallet_id, 'USD', 500.00, 'completed', 1111111001)
  on conflict (id) do update set status = 'completed', amount = 500.00, currency = 'USD';

  -- Completed USD #2: 250
  insert into public.wallet_topups (id, wallet_id, currency, amount, status, reference_no)
  values ('a2222222-b222-c222-d222-e22222222222', v_wallet_id, 'USD', 250.00, 'completed', 1111111002)
  on conflict (id) do update set status = 'completed', amount = 250.00, currency = 'USD';

  -- Completed EUR: 300
  insert into public.wallet_topups (id, wallet_id, currency, amount, status, reference_no)
  values ('a3333333-b333-c333-d333-e33333333333', v_wallet_id, 'EUR', 300.00, 'completed', 1111111003)
  on conflict (id) do update set status = 'completed', amount = 300.00, currency = 'EUR';

  -- Pending USD: 100
  insert into public.wallet_topups (id, wallet_id, currency, amount, status, reference_no)
  values ('a4444444-b444-c444-d444-e44444444444', v_wallet_id, 'USD', 100.00, 'pending', 1111111004)
  on conflict (id) do update set status = 'pending', amount = 100.00, currency = 'USD';

  -- Sum completed topups per currency and set the wallet balance
  -- directly — the balance-crediting trigger is disabled for this
  -- transaction along with the notify trigger.
  select
    coalesce(sum(case when currency = 'USD' then amount else 0 end), 0),
    coalesce(sum(case when currency = 'EUR' then amount else 0 end), 0)
   into v_usd_total, v_eur_total
   from public.wallet_topups
   where wallet_id = v_wallet_id and status = 'completed';

  update public.wallets
     set usd_balance = v_usd_total,
         eur_balance = v_eur_total,
         updated_at = now()
   where id = v_wallet_id;
end;
$$;

alter table public.wallet_topups enable trigger user;

-- Sanity: expected balances (USD 750, EUR 300, completed 3, pending 1)
select
  w.reference_no,
  w.usd_balance,
  w.eur_balance,
  (select count(*) from public.wallet_topups wt
    where wt.wallet_id = w.id and wt.status = 'completed') as completed_topups,
  (select count(*) from public.wallet_topups wt
    where wt.wallet_id = w.id and wt.status = 'pending') as pending_topups
from public.wallets w
join public.advertisers a on a.id = w.advertiser_id
where a.profile_id = 'a4444444-4444-4444-4444-444444444444';
