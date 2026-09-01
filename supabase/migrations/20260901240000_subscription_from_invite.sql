-- =====================================================================
-- Auto-create the subscription on accept — plan-model phase 3
-- =====================================================================
-- On accept/signup, turn the plan carried by the invitation into a live
-- subscription for the new advertiser. monthly_fee = 0 (free / NSA
-- community) → no subscription. Idempotent — skips if the advertiser
-- already has a subscription. SECURITY DEFINER so it runs from the
-- accept routes (invitee session) and the signup route (service role).
--
-- The subscription is created "active"; the sub invoice + collection are
-- handled separately (external invoicer / phase 4 pay-now + cron), and
-- the advertiser shows "owing" until paid without being blocked.
-- =====================================================================

set search_path = public;

create or replace function public.create_subscription_from_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_inv public.invitations%rowtype;
  v_adv public.advertisers%rowtype;
  v_fee numeric;
  v_cur text;
begin
  select * into v_inv from public.invitations where id = p_invite_id;
  if not found then return; end if;

  -- Resolve the advertiser. Service role (signup route, auth.uid() null)
  -- → match by the invitation's email in its tenant; otherwise the
  -- caller's own advertiser (existing-user accept route).
  if v_uid is null then
    select a.* into v_adv
      from public.advertisers a
      join public.user_profiles up on up.user_id = a.user_id
     where lower(up.email) = lower(coalesce(v_inv.email, ''))
       and a.tenant_id = v_inv.tenant_id
     order by a.created_at desc
     limit 1;
  else
    select * into v_adv from public.advertisers where user_id = v_uid limit 1;
  end if;
  if not found then return; end if;

  v_fee := coalesce(v_inv.monthly_fee, 0);
  if v_fee <= 0 then return; end if; -- free / no plan → no subscription

  -- Idempotent: don't create a second subscription.
  if exists (
    select 1 from public.subscriptions s
     where s.advertiser_id = v_adv.id
       and s.status in ('active', 'inactive', 'past_due', 'paused')
  ) then
    return;
  end if;

  v_cur := upper(coalesce(v_inv.plan_currency, 'EUR'));
  if v_cur not in ('USD', 'EUR') then v_cur := 'EUR'; end if;

  insert into public.subscriptions
    (advertiser_id, tenant_id, amount, currency, start_date, status,
     next_payment_date)
  values
    (v_adv.id, v_inv.tenant_id, v_fee, v_cur, now(), 'active',
     now() + interval '1 month');
end;
$$;

revoke all on function public.create_subscription_from_invite(uuid) from public, anon;
grant execute on function public.create_subscription_from_invite(uuid) to authenticated, service_role;
