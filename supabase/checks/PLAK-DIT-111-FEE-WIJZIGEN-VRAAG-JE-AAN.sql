-- ════════════════════════════════════════════════════════════════════
-- PLAK 111 — een fee wijzigen vraag je aan, je doet het niet
-- ════════════════════════════════════════════════════════════════════
--
-- De eigenaar, 27-09: "en als admin de fee moet aanpassen dan moet de
-- request bij a super admin belanden, niet aanpassen dan niet ... dus
-- admin wel zelf fee laten changen alleen bij creation eenmalig? en
-- superadmin altijd?"
--
-- WAT ER AL STOND, EN WAT NIET
--
-- De helft die u beschrijft is er al, en strenger dan u dacht.
-- `feeIsAPrice` (actions/_fee-is-a-price.ts) laat een medewerker-admin
-- alleen drie dingen opslaan: leeg, het plantarief van die klant, of de
-- standaard van dat accounttype. Elk ander getal is een PRIJS en gaat
-- naar de eigenaar -- en dat geldt bij aanmaken EN bij wijzigen, niet
-- alleen eenmalig. Het is ook echt serverkant afgedwongen, op alle drie
-- de schrijvers (aanmaken, wijzigen, toewijzen uit de pool).
--
-- Wat ONTBRAK is het tweede deel van uw zin: waar het heen gaat. Tot nu
-- kreeg de medewerker alleen een weigering -- "vraag de eigenaar" -- en
-- daar hield het op. Geen rij, geen wachtrij, geen melding. In de
-- praktijk betekent dat een appje, of helemaal niets.
--
-- Deze tabel is die wachtrij.
--
-- HOE HET WERKT
--
--   medewerker vult een ander tarief in    -> geweigerd, zoals nu
--   drukt op "vraag de eigenaar"           -> rij hier, status pending
--   eigenaar keurt goed                    -> ad_accounts.fee gaat om
--   eigenaar wijst af, MET reden           -> rij dicht, niets verandert
--
-- Een reden is verplicht aan allebei de kanten. Bij het aanvragen omdat
-- de eigenaar anders een getal krijgt zonder verhaal, en bij het
-- afwijzen omdat een afwijzing zonder reden de medewerker niets leert
-- -- dezelfde regel als bij geld dat de zaak uit gaat (commit 2761fbc).
--
-- HET TOEPASSEN ZIT IN EEN RPC, NIET IN DE APP
--
-- Goedkeuren verandert een prijs, en dat is een financiele schrijf. Die
-- hoort volgens CLAUDE.md in een SECURITY DEFINER RPC met de
-- eigenaarscontrole erin, niet in een update vanuit de browser. De
-- functie hieronder controleert de eigenaar, de tenant en de status, en
-- zet daarna pas het tarief om.
--
-- De revoke staat in HETZELFDE blok als de create or replace: Postgres
-- geeft EXECUTE aan PUBLIC op een nieuwe functie, en PUBLIC is inclusief
-- anon.
--
-- Plak dit hele bestand in de SQL editor. Onderaan staat EEN
-- rapporttabel.
-- ════════════════════════════════════════════════════════════════════

create temporary table if not exists _plak111 (
  n integer, stap text, uitkomst text
) on commit preserve rows;
truncate _plak111;

-- ── 1. de tabel ─────────────────────────────────────────────────────
do $blk0$
begin
  create table if not exists public.fee_change_requests (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants(id) on delete cascade,
    ad_account_id uuid not null references public.ad_accounts(id) on delete cascade,
    advertiser_id uuid references public.advertisers(id) on delete set null,

    -- Wat het WAS op het moment van vragen. Vastgelegd, niet later
    -- opgezocht: als er ondertussen iets anders gebeurt wil de eigenaar
    -- zien waar de medewerker naar keek toen ze het vroeg.
    current_fee numeric,
    requested_fee numeric not null check (requested_fee >= 0 and requested_fee <= 100),

    -- Waarom. Verplicht -- een getal zonder verhaal is geen aanvraag.
    reason text not null check (length(btrim(reason)) >= 3),

    status text not null default 'pending'
      check (status in ('pending', 'approved', 'rejected', 'withdrawn')),

    requested_by uuid references auth.users(id),
    reviewed_by uuid references auth.users(id),
    reviewed_at timestamptz,
    decision_reason text,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

  create index if not exists fee_change_requests_tenant_idx
    on public.fee_change_requests (tenant_id, status, created_at desc);
  create index if not exists fee_change_requests_account_idx
    on public.fee_change_requests (ad_account_id, created_at desc);

  -- Hooguit EEN openstaande aanvraag per account. Twee medewerkers die
  -- allebei iets vragen over hetzelfde account geven de eigenaar twee
  -- getallen en geen volgorde; de tweede krijgt nu te zien dat er al een
  -- vraag ligt.
  create unique index if not exists fee_change_requests_one_open
    on public.fee_change_requests (ad_account_id)
    where status = 'pending';

  insert into _plak111 values (0, 'tabel fee_change_requests',
    'aangemaakt; reden verplicht, hooguit een openstaande aanvraag per account');
exception when others then
  insert into _plak111 values (0, 'tabel fee_change_requests',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk0$;

-- ── 2. wie mag wat zien ─────────────────────────────────────────────
--     Lezen: elke actieve admin van de tenant -- de medewerker moet haar
--     eigen aanvraag kunnen volgen. Schrijven gaat NIET rechtstreeks:
--     geen insert-, update- of delete-beleid, alles via de RPC's
--     hieronder. Een klant heeft hier niets te zoeken: dit gaat over de
--     prijs die WIJ vragen en de marge erachter.
do $blk1$
begin
  alter table public.fee_change_requests enable row level security;

  drop policy if exists fee_change_requests_admin_read on public.fee_change_requests;
  create policy fee_change_requests_admin_read on public.fee_change_requests
    for select to authenticated
    using (
      exists (
        select 1 from public.user_profiles up
         where up.user_id = auth.uid()
           and up.tenant_id = fee_change_requests.tenant_id
           and up.role = 'admin'
           and coalesce(up.is_active, true) = true
           and coalesce(up.status, 'active') <> 'inactive'
           and coalesce(up.status, '') <> 'pending_erasure'
      )
    );

  insert into _plak111 values (1, 'beleid',
    'lezen: actieve admin van de tenant. Schrijven: alleen via de RPC, geen direct beleid');
exception when others then
  insert into _plak111 values (1, 'beleid',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk1$;

-- ── 3. aanvragen ────────────────────────────────────────────────────
do $blk2$
begin
  create or replace function public.fee_change_request(
    p_ad_account_id uuid,
    p_requested_fee numeric,
    p_reason text
  )
  returns public.fee_change_requests
  language plpgsql
  security definer
  set search_path to 'public'
  as $fn$
  declare
    v_uid  uuid := auth.uid();
    v_prof public.user_profiles%rowtype;
    v_acct public.ad_accounts%rowtype;
    v_row  public.fee_change_requests%rowtype;
  begin
    if v_uid is null then
      raise exception 'Unauthorized' using errcode = '42501';
    end if;

    -- Rol EN actief. Geen enkele geld-RPC in dit schema testte allebei;
    -- een uitgezette medewerker houdt een geldige JWT.
    select * into v_prof
      from public.user_profiles
     where user_id = v_uid
       and role = 'admin'
       and coalesce(is_active, true) = true
       and coalesce(status, 'active') <> 'inactive'
     limit 1;
    if not found then
      raise exception 'Forbidden' using errcode = '42501';
    end if;

    if p_requested_fee is null or p_requested_fee < 0 or p_requested_fee > 100 then
      raise exception 'Vul een percentage tussen 0 en 100 in' using errcode = '22000';
    end if;
    if p_reason is null or length(btrim(p_reason)) < 3 then
      raise exception 'Schrijf erbij waarom' using errcode = '22000';
    end if;

    select * into v_acct
      from public.ad_accounts
     where id = p_ad_account_id
       and tenant_id = v_prof.tenant_id;
    if not found then
      raise exception 'Dat ad-account bestaat niet' using errcode = '42704';
    end if;

    if coalesce(v_acct.fee, -1) = p_requested_fee then
      raise exception 'Dat is het tarief dat er al op staat' using errcode = '22000';
    end if;

    insert into public.fee_change_requests (
      tenant_id, ad_account_id, advertiser_id,
      current_fee, requested_fee, reason, requested_by
    ) values (
      v_prof.tenant_id, v_acct.id, v_acct.advertiser_id,
      v_acct.fee, p_requested_fee, btrim(p_reason), v_uid
    )
    returning * into v_row;

    -- De eigenaar hoort het. Alleen de eigenaar: dit gaat over wat wij
    -- vragen, en de rest van de balie hoeft niet mee te kijken naar een
    -- prijsdiscussie.
    begin
      insert into public.notifications (recipient_user_id, tenant_id, type, payload)
      select t.owner_id, v_prof.tenant_id, 'fee_change_requested',
             jsonb_build_object(
               'request_id', v_row.id,
               'account_name', v_acct.name,
               'current_fee', v_acct.fee,
               'requested_fee', p_requested_fee,
               'reason', btrim(p_reason),
               'by', v_prof.full_name
             )
        from public.tenants t
       where t.id = v_prof.tenant_id
         and t.owner_id is not null
         and t.owner_id <> v_uid;
    exception when others then
      -- Een melding die faalt mag de aanvraag niet tegenhouden.
      raise warning 'fee_change_requested notice failed: %', sqlerrm;
    end;

    return v_row;
  end;
  $fn$;

  revoke all on function public.fee_change_request(uuid, numeric, text)
    from public, anon;
  grant execute on function public.fee_change_request(uuid, numeric, text)
    to authenticated, service_role;

  insert into _plak111 values (2, 'aanvragen',
    'fee_change_request(uuid, numeric, text) -- rol + actief getest, reden verplicht, eigenaar krijgt melding');
exception when others then
  insert into _plak111 values (2, 'aanvragen',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk2$;

-- ── 4. beslissen ────────────────────────────────────────────────────
do $blk3$
begin
  create or replace function public.fee_change_decide(
    p_request_id uuid,
    p_approve boolean,
    p_reason text default null
  )
  returns public.fee_change_requests
  language plpgsql
  security definer
  set search_path to 'public'
  as $fn$
  declare
    v_uid   uuid := auth.uid();
    v_prof  public.user_profiles%rowtype;
    v_owner uuid;
    v_row   public.fee_change_requests%rowtype;
  begin
    if v_uid is null then
      raise exception 'Unauthorized' using errcode = '42501';
    end if;

    select * into v_prof
      from public.user_profiles
     where user_id = v_uid
       and role = 'admin'
       and coalesce(is_active, true) = true
       and coalesce(status, 'active') <> 'inactive'
     limit 1;
    if not found then
      raise exception 'Forbidden' using errcode = '42501';
    end if;

    select owner_id into v_owner from public.tenants where id = v_prof.tenant_id;
    if v_owner is null or v_owner <> v_uid then
      raise exception 'Alleen de eigenaar beslist over een tarief'
        using errcode = '42501';
    end if;

    -- Een afwijzing zonder reden leert de medewerker niets. Zelfde regel
    -- als bij het afwijzen van geld dat de zaak uit gaat.
    if not p_approve and (p_reason is null or length(btrim(p_reason)) < 3) then
      raise exception 'Schrijf erbij waarom niet' using errcode = '22000';
    end if;

    -- FOR UPDATE: twee tabbladen die allebei op goedkeuren drukken
    -- zetten anders allebei het tarief om en schrijven allebei een rij.
    select * into v_row
      from public.fee_change_requests
     where id = p_request_id
       and tenant_id = v_prof.tenant_id
     for update;
    if not found then
      raise exception 'Die aanvraag bestaat niet' using errcode = '42704';
    end if;
    if v_row.status <> 'pending' then
      raise exception 'Die aanvraag is al afgehandeld (%)' , v_row.status
        using errcode = '22000';
    end if;

    if p_approve then
      update public.ad_accounts
         set fee = v_row.requested_fee,
             updated_at = now()
       where id = v_row.ad_account_id
         and tenant_id = v_prof.tenant_id;
      if not found then
        raise exception 'Het ad-account is er niet meer' using errcode = '42704';
      end if;
    end if;

    update public.fee_change_requests
       set status = case when p_approve then 'approved' else 'rejected' end,
           reviewed_by = v_uid,
           reviewed_at = now(),
           decision_reason = nullif(btrim(coalesce(p_reason, '')), ''),
           updated_at = now()
     where id = p_request_id
    returning * into v_row;

    -- Degene die het vroeg hoort de uitkomst.
    begin
      insert into public.notifications (recipient_user_id, tenant_id, type, payload)
      select v_row.requested_by, v_prof.tenant_id, 'fee_change_decided',
             jsonb_build_object(
               'request_id', v_row.id,
               'approved', p_approve,
               'requested_fee', v_row.requested_fee,
               'reason', v_row.decision_reason
             )
       where v_row.requested_by is not null
         and v_row.requested_by <> v_uid;
    exception when others then
      raise warning 'fee_change_decided notice failed: %', sqlerrm;
    end;

    return v_row;
  end;
  $fn$;

  revoke all on function public.fee_change_decide(uuid, boolean, text)
    from public, anon;
  grant execute on function public.fee_change_decide(uuid, boolean, text)
    to authenticated, service_role;

  insert into _plak111 values (3, 'beslissen',
    'fee_change_decide(uuid, boolean, text) -- alleen de eigenaar, reden verplicht bij afwijzen, FOR UPDATE tegen dubbel klikken');
exception when others then
  insert into _plak111 values (3, 'beslissen',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk3$;

-- ── 5. de twee lijsten uit CLAUDE.md ────────────────────────────────
--     Een nieuwe financiele tabel hoort in de auditlijst EN in de
--     updated_at-lijst. Beide triggers bestaan al generiek; dit hangt ze
--     aan deze tabel.
do $blk4$
begin
  if to_regprocedure('public._audit_row_change()') is not null then
    drop trigger if exists z_audit_fee_change_requests on public.fee_change_requests;
    create trigger z_audit_fee_change_requests
      after insert or update or delete on public.fee_change_requests
      for each row execute function public._audit_row_change();
  end if;

  if to_regprocedure('public._touch_updated_at()') is not null then
    drop trigger if exists a_touch_fee_change_requests on public.fee_change_requests;
    create trigger a_touch_fee_change_requests
      before update on public.fee_change_requests
      for each row execute function public._touch_updated_at();
  end if;

  insert into _plak111 values (4, 'audit en updated_at',
    'triggers gehangen voor zover de functies bestaan');
exception when others then
  insert into _plak111 values (4, 'audit en updated_at',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk4$;

-- ── controle ────────────────────────────────────────────────────────
do $blk5$
declare
  v_tab  integer;
  v_fn   integer;
  v_pol  text;
  v_anon text;
begin
  select count(*) into v_tab
    from information_schema.tables
   where table_schema = 'public' and table_name = 'fee_change_requests';

  select count(*) into v_fn
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('fee_change_request', 'fee_change_decide');

  select coalesce(string_agg(policyname || ' [' || cmd || ']', ' | '
           order by policyname), 'GEEN')
    into v_pol
    from pg_policies
   where schemaname = 'public' and tablename = 'fee_change_requests';

  select coalesce(string_agg(p.proname, ', ' order by p.proname), 'geen')
    into v_anon
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('fee_change_request', 'fee_change_decide')
     and has_function_privilege('anon', p.oid, 'execute');

  insert into _plak111 values (5, 'stand van zaken',
    'tabel: ' || v_tab || '/1 | functies: ' || v_fn || '/2 | beleid: ' || v_pol ||
    ' | anon mag uitvoeren: ' || v_anon || ' (moet "geen")');
exception when others then
  insert into _plak111 values (5, 'stand van zaken',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk5$;

-- ════════════════════════════════════════════════════════════════════
-- HET RAPPORT — de editor toont alleen deze laatste tabel.
-- ════════════════════════════════════════════════════════════════════
select n as "#", stap as "wat", uitkomst as "uitkomst"
  from _plak111 order by n;
