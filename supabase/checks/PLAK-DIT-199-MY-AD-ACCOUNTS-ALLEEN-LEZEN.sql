-- ════════════════════════════════════════════════════════════════════
-- PLAK 199 -- de view my_ad_accounts: alleen lezen
-- ════════════════════════════════════════════════════════════════════
--
-- Controle 01-10 (rechten-agent): `authenticated` had nog insert en
-- update op de view my_ad_accounts (Supabase-standaardrechten). De view
-- is niet bijwerkbaar, dus er kon niets geschreven worden -- maar de
-- regel van dit project is: intrekken, niet vertrouwen op toeval.
--
-- Twee keer plakken kan.

do $blk0$
begin
  revoke insert, update, delete, truncate, references, trigger
    on public.my_ad_accounts from authenticated, anon, public;
  grant select on public.my_ad_accounts to authenticated;
end;
$blk0$;

-- ── RAPPORT ──────────────────────────────────────────────────────────
select
  has_table_privilege('authenticated', 'public.my_ad_accounts', 'select') as lezen_moet_true,
  has_table_privilege('authenticated', 'public.my_ad_accounts', 'insert') as insert_moet_false,
  has_table_privilege('authenticated', 'public.my_ad_accounts', 'update') as update_moet_false,
  has_table_privilege('anon', 'public.my_ad_accounts', 'select') as anon_moet_false;
