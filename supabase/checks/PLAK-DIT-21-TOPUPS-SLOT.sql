-- =====================================================================
-- PLAK 21 — de fundingrij stond open voor elke medewerker-admin
-- =====================================================================
-- `"Enable ALL for admins" for all to authenticated using
-- (_is_admin_of(tenant_id))` geeft elke actieve admin INSERT, UPDATE en
-- DELETE op `top_ups`. `_is_admin_of` kent het verschil tussen de
-- eigenaar en een medewerker niet, er is geen table-level revoke, en er
-- hangt geen kolomtrigger aan -- `_fee_is_the_owners` zit alleen op
-- `ad_accounts`, `_money_columns_are_the_owners` alleen op
-- `subscriptions` en `referral_links`.
--
-- Eén regel uit de console van een ingelogde admin verslaat daarmee
-- TOPUP_UPDATE_ALLOWED (dat `fee`, `fee_amount`, `topup_amount`,
-- `amount_usd`, `currency` en `amount_received` juist weglaat), de
-- weigering om completed terug naar pending te zetten,
-- `maintenanceGuard` en de eigenaar-only fee-poort:
--
--   update top_ups set fee = 0, fee_amount = 0,
--                      topup_amount = <bruto>, status = 'completed'
--    where id = '<topup>'
--
-- Dat is exact het argument dat 20260920280000 maakt voor
-- `ad_accounts.fee` en 20260920330000 voor `exchange_rates`, `plans` en
-- `fee_defaults`. `top_ups.fee` is de prijs van EEN funding en heeft
-- diezelfde behandeling nooit gekregen.
--
-- ── WAT DIT WEL EN NIET DOET ─────────────────────────────────────────
--
-- ALLEEN INSERT en DELETE worden ingetrokken. NIET update: de
-- adminacties (`updateTopupAsAdmin`, `verifyAdTopup`,
-- `rejectAdTopup`) schrijven met de SESSIE VAN DE BELLER, dus een
-- revoke op update sloopt de wachtrij. Voor een gewone adverteerder is
-- schrijven sowieso al dicht: er is geen enkele write-policy die een
-- niet-admin noemt.
--
-- Dat laat het UPDATE-gat open. Dat is bewust: het dichtdoen vraagt of
-- een kolomtrigger (zoals `_fee_is_the_owners` op ad_accounts) of het
-- verplaatsen van die schrijfacties naar de service-client, en dat
-- tweede kan pas als ik weet wat `top_up_admin_verify` van zijn beller
-- verwacht. Zie regel 6.
--
-- ── EN DE RPC ────────────────────────────────────────────────────────
--
-- `top_up_admin_verify` is aanroepbaar op /rest/v1/rpc/, en de hele
-- prijspoort (vloer, plafond, tenant-vergelijking, de her-lees of hij
-- al completed is) zit ALLEEN in de TypeScript-wrapper. Dus:
--
--   rpc('top_up_admin_verify', { p_top_up_id, p_new_fee_percent: 0 })
--
-- slaat die allemaal over. Execute intrekken kan NIET zomaar: de
-- wrapper roept hem aan met de sessie van de beller, en de functie leest
-- zelf `auth.uid()` om te zien of je admin bent -- met de service-client
-- aanroepen zou zijn eigen poort breken. De poort hoort dus IN de
-- functie, en daarvoor heb ik zijn body nodig.
--
-- Regel 1 meet eerst of het gat er is. Repo en live lopen op dit project
-- uit elkaar, dus dat wordt gemeten, niet aangenomen.
--
-- Veilig om vaker te draaien.
-- =====================================================================

set search_path = public;

create temporary table if not exists _tu (k text, v text);
delete from _tu;

insert into _tu
select 'voor',
  coalesce((
    select string_agg(distinct privilege_type, ', ' order by privilege_type)
      from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'top_ups'
       and grantee in ('authenticated', 'anon')
       and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
  ), 'geen');

do $blk0$
begin
  execute 'revoke insert, delete on public.top_ups from authenticated';
  execute 'revoke insert, delete on public.top_ups from anon';
  insert into _tu values ('revoke', 'gelukt');
exception when others then
  insert into _tu values ('revoke', 'MISLUKT: ' || sqlstate || ' ' || sqlerrm);
end;
$blk0$;

-- =====================================================================
-- Het rapport — de SQL-editor toont alleen dit
-- =====================================================================
select 1 as nr, 'WAS het gat er (schrijfrechten op top_ups VOOR deze plak)' as item,
  coalesce((select v from _tu where k = 'voor' limit 1), '?') as antwoord
union all
select 2, 'intrekken gelukt',
  coalesce((select v from _tu where k = 'revoke' limit 1), '?')
union all
select 3, 'schrijfrechten NA deze plak (UPDATE hoort te blijven)',
  coalesce((
    select string_agg(distinct privilege_type, ', ' order by privilege_type)
      from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'top_ups'
       and grantee in ('authenticated', 'anon')
       and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
  ), 'geen - dicht')
union all
select 4, 'alle policies op top_ups',
  coalesce((
    select string_agg(policyname || ' [' || cmd || ']  using: ' ||
                      coalesce(qual, '-'), E'\n' order by cmd, policyname)
      from pg_policies
     where schemaname = 'public' and tablename = 'top_ups'
  ), 'geen')
union all
select 5, 'triggers op top_ups (is er een kolomslot)',
  coalesce((
    select string_agg(t.tgname || ' -> ' || p.proname, E'\n' order by t.tgname)
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_proc p on p.oid = t.tgfoid
     where c.relname = 'top_ups'
       and c.relnamespace = 'public'::regnamespace
       and not t.tgisinternal
  ), 'GEEN - de fee van een funding heeft geen slot')
union all
-- Die body heb ik nodig om de prijspoort IN de functie te zetten, want
-- execute intrekken kan niet: de wrapper belt hem met de sessie van de
-- beller en de functie leest zelf auth.uid().
select 6, 'STUUR TERUG >> body top_up_admin_verify',
  coalesce((
    select pg_get_functiondef(p.oid)
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'top_up_admin_verify'
     limit 1
  ), 'staat niet op deze database')
union all
-- Rijen zonder advertiser_id slaan de hele fee-poort over
-- (topup-actions.ts:1175 zet er een `if (row.advertiser_id)` omheen).
select 7, 'top_ups-rijen zonder advertiser_id',
  (select count(*)::text from public.top_ups where advertiser_id is null)
order by nr;
