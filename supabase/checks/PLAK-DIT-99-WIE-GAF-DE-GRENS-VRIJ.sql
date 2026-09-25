-- ════════════════════════════════════════════════════════════════════
-- PLAK 99 — een vrijgave zonder naam erbij
-- ════════════════════════════════════════════════════════════════════
--
-- Plak 98 werkt. Maar de eerste vrijgave, gemeten een minuut later:
--
--   audit_events | advertisers | UPDATE | was (leeg) -> nu 10.00
--                | actor_user_id: NULL
--
-- Het staat er dus wel, en er staat niet bij wie. Bij "wie heeft de
-- uitbetaalgrens van deze affiliate verlaagd" is dat precies de vraag
-- waarvoor het logboek bestaat.
--
-- WAAROM DAT GEBEURT
--
-- `advertisers` draagt a0_guard_advertisers_session_write, die elke
-- kolom buiten zijn lijst weigert zodra current_user = 'authenticated'.
-- De server action schrijft daarom met de service key -- en die heeft
-- geen auth.uid(), dus _audit_row_change vindt geen actor.
--
-- DE OPLOSSING IS DE VORM DIE CLAUDE.MD SOWIESO VOORSCHRIJFT
--
-- Een SECURITY DEFINER functie draait als HAAR EIGENAAR, dus
-- current_user is niet 'authenticated' en de kolomtrigger laat hem door.
-- Maar auth.uid() leest de JWT-claim van het VERZOEK, niet de rol -- die
-- blijft dus gewoon de eigenaar die op de knop drukte. Eén functie lost
-- allebei op: de schrijf mag, en het logboek weet wie.
--
-- De eigenaarscontrole zit IN de functie, niet alleen ervoor. Postgres
-- geeft EXECUTE aan PUBLIC op elke nieuwe functie, dus de revoke staat
-- in hetzelfde blok.
--
-- Plak dit hele bestand in de SQL editor. Onderaan staat EEN
-- rapporttabel.
-- ════════════════════════════════════════════════════════════════════

create temporary table if not exists _plak99 (
  n integer, stap text, uitkomst text
) on commit preserve rows;
truncate _plak99;

do $blk0$
begin
  create or replace function public.affiliate_payout_min_set(
    p_advertiser_id uuid,
    p_min numeric default null
  )
  returns numeric
  language plpgsql
  security definer
  set search_path to 'public'
  as $fn$
  declare
    v_uid    uuid := auth.uid();
    v_tenant uuid;
    v_owner  uuid;
    v_target uuid;
    v_min    numeric(14,2);
  begin
    if v_uid is null then
      raise exception 'Sign in first' using errcode = '42501';
    end if;

    -- Wie vraagt het, en van welke organisatie.
    select up.tenant_id into v_tenant
      from public.user_profiles up
     where up.user_id = v_uid
     limit 1;
    if v_tenant is null then
      raise exception 'No organisation for this account' using errcode = '42501';
    end if;

    -- ALLEEN de eigenaar. Een medewerker-admin mag dit niet: dit bepaalt
    -- wanneer er geld de deur uit gaat. Dezelfde regel als
    -- _guard_commission_columns hiernaast.
    select t.owner_id into v_owner
      from public.tenants t
     where t.id = v_tenant
     limit 1;
    if v_owner is null or v_owner <> v_uid then
      raise exception 'Only the account owner can set a payout minimum'
        using errcode = '42501';
    end if;

    -- En de affiliate moet van diezelfde organisatie zijn.
    select a.tenant_id into v_target
      from public.advertisers a
     where a.id = p_advertiser_id
     limit 1;
    if v_target is null then
      raise exception 'No such affiliate' using errcode = 'P0002';
    end if;
    if v_target <> v_tenant then
      raise exception 'That affiliate is not on this account'
        using errcode = '42501';
    end if;

    -- Leeg is niet nul. Leeg = terug naar de staande grens; 0 = deze ene
    -- mag elk bedrag vragen. Die twee mogen hier niet samenvallen.
    if p_min is null then
      v_min := null;
    else
      v_min := round(p_min::numeric, 2);
      if v_min < 0 then
        raise exception 'A minimum is zero or more' using errcode = '22023';
      end if;
      if v_min > 100000 then
        raise exception 'A minimum above 100000 is almost certainly a typo'
          using errcode = '22023';
      end if;
    end if;

    update public.advertisers
       set payout_min_override = v_min
     where id = p_advertiser_id
       and tenant_id = v_tenant;

    if not found then
      raise exception 'Nothing was changed' using errcode = 'P0002';
    end if;

    return v_min;
  end;
  $fn$;

  -- Postgres geeft EXECUTE aan PUBLIC op elke nieuwe functie, en PUBLIC
  -- is inclusief anon -- de rol achter de publishable key. Hoort in
  -- hetzelfde blok als de create.
  revoke all on function public.affiliate_payout_min_set(uuid, numeric)
    from public, anon;
  grant execute on function public.affiliate_payout_min_set(uuid, numeric)
    to authenticated, service_role;

  insert into _plak99 values (0, 'affiliate_payout_min_set', 'aangemaakt');
exception when others then
  insert into _plak99 values (0, 'affiliate_payout_min_set',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk0$;

-- ── controle ─────────────────────────────────────────────────────────
do $blk1$
declare
  v_fn   integer;
  v_def  integer;
  v_anon integer;
  v_auth integer;
begin
  select count(*) into v_fn
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'affiliate_payout_min_set';

  select count(*) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'affiliate_payout_min_set'
     and p.prosecdef;

  select count(*) into v_anon
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'affiliate_payout_min_set'
     and has_function_privilege('anon', p.oid, 'execute');

  select count(*) into v_auth
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'affiliate_payout_min_set'
     and has_function_privilege('authenticated', p.oid, 'execute');

  insert into _plak99 values (1, 'stand van zaken',
    'functie: ' || v_fn || '/1 | security definer: ' || v_def ||
    '/1 | anon mag hem: ' || v_anon || ' (moet 0) | authenticated mag hem: ' ||
    v_auth || ' (moet 1)');
exception when others then
  insert into _plak99 values (1, 'stand van zaken',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk1$;

-- ── en wat er nu aan uitzonderingen staat ────────────────────────────
do $blk2$
declare
  v text;
begin
  select coalesce(string_agg(
           coalesce(a.tenant_client_code, '?') || ' -> ' ||
           to_char(a.payout_min_override, 'FM999G999G990D00'), ' | '),
         'niemand - iedereen staat op de staande 200')
    into v
    from public.advertisers a
   where a.payout_min_override is not null;
  insert into _plak99 values (2, 'uitzonderingen nu', v);
exception when others then
  insert into _plak99 values (2, 'uitzonderingen nu',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk2$;

-- ── de vrijgave van vandaag draagt nog geen naam ─────────────────────
--     Die kan niet met terugwerkende kracht worden ingevuld -- het
--     logboek is append-only en dat hoort zo. Dit zegt alleen hoeveel
--     het er zijn, zodat het niet als een nieuwe fout terugkomt.
do $blk3$
declare
  v integer;
begin
  select count(*) into v
    from public.audit_events
   where table_name = 'advertisers'
     and action = 'UPDATE'
     and actor_user_id is null
     and (before_data ->> 'payout_min_override')
         is distinct from (after_data ->> 'payout_min_override');
  insert into _plak99 values (3, 'vrijgaven zonder naam',
    v || ' stuks, allemaal van voor deze plak. Vanaf nu draagt elke '
      || 'vrijgave de eigenaar die erop drukte.');
exception when others then
  insert into _plak99 values (3, 'vrijgaven zonder naam',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk3$;

-- ════════════════════════════════════════════════════════════════════
-- HET RAPPORT — de editor toont alleen deze laatste tabel.
-- ════════════════════════════════════════════════════════════════════
select n as "#", stap as "wat", uitkomst as "uitkomst"
  from _plak99 order by n;
