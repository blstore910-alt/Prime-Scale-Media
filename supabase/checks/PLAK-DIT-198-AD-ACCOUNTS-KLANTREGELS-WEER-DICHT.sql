-- ════════════════════════════════════════════════════════════════════
-- PLAK 198 -- klanten lezen ad_accounts weer NIET rechtstreeks (L1 dicht)
-- ════════════════════════════════════════════════════════════════════
--
-- Plak 197 zette de twee klantregels terug, omdat zes serverpaden de
-- tabel nog als klant lazen. Die lezen sinds commit "fix(L1)" via de view
-- my_ad_accounts of met de service-sleutel na een eigendomscontrole.
--
-- PAS PLAKKEN ALS DIE COMMIT LIVE STAAT (/api/version). Daarvoor breekt
-- dit de fee-offerte bij het funden ("That ad account was not found").
--
-- Wat blijft: de beheerdersregel op ad_accounts, en de view (die eigen,
-- team- en beheerdersrijen toont, zonder het interne type).
--
-- Twee keer plakken kan.

do $blk0$
begin
  drop policy if exists "Enable select for advertisers" on public.ad_accounts;
  drop policy if exists ad_accounts_team_read on public.ad_accounts;
end;
$blk0$;

-- ── RAPPORT ──────────────────────────────────────────────────────────
select
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'ad_accounts') as regels_op_ad_accounts_moet_1,
  (select string_agg(policyname, ', ') from pg_policies where schemaname = 'public' and tablename = 'ad_accounts') as welke,
  has_table_privilege('authenticated', 'public.my_ad_accounts', 'select') as view_leesbaar_moet_true;
