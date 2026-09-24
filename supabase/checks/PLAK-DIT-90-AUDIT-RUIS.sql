-- ════════════════════════════════════════════════════════════════════
-- PLAK 90 — 980 van de 1.039 regels in het audit-logboek zijn "iemand
--            heeft het scherm nog open"
-- ════════════════════════════════════════════════════════════════════
--
-- GEMETEN OP PRODUCTIE, 24-09. De app schrijft elke vijf minuten per
-- ingelogde gebruiker een `last_seen_at` weg. Op `user_profiles` staat
-- een audit-trigger, dus elke ping is een regel in het logboek:
--
--   gewijzigde kolommen             regels
--   last_seen_at, updated_at           980
--   (helemaal niets)                    18
--   is_active, status, updated_at       16
--   full_name, updated_at                6
--
-- Van de 1.039 regels over klantprofielen gaan er dus 22 ergens over.
-- Het logboek heet "Append-only. Every audited write." en de eigenaar
-- moet er 44 pagina's doorheen om die 22 te vinden -- en er komen er
-- twaalf per uur bij per openstaand scherm.
--
-- Die 18 waarin NIETS veranderde zijn hetzelfde probleem: een schrijf
-- met dezelfde waarden, waar `_touch_updated_at` dan een tijdstempel op
-- zet.
--
-- Deze plak vervangt `_audit_row_change` door een versie die bij een
-- wijziging eerst kijkt WAT er veranderde, en niets wegschrijft als dat
-- alleen boekhoud-tijdstempels zijn. Inserts en deletes blijven altijd
-- een regel, en elke echte kolomwijziging ook.
--
-- De 980 regels die er al staan blijven staan: een audit-logboek waar
-- iemand rijen uit weghaalt is geen audit-logboek meer.
--
-- Plak dit hele bestand in de SQL editor. Onderaan staat EEN
-- rapporttabel.
-- ════════════════════════════════════════════════════════════════════

create temporary table if not exists _plak90 (
  n integer, stap text, uitkomst text
) on commit preserve rows;
truncate _plak90;

do $blk0$
begin
  create or replace function public._audit_row_change()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
  as $fn$
  declare
    v_uid uuid := auth.uid();
    v_profile_id uuid;
    v_tenant_id uuid;
    v_row_id text;
    v_old jsonb;
    v_new jsonb;
    v_changed text[];
    -- Tijdstempels die de boekhouding zelf bijhoudt. Verandert er niets
    -- anders dan deze, dan is er niets gebeurd wat iemand wil nalezen.
    v_noise constant text[] := array['last_seen_at', 'updated_at'];
  begin
    if tg_op = 'UPDATE' then
      v_old := to_jsonb(old);
      v_new := to_jsonb(new);

      select coalesce(array_agg(k), array[]::text[])
        into v_changed
        from jsonb_object_keys(v_new) k
       where v_new -> k is distinct from v_old -> k;

      -- `<@` is "zit helemaal in". Een lege verzameling zit overal in,
      -- dus een schrijf die niets veranderde valt hier ook onder.
      if v_changed <@ v_noise then
        return new;
      end if;
    end if;

    -- Best-effort actor profile lookup.
    if v_uid is not null then
      select id, tenant_id into v_profile_id, v_tenant_id
        from public.user_profiles
       where user_id = v_uid
       order by created_at asc
       limit 1;
    end if;

    -- Prefer the row's own tenant_id when present.
    if tg_op = 'DELETE' then
      v_tenant_id := coalesce((to_jsonb(old) ->> 'tenant_id')::uuid, v_tenant_id);
      v_row_id := coalesce((to_jsonb(old) ->> 'id'), null);
    else
      v_tenant_id := coalesce((to_jsonb(new) ->> 'tenant_id')::uuid, v_tenant_id);
      v_row_id := coalesce((to_jsonb(new) ->> 'id'), null);
    end if;

    insert into public.audit_events (
      actor_user_id,
      actor_profile_id,
      tenant_id,
      table_name,
      action,
      row_id,
      before_data,
      after_data
    ) values (
      v_uid,
      v_profile_id,
      v_tenant_id,
      tg_table_name,
      tg_op,
      v_row_id,
      case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
      case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end
    );

    return coalesce(new, old);
  end;
  $fn$;

  -- Postgres geeft EXECUTE aan PUBLIC op elke nieuwe functie, en PUBLIC
  -- is inclusief anon. Dit is een trigger-functie -- los aanroepen geeft
  -- een fout -- maar de regel is de regel, en hij staat in hetzelfde
  -- blok als de create.
  revoke all on function public._audit_row_change() from public, anon;
  grant execute on function public._audit_row_change() to authenticated, service_role;

  insert into _plak90 values (0, 'trigger-functie vervangen', 'gedaan');
exception when others then
  insert into _plak90 values (0, 'trigger-functie vervangen',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk0$;

-- ── controle: lees de definitie terug, niet een teller ───────────────
do $blk1$
declare
  v_guard integer;
  v_anon  integer;
  v_trigs integer;
begin
  select count(*) into v_guard
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = '_audit_row_change'
     and pg_get_functiondef(p.oid) ~ 'v_noise';

  select count(*) into v_anon
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = '_audit_row_change'
     and has_function_privilege('anon', p.oid, 'execute');

  select count(*) into v_trigs
    from pg_trigger t
    join pg_proc p on p.oid = t.tgfoid
   where p.proname = '_audit_row_change' and not t.tgisinternal;

  insert into _plak90 values (1, 'stand van zaken',
    'ruisfilter in de definitie: ' || v_guard || '/1' ||
    ' | anon mag hem: ' || v_anon || ' (moet 0)' ||
    ' | tabellen met deze trigger: ' || v_trigs);
exception when others then
  insert into _plak90 values (1, 'stand van zaken',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk1$;

-- ── wat er nu in het logboek staat ───────────────────────────────────
do $blk2$
declare
  v_tot  bigint;
  v_ping bigint;
begin
  select count(*) into v_tot from public.audit_events;

  select count(*) into v_ping
    from public.audit_events ae
   where ae.before_data is not null
     and not exists (
       select 1
         from jsonb_object_keys(ae.after_data) k
        where ae.after_data -> k is distinct from ae.before_data -> k
          and k <> 'last_seen_at' and k <> 'updated_at'
     );

  insert into _plak90 values (2, 'logboek nu',
    v_tot || ' regels, waarvan ' || v_ping ||
    ' alleen een tijdstempel (die blijven staan; er komen er geen meer bij)');
exception when others then
  insert into _plak90 values (2, 'logboek nu', 'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk2$;

-- ════════════════════════════════════════════════════════════════════
-- HET RAPPORT — de editor toont alleen deze laatste tabel.
-- ════════════════════════════════════════════════════════════════════
select n as "#", stap as "wat", uitkomst as "uitkomst"
  from _plak90 order by n;
