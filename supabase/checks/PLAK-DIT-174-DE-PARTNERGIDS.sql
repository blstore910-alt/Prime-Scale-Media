-- ════════════════════════════════════════════════════════════════════
-- PLAK 174 — DE PARTNERGIDS
-- ════════════════════════════════════════════════════════════════════
--
-- De eigenaar, 30-09: "PSM partner directory > partners met wow super
-- mooie tiles of grids of cards met links naar onze website waar meer
-- info staat."
--
-- ── WAAROM EEN TABEL EN GEEN BESTAND ──────────────────────────────
--
-- Een lijst in de code betekent dat elke nieuwe partner een deploy is,
-- en dus een verzoek aan mij. In een tabel zet de eigenaar ze er zelf
-- in, vanuit /partners in beheer. Hij werkt met een co-pilot die af en
-- toe weg is; een partner toevoegen hoort daar niet op te wachten.
--
-- ── WAT ER BEWUST NIET IN STAAT ───────────────────────────────────
--
-- Geen partners die ik niet ken. primescalemedia.com is één pagina en
-- noemt er geen enkele (nagekeken op 30-09); de partnerpagina's waar
-- deze kaarten naartoe linken bestaan dus ook nog niet. Er komt één
-- rij in: Prime Scale Fulfillment, de eigen zusterorganisatie, die op
-- de site zelf al gelinkt staat. De rest is aan de eigenaar.
--
-- ── DE HUISREGELS VOOR EEN NIEUWE TABEL, ALLEMAAL ─────────────────
--
-- 1. RLS aan.
-- 2. `anon` en `public` eruit -- Supabase geeft `anon` standaard
--    arwdDxtm op elke nieuwe tabel in public.
-- 3. insert/update/delete/truncate van `authenticated` eruit. Dat bereikt
--    de regel hierboven NIET: `authenticated` krijgt zijn rechten uit de
--    default privileges, niet uit public. Plak 130 moest dat voor vier
--    tabellen achteraf rechtzetten.
-- 4. Alleen select terug. Schrijven gaat via de server action met
--    tenant-toets en kolom-allowlist (actions/partner-actions.ts).
-- 5. `_touch_updated_at`, zodat optimistic concurrency werkt.
-- 6. `_audit_row_change`, zodat elke wijziging terug te vinden is.
--
-- De controle onderaan leest de rechten terug in plaats van ze aan te
-- nemen -- zie de les van 28-09 in CLAUDE.md.
-- ════════════════════════════════════════════════════════════════════

select set_config(
  'request.headers',
  json_build_object('x-psm-actor',
                    '8bd9b91b-c07b-4aae-9bd5-2aff773ab082')::text,
  true);

-- ── 1. de tabel ──────────────────────────────────────────────────
do $blk1$
begin
  if exists (select 1 from information_schema.tables
              where table_schema='public' and table_name='partners') then
    raise notice 'partners bestaat al';
    return;
  end if;

  create table public.partners (
    id          uuid primary key default gen_random_uuid(),
    tenant_id   uuid not null references public.tenants(id) on delete cascade,
    name        text not null check (length(trim(name)) between 1 and 80),
    -- Eén regel onder de naam. Kort gehouden door de database, want een
    -- tegel met een alinea is geen tegel meer.
    tagline     text check (tagline is null or length(tagline) <= 120),
    category    text check (category is null or length(category) <= 40),
    -- De link naar ONZE site, waar het verhaal staat. Alleen https: een
    -- klant tikt hierop, en een http- of javascript-link op een scherm
    -- van ons is ons probleem.
    url         text check (url is null or url ~ '^https://[^[:space:]]+$'),
    logo_url    text check (logo_url is null or logo_url ~ '^https://[^[:space:]]+$'),
    -- Een kleur voor de tegel als er geen logo is, zodat een lege tegel
    -- er niet uitziet als een tegel die niet laadde.
    accent      text check (accent is null or accent ~ '^#[0-9a-fA-F]{6}$'),
    sort_order  int  not null default 100,
    is_active   boolean not null default true,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
  );

  create index partners_tenant_active_idx
    on public.partners (tenant_id, is_active, sort_order);
end
$blk1$;

-- ── 2. rechten, en RLS ───────────────────────────────────────────
do $blk2$
begin
  alter table public.partners enable row level security;

  revoke all on public.partners from anon, public;
  revoke insert, update, delete, truncate on public.partners from authenticated;
  grant select on public.partners to authenticated;
  grant all on public.partners to service_role;

  -- Lezen: iedereen die is ingelogd, maar alleen zijn EIGEN tenant en
  -- alleen wat actief is. Een uitgezette partner verdwijnt voor de
  -- klant; de beheerkant leest hem via de server action.
  drop policy if exists partners_read_own_tenant on public.partners;
  create policy partners_read_own_tenant on public.partners
    for select to authenticated
    using (
      is_active
      and tenant_id in (select up.tenant_id from public.user_profiles up
                         where up.user_id = auth.uid())
    );
end
$blk2$;

-- ── 3. updated_at en het auditspoor ──────────────────────────────
do $blk3$
begin
  drop trigger if exists trg_touch_partners on public.partners;
  create trigger trg_touch_partners
    before update on public.partners
    for each row execute function public._touch_updated_at();

  drop trigger if exists trg_audit_partners on public.partners;
  create trigger trg_audit_partners
    after insert or update or delete on public.partners
    for each row execute function public._audit_row_change();
end
$blk3$;

-- ── 4. de ene partner die ik ken ─────────────────────────────────
do $blk4$
declare v_tenant uuid;
begin
  select t.id into v_tenant from public.tenants t
   where t.name ilike '%prime scale media%' limit 1;
  if v_tenant is null then
    raise notice 'tenant niet gevonden -- geen startrij';
    return;
  end if;
  if not exists (select 1 from public.partners
                  where tenant_id = v_tenant and name = 'Prime Scale Fulfillment') then
    insert into public.partners (tenant_id, name, tagline, category, url, accent, sort_order)
    values (v_tenant, 'Prime Scale Fulfillment',
            'Storage, pick-and-pack and shipping for your store.',
            'Fulfillment', 'https://primescalefulfillment.com', '#5B8DFF', 10);
  end if;
end
$blk4$;

-- ── HET RAPPORT, HELEMAAL ONDERAAN ─────────────────────────────────
-- Allemaal lezen, niets aannemen:
--   rls              hoort 'aan'
--   anon_leest       hoort 'nee'
--   auth_schrijft    hoort 'nee'  (de les van plak 130)
--   auth_leest       hoort 'ja'
--   triggers         hoort 2
--   partners         hoort 1
select
  'plak 174 geplaatst'                                             as wat,
  (select case when relrowsecurity then 'aan' else 'UIT' end
     from pg_class where oid = 'public.partners'::regclass)        as rls,
  (select case when has_table_privilege('anon','public.partners','select')
               then 'JA -- FOUT' else 'nee' end)                   as anon_leest,
  (select case when has_table_privilege('authenticated','public.partners','insert')
                 or has_table_privilege('authenticated','public.partners','update')
                 or has_table_privilege('authenticated','public.partners','delete')
               then 'JA -- FOUT' else 'nee' end)                   as auth_schrijft,
  (select case when has_table_privilege('authenticated','public.partners','select')
               then 'ja' else 'NEE' end)                           as auth_leest,
  (select count(*)::text from pg_trigger
    where tgrelid = 'public.partners'::regclass and not tgisinternal) as triggers,
  (select count(*)::text from public.partners)                     as partners;
