-- ════════════════════════════════════════════════════════════════════
-- PLAK 145 — ZONDER DEZE KRIJGT JE COMPAGNON OVERAL "FORBIDDEN"
-- ════════════════════════════════════════════════════════════════════
--
-- DRAAI DEZE VÓÓR PLAK 144. Anders geef je hem een eigenaarsrij die
-- niets doet.
--
-- ── WAT ER MIS IS ─────────────────────────────────────────────────
--
-- Plak 143 maakte `tenant_owners`, en de code leest hem. Maar de
-- DATABASE niet. Vijf functies beslissen daar wie eigenaar is, en alle
-- vijf vergelijken met de oude kolom:
--
--   _is_super_admin_of(uuid)       9 RLS-policies hangen eraan
--   _is_tenant_owner(uuid)         7 triggers
--   _owns_tenant(uuid)
--   _is_wallet_tenant_owner(uuid)  de walletcorrecties
--   _is_active_owner()
--
-- Gevolg zonder deze plak: je compagnon ziet het Owner-menu, klikt op
-- een knop, en krijgt "Forbidden" -- op elke pagina. Prijzen, koersen,
-- commissieregels, het grootboek, de reconciliatie. Alles.
--
-- Precies waar jij vanochtend naar vroeg: "als hij super admin is moet
-- zijn adres niet buggen met systeem, alles wat hij aanpast moet bij
-- mij ook doorzetten."
--
-- ── WAAROM HET ZO WEINIG REGELS ZIJN ──────────────────────────────
--
-- Omdat die 26 policies, 17 triggers en ~20 functies NIET ieder hun
-- eigen eigenaarstoets hebben -- ze bellen allemaal een van deze vijf.
-- Vijf functies vervangen repareert dus de hele database in één keer.
-- Dat is het rendement van een gedeelde helper, en het is dezelfde
-- reden dat de codekant maar één plek hoefde.
--
-- ── WAT ER NIET VERANDERT ─────────────────────────────────────────
--
-- Elke functie leest nu `tenant_owners` OF de oude kolom. Wie gisteren
-- eigenaar was, is het vandaag nog. Er komen alleen mensen BIJ, nooit
-- iemand af. En `tenants.owner_id` blijft gevuld en blijft werken.
--
-- De actieftoets blijft staan waar hij stond: een gedeactiveerde admin
-- is geen admin, eigenaar of niet.
-- ════════════════════════════════════════════════════════════════════

-- ── HET HULPJE DAT DE ANDERE VIER GEBRUIKEN ────────────────────────
-- Eén plek waar "staat deze gebruiker in de eigenarenlijst" staat, in
-- plaats van vijf keer dezelfde or.
create or replace function public._in_owner_set(p_tenant uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $blk0$
  select p_tenant is not null and p_user is not null and (
    exists (
      select 1 from public.tenant_owners o
       where o.tenant_id = p_tenant and o.user_id = p_user
    )
    or exists (
      select 1 from public.tenants t
       where t.id = p_tenant and t.owner_id = p_user
    )
  );
$blk0$;

revoke all on function public._in_owner_set(uuid, uuid) from public, anon;
grant execute on function public._in_owner_set(uuid, uuid)
  to authenticated, service_role;

-- ── 1. _is_super_admin_of -- 9 RLS-policies ────────────────────────
create or replace function public._is_super_admin_of(tenant uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $blk1$
  select exists (
    select 1
      from public.user_profiles up
     where up.tenant_id = tenant
       and up.user_id = auth.uid()
       and up.role = 'admin'
       -- Een gedeactiveerde admin is geen admin, eigenaar of niet.
       and coalesce(up.is_active, true)
       and coalesce(up.status, 'active') <> 'inactive'
       and public._in_owner_set(tenant, auth.uid())
  );
$blk1$;

revoke all on function public._is_super_admin_of(uuid) from public, anon;
grant execute on function public._is_super_admin_of(uuid)
  to authenticated, service_role;

-- ── 2. _is_tenant_owner(uuid) -- 7 triggers ────────────────────────
create or replace function public._is_tenant_owner(p_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $blk2$
  select public._in_owner_set(p_tenant, auth.uid());
$blk2$;

revoke all on function public._is_tenant_owner(uuid) from public, anon;
grant execute on function public._is_tenant_owner(uuid)
  to authenticated, service_role;

-- ── 3. _owns_tenant ────────────────────────────────────────────────
create or replace function public._owns_tenant(p_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $blk3$
  select public._in_owner_set(p_tenant, auth.uid());
$blk3$;

revoke all on function public._owns_tenant(uuid) from public, anon;
grant execute on function public._owns_tenant(uuid)
  to authenticated, service_role;

-- ── 4. _is_wallet_tenant_owner -- de walletcorrecties ──────────────
create or replace function public._is_wallet_tenant_owner(p_wallet uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $blk4$
  select exists (
    select 1
      from public.wallets w
     where w.id = p_wallet
       and public._in_owner_set(w.tenant_id, auth.uid())
  );
$blk4$;

revoke all on function public._is_wallet_tenant_owner(uuid) from public, anon;
grant execute on function public._is_wallet_tenant_owner(uuid)
  to authenticated, service_role;

-- ── 5. _is_active_owner ────────────────────────────────────────────
create or replace function public._is_active_owner()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $blk5$
  select exists (
    select 1
      from public.user_profiles up
     where up.user_id = auth.uid()
       and up.role = 'admin'
       and coalesce(up.is_active, true)
       and coalesce(up.status, 'active') <> 'inactive'
       and public._in_owner_set(up.tenant_id, auth.uid())
  );
$blk5$;

revoke all on function public._is_active_owner() from public, anon;
grant execute on function public._is_active_owner()
  to authenticated, service_role;

-- ── 6. DE TWEE-ARGUMENT VERSIE GAAT WEG ────────────────────────────
-- Plak 143 maakte `_is_tenant_owner(uuid, uuid)` als NIEUWE overload
-- naast de bestaande met één argument. Twee functies met dezelfde naam
-- en verschillende betekenis is precies hoe iemand over een half jaar
-- de verkeerde aanroept. De eenargumentversie hierboven doet nu het
-- werk; deze wordt `_in_owner_set` en verdwijnt.
drop function if exists public._is_tenant_owner(uuid, uuid);

-- ── EEN RAPPORT, HELEMAAL ONDERAAN ─────────────────────────────────
-- Alle vijf horen 'ja' te zeggen.
select
  p.proname                                                   as functie,
  case when position('_in_owner_set' in pg_get_functiondef(p.oid)) > 0
         or p.proname = '_in_owner_set'
       then 'ja' else 'NEE -- kijkt nog naar de oude kolom' end
                                                              as leest_de_lijst,
  (select count(*) from pg_policy pol
    where pg_get_expr(pol.polqual, pol.polrelid)
          ilike '%' || p.proname || '%')::text                as policies,
  has_function_privilege('anon', p.oid, 'execute')::text      as anon_mag
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('_in_owner_set', '_is_super_admin_of', '_is_tenant_owner',
                    '_owns_tenant', '_is_wallet_tenant_owner', '_is_active_owner')
order by p.proname;
