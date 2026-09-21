-- =====================================================================
-- PLAK 25 — een klant kon een wissel verzinnen die nooit gebeurde
-- =====================================================================
-- Uit het rapport van plak 23 en de controle erna:
--
--   schrijfrechten op wallet_exchanges : DELETE, INSERT, UPDATE
--   policy "Enable insert for advertisers only" [INSERT]
--     check: de wallet moet van de beller zijn
--
-- De check doet zijn werk -- je komt niet aan de wallet van een ander --
-- maar hij zegt niets over de BEDRAGEN. Op je eigen wallet mag je dus
-- schrijven wat je wilt:
--
--   POST /rest/v1/wallet_exchanges
--   {"wallet_id":"<eigen>","from_currency":"EUR","from_amount":5000,
--    "to_currency":"USD","to_amount":5730,"exchange_rate":0.872361}
--
-- Dat verplaatst geen cent -- de saldo's worden alleen door de RPC
-- aangeraakt -- maar die rij komt daarna wel terug op:
--
--   * het afschrift van de klant zelf (adv-app.tsx)
--   * de wisseltabel van de admin (wallet-exchanges-table.tsx)
--   * het financieel rapport (finance-report-actions.ts)
--   * /api/stats/wallet
--
-- Dus de klant kan de cijfers vervuilen waar PSM zelf mee afstemt, en
-- een geloofwaardig ogend record maken om ruzie over te maken: "jullie
-- eigen systeem zegt dat ik 5.000 gewisseld heb".
--
-- ── DIT IS HET OMGEKEERDE VAN PLAK 21 ────────────────────────────────
--
-- Bij `top_ups` moest UPDATE blijven staan, omdat de adminacties met de
-- SESSIE VAN DE BELLER schrijven. Hier niet. Ik heb elke aanraking van
-- `wallet_exchanges` in de codebase nagelopen en ze zijn ALLEMAAL een
-- select:
--
--   adv-app.tsx:766              select
--   wallet-exchanges-table.tsx:54 select
--   finance-report-actions.ts:464 select
--   app/api/stats/wallet:145      select
--
-- De enige schrijver is `wallet_exchange` zelf, en die is SECURITY
-- DEFINER -- die draait als de eigenaar van de functie en gaat dus zowel
-- om het grant als om de policy heen. Insert, update en delete kunnen
-- hier dus helemaal dicht zonder dat er iets breekt.
--
-- Regel 5 van het rapport controleert dat de functie inderdaad SECURITY
-- DEFINER is en van wie hij is, want dat is precies waar dit op leunt.
--
-- Veilig om vaker te draaien.
-- =====================================================================

set search_path = public;

create temporary table if not exists _wx (k text, v text);
delete from _wx;

insert into _wx
select 'voor',
  coalesce((
    select string_agg(distinct privilege_type, ', ' order by privilege_type)
      from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'wallet_exchanges'
       and grantee in ('authenticated', 'anon')
       and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
  ), 'geen');

insert into _wx
select 'rijen', (select count(*)::text from public.wallet_exchanges);

do $blk0$
begin
  execute 'revoke insert, update, delete on public.wallet_exchanges from authenticated';
  execute 'revoke insert, update, delete on public.wallet_exchanges from anon';
  insert into _wx values ('revoke', 'gelukt');
exception when others then
  insert into _wx values ('revoke', 'MISLUKT: ' || sqlstate || ' ' || sqlerrm);
end;
$blk0$;

-- De policy hoort ook weg: hij staat er alleen om een schrijfactie toe
-- te laten die niet meer bestaat, en een policy laten staan voor een
-- recht dat is ingetrokken is precies hoe hij ooit stilletjes weer
-- werkt als iemand het grant terugzet.
do $blk1$
begin
  execute 'drop policy if exists "Enable insert for advertisers only" on public.wallet_exchanges';
  insert into _wx values ('policy', 'verwijderd');
exception when others then
  insert into _wx values ('policy', 'MISLUKT: ' || sqlstate || ' ' || sqlerrm);
end;
$blk1$;

-- =====================================================================
-- Het rapport — de SQL-editor toont alleen dit
-- =====================================================================
select 1 as nr, 'WAS het gat er (schrijfrechten VOOR deze plak)' as item,
  coalesce((select v from _wx where k = 'voor' limit 1), '?') as antwoord
union all
select 2, 'intrekken gelukt',
  coalesce((select v from _wx where k = 'revoke' limit 1), '?')
union all
select 3, 'schrijfrechten NA deze plak (hoort GEEN te zijn)',
  coalesce((
    select string_agg(distinct privilege_type, ', ' order by privilege_type)
      from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'wallet_exchanges'
       and grantee in ('authenticated', 'anon')
       and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
  ), 'geen - dicht')
union all
select 4, 'policies die er nu nog op staan (alleen lezen hoort over)',
  coalesce((
    select string_agg(policyname || ' [' || cmd || ']', E'\n' order by cmd, policyname)
      from pg_policies
     where schemaname = 'public' and tablename = 'wallet_exchanges'
  ), 'geen')
union all
-- Hier leunt alles op: de RPC moet SECURITY DEFINER zijn, anders heb ik
-- zojuist het wisselen opnieuw gesloopt.
select 5, 'is wallet_exchange SECURITY DEFINER (zo niet: ZEG HET METEEN)',
  coalesce((
    select case when p.prosecdef then 'ja - definer, eigenaar ' || pg_get_userbyid(p.proowner)
                else 'NEE - INVOKER, dit breekt het wisselen, zet de rechten terug' end
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'wallet_exchange' limit 1
  ), 'functie niet gevonden')
union all
select 6, 'aantal wissels in de tabel (moet 1 zijn, die van de walkthrough)',
  coalesce((select v from _wx where k = 'rijen' limit 1), '?')
union all
-- Als er OOIT een verzonnen rij is gezet staat hij hier: een rij waar de
-- bedragen niet uit de koers volgen.
select 7, 'wissels waarvan de bedragen niet uit de koers volgen',
  coalesce((
    select string_agg(x.id::text || ': ' || x.from_amount::text || ' ' ||
                      x.from_currency || ' -> ' || x.to_amount::text || ' ' ||
                      x.to_currency || ' bij koers ' || x.exchange_rate::text,
                      E'\n')
      from public.wallet_exchanges x
     where x.exchange_rate is not null and x.exchange_rate > 0
       and abs(
             (case when x.from_currency = 'USD'
                   then x.from_amount * x.exchange_rate
                   else x.from_amount / x.exchange_rate end)
             - (coalesce(x.fee_amount, 0) + x.to_amount)
           ) > 0.02
  ), 'geen - elke rij telt op')
order by nr;
