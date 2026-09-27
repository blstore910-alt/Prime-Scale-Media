-- ════════════════════════════════════════════════════════════════════
-- PLAK 108 — elke admin hoort het als een klant wordt uitgezet
-- ════════════════════════════════════════════════════════════════════
--
-- De eigenaar, 27-09, over het uitzetten van een klant: "na deactivate
-- moet er nog een popup komen... en ook dat admin melding krijgt."
--
-- De popup zit in de app (twee stappen nu, de tweede vraagt de klantcode
-- overgetypt -- een tweede ja/nee klikt iemand net zo snel weg). Dit is
-- de melding.
--
-- WAAROM DIT ERTOE DOET
--
-- Uitzetten neemt onmiddellijk de toegang weg en zet elk abonnement
-- stil. De volgende medewerker die de telefoon opneemt voor die klant
-- ziet alleen dat er niets meer werkt. Wie het deed en waarom staat
-- alleen in audit_events, en daar kijkt niemand tijdens een gesprek.
--
-- Het gaat naar ELKE actieve admin van de tenant, via de helper die
-- plak 105 heeft neergezet -- inclusief de eigenaar, want die is er ook
-- een -- behalve naar degene die het zelf heeft gedaan. Die weet het.
--
-- Plak dit hele bestand in de SQL editor. Onderaan staat EEN
-- rapporttabel.
-- ════════════════════════════════════════════════════════════════════

create temporary table if not exists _plak108 (
  n integer, stap text, uitkomst text
) on commit preserve rows;
truncate _plak108;

-- ── 1. de trigger ───────────────────────────────────────────────────
do $blk0$
begin
  if to_regprocedure('public._admin_recipients(uuid)') is null then
    insert into _plak108 values (0, 'voorwaarde',
      'AFGEBROKEN: _admin_recipients bestaat niet -- draai eerst plak 105');
    return;
  end if;

  create or replace function public._notify_customer_deactivated()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public'
  as $fn$
  declare
    v_actor  uuid := auth.uid();
    v_by     text;
    v_code   text;
    v_payload jsonb;
  begin
    -- Alleen een KLANT die van aan naar uit gaat. Een admin die wordt
    -- uitgezet is een andere gebeurtenis en heeft zijn eigen slot
    -- (a4_guard_admin_status, plak 105).
    if coalesce(old.role::text, '') = 'admin' then
      return new;
    end if;
    if coalesce(old.is_active, true) = false
       or coalesce(new.is_active, true) = true then
      return new;
    end if;

    select a.tenant_client_code into v_code
      from public.advertisers a
     where a.profile_id = new.id
     limit 1;

    select up.full_name into v_by
      from public.user_profiles up
     where up.user_id = v_actor
       and up.tenant_id = new.tenant_id
     limit 1;

    v_payload := jsonb_build_object(
      'profile_id', new.id,
      'name', new.full_name,
      'client_code', v_code,
      'by', v_by
    );

    insert into public.notifications (recipient_user_id, tenant_id, type, payload)
    select r, new.tenant_id, 'customer_deactivated', v_payload
      from public._admin_recipients(new.tenant_id) r
     -- Niet naar degene die op de knop drukte.
     where v_actor is null or r <> v_actor;

    return new;
  exception when others then
    -- Een melding die faalt mag het uitzetten niet tegenhouden. De
    -- schrijf zelf is het punt; dit is het bericht erover.
    raise warning 'customer_deactivated notice failed: %', sqlerrm;
    return new;
  end;
  $fn$;

  revoke all on function public._notify_customer_deactivated() from public, anon;
  grant execute on function public._notify_customer_deactivated()
    to authenticated, service_role;

  drop trigger if exists a5_notify_customer_deactivated on public.user_profiles;
  create trigger a5_notify_customer_deactivated
    after update on public.user_profiles
    for each row execute function public._notify_customer_deactivated();

  insert into _plak108 values (0, 'melding bij uitzetten',
    'trigger staat; gaat naar elke actieve admin behalve de uitvoerder');
exception when others then
  insert into _plak108 values (0, 'melding bij uitzetten',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk0$;

-- ── controle ────────────────────────────────────────────────────────
do $blk1$
declare
  v_trg integer;
  v_wie text;
begin
  select count(*) into v_trg from pg_trigger
   where tgname = 'a5_notify_customer_deactivated' and not tgisinternal;

  select coalesce(string_agg(up.full_name, ', ' order by up.full_name), 'niemand')
    into v_wie
    from public.user_profiles up
   where up.role = 'admin'
     and coalesce(up.is_active, true)
     and coalesce(up.status, 'active') <> 'inactive'
     and up.tenant_id = (select id from public.tenants where slug = 'prime-scale-media');

  insert into _plak108 values (1, 'stand van zaken',
    'trigger aanwezig: ' || v_trg || '/1 | krijgt de melding: ' || v_wie);
exception when others then
  insert into _plak108 values (1, 'stand van zaken',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk1$;

-- ════════════════════════════════════════════════════════════════════
-- HET RAPPORT — de editor toont alleen deze laatste tabel.
-- ════════════════════════════════════════════════════════════════════
select n as "#", stap as "wat", uitkomst as "uitkomst"
  from _plak108 order by n;
