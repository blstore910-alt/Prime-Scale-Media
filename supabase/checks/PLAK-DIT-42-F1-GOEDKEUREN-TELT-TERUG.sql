-- =====================================================================
-- PLAK 42 — F1: goedkeuren telt terug, aanvragen hebben een status,
--            en vier deuren dicht
-- =====================================================================
-- De eigenaar, 22-09:
--   1. Aanmelden via een link: eerst goedkeuring. "Stel ik keur goed, dan
--      moeten alle verdiensten meetellen, ook voor ik goedkeurde" -- met de
--      regels die gelden op het moment van goedkeuren.
--   2. Een los affiliate-account: alleen het portaal, met een upgrade naar
--      adverteerder. (De identiteit daarvoor komt in plak 43; deze plak
--      leest eerst uit hoe live een klantcode ontstaat -- rij 90.)
--   3. Een adverteerder die zich aanmeldt als affiliate: goedkeuren = link
--      aan, standaardregels, detailoverzicht.
--
-- WAT HIER GEBEURT
--   A. referral_link_decide(link, ja/nee, reden) -- ALLEEN de eigenaar.
--      Ja: de link gaat aan en ELKE voltooide funding en betaalde
--      abonnementsfactuur van die klant sinds de koppeling wordt alsnog
--      geboekt, met de regels van NU (de eigenaar kiest bij goedkeuren).
--      De eenmalige bonus landt op de vroegste funding. De unieke indexen
--      van plak 35 maken dubbel boeken onmogelijk.
--      Nee: status afgewezen met reden; er wordt niets geboekt.
--   B. referral_link_assign(klant, affiliate) -- "Set referrer" door de
--      eigenaar: maakt de koppeling en keurt hem meteen goed (met
--      terugwerkende kracht vanaf de koppeling).
--   C. Een nieuwe koppeling die op goedkeuring wacht meldt zich: de
--      eigenaar krijgt 'referral_pending', de affiliate 'referral_joined'.
--      Goedkeuren/afwijzen meldt de affiliate het resultaat.
--   D. Aanvragen om affiliate te worden krijgen een STATUS op de advertiser
--      (applied / approved / refused) in plaats van een melding die de
--      aanvrager niet kan lezen en die na herladen "vergeten" was.
--      affiliate_application_decide(advertiser, ja/nee, reden) -- eigenaar.
--   E. affiliate_referral_stats geeft ook koppelingen die op goedkeuring
--      wachten, met hun status, zodat de affiliate "wacht op goedkeuring"
--      ziet in plaats van "No referrals yet".
--   F. De abonnementsboeking wordt, net als de funding in plak 41, één
--      functie (_book_invoice_commission) die de trigger en A gebruiken.
--
-- DEUREN DICHT (F1-rechtencontrole)
--   G. invitations.token: iedere medewerker-admin kon de token van ELKE
--      openstaande uitnodiging lezen, en met token + e-mail maakt
--      /api/accept-invite/signup een account met een zelfgekozen
--      wachtwoord -- een overname. Sessies lezen voortaan alle kolommen
--      BEHALVE token (de app las hem nergens met een sessie; de twee
--      pagina's die dat deden zijn in dezelfde commit omgezet).
--   H. advertisers: een sessie mag alleen fee-, notitie- en
--      commissievelden wijzigen -- niet de klantcode, niet user_id (wie het
--      geld ontvangt), niet de tenant, niet de affiliate-status.
--   I. user_profiles: een UITGENODIGDE kon zichzelf als adverteerder
--      invoegen vóór het accepteren. Die tak is weg; accepteren gaat al
--      via de service key.
--   J. referral_links: status staat standaard op 'pending' (was 'active'),
--      en een sessie kan status en koppeling niet zelf zetten -- alleen A
--      en B doen dat.
--
-- Veilig om vaker te draaien. Elke deur meet eerst of iets breekt.
-- =====================================================================

set search_path = public;

create temporary table if not exists _p42 (nr int, item text, v text);
delete from _p42;

-- ── kolommen ─────────────────────────────────────────────────────────
alter table public.referral_links
  add column if not exists decided_at      timestamptz,
  add column if not exists decision_reason text;

alter table public.advertisers
  add column if not exists affiliate_status          text,
  add column if not exists affiliate_applied_at      timestamptz,
  add column if not exists affiliate_decided_at      timestamptz,
  add column if not exists affiliate_refusal_reason  text;

do $blk0$
begin
  alter table public.advertisers drop constraint if exists advertisers_affiliate_status_ok;
  alter table public.advertisers add constraint advertisers_affiliate_status_ok
    check (affiliate_status is null or affiliate_status in ('applied', 'approved', 'refused'));
exception when others then
  insert into _p42 values (1, 'affiliate_status check', 'MISLUKT: ' || sqlerrm);
end;
$blk0$;

-- Wie vandaag al affiliate is (een koppeling als affiliate, of
-- commissievoorwaarden op de advertiser), staat meteen op approved.
update public.advertisers a
   set affiliate_status = 'approved', affiliate_decided_at = coalesce(affiliate_decided_at, now())
 where affiliate_status is null
   and (exists (select 1 from public.referral_links rl
                 where rl.affiliate_advertiser_id = a.id
                   and coalesce(rl.status, 'active') = 'active')
        or (coalesce(a.commission_type::text, '') not in ('', 'none'))
        or coalesce(a.commission_pct, 0) > 0
        or coalesce(a.commission_onetime, 0) > 0
        or coalesce(a.commission_monthly, 0) > 0
        or exists (select 1 from public.user_profiles up
                    where up.id = a.profile_id and up.role = 'affiliate')
        or exists (select 1 from public.commission_rules cr
                    where cr.affiliate_advertiser_id = a.id));

insert into _p42
select 1, 'affiliates op approved gezet (bestaande)',
  (select count(*)::text from public.advertisers where affiliate_status = 'approved') ||
  ' | ' || coalesce((select string_agg(tenant_client_code, ', ') from public.advertisers
                      where affiliate_status = 'approved'), '-');

-- ── F. de abonnementsboeking als functie ─────────────────────────────
create or replace function public._book_invoice_commission(
  p_invoice_id uuid, p_at timestamptz, p_note text default null)
returns numeric
language plpgsql
security definer
set search_path to 'public'
as $blk1$
declare
  inv          record;
  v_link       record;
  v_rule       record;
  v_aff_user   uuid;
  v_aff_status text;
  v_aff_active boolean;
  v_base       numeric;
  v_amount     numeric;
  v_currency   text;
  v_code       text;
begin
  select * into inv from public.invoices where id = p_invoice_id;
  if not found or coalesce(inv.status, '') <> 'paid'
     or lower(coalesce(inv.type, '')) not in ('subscription', 'subscription_adjustment') then
    return 0;
  end if;

  select rl.id, rl.tenant_id, rl.affiliate_advertiser_id into v_link
    from public.referral_links rl
   where rl.referred_advertiser_id = inv.advertiser_id
     and rl.tenant_id = inv.tenant_id
     and coalesce(rl.status, 'active') = 'active'
   order by rl.created_at asc
   limit 1;
  if not found then
    return 0;
  end if;
  if exists (select 1 from public.referral_commissions where subscription_invoice_id = inv.id) then
    return 0;
  end if;

  select a.user_id, up.status, coalesce(up.is_active, true)
    into v_aff_user, v_aff_status, v_aff_active
    from public.advertisers a
    left join public.user_profiles up on up.id = a.profile_id
   where a.id = v_link.affiliate_advertiser_id;
  if not found or coalesce(v_aff_status, 'active') = 'inactive' or not v_aff_active then
    return 0;
  end if;

  select * into v_rule
    from public._commission_rule_at(inv.tenant_id, v_link.affiliate_advertiser_id,
                                    'subscription', null, p_at);
  if not found or v_rule.pct is null or v_rule.pct <= 0 then
    return 0;
  end if;

  v_base := round(coalesce(nullif(inv.sub_total, 0), inv.total, 0)::numeric, 2);
  if v_base <= 0 then
    return 0;
  end if;
  v_amount   := round(v_base * v_rule.pct / 100, 2);
  v_currency := upper(coalesce(inv.currency, 'EUR'));
  if v_amount <= 0 then
    return 0;
  end if;

  insert into public.referral_commissions
    (referral_link_id, tenant_id, type, source, amount, currency, status,
     subscription_id, subscription_invoice_id, base_amount, pct, rule_id, note)
  values
    (v_link.id, v_link.tenant_id, 'subscription_pct', 'subscription', v_amount, v_currency, 'unpaid',
     inv.subscription_id, inv.id, v_base, v_rule.pct, v_rule.rule_id, p_note)
  on conflict do nothing;
  if not found then
    return 0;
  end if;

  perform public._referral_link_earnings_add(v_link.id, v_currency, v_amount);

  select a.tenant_client_code into v_code from public.advertisers a where a.id = inv.advertiser_id;
  if v_aff_user is not null then
    insert into public.notifications (recipient_user_id, tenant_id, type, payload)
    values (v_aff_user, v_link.tenant_id, 'referral_commission_earned',
            jsonb_build_object('amount', v_amount, 'currency', v_currency,
                               'client_code', v_code, 'source', 'subscription'));
  end if;
  return v_amount;
end;
$blk1$;

revoke all on function public._book_invoice_commission(uuid, timestamptz, text) from public, anon, authenticated;

create or replace function public.handle_referral_commission_on_invoice_paid()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $blk2$
begin
  if coalesce(new.status, '') <> 'paid' then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if coalesce(old.status, '') = 'paid' then
      return new;
    end if;
  end if;
  begin
    perform public._book_invoice_commission(new.id, coalesce(new.paid_at, now()), null);
  exception when others then
    raise warning 'referral commission for invoice % failed: %', new.id, sqlerrm;
    begin
      insert into public.notifications (recipient_user_id, tenant_id, type, payload)
      select tn.owner_id, tn.id, 'referral_commission_failed',
             jsonb_build_object('invoice_id', new.id, 'error', left(sqlerrm, 300))
        from public.tenants tn
       where tn.id = new.tenant_id and tn.owner_id is not null;
    exception when others then
      null;
    end;
  end;
  return new;
end;
$blk2$;

insert into _p42 values (2, 'abonnementsboeking', '_book_invoice_commission; de trigger roept hem aan');

-- ── A. goedkeuren (met terugwerkende kracht) of afwijzen ─────────────
create or replace function public.referral_link_decide(
  p_link_id uuid, p_approve boolean, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $blk3$
declare
  v_link      record;
  r           record;
  v_before    record;
  v_after     record;
  v_topups    int := 0;
  v_invoices  int := 0;
  v_aff_user  uuid;
  v_ref_code  text;
  v_ref_name  text;
begin
  select * into v_link from public.referral_links where id = p_link_id for update;
  if not found then
    raise exception 'Referral not found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.tenants t
                  where t.id = v_link.tenant_id and t.owner_id = auth.uid()) then
    raise exception 'Only the account owner can approve or refuse a referral' using errcode = '42501';
  end if;
  if coalesce(v_link.status, '') <> 'pending' then
    raise exception 'This referral was already decided (%)', coalesce(v_link.status, 'unknown')
      using errcode = '22023';
  end if;
  if v_link.affiliate_advertiser_id = v_link.referred_advertiser_id then
    raise exception 'A customer cannot be their own referrer' using errcode = '22023';
  end if;

  select a.user_id into v_aff_user from public.advertisers a where a.id = v_link.affiliate_advertiser_id;
  select a.tenant_client_code, up.full_name into v_ref_code, v_ref_name
    from public.advertisers a left join public.user_profiles up on up.id = a.profile_id
   where a.id = v_link.referred_advertiser_id;

  if not coalesce(p_approve, false) then
    if length(coalesce(trim(p_reason), '')) = 0 then
      raise exception 'Say why, so it is on record' using errcode = '22023';
    end if;
    update public.referral_links
       set status = 'rejected', decided_at = now(), decision_reason = left(trim(p_reason), 500)
     where id = v_link.id;
    if v_aff_user is not null then
      insert into public.notifications (recipient_user_id, tenant_id, type, payload)
      values (v_aff_user, v_link.tenant_id, 'referral_rejected',
              jsonb_build_object('client_code', v_ref_code));
    end if;
    return jsonb_build_object('ok', true, 'approved', false);
  end if;

  select coalesce(earnings_eur, 0) eur, coalesce(earnings_usd, 0) usd into v_before
    from public.referral_links where id = v_link.id;

  update public.referral_links
     set status = 'active', decided_at = now(), decision_reason = null
   where id = v_link.id;

  -- Alles sinds de koppeling, met de regels van NU.
  for r in
    select t.id, coalesce(t.verified_at, t.created_at) as at
      from public.top_ups t
     where t.advertiser_id = v_link.referred_advertiser_id
       and t.tenant_id = v_link.tenant_id
       and t.status = 'completed'
       and coalesce(t.is_deleted, false) = false
       and coalesce(t.verified_at, t.created_at) >= v_link.created_at
     order by coalesce(t.verified_at, t.created_at)
  loop
    perform public._book_topup_commission(r.id, now());
    v_topups := v_topups + 1;
  end loop;

  for r in
    select i.id
      from public.invoices i
     where i.advertiser_id = v_link.referred_advertiser_id
       and i.tenant_id = v_link.tenant_id
       and i.status = 'paid'
       and lower(coalesce(i.type, '')) in ('subscription', 'subscription_adjustment')
       and coalesce(i.paid_at, i.created_at) >= v_link.created_at
     order by coalesce(i.paid_at, i.created_at)
  loop
    perform public._book_invoice_commission(r.id, now(), 'Booked on approval');
    v_invoices := v_invoices + 1;
  end loop;

  select coalesce(earnings_eur, 0) eur, coalesce(earnings_usd, 0) usd into v_after
    from public.referral_links where id = v_link.id;

  if v_aff_user is not null then
    insert into public.notifications (recipient_user_id, tenant_id, type, payload)
    values (v_aff_user, v_link.tenant_id, 'referral_approved',
            jsonb_build_object('client_code', v_ref_code, 'name', v_ref_name,
                               'booked_eur', v_after.eur - v_before.eur,
                               'booked_usd', v_after.usd - v_before.usd));
  end if;

  return jsonb_build_object('ok', true, 'approved', true,
    'topups', v_topups, 'invoices', v_invoices,
    'booked_eur', v_after.eur - v_before.eur, 'booked_usd', v_after.usd - v_before.usd);
end;
$blk3$;

revoke all on function public.referral_link_decide(uuid, boolean, text) from public, anon;
grant execute on function public.referral_link_decide(uuid, boolean, text) to authenticated;

-- ── B. "Set referrer" door de eigenaar ───────────────────────────────
create or replace function public.referral_link_assign(
  p_referred_advertiser_id uuid, p_affiliate_advertiser_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $blk4$
declare
  v_ref  record;
  v_aff  record;
  v_id   uuid;
begin
  select id, tenant_id, user_id into v_ref from public.advertisers where id = p_referred_advertiser_id;
  select id, tenant_id, user_id into v_aff from public.advertisers where id = p_affiliate_advertiser_id;
  if v_ref.id is null or v_aff.id is null then
    raise exception 'Advertiser not found' using errcode = 'P0002';
  end if;
  if v_ref.tenant_id <> v_aff.tenant_id then
    raise exception 'Both must be in the same organisation' using errcode = '42501';
  end if;
  if not exists (select 1 from public.tenants t
                  where t.id = v_ref.tenant_id and t.owner_id = auth.uid()) then
    raise exception 'Only the account owner can set a referrer' using errcode = '42501';
  end if;
  if v_ref.id = v_aff.id then
    raise exception 'A customer cannot be their own referrer' using errcode = '22023';
  end if;
  if exists (select 1 from public.referral_links rl
              where rl.referred_advertiser_id = v_ref.id
                and coalesce(rl.status, 'active') <> 'rejected') then
    raise exception 'This customer already has a referrer' using errcode = '23505';
  end if;

  -- Een eerder AFGEWEZEN koppeling wordt hergebruikt in plaats van een
  -- tweede rij (een afgewezen koppeling heeft nooit iets verdiend; de
  -- telling begint bij "nu").
  select id into v_id
    from public.referral_links
   where referred_advertiser_id = v_ref.id and status = 'rejected'
   order by created_at desc
   limit 1;
  if v_id is not null then
    update public.referral_links
       set affiliate_advertiser_id = v_aff.id, affiliate_user_id = v_aff.user_id,
           advertiser_user_id = v_ref.user_id, status = 'pending', created_at = now(),
           decided_at = null, decision_reason = null
     where id = v_id;
  else
    insert into public.referral_links
      (tenant_id, referred_advertiser_id, affiliate_advertiser_id,
       affiliate_user_id, advertiser_user_id, status)
    values
      (v_ref.tenant_id, v_ref.id, v_aff.id, v_aff.user_id, v_ref.user_id, 'pending')
    returning id into v_id;
  end if;

  return public.referral_link_decide(v_id, true, null);
end;
$blk4$;

revoke all on function public.referral_link_assign(uuid, uuid) from public, anon;
grant execute on function public.referral_link_assign(uuid, uuid) to authenticated;

insert into _p42 values (3, 'goedkeuren', 'referral_link_decide + referral_link_assign (alleen eigenaar, telt terug)');

-- ── C. een wachtende koppeling meldt zich ────────────────────────────
create or replace function public._notify_referral_pending()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $blk5$
declare
  v_aff_code text; v_aff_name text; v_ref_code text; v_ref_name text;
begin
  if coalesce(new.status, '') not in ('pending', 'active') then
    return new;
  end if;
  -- De eigenaar die zelf een referrer zet (B) keurt meteen goed; hem
  -- melden wat hij net deed is ruis, en de affiliate krijgt "approved".
  if auth.uid() is not null and exists (
       select 1 from public.tenants t where t.id = new.tenant_id and t.owner_id = auth.uid()) then
    return new;
  end if;
  select a.tenant_client_code, up.full_name into v_aff_code, v_aff_name
    from public.advertisers a left join public.user_profiles up on up.id = a.profile_id
   where a.id = new.affiliate_advertiser_id;
  select a.tenant_client_code, up.full_name into v_ref_code, v_ref_name
    from public.advertisers a left join public.user_profiles up on up.id = a.profile_id
   where a.id = new.referred_advertiser_id;

  if new.status = 'pending' then
    insert into public.notifications (recipient_user_id, tenant_id, type, payload)
    select t.owner_id, t.id, 'referral_pending',
           jsonb_build_object('link_id', new.id, 'affiliate_advertiser_id', new.affiliate_advertiser_id,
                              'affiliate_code', v_aff_code, 'affiliate_name', v_aff_name,
                              'client_code', v_ref_code, 'name', v_ref_name)
      from public.tenants t where t.id = new.tenant_id and t.owner_id is not null;
  end if;

  if new.affiliate_user_id is not null then
    insert into public.notifications (recipient_user_id, tenant_id, type, payload)
    values (new.affiliate_user_id, new.tenant_id, 'referral_joined',
            jsonb_build_object('client_code', v_ref_code, 'pending', new.status = 'pending'));
  end if;
  return new;
exception when others then
  raise warning 'referral_pending notification failed: %', sqlerrm;
  return new;
end;
$blk5$;

drop trigger if exists trg_notify_referral_pending on public.referral_links;
create trigger trg_notify_referral_pending
  after insert on public.referral_links
  for each row execute function public._notify_referral_pending();

insert into _p42 values (4, 'meldingen', 'nieuwe klant -> affiliate; wachtend -> ook eigenaar; besluit -> affiliate');

-- ── D. affiliate worden: status + besluit ────────────────────────────
create or replace function public.affiliate_application_submit(p_profile_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $blk6$
declare
  v_uid        uuid := auth.uid();
  v_profile    record;
  v_adv        record;
  v_recipients uuid[];
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Please sign in and try again.');
  end if;

  select p.id, p.tenant_id, p.full_name, p.email, p.is_active, p.status
    into v_profile
    from public.user_profiles p
   where p.user_id = v_uid and (p_profile_id is null or p.id = p_profile_id)
   order by (p.id = p_profile_id) desc nulls last
   limit 1;
  if v_profile.id is null or v_profile.tenant_id is null then
    return jsonb_build_object('ok', false, 'error', 'We could not find your account.');
  end if;
  if coalesce(v_profile.is_active, true) = false or coalesce(v_profile.status, 'active') = 'inactive' then
    return jsonb_build_object('ok', false, 'error', 'This account is inactive.');
  end if;

  select a.id, a.tenant_client_code, a.affiliate_status into v_adv
    from public.advertisers a
   where a.user_id = v_uid and a.tenant_id = v_profile.tenant_id
   limit 1;
  if v_adv.id is null then
    return jsonb_build_object('ok', false, 'error', 'We could not find your advertiser account.');
  end if;
  if v_adv.affiliate_status = 'approved' then
    return jsonb_build_object('ok', false, 'error', 'You are already on the affiliate program.');
  end if;
  if v_adv.affiliate_status = 'applied' then
    return jsonb_build_object('ok', true, 'already_sent', true);
  end if;

  update public.advertisers
     set affiliate_status = 'applied', affiliate_applied_at = now(),
         affiliate_decided_at = null, affiliate_refusal_reason = null
   where id = v_adv.id;

  select array_agg(t.owner_id) into v_recipients
    from public.tenants t where t.id = v_profile.tenant_id and t.owner_id is not null;

  insert into public.notifications (recipient_user_id, tenant_id, type, payload)
  select r, v_profile.tenant_id, 'affiliate_application',
         jsonb_build_object('applicant_profile_id', v_profile.id,
                            'applicant_name', coalesce(v_profile.full_name, v_profile.email),
                            'applicant_email', v_profile.email,
                            'advertiser_id', v_adv.id,
                            'client_code', v_adv.tenant_client_code)
    from unnest(coalesce(v_recipients, array[]::uuid[])) r;

  return jsonb_build_object('ok', true, 'already_sent', false);
end;
$blk6$;

revoke all on function public.affiliate_application_submit(uuid) from public, anon;
grant execute on function public.affiliate_application_submit(uuid) to authenticated;

create or replace function public.affiliate_application_decide(
  p_advertiser_id uuid, p_approve boolean, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $blk7$
declare
  v_adv record;
begin
  select * into v_adv from public.advertisers where id = p_advertiser_id for update;
  if not found then
    raise exception 'Advertiser not found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.tenants t
                  where t.id = v_adv.tenant_id and t.owner_id = auth.uid()) then
    raise exception 'Only the account owner can decide this' using errcode = '42501';
  end if;

  if coalesce(p_approve, false) then
    update public.advertisers
       set affiliate_status = 'approved', affiliate_decided_at = now(), affiliate_refusal_reason = null
     where id = v_adv.id;
    if v_adv.user_id is not null then
      insert into public.notifications (recipient_user_id, tenant_id, type, payload)
      values (v_adv.user_id, v_adv.tenant_id, 'affiliate_approved', '{}'::jsonb);
    end if;
    return jsonb_build_object('ok', true, 'approved', true);
  end if;

  if length(coalesce(trim(p_reason), '')) = 0 then
    raise exception 'Say why, so they know' using errcode = '22023';
  end if;
  update public.advertisers
     set affiliate_status = 'refused', affiliate_decided_at = now(),
         affiliate_refusal_reason = left(trim(p_reason), 500)
   where id = v_adv.id;
  if v_adv.user_id is not null then
    insert into public.notifications (recipient_user_id, tenant_id, type, payload)
    values (v_adv.user_id, v_adv.tenant_id, 'affiliate_refused',
            jsonb_build_object('reason', left(trim(p_reason), 500)));
  end if;
  return jsonb_build_object('ok', true, 'approved', false);
end;
$blk7$;

revoke all on function public.affiliate_application_decide(uuid, boolean, text) from public, anon;
grant execute on function public.affiliate_application_decide(uuid, boolean, text) to authenticated;

insert into _p42 values (5, 'affiliate worden', 'status op de advertiser + affiliate_application_decide (eigenaar)');

-- ── E. de affiliate ziet ook wat op goedkeuring wacht ────────────────
drop function if exists public.affiliate_referral_stats(timestamptz, timestamptz);
create function public.affiliate_referral_stats(
  p_from timestamp with time zone default null::timestamp with time zone,
  p_to   timestamp with time zone default null::timestamp with time zone)
returns table(referral_link_id uuid, referred_advertiser_id uuid, referred_advertiser_name text,
              referred_advertiser_email text, referred_advertiser_code text, commission_type text,
              commission_pct numeric, commission_currency text, spend_usd numeric, spend_eur numeric,
              topup_count integer, earnings_usd numeric, earnings_eur numeric,
              unpaid_usd numeric, unpaid_eur numeric, link_status text)
language plpgsql
security definer
set search_path to 'public'
as $blk8$
declare
  v_uid uuid := auth.uid();
  v_aff uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  select a.id into v_aff
    from public.advertisers a
   where a.user_id = v_uid
   order by a.created_at desc
   limit 1;
  if v_aff is null then
    return;
  end if;

  return query
  select
    d.id, d.referred_advertiser_id, d.referred_advertiser_name::text,
    regexp_replace(d.referred_advertiser_email::text, '^(.)[^@]*@', '\1***@'),
    d.referred_advertiser_tenant_client_code::text,
    null::text, null::numeric, null::text,
    coalesce(sp.spend_usd, 0)::numeric, coalesce(sp.spend_eur, 0)::numeric,
    coalesce(sp.topup_count, 0)::int,
    greatest(coalesce(ea.earn_usd, 0) - coalesce(cb.usd, 0), 0)::numeric,
    greatest(coalesce(ea.earn_eur, 0) - coalesce(cb.eur, 0), 0)::numeric,
    greatest(coalesce(ea.unpaid_usd, 0) - coalesce(cb.usd, 0), 0)::numeric,
    greatest(coalesce(ea.unpaid_eur, 0) - coalesce(cb.eur, 0), 0)::numeric,
    coalesce(rl.status, 'active')::text
  from public.referral_links_with_details d
  join public.referral_links rl on rl.id = d.id
  left join lateral (
    select
      sum(t.topup_amount) filter (where t.topup_usd is null
                                     or upper(coalesce(t.currency, 'EUR')) = 'USD') as spend_usd,
      sum(t.topup_amount) filter (where t.topup_usd is not null
                                     and upper(coalesce(t.currency, 'EUR')) = 'EUR') as spend_eur,
      count(*) as topup_count
    from public.top_ups t
    where t.advertiser_id = d.referred_advertiser_id
      and t.tenant_id = d.tenant_id
      and t.status = 'completed'
      and coalesce(t.is_deleted, false) = false
      and (p_from is null or coalesce(t.verified_at, t.created_at) >= p_from)
      and (p_to   is null or coalesce(t.verified_at, t.created_at) <= p_to)
  ) sp on true
  left join lateral (
    select
      sum(rc.amount) filter (where upper(rc.currency) = 'USD' and coalesce(rc.status, 'unpaid') in ('unpaid', 'paid')) as earn_usd,
      sum(rc.amount) filter (where upper(rc.currency) = 'EUR' and coalesce(rc.status, 'unpaid') in ('unpaid', 'paid')) as earn_eur,
      sum(rc.amount) filter (where upper(rc.currency) = 'USD' and coalesce(rc.status, 'unpaid') = 'unpaid') as unpaid_usd,
      sum(rc.amount) filter (where upper(rc.currency) = 'EUR' and coalesce(rc.status, 'unpaid') = 'unpaid') as unpaid_eur
    from public.referral_commissions rc
    where rc.referral_link_id = d.id
      and (p_from is null or rc.created_at >= p_from)
      and (p_to   is null or rc.created_at <= p_to)
  ) ea on true
  left join lateral (
    select sum(c.amount) filter (where upper(c.currency) = 'USD') as usd,
           sum(c.amount) filter (where upper(c.currency) = 'EUR') as eur
      from public.referral_clawbacks c
     where c.referral_link_id = d.id
       and (p_from is null or c.created_at >= p_from)
       and (p_to   is null or c.created_at <= p_to)
  ) cb on true
  where d.affiliate_advertiser_id = v_aff
    and coalesce(rl.status, 'active') in ('active', 'pending')
  order by d.referred_advertiser_name nulls last;
end;
$blk8$;

revoke all on function public.affiliate_referral_stats(timestamptz, timestamptz) from public, anon;
grant execute on function public.affiliate_referral_stats(timestamptz, timestamptz) to authenticated;

insert into _p42 values (6, 'affiliate_referral_stats', 'geeft ook wachtende koppelingen (link_status); geen oude voorwaarden meer naar buiten');

-- ── G. invitations.token dicht voor sessies ──────────────────────────
do $blk9$
declare
  v_cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into v_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'invitations' and column_name <> 'token';
  execute 'revoke select on public.invitations from authenticated, anon';
  execute format('grant select (%s) on public.invitations to authenticated', v_cols);
  insert into _p42 values (7, 'invitations.token', 'sessies lezen alles behalve token');
exception when others then
  insert into _p42 values (7, 'invitations.token', 'MISLUKT: ' || sqlstate || ' ' || sqlerrm);
end;
$blk9$;

-- ── H. advertisers: een sessie wijzigt geen identiteit ───────────────
create or replace function public._guard_advertisers_session_write()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $blk10$
declare
  v_allowed text[] := array['startup_fee', 'fee_status', 'airtable', 'note',
                            'commission_type', 'commission_pct', 'commission_monthly',
                            'commission_onetime', 'commission_currency', 'updated_at'];
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if (to_jsonb(new) - v_allowed) is distinct from (to_jsonb(old) - v_allowed) then
    raise exception 'advertisers: only fees, notes and commission terms can be changed here'
      using errcode = '42501';
  end if;
  return new;
end;
$blk10$;

do $blk11$
declare
  v_invokers text;
begin
  select string_agg(p.proname, ', ') into v_invokers
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and not p.prosecdef and p.prokind = 'f'
     and p.proname <> '_guard_advertisers_session_write'
     and p.prosrc ~* '(insert\s+into|update|delete\s+from)\s+(public\.)?advertisers\b';
  -- Een functie die als de SESSIE draait en advertisers schrijft, zou
  -- door de wacht breken. Dan eerst meten, niets zetten.
  if v_invokers is not null then
    insert into _p42 values (8, 'advertisers', 'NIETS GEZET - deze functies draaien als de sessie en schrijven advertisers: ' || v_invokers);
    return;
  end if;
  -- "a0_": BEFORE-triggers fire in name order, and this one must judge
  -- the caller's own change -- not a column a later system trigger fills.
  execute 'drop trigger if exists a0_guard_advertisers_session_write on public.advertisers';
  execute 'create trigger a0_guard_advertisers_session_write before update on public.advertisers
             for each row execute function public._guard_advertisers_session_write()';
  execute 'revoke insert, delete, truncate on public.advertisers from authenticated, anon';
  insert into _p42 values (8, 'advertisers', 'sessie: alleen fees/notities/voorwaarden; geen insert/delete');
exception when others then
  insert into _p42 values (8, 'advertisers', 'MISLUKT: ' || sqlstate || ' ' || sqlerrm);
end;
$blk11$;

-- ── I. een uitgenodigde voegt zichzelf niet in ───────────────────────
do $blk12$
begin
  execute 'drop policy if exists user_profiles_insert on public.user_profiles';
  execute 'create policy user_profiles_insert on public.user_profiles
             for insert
             with check (public._is_admin_of(tenant_id)
                         or (user_id = auth.uid() and public._owns_tenant(tenant_id)))';
  insert into _p42 values (9, 'user_profiles insert', 'alleen admin, of de eigenaar voor zijn eigen tenant');
exception when others then
  insert into _p42 values (9, 'user_profiles insert', 'MISLUKT: ' || sqlstate || ' ' || sqlerrm);
end;
$blk12$;

insert into _p42
select 9, 'user_profiles: alle insert-policies die er nu staan',
  coalesce(string_agg(policyname || ' :: ' || coalesce(with_check, '-'), E'\n'), 'geen')
  from pg_policies
 where schemaname = 'public' and tablename = 'user_profiles' and cmd in ('INSERT', 'ALL');

-- ── J. referral_links: standaard pending, status alleen via A/B ──────
create or replace function public._guard_referral_links_session_write()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $blk13$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if coalesce(new.status, 'pending') <> 'pending' then
      raise exception 'referral_links: a new referral starts pending; the owner approves it'
        using errcode = '42501';
    end if;
    return new;
  end if;
  if new.status is distinct from old.status
     or new.affiliate_advertiser_id is distinct from old.affiliate_advertiser_id
     or new.referred_advertiser_id is distinct from old.referred_advertiser_id
     or new.tenant_id is distinct from old.tenant_id
     or new.earnings_eur is distinct from old.earnings_eur
     or new.earnings_usd is distinct from old.earnings_usd then
    raise exception 'referral_links: approve or refuse through the owner''s action'
      using errcode = '42501';
  end if;
  return new;
end;
$blk13$;

do $blk14$
begin
  execute 'alter table public.referral_links alter column status set default ''pending''';
  execute 'drop trigger if exists a0_guard_referral_links_session_write on public.referral_links';
  execute 'create trigger a0_guard_referral_links_session_write
             before insert or update on public.referral_links
             for each row execute function public._guard_referral_links_session_write()';
  insert into _p42 values (10, 'referral_links', 'standaard pending; status en koppeling alleen via goedkeuren');
exception when others then
  insert into _p42 values (10, 'referral_links', 'MISLUKT: ' || sqlstate || ' ' || sqlerrm);
end;
$blk14$;

-- ── voor plak 43: hoe ontstaat live een advertiser + klantcode? ──────
insert into _p42
select 10, 'andere functies die een koppeling maken (moeten status zelf zetten)',
  coalesce(string_agg(p.proname, ', '), 'geen')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.prosrc ~* 'insert\s+into\s+(public\.)?referral_links'
   and p.proname not in ('referral_link_assign');

insert into _p42
select 90, 'STUUR TERUG >> functies die tenant_client_code of een advertiser aanmaken',
  coalesce(string_agg(p.proname || E':\n' || left(pg_get_functiondef(p.oid), 6000), E'\n\n'), 'geen')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and (p.prosrc ilike '%tenant_client_code%' and p.prosrc ~* 'insert\s+into\s+(public\.)?advertisers'
        or p.proname in ('ensure_advertiser_and_wallet'));

insert into _p42
select 91, 'triggers op user_profiles / advertisers / wallets',
  coalesce(string_agg(c.relname || ' :: ' || t.tgname || ' -> ' || p.proname, E'\n' order by c.relname, t.tgname), 'geen')
  from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_proc p on p.oid = t.tgfoid
 where not t.tgisinternal and c.relname in ('user_profiles', 'advertisers', 'wallets');

insert into _p42
select 92, 'profielen met rol affiliate en ZONDER advertiser-rij',
  coalesce(string_agg(coalesce(up.email, up.id::text), ', '), 'geen')
  from public.user_profiles up
 where up.role = 'affiliate'
   and not exists (select 1 from public.advertisers a where a.user_id = up.user_id and a.tenant_id = up.tenant_id);

select nr, item, v as antwoord from _p42 order by nr;
