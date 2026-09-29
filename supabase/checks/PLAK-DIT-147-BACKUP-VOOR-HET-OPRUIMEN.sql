-- ════════════════════════════════════════════════════════════════════
-- PLAK 147 — DE BACK-UP, VÓÓR ER IETS WEGGAAT
-- ════════════════════════════════════════════════════════════════════
--
-- DEZE PLAK VERWIJDERT NIETS. Hij maakt alleen kopieën.
--
-- Blok 15 is het enige blok in dit hele document dat niet terug te
-- draaien is. Alles hierboven voegt toe; dat blok haalt weg. Dus eerst
-- dit.
--
-- ── WAT HET DOET ──────────────────────────────────────────────────
--
-- Eén schema, `backup_20260929`, met een kopie van elke tabel waar een
-- account aan hangt. Een kopie in dezelfde database is geen echte
-- back-up -- als de database omvalt is hij ook weg -- maar tegen de
-- fout die hier dreigt, namelijk een rij te veel verwijderen, is hij
-- precies goed: hij staat er binnen een seconde en je haalt er met één
-- insert iets uit terug.
--
-- Maak DAARNAAST een Supabase-back-up van vandaag. En let op:
-- **opslagbestanden zitten daar niet in**. De betaalbewijzen die
-- klanten hebben geüpload staan in Storage, niet in de database, en
-- geen van beide back-ups pakt ze.
--
-- ── WAAROM EEN SCHEMA EN GEEN EXPORT ──────────────────────────────
--
-- Omdat een export een bestand is dat iemand moet bewaren, en dat is
-- precies de stap die overgeslagen wordt. Een schema staat er gewoon,
-- het kost niets, en over drie maanden gooi je het weg met één regel
-- die onderaan deze plak staat.
--
-- ── DE TABELLEN ───────────────────────────────────────────────────
--
-- Alles waar een adverteerder aan vastzit, plus het auditlog. Dat
-- laatste moet sowieso blijven staan -- het is append-only en hoort te
-- overleven waar het over ging -- maar een kopie kost niets en de dag
-- dat je hem nodig hebt is de dag dat iets anders al fout is gegaan.
-- ════════════════════════════════════════════════════════════════════

create schema if not exists backup_20260929;

-- Niemand hoeft hier bij te kunnen behalve de databasebeheerder. Geen
-- RLS op een back-upschema betekent: geen enkele rol mag erbij, ook
-- `authenticated` niet, en dat regelen we met rechten in plaats van
-- met policies.
revoke all on schema backup_20260929 from public, anon, authenticated;

do $blk0$
declare
  t text;
  n bigint;
  total bigint := 0;
begin
  foreach t in array array[
    'advertisers', 'user_profiles', 'companies', 'wallets',
    'wallet_topups', 'top_ups', 'invoices', 'subscriptions',
    'ad_accounts', 'ad_account_requests', 'referral_links',
    'referral_commissions', 'affiliate_payouts', 'wallet_ledger',
    'wallet_adjustments', 'wallet_refunds', 'wallet_precharges',
    'ad_account_withdrawals', 'dst_charges', 'audit_events',
    'notifications', 'tenant_owners', 'admin_capabilities'
  ] loop
    if to_regclass('public.' || quote_ident(t)) is null then
      raise notice 'bestaat niet, overgeslagen: %', t;
      continue;
    end if;
    if to_regclass('backup_20260929.' || quote_ident(t)) is not null then
      raise notice 'kopie stond er al: %', t;
      continue;
    end if;

    execute format(
      'create table backup_20260929.%I as select * from public.%I', t, t);
    execute format('select count(*) from backup_20260929.%I', t) into n;
    execute format(
      'revoke all on backup_20260929.%I from public, anon, authenticated', t);
    total := total + n;
    raise notice 'gekopieerd: % (% rijen)', t, n;
  end loop;

  raise notice 'plak 147: % rijen veiliggesteld in backup_20260929', total;
end
$blk0$;

-- ── WEGGOOIEN, OVER EEN MAAND OF DRIE ──────────────────────────────
-- Eén regel, als je zeker weet dat je hem niet meer nodig hebt:
--
--   drop schema backup_20260929 cascade;

-- ── EEN RAPPORT, HELEMAAL ONDERAAN ─────────────────────────────────
select
  c.relname                                                  as tabel,
  to_char(c.reltuples::bigint, 'FM999G999')                  as rijen_ongeveer,
  pg_size_pretty(pg_total_relation_size(c.oid))              as grootte,
  case when has_table_privilege('authenticated',
              c.oid, 'sel' || 'ect')
       then 'LET OP -- authenticated kan erbij' else 'dicht' end as rechten
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'backup_20260929'
  and c.relkind = 'r'
order by pg_total_relation_size(c.oid) desc;
