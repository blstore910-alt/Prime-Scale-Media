-- =====================================================================
-- PLAK 18 — DRINGEND: een aanvraag indienen zonder te betalen
-- =====================================================================
-- Gevonden door de rechten-agent op reis A3.
--
-- `ad_account_requests_insert_owner` geeft een adverteerder INSERT op
-- `ad_account_requests` voor zijn eigen advertiser_id, en er is geen
-- table-level revoke. De EUR 50 wordt geheven IN
-- `ad_account_request_create_paid` en nergens anders afgedwongen.
--
-- Dus vanuit de console van de klant zelf:
--
--   POST /rest/v1/ad_account_requests
--   { "advertiser_id": "<eigen>", "tenant_id": "<willekeurig>",
--     "platform": "meta-ads", "currency": "EUR", "status": "pending" }
--
-- De aanvraag landt in de wachtrij, een admin handelt hem af, en de
-- wallet is nooit geraakt. De WITH CHECK bindt alleen `advertiser_id` --
-- `tenant_id` staat vrij, dus dezelfde call kan de rij in de wachtrij
-- van een ANDERE tenant zetten.
--
-- ── EN DAN WORDT HET EEN WALLET-CREDIT NAAR KEUZE ────────────────────
--
-- `ad_account_request_reject_refund` leest het terug te betalen bedrag
-- uit de metadata van de rij:
--
--     v_fee := coalesce((v_meta->>'request_fee')::numeric, 0);
--
-- Die metadata is met bovenstaande insert door de klant zelf te
-- schrijven. Zet er `{"request_fee": 100000}` in, laat de admin op
-- Afwijzen drukken, en er wordt EUR 100.000 op de wallet bijgeschreven.
-- De functie controleert nergens dat er ooit iets IS afgeschreven --
-- `request_fee` IS haar administratie van die afschrijving. Het
-- adminscherm bevestigt het nog: "EUR 100000.00 returned to their
-- wallet."
--
-- ── DE REPARATIE, EN WAAROM ZO SMAL ──────────────────────────────────
--
-- Alleen INSERT en DELETE worden ingetrokken. NIET update: de
-- adminacties (`setAdAccountRequestStatus`, `rejectAdAccountRequest`,
-- `createAdAccountFromRequest`) schrijven met de SESSIE VAN DE BELLER,
-- dus een revoke op update sloopt de wachtrij. Voor een gewone
-- adverteerder is update sowieso al dicht: er is geen permissieve
-- UPDATE-policy voor een niet-admin.
--
-- Postgres kijkt naar de GRANT voordat hij de policy evalueert, dus dit
-- sluit de insert-policy zonder de leeskant te raken. De legitieme
-- insert loopt via `ad_account_request_create_paid`, SECURITY DEFINER,
-- en merkt er niets van.
--
-- Regel 1 zegt of het gat er ECHT was voordat dit draaide -- de repo en
-- de live database lopen op dit project uit elkaar, dus dat moet
-- gemeten, niet aangenomen.
--
-- Veilig om vaker te draaien.
-- =====================================================================

set search_path = public;

create temporary table if not exists _a3 (k text, v text);
delete from _a3;

-- Eerst meten, dan dichtdoen.
insert into _a3
select 'voor',
  coalesce((
    select string_agg(distinct privilege_type, ', ' order by privilege_type)
      from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'ad_account_requests'
       and grantee in ('authenticated', 'anon')
       and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
  ), 'geen');

insert into _a3
select 'policies',
  coalesce((
    select string_agg(policyname || ' [' || cmd || ']', E'\n' order by cmd, policyname)
      from pg_policies
     where schemaname = 'public' and tablename = 'ad_account_requests'
  ), 'geen');

do $blk0$
begin
  execute 'revoke insert, delete on public.ad_account_requests from authenticated';
  execute 'revoke insert, delete on public.ad_account_requests from anon';
  insert into _a3 values ('revoke', 'gelukt');
exception when others then
  insert into _a3 values ('revoke', 'MISLUKT: ' || sqlstate || ' ' || sqlerrm);
end;
$blk0$;

-- =====================================================================
-- Het rapport — de SQL-editor toont alleen dit
-- =====================================================================
select 1 as nr,
  'WAS het gat er (schrijfrechten VOOR deze plak)' as item,
  coalesce((select v from _a3 where k = 'voor' limit 1), '?') as antwoord
union all
select 2, 'intrekken gelukt',
  coalesce((select v from _a3 where k = 'revoke' limit 1), '?')
union all
select 3, 'schrijfrechten NA deze plak (update mag blijven)',
  coalesce((
    select string_agg(distinct privilege_type, ', ' order by privilege_type)
      from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'ad_account_requests'
       and grantee in ('authenticated', 'anon')
       and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
  ), 'geen - dicht')
union all
select 4, 'alle policies op ad_account_requests',
  coalesce((select v from _a3 where k = 'policies' limit 1), '?')
union all
-- Zijn er rijen die NOOIT door de RPC zijn gemaakt? Die missen de vier
-- sleutels die de RPC er altijd in zet.
select 5, 'aanvragen ZONDER request_fee in de metadata (nooit betaald?)',
  coalesce((
    select count(*)::text || ' van ' ||
           (select count(*)::text from public.ad_account_requests)
      from public.ad_account_requests r
     where coalesce(r.metadata, '{}'::jsonb) ->> 'request_fee' is null
  ), '?')
union all
-- Deze twee bodies heb ik nodig om de metadata-gaten te dichten:
-- `request_fee_refunded_at` staat NIET in de lijst die de RPC
-- overschrijft, dus wie hem zelf meestuurt zet de terugbetaling uit.
select 6, 'STUUR TERUG >> body ad_account_request_create_paid',
  coalesce((
    select pg_get_functiondef(p.oid)
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'ad_account_request_create_paid'
     limit 1
  ), 'staat niet op deze database')
union all
select 7, 'STUUR TERUG >> body ad_account_request_reject_refund',
  coalesce((
    select pg_get_functiondef(p.oid)
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'ad_account_request_reject_refund'
     limit 1
  ), 'staat niet op deze database')
order by nr;
