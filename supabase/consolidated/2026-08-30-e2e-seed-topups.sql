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
-- Balances are updated by the trg_apply_wallet_topup_balance trigger
-- when status flips to 'completed'. To seed with completed status
-- directly, insert as pending then UPDATE to completed so the
-- trigger fires and credits the wallet in one transaction.
--
-- Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════

-- Wallet id for the advertiser role.
do $$
declare
  v_wallet_id uuid;
begin
  select w.id into v_wallet_id
    from public.wallets w
    join public.advertisers a on a.id = w.advertiser_id
   where a.profile_id = 'a4444444-4444-4444-4444-444444444444';
  if v_wallet_id is null then
    raise notice 'Advertiser wallet not found — run wire-fixture first';
    return;
  end if;

  -- 1. Completed USD topup #1: 500.00
  insert into public.wallet_topups (id, wallet_id, currency, amount, status, reference_no)
  values (
    'a1111111-b111-c111-d111-e11111111111',
    v_wallet_id, 'USD', 500.00, 'pending', 1111111001
  )
  on conflict (id) do update set status = 'pending', amount = 500.00;
  update public.wallet_topups set status = 'completed'
   where id = 'a1111111-b111-c111-d111-e11111111111';

  -- 2. Completed USD topup #2: 250.00
  insert into public.wallet_topups (id, wallet_id, currency, amount, status, reference_no)
  values (
    'a2222222-b222-c222-d222-e22222222222',
    v_wallet_id, 'USD', 250.00, 'pending', 1111111002
  )
  on conflict (id) do update set status = 'pending', amount = 250.00;
  update public.wallet_topups set status = 'completed'
   where id = 'a2222222-b222-c222-d222-e22222222222';

  -- 3. Completed EUR topup: 300.00
  insert into public.wallet_topups (id, wallet_id, currency, amount, status, reference_no)
  values (
    'a3333333-b333-c333-d333-e33333333333',
    v_wallet_id, 'EUR', 300.00, 'pending', 1111111003
  )
  on conflict (id) do update set status = 'pending', amount = 300.00;
  update public.wallet_topups set status = 'completed'
   where id = 'a3333333-b333-c333-d333-e33333333333';

  -- 4. Pending USD topup: 100.00 — visible in admin queue
  insert into public.wallet_topups (id, wallet_id, currency, amount, status, reference_no)
  values (
    'a4444444-b444-c444-d444-e44444444444',
    v_wallet_id, 'USD', 100.00, 'pending', 1111111004
  )
  on conflict (id) do update set status = 'pending', amount = 100.00;
end;
$$;

-- Sanity: expected balances after trigger runs
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
