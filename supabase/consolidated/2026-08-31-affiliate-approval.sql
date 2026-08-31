-- ═══════════════════════════════════════════════════════════════════
-- Affiliate approval gate + approval-aware commission accrual.
-- Paste and run once. Order matters: the status column is added
-- BEFORE the accrual function that reads it.
--
-- After this: self-signup referrals land as 'pending' and earn
-- nothing until an admin clicks Approve on /affiliates; admin-created
-- links are 'active' immediately.
--
-- Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════

-- ─── 1. status column on referral_links ───
alter table public.referral_links
  add column if not exists status text not null default 'active';

alter table public.referral_links
  drop constraint if exists referral_links_status_ck;
alter table public.referral_links
  add constraint referral_links_status_ck
  check (status in ('pending', 'active', 'rejected'));

create index if not exists referral_links_status_idx
  on public.referral_links (tenant_id, status);

-- ─── 2. accrual function, now gated on status='active' ───
create or replace function public._accrue_referral_commission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_advertiser_id uuid;
  v_link          record;
  v_amount        numeric;
begin
  if not (tg_op = 'UPDATE'
          and new.status = 'completed'
          and old.status is distinct from 'completed') then
    return new;
  end if;

  begin
    select w.advertiser_id into v_advertiser_id
      from public.wallets w
     where w.id = new.wallet_id;
    if v_advertiser_id is null then
      return new;
    end if;

    select rl.id,
           rl.tenant_id,
           rl.commission_type,
           rl.commission_pct,
           rl.commission_currency,
           coalesce(rl.status, 'active') as status
      into v_link
      from public.referral_links rl
     where rl.referred_advertiser_id = v_advertiser_id
     limit 1;
    if not found then
      return new;
    end if;
    if v_link.status <> 'active' then
      return new;
    end if;

    if coalesce(v_link.commission_type, '') <> 'percentage' then
      return new;
    end if;
    if coalesce(v_link.commission_pct, 0) <= 0 then
      return new;
    end if;

    v_amount := round(new.amount * v_link.commission_pct / 100.0, 2);
    if v_amount <= 0 then
      return new;
    end if;

    insert into public.referral_commissions (
      referral_link_id, tenant_id, type, amount, currency, status, topup_id
    ) values (
      v_link.id, v_link.tenant_id, 'percentage', v_amount,
      coalesce(new.currency, v_link.commission_currency), 'unpaid', null
    );

    if new.currency = 'USD' then
      update public.referral_links
         set earnings_usd = coalesce(earnings_usd, 0) + v_amount
       where id = v_link.id;
    elsif new.currency = 'EUR' then
      update public.referral_links
         set earnings_eur = coalesce(earnings_eur, 0) + v_amount
       where id = v_link.id;
    end if;

  exception when others then
    raise warning 'referral accrual skipped for wallet_topup %: %',
      new.id, sqlerrm;
  end;

  return new;
end;
$$;

drop trigger if exists trg_accrue_referral_commission on public.wallet_topups;
create trigger trg_accrue_referral_commission
  after update of status on public.wallet_topups
  for each row execute function public._accrue_referral_commission();

-- ─── 3. sanity ───
select
  count(*) filter (where status = 'pending')  as pending,
  count(*) filter (where status = 'active')   as active,
  count(*) filter (where status = 'rejected') as rejected
from public.referral_links;
