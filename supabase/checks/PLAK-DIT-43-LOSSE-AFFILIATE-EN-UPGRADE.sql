-- =====================================================================
-- PLAK 43 — F1: een losse affiliate heeft een eigen code, en kan ook
--            adverteerder worden
-- =====================================================================
-- De eigenaar, 22-09: "alleen affiliate-portaal, maar met de optie om
-- er adverteerder bij te krijgen".
--
-- Gemeten in plak 42 (rij 92): twee profielen met rol `affiliate` hebben
-- GEEN advertisers-rij. Zonder die rij heeft een affiliate geen
-- klantcode, dus geen link, en ziet hun portaal niets
-- (affiliate_referral_stats zoekt de affiliate op in advertisers).
-- ensure_advertiser_and_wallet stopt bij elke rol behalve advertiser
-- (plak 42 rij 90), en de trigger op user_profiles maakt alleen voor
-- adverteerders een rij.
--
-- WAT HIER GEBEURT
--   A. _ensure_affiliate_identity(profiel): een advertisers-rij (de
--      klantcode komt uit de bestaande trigger generate_client_code),
--      status approved -- uitgenodigd als affiliate IS goedgekeurd -- en
--      een lege wallet, zodat "ook adverteerder worden" later niets hoeft
--      aan te maken.
--   B. Een trigger op user_profiles roept A aan zodra een profiel de rol
--      affiliate krijgt (bij aanmaken of wijzigen). Nooit blokkerend.
--   C. De twee bestaande profielen worden nu aangevuld.
--   D. Ook adverteerder worden:
--      affiliate_upgrade_request()          -- de affiliate vraagt het
--      affiliate_upgrade_decide(adv, ja/nee, reden) -- ALLEEN de eigenaar;
--        ja = de rol wordt advertiser (zelfde code, wallet, referrals),
--        nee = met reden, die de affiliate te zien krijgt.
--
-- Veilig om vaker te draaien.
-- =====================================================================

set search_path = public;

create temporary table if not exists _p43 (nr int, item text, v text);
delete from _p43;

alter table public.advertisers
  add column if not exists upgrade_requested_at   timestamptz,
  add column if not exists upgrade_decided_at     timestamptz,
  add column if not exists upgrade_refusal_reason text;

-- ── A. de identiteit van een affiliate ───────────────────────────────
create or replace function public._ensure_affiliate_identity(p_profile_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $blk0$
declare
  v_p   record;
  v_adv uuid;
  v_ref text;
begin
  select id, user_id, tenant_id, role::text as role into v_p
    from public.user_profiles where id = p_profile_id;
  if not found or v_p.role <> 'affiliate' or v_p.tenant_id is null or v_p.user_id is null then
    return null;
  end if;

  select id into v_adv from public.advertisers where profile_id = v_p.id limit 1;
  if v_adv is null then
    insert into public.advertisers
      (profile_id, user_id, tenant_id, startup_fee, fee_status, airtable,
       affiliate_status, affiliate_decided_at)
    values
      (v_p.id, v_p.user_id, v_p.tenant_id, 0, 'pending', false, 'approved', now())
    returning id into v_adv;
  else
    update public.advertisers
       set affiliate_status = 'approved', affiliate_decided_at = coalesce(affiliate_decided_at, now())
     where id = v_adv and affiliate_status is distinct from 'approved';
  end if;

  if not exists (select 1 from public.wallets where advertiser_id = v_adv) then
    v_ref := lpad((floor(random() * 10000000000)::bigint)::text, 10, '0');
    insert into public.wallets (advertiser_id, tenant_id, reference_no)
    values (v_adv, v_p.tenant_id, v_ref);
  end if;

  return v_adv;
end;
$blk0$;

revoke all on function public._ensure_affiliate_identity(uuid) from public, anon, authenticated;

-- ── B. automatisch, zodra iemand affiliate wordt ─────────────────────
create or replace function public._affiliate_identity_on_profile()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $blk1$
begin
  if new.role::text = 'affiliate'
     and (tg_op = 'INSERT' or old.role::text is distinct from new.role::text) then
    begin
      perform public._ensure_affiliate_identity(new.id);
    exception when others then
      raise warning 'affiliate identity for profile % failed: %', new.id, sqlerrm;
    end;
  end if;
  return new;
end;
$blk1$;

drop trigger if exists zz_affiliate_identity_after_profile on public.user_profiles;
create trigger zz_affiliate_identity_after_profile
  after insert or update of role on public.user_profiles
  for each row execute function public._affiliate_identity_on_profile();

insert into _p43 values (1, 'automatisch', 'nieuw of gewijzigd naar affiliate -> eigen code + wallet');

-- ── C. de bestaande aanvullen ────────────────────────────────────────
do $blk2$
declare
  r record;
  v_done text := '';
begin
  for r in
    select up.id, coalesce(up.email, up.id::text) as who
      from public.user_profiles up
     where up.role::text = 'affiliate'
       and not exists (select 1 from public.advertisers a where a.profile_id = up.id)
  loop
    perform public._ensure_affiliate_identity(r.id);
    v_done := v_done || r.who || ' ';
  end loop;
  insert into _p43 values (2, 'aangevuld', case when v_done = '' then 'niemand nodig' else v_done end);
exception when others then
  insert into _p43 values (2, 'aangevuld', 'MISLUKT: ' || sqlstate || ' ' || sqlerrm);
end;
$blk2$;

insert into _p43
select 3, 'affiliates met hun code',
  coalesce(string_agg(coalesce(up.email, '?') || ' = ' || coalesce(a.tenant_client_code, 'GEEN CODE')
                      || ' | wallet ' || case when w.id is null then 'NEE' else 'ja' end
                      || ' | ' || coalesce(a.affiliate_status, '-'), E'\n'), 'geen')
  from public.user_profiles up
  left join public.advertisers a on a.profile_id = up.id
  left join public.wallets w on w.advertiser_id = a.id
 where up.role::text = 'affiliate';

-- ── D. ook adverteerder worden ───────────────────────────────────────
create or replace function public.affiliate_upgrade_request()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $blk3$
declare
  v_uid uuid := auth.uid();
  v_p   record;
  v_adv record;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Please sign in and try again.');
  end if;
  select up.id, up.tenant_id, up.full_name, up.email, up.role::text as role,
         coalesce(up.is_active, true) as is_active, coalesce(up.status, 'active') as status
    into v_p
    from public.user_profiles up
   where up.user_id = v_uid and up.role::text = 'affiliate'
   limit 1;
  if v_p.id is null then
    return jsonb_build_object('ok', false, 'error', 'This is for affiliate accounts.');
  end if;
  if not v_p.is_active or v_p.status = 'inactive' then
    return jsonb_build_object('ok', false, 'error', 'This account is inactive.');
  end if;

  select id, tenant_client_code, upgrade_requested_at into v_adv
    from public.advertisers where profile_id = v_p.id limit 1;
  if v_adv.id is null then
    perform public._ensure_affiliate_identity(v_p.id);
    select id, tenant_client_code, upgrade_requested_at into v_adv
      from public.advertisers where profile_id = v_p.id limit 1;
  end if;
  if v_adv.upgrade_requested_at is not null then
    return jsonb_build_object('ok', true, 'already_sent', true);
  end if;

  update public.advertisers
     set upgrade_requested_at = now(), upgrade_decided_at = null, upgrade_refusal_reason = null
   where id = v_adv.id;

  insert into public.notifications (recipient_user_id, tenant_id, type, payload)
  select t.owner_id, t.id, 'affiliate_upgrade_requested',
         jsonb_build_object('advertiser_id', v_adv.id, 'client_code', v_adv.tenant_client_code,
                            'name', coalesce(v_p.full_name, v_p.email), 'email', v_p.email)
    from public.tenants t
   where t.id = v_p.tenant_id and t.owner_id is not null;

  return jsonb_build_object('ok', true, 'already_sent', false);
end;
$blk3$;

revoke all on function public.affiliate_upgrade_request() from public, anon;
grant execute on function public.affiliate_upgrade_request() to authenticated;

create or replace function public.affiliate_upgrade_decide(
  p_advertiser_id uuid, p_approve boolean, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $blk4$
declare
  v_adv  record;
  v_role text;
begin
  select a.*, up.role::text as prof_role
    into v_adv
    from public.advertisers a
    join public.user_profiles up on up.id = a.profile_id
   where a.id = p_advertiser_id
   for update of a;
  if not found then
    raise exception 'Affiliate not found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.tenants t
                  where t.id = v_adv.tenant_id and t.owner_id = auth.uid()) then
    raise exception 'Only the account owner can decide this' using errcode = '42501';
  end if;
  if v_adv.prof_role <> 'affiliate' then
    raise exception 'This account is already an advertiser' using errcode = '22023';
  end if;

  if coalesce(p_approve, false) then
    -- De rol-wacht (_guard_user_profile_role) laat dit toe: de beller is
    -- de eigenaar. Zelfde rij, zelfde code, wallet en referrals.
    update public.user_profiles set role = 'advertiser' where id = v_adv.profile_id;
    update public.advertisers
       set upgrade_requested_at = null, upgrade_decided_at = now(), upgrade_refusal_reason = null,
           affiliate_status = coalesce(affiliate_status, 'approved')
     where id = v_adv.id;
    if v_adv.user_id is not null then
      insert into public.notifications (recipient_user_id, tenant_id, type, payload)
      values (v_adv.user_id, v_adv.tenant_id, 'affiliate_upgrade_approved', '{}'::jsonb);
    end if;
    return jsonb_build_object('ok', true, 'approved', true);
  end if;

  if v_adv.upgrade_requested_at is null then
    raise exception 'There is no request to refuse' using errcode = '22023';
  end if;
  if length(coalesce(trim(p_reason), '')) = 0 then
    raise exception 'Say why, so they know' using errcode = '22023';
  end if;
  update public.advertisers
     set upgrade_requested_at = null, upgrade_decided_at = now(),
         upgrade_refusal_reason = left(trim(p_reason), 500)
   where id = v_adv.id;
  if v_adv.user_id is not null then
    insert into public.notifications (recipient_user_id, tenant_id, type, payload)
    values (v_adv.user_id, v_adv.tenant_id, 'affiliate_upgrade_refused',
            jsonb_build_object('reason', left(trim(p_reason), 500)));
  end if;
  return jsonb_build_object('ok', true, 'approved', false);
end;
$blk4$;

revoke all on function public.affiliate_upgrade_decide(uuid, boolean, text) from public, anon;
grant execute on function public.affiliate_upgrade_decide(uuid, boolean, text) to authenticated;

insert into _p43 values (4, 'ook adverteerder', 'affiliate_upgrade_request + affiliate_upgrade_decide (eigenaar)');

-- ── controle: de affiliate-sessie kan zijn eigen status lezen ─────────
insert into _p43
select 5, 'advertisers_select-policies (de affiliate leest zijn eigen rij)',
  coalesce(string_agg(policyname || ' :: ' || coalesce(qual, '-'), E'\n'), 'geen')
  from pg_policies
 where schemaname = 'public' and tablename = 'advertisers' and cmd in ('SELECT', 'ALL');

select nr, item, v as antwoord from _p43 order by nr;
