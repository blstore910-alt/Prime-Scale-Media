-- Anti-spam: cap how many PENDING requests one advertiser can pile up.
--
-- Wallet top-ups and ad-account requests are created directly from the
-- client (RLS-scoped to the caller's own advertiser), so a scripted or
-- compromised account could flood the admin queue with its own pending
-- rows. A DB-side cap stops that definitively, regardless of the client
-- or any rate-limit bypass. Legitimate customers never approach it.

-- Wallet top-ups: at most 15 pending per advertiser (via their wallet).
create or replace function public._cap_pending_wallet_topups()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if new.status is distinct from 'pending' then
    return new;
  end if;
  select count(*) into v_count
    from public.wallet_topups
   where wallet_id = new.wallet_id
     and status = 'pending';
  if v_count >= 15 then
    raise exception 'Too many pending top-ups — please wait for the current ones to be processed'
      using errcode = '54000';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_cap_pending_wallet_topups on public.wallet_topups;
create trigger trg_cap_pending_wallet_topups
  before insert on public.wallet_topups
  for each row execute function public._cap_pending_wallet_topups();


-- Ad-account requests: at most 20 pending per advertiser.
create or replace function public._cap_pending_ad_requests()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if new.status is distinct from 'pending' or new.advertiser_id is null then
    return new;
  end if;
  select count(*) into v_count
    from public.ad_account_requests
   where advertiser_id = new.advertiser_id
     and status = 'pending';
  if v_count >= 20 then
    raise exception 'Too many pending ad-account requests — please wait for review'
      using errcode = '54000';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_cap_pending_ad_requests on public.ad_account_requests;
create trigger trg_cap_pending_ad_requests
  before insert on public.ad_account_requests
  for each row execute function public._cap_pending_ad_requests();
