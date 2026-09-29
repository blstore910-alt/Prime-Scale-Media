-- ════════════════════════════════════════════════════════════════════
-- PLAK 149 — DE BOEKEN VOLGEN DE BEVOEGDHEID, NIET DE PAGINA
-- ════════════════════════════════════════════════════════════════════
--
-- WAT ER MIS IS
--
-- De schakelaars op /admins bepalen wie welke PAGINA mag openen. De
-- DATA eronder weet daar niets van. Gemeten 29-09:
--
--   audit_events   _is_super_admin_of(tenant_id)   -- alleen eigenaar
--   wallet_ledger  admin van de tenant, of de klant zelf
--
-- Twee verschillende problemen, allebei echt.
--
-- **Het grootboek staat open voor elke admin.** `wallet_ledger` mag
-- gelezen worden door iedere admin van de tenant. De pagina /ledger is
-- eigenaar-alleen, maar de publieke sleutel praat rechtstreeks met
-- PostgREST: een admin die de URL van de API kent leest elke beweging
-- van elke klant, zonder de pagina te openen. De schakelaar
-- "See the ledger and reconciliation" is dus vandaag decoratie.
--
-- **En het auditlog is dicht voor wie hem net heeft gekregen.** Daar
-- staat `_is_super_admin_of`, dus een admin aan wie jij "See the audit
-- log" geeft, krijgt de pagina te zien en nul rijen erin. Dat is de
-- andere kant van dezelfde fout, en hij is gemener: het ziet eruit
-- alsof er niets gebeurd is.
--
-- ── WAT DIT DOET ──────────────────────────────────────────────────
--
-- Allebei de policies lezen nu `has_capability(...)` erbij. Eigenaar
-- mag altijd; een admin mag als jij het hem hebt gegeven; verder
-- niemand. De klant houdt zijn eigen regels in `wallet_ledger`, want
-- dat waren ze al en dat is zijn eigen geld.
--
-- ── WAT DIT NIET KAN, EN WAAROM ───────────────────────────────────
--
-- `finance.check` blijft een pagina-bevoegdheid en wordt géén
-- data-bevoegdheid. Dat scherm leest `wallet_topups`, `top_ups`,
-- `ad_account_withdrawals`, `wallet_refunds`, `wallet_adjustments` en
-- `wallet_precharges` -- precies de tabellen die elke admin nodig
-- heeft om zijn wachtrij te doen. Die dichtzetten om het
-- controlescherm te beschermen zou de gewone werkdag breken.
--
-- Dus: /finance-check bepaalt wie het OVERZICHT en de
-- refund-plafonds voorgeschoteld krijgt. Het houdt geen admin tegen
-- die dezelfde rijen zelf bij elkaar zoekt. Dat staat nu ook zo in
-- het scherm, want een slot dat niet sluit hoort niet als slot
-- getekend te worden.
-- ════════════════════════════════════════════════════════════════════

-- De naam op de auditregel. In de SQL-editor is auth.uid() leeg.
select set_config(
  'request.headers',
  json_build_object('x-psm-actor',
                    '8bd9b91b-c07b-4aae-9bd5-2aff773ab082')::text,
  true);

-- ── 1. HET AUDITLOG ────────────────────────────────────────────────
drop policy if exists audit_events_read on public.audit_events;
create policy audit_events_read on public.audit_events
  for select to authenticated
  using (
    public._is_super_admin_of(tenant_id)
    or (
      public.has_capability('audit.view')
      and exists (
        select 1 from public.user_profiles up
         where up.user_id = auth.uid()
           and up.tenant_id = audit_events.tenant_id
      )
    )
  );

-- ── 2. HET GROOTBOEK ───────────────────────────────────────────────
-- Was: elke admin van de tenant. Nu: de eigenaar, of een admin aan wie
-- het is gegeven -- en de klant houdt zijn eigen regels.
drop policy if exists wallet_ledger_select on public.wallet_ledger;
create policy wallet_ledger_select on public.wallet_ledger
  for select to authenticated
  using (
    exists (
      select 1 from public.wallets w
       where w.id = wallet_ledger.wallet_id
         and (
           -- De eigenaar, altijd.
           public._in_owner_set(w.tenant_id, auth.uid())
           -- Of een admin die deze bevoegdheid heeft gekregen.
           or (
             public.has_capability('ledger.read')
             and exists (
               select 1 from public.user_profiles up
                where up.user_id = auth.uid()
                  and up.tenant_id = w.tenant_id
                  and up.role = 'admin'
             )
           )
           -- Of de klant zelf: zijn eigen geld, zijn eigen regels.
           or exists (
             select 1 from public.advertisers a
              where a.id = w.advertiser_id
                and a.user_id = auth.uid()
           )
         )
    )
  );

-- ── EEN RAPPORT, HELEMAAL ONDERAAN ─────────────────────────────────
-- Allebei horen 'ja' te zeggen.
select
  c.relname                                                   as tabel,
  pol.polname                                                 as policy,
  case when pg_get_expr(pol.polqual, pol.polrelid)
            like '%has_capability%'
       then 'ja' else 'NEE' end                               as volgt_de_schakelaar,
  case when pg_get_expr(pol.polqual, pol.polrelid)
            like '%_in_owner_set%'
         or pg_get_expr(pol.polqual, pol.polrelid)
            like '%_is_super_admin_of%'
       then 'ja' else 'NEE' end                               as eigenaar_mag_altijd
from pg_policy pol
join pg_class c on c.oid = pol.polrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('audit_events', 'wallet_ledger')
  and pol.polcmd = 'r'
order by c.relname;
