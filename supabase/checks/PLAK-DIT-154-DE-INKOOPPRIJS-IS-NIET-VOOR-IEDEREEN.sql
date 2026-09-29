-- ════════════════════════════════════════════════════════════════════
-- PLAK 154 — DE INKOOPPRIJS IS NIET VOOR ELKE ADMIN
-- ════════════════════════════════════════════════════════════════════
--
-- WAT ER MIS IS
--
-- Twee tabellen dragen wat WIJ betalen, en dus onze marge:
--
--   ad_account_costs            per ad-account
--   ad_account_type_suppliers   per type, plus de naam van de leverancier
--
-- Allebei leesbaar door `_is_admin_of(tenant_id)` -- dat is IEDERE
-- admin van de tenant, niet alleen een eigenaar.
--
-- Vanochtend werd dezelfde lek aan de codekant gevonden en gedicht:
-- `/users` las `select("*")` op een view die `supplier_cost` draagt,
-- en daarmee lag de inkoopprijs bij de twee staf-admins op het scherm.
-- De tabellen eronder stonden nog gewoon open, en dat is dezelfde les
-- als bij het grootboek vanmorgen: de PAGINA afschermen is niet
-- hetzelfde als de DATA afschermen. De publieke sleutel praat
-- rechtstreeks met PostgREST.
--
-- ── WAT DIT DOET ──────────────────────────────────────────────────
--
-- Allebei de policies volgen nu de schakelaar `cost.view` --
-- "See what we pay the supplier" op /admins. Een eigenaar mag altijd;
-- een admin mag als jij het hem hebt gegeven; verder niemand.
--
-- Standaard staat die schakelaar UIT, en dat is met opzet: de balie
-- heeft de fee nodig die we REKENEN om haar werk te doen, en nooit
-- die we betalen.
--
-- ── WAT ER NIET STUK GAAT ─────────────────────────────────────────
--
-- Het scherm /settings/ad-account-types is eigenaar-alleen, dus jij
-- ziet precies wat je zag. `listAdAccountTypes` vult het
-- leveranciersblok sinds vandaag alleen nog voor wie de bevoegdheid
-- heeft, dus de code en de database zeggen hetzelfde -- en een admin
-- zonder die schakelaar krijgt de types met de klantgerichte fee, wat
-- alles is wat de rest van de app gebruikt.
--
-- De SCHRIJF-kant blijft zoals hij was: die loopt al via
-- eigenaar-getoetste server actions.
-- ════════════════════════════════════════════════════════════════════

-- De naam op de auditregel. In de SQL-editor is auth.uid() leeg.
select set_config(
  'request.headers',
  json_build_object('x-psm-actor',
                    '8bd9b91b-c07b-4aae-9bd5-2aff773ab082')::text,
  true);

-- ── 1. WAT WE PER AD-ACCOUNT BETALEN ───────────────────────────────
drop policy if exists ad_account_costs_admin_read on public.ad_account_costs;
create policy ad_account_costs_admin_read on public.ad_account_costs
  for select to authenticated
  using (
    public._in_owner_set(tenant_id, auth.uid())
    or (
      public.has_capability('cost.view')
      and exists (
        select 1 from public.user_profiles up
         where up.user_id = auth.uid()
           and up.tenant_id = ad_account_costs.tenant_id
           and up.role = 'admin'
      )
    )
  );

-- ── 2. WAT WE PER TYPE BETALEN, EN AAN WIE ─────────────────────────
-- Deze policy staat op `*` (alle handelingen). Hij wordt gesplitst:
-- lezen volgt de schakelaar, schrijven blijft bij de eigenaar. Een
-- enkele ALL-policy zou schrijven aan iedereen geven die mag lezen,
-- en dat is niet hetzelfde recht.
drop policy if exists ad_account_type_suppliers_admin
  on public.ad_account_type_suppliers;

create policy ad_account_type_suppliers_read
  on public.ad_account_type_suppliers
  for select to authenticated
  using (
    public._in_owner_set(tenant_id, auth.uid())
    or (
      public.has_capability('cost.view')
      and exists (
        select 1 from public.user_profiles up
         where up.user_id = auth.uid()
           and up.tenant_id = ad_account_type_suppliers.tenant_id
           and up.role = 'admin'
      )
    )
  );

create policy ad_account_type_suppliers_write
  on public.ad_account_type_suppliers
  for all to authenticated
  using (public._in_owner_set(tenant_id, auth.uid()))
  with check (public._in_owner_set(tenant_id, auth.uid()));

-- ── EEN RAPPORT, HELEMAAL ONDERAAN ─────────────────────────────────
-- Beide leespolicies horen 'ja' te zeggen.
select
  c.relname                                                   as tabel,
  pol.polname                                                 as policy,
  case pol.polcmd when 'r' then 'lezen' when '*' then 'alles'
       else pol.polcmd::text end                              as voor,
  case when pg_get_expr(pol.polqual, pol.polrelid)
            like '%has_capability%'
       then 'ja' else 'nee' end                               as volgt_de_schakelaar,
  case when pg_get_expr(pol.polqual, pol.polrelid)
            like '%_in_owner_set%'
       then 'ja' else 'NEE' end                               as eigenaar_mag_altijd
from pg_policy pol
join pg_class c on c.oid = pol.polrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('ad_account_costs', 'ad_account_type_suppliers')
order by c.relname, pol.polcmd;
