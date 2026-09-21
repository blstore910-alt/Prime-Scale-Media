-- =====================================================================
-- PLAK 36 — "Request deletion" is een AANVRAAG, geen slot
-- =====================================================================
-- De eigenaar, 21-09: "niet direct verwijderen, moet een request komen
-- bij admin, daarna pas".
--
-- Vandaag zet requestOwnErasure meteen status = 'pending_erasure' en
-- is_active = false: de klant drukt op de knop en is buitengesloten,
-- zonder dat iemand bij ons het weet.
--
-- Nu:
--   1  user_profiles.erasure_requested_at -- WANNEER de klant het vroeg.
--   2  account_deletion_request_submit(): zet die tijd, meldt het aan de
--      eigenaar ('account_deletion_requested'). De klant blijft gewoon
--      ingelogd. Twee keer drukken = één aanvraag.
--   3  account_deletion_decide(profiel, ja/nee, reden): ALLEEN de eigenaar.
--      Ja = het oude gedrag (pending_erasure, inloggen dicht).
--      Nee = de aanvraag vervalt en de klant krijgt de reden
--      ('account_deletion_declined').
--
-- Veilig om vaker te draaien.
-- =====================================================================

set search_path = public;

create temporary table if not exists _p36 (nr int, item text, v text);
delete from _p36;

alter table public.user_profiles
  add column if not exists erasure_requested_at timestamptz;

insert into _p36 values (1, 'user_profiles.erasure_requested_at', 'kolom staat');

create or replace function public.account_deletion_request_submit(p_profile_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $blk0$
declare
  v_uid  uuid := auth.uid();
  v_p    record;
  v_code text;
begin
  if v_uid is null then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  select up.* into v_p
    from public.user_profiles up
   where up.user_id = v_uid
     and (p_profile_id is null or up.id = p_profile_id)
   order by up.created_at asc
   limit 1;
  if not found then
    raise exception 'No profile for this user' using errcode = '42501';
  end if;

  -- De eigenaar kan zichzelf niet uit zijn eigen organisatie laten
  -- verwijderen: dan heeft niemand nog toegang.
  if exists (select 1 from public.tenants t where t.owner_id = v_uid) then
    return jsonb_build_object('ok', false,
      'error', 'This account owns the organisation, so it cannot ask to be deleted. Transfer ownership first, or contact us.');
  end if;

  if v_p.erasure_requested_at is not null then
    return jsonb_build_object('ok', true, 'already_sent', true,
                              'requested_at', v_p.erasure_requested_at);
  end if;

  update public.user_profiles
     set erasure_requested_at = now(), updated_at = now()
   where user_id = v_uid;

  select a.tenant_client_code into v_code
    from public.advertisers a
   where a.user_id = v_uid and a.tenant_id = v_p.tenant_id
   limit 1;

  insert into public.notifications (recipient_user_id, tenant_id, type, payload)
  select t.owner_id, t.id, 'account_deletion_requested',
         jsonb_build_object('profile_id', v_p.id, 'name', v_p.full_name,
                            'email', v_p.email, 'client_code', v_code)
    from public.tenants t
   where t.id = v_p.tenant_id and t.owner_id is not null;

  return jsonb_build_object('ok', true, 'already_sent', false, 'requested_at', now());
end;
$blk0$;

revoke all on function public.account_deletion_request_submit(uuid) from public, anon;
grant execute on function public.account_deletion_request_submit(uuid) to authenticated;

insert into _p36 values (2, 'account_deletion_request_submit', 'staat; iedere ingelogde gebruiker, alleen voor zichzelf');

create or replace function public.account_deletion_decide(
  p_profile_id uuid, p_approve boolean, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $blk1$
declare
  v_uid uuid := auth.uid();
  v_p   record;
begin
  select * into v_p from public.user_profiles where id = p_profile_id for update;
  if not found then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.tenants t
                  where t.id = v_p.tenant_id and t.owner_id = v_uid) then
    raise exception 'Only the account owner can decide a deletion request' using errcode = '42501';
  end if;
  if v_p.erasure_requested_at is null then
    raise exception 'There is no deletion request for this account' using errcode = '22023';
  end if;

  if p_approve then
    update public.user_profiles
       set status = 'pending_erasure', is_active = false, updated_at = now()
     where user_id = v_p.user_id;
    return jsonb_build_object('ok', true, 'approved', true);
  end if;

  if length(coalesce(trim(p_reason), '')) = 0 then
    raise exception 'A reason is required to decline' using errcode = '22023';
  end if;
  update public.user_profiles
     set erasure_requested_at = null, updated_at = now()
   where user_id = v_p.user_id;
  insert into public.notifications (recipient_user_id, tenant_id, type, payload)
  values (v_p.user_id, v_p.tenant_id, 'account_deletion_declined',
          jsonb_build_object('reason', left(trim(p_reason), 500)));
  return jsonb_build_object('ok', true, 'approved', false);
end;
$blk1$;

revoke all on function public.account_deletion_decide(uuid, boolean, text) from public, anon;
grant execute on function public.account_deletion_decide(uuid, boolean, text) to authenticated;

insert into _p36 values (3, 'account_deletion_decide', 'staat; alleen de eigenaar');

insert into _p36
select 4, 'openstaande aanvragen',
  coalesce(string_agg(coalesce(email, id::text) || ' sinds ' || to_char(erasure_requested_at, 'DD-MM HH24:MI'), E'\n'), 'geen')
  from public.user_profiles where erasure_requested_at is not null;

select nr, item, v as antwoord from _p36 order by nr;
