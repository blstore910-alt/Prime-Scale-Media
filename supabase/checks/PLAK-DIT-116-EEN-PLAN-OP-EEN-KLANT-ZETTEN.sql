-- ════════════════════════════════════════════════════════════════════
-- PLAK 116 — een plan op een klant zetten (ook een van 0 euro)
-- ════════════════════════════════════════════════════════════════════
--
-- De eigenaar, 28-09: "NSA moet wel een plan, maar dan 0 eu in onze
-- app -- zij betalen zelf aan de NSA academy per maand, niet aan ons.
-- Zijn zeer weinig mensen met een 0-euro plan, maar die zijn er wel."
--
-- WAAROM DIT EEN RPC MOET ZIJN EN GEEN GEWONE SCHRIJF
--
-- Gemeten op deze database: `advertiser_plans` heeft precies EEN
-- policy, `advertiser_plans_read_own`, en die is SELECT. Er is geen
-- insert- en geen update-beleid. Via PostgREST kan dus niemand die
-- tabel schrijven -- ook de eigenaar niet.
--
-- Het enige dat er vandaag in schrijft is
-- `create_subscription_from_invite`, een SECURITY DEFINER functie, die
-- langs RLS heen gaat. Vandaar dat een klant die via een uitnodiging
-- binnenkomt wel een plan heeft en een klant die via een affiliate-link
-- binnenkomt niet -- en er geen knop bestond om dat recht te zetten.
--
-- Ik heb dat eerst als een gewone upsert in de server-action gezet en
-- dat leek te werken: de knop meldde "Plan set". Er stond niets in de
-- tabel. RLS geeft nul rijen terug en geen fout, en de action keek
-- alleen naar `error`. Precies de val waar de rest van deze app het
-- hele jaar op is nagelopen, nu in mijn eigen code. De action is
-- aangepast om deze functie aan te roepen en te controleren dat er
-- echt iets is geschreven.
--
-- WAT HET DOET
--
-- Neemt een kaart uit `plans` en legt hem op de klant: zelfde kolommen
-- en dezelfde `on conflict` als de uitnodigingsweg, met opzet -- twee
-- manieren om hetzelfde te schrijven die er net anders uitzien is hoe
-- twee klanten op een plan verschillend gefactureerd raken.
--
-- Het maakt GEEN abonnement. Dat blijft bij de server-action, die
-- precies de regel van de uitnodiging volgt: `if v_fee <= 0 then
-- return` -- een gratis plan geeft de klant zijn inbegrepen accounts en
-- zijn top-uptarief, en er valt niets maandelijks te innen.
--
-- ALLEEN DE EIGENAAR
--
-- Een plan is een PRIJS. Het abonnementenscherm zegt het al met zoveel
-- woorden ("Plans are the owner's to start, price and stop") en
-- feeIsAPrice houdt dezelfde lijn aan voor het tarief per account. De
-- test staat in de functie, niet alleen op de knop.
--
-- Plak dit hele bestand in de SQL editor. Onderaan staat EEN
-- rapporttabel.
-- ════════════════════════════════════════════════════════════════════

create temporary table if not exists _plak116 (
  n integer, stap text, uitkomst text
) on commit preserve rows;
truncate _plak116;

do $blk0$
begin
  create or replace function public.advertiser_plan_set(
    p_advertiser_id uuid,
    p_plan_id uuid
  )
  returns public.advertiser_plans
  language plpgsql
  security definer
  set search_path to 'public'
  as $fn$
  declare
    v_uid   uuid := auth.uid();
    v_prof  public.user_profiles%rowtype;
    v_owner uuid;
    v_adv   public.advertisers%rowtype;
    v_plan  public.plans%rowtype;
    v_cur   text;
    v_row   public.advertiser_plans%rowtype;
  begin
    if v_uid is null then
      raise exception 'Unauthorized' using errcode = '42501';
    end if;

    -- Rol EN actief. Een uitgezette medewerker houdt een geldige JWT.
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
      raise exception 'Alleen de eigenaar zet een plan op een klant'
        using errcode = '42501';
    end if;

    select * into v_adv
      from public.advertisers
     where id = p_advertiser_id
       and tenant_id = v_prof.tenant_id;
    if not found then
      raise exception 'Die klant bestaat niet' using errcode = '42704';
    end if;

    select * into v_plan
      from public.plans
     where id = p_plan_id
       and tenant_id = v_prof.tenant_id
       and coalesce(is_active, true) = true;
    if not found then
      raise exception 'Dat plan bestaat niet of staat uit' using errcode = '42704';
    end if;

    v_cur := upper(coalesce(v_plan.currency, 'EUR'));
    if v_cur not in ('USD', 'EUR') then v_cur := 'EUR'; end if;

    insert into public.advertiser_plans
      (advertiser_id, tenant_id, plan_id, monthly_fee, plan_currency,
       included_ad_accounts, topup_fee_pct)
    values
      (v_adv.id, v_adv.tenant_id, v_plan.id,
       coalesce(v_plan.monthly_fee, 0), v_cur,
       coalesce(v_plan.included_ad_accounts, 0),
       coalesce(v_plan.topup_fee_pct, 0))
    on conflict (advertiser_id) do update
      set plan_id              = excluded.plan_id,
          monthly_fee          = excluded.monthly_fee,
          plan_currency        = excluded.plan_currency,
          included_ad_accounts = excluded.included_ad_accounts,
          topup_fee_pct        = excluded.topup_fee_pct,
          updated_at           = now()
    returning * into v_row;

    return v_row;
  end;
  $fn$;

  revoke all on function public.advertiser_plan_set(uuid, uuid)
    from public, anon;
  grant execute on function public.advertiser_plan_set(uuid, uuid)
    to authenticated, service_role;

  insert into _plak116 values (0, 'plan op een klant zetten',
    'advertiser_plan_set(uuid, uuid) staat; alleen de eigenaar, zelfde kolommen als de uitnodigingsweg');
exception when others then
  insert into _plak116 values (0, 'plan op een klant zetten',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk0$;

-- ── controle ────────────────────────────────────────────────────────
do $blk1$
declare
  v_fn     integer;
  v_anon   boolean;
  v_pol    text;
  v_zonder text;
begin
  select count(*) into v_fn
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'advertiser_plan_set';

  select coalesce(bool_or(has_function_privilege('anon', p.oid, 'execute')), false)
    into v_anon
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'advertiser_plan_set';

  select coalesce(string_agg(policyname || ' [' || cmd || ']', ', '
           order by policyname), 'GEEN')
    into v_pol
    from pg_policies where tablename = 'advertiser_plans';

  select coalesce(string_agg(a.tenant_client_code, ', ' order by a.tenant_client_code), 'niemand')
    into v_zonder
    from public.advertisers a
    join public.user_profiles p on p.id = a.profile_id
   where a.tenant_id = (select id from public.tenants where slug = 'prime-scale-media')
     and p.role = 'advertiser'
     and not exists (
       select 1 from public.advertiser_plans ap where ap.advertiser_id = a.id
     );

  insert into _plak116 values (1, 'stand van zaken',
    'functie: ' || v_fn || '/1 | anon mag uitvoeren: ' || v_anon::text ||
    ' (moet false) | beleid op advertiser_plans: ' || v_pol);
  insert into _plak116 values (2, 'klanten zonder plan',
    v_zonder);
exception when others then
  insert into _plak116 values (1, 'stand van zaken',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk1$;

-- ════════════════════════════════════════════════════════════════════
-- HET RAPPORT — de editor toont alleen deze laatste tabel.
-- ════════════════════════════════════════════════════════════════════
select n as "#", stap as "wat", uitkomst as "uitkomst"
  from _plak116 order by n;
