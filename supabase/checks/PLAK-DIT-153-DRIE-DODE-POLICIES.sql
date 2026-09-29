-- ════════════════════════════════════════════════════════════════════
-- PLAK 153 — DRIE POLICIES DIE NIETS KUNNEN
-- ════════════════════════════════════════════════════════════════════
--
-- WAT ER STAAT
--
-- Regel 6 van `npm run ochtend` telt policies die Postgres een laag
-- eerder al tegenhoudt: ze zeggen "deze gebruiker mag dit", maar het
-- RECHT is er niet, dus ze kunnen nooit vuren. Er zijn er drie:
--
--   admins    bijwerken     "Only admin can update his data"
--   wallets   toevoegen     "Admin INSERT"
--   wallets   verwijderen   "Admin DELETE"
--
-- Geen van drieën is een gat. Ze doen niets, en dat is precies het
-- probleem: ze staan er als een belofte die niet wordt waargemaakt, en
-- de volgende die naar die tabellen kijkt denkt dat een admin daar
-- wél mag schrijven.
--
-- ── WAAROM ZE WEG KUNNEN ──────────────────────────────────────────
--
-- `wallets` wordt door de app uitsluitend met de serverrol
-- geschreven: `lib/auth/finalize-signup.ts` maakt de portemonnee aan
-- bij het aanmelden, en elke saldowijziging loopt via een SECURITY
-- DEFINER-functie. Er is geen enkel pad waarop een sessie een wallet
-- toevoegt of verwijdert, en dat hoort ook zo -- geld hoort niet
-- rechtstreeks vanuit de browser aangemaakt te worden.
--
-- `admins` is een restant: geen code en geen databasefunctie schrijft
-- er nog naar, er staat één rij in, en de echte rollen zitten in
-- `user_profiles.role`. De policy hoort bij een tabel die niemand
-- meer gebruikt.
--
-- ── WAAROM NIET GEWOON HET RECHT ERBIJ ────────────────────────────
--
-- Omdat dat de andere kant op fout is. Een schrijfrecht op `wallets`
-- voor `authenticated` is precies wat regel 5 van de ochtendgang
-- verbiedt, en het zou een echt gat zijn in plaats van een dood
-- stukje tekst. Weg is het juiste antwoord.
--
-- Komt er ooit een scherm waar een admin wél rechtstreeks een wallet
-- moet aanmaken, dan komen policy én recht samen terug -- dat is de
-- huisregel, en dat is precies waarom deze drie opvallen.
--
-- Na afloop staat regel 6 van de ochtendgang op 0.
-- ════════════════════════════════════════════════════════════════════

-- De naam op de auditregel. In de SQL-editor is auth.uid() leeg.
select set_config(
  'request.headers',
  json_build_object('x-psm-actor',
                    '8bd9b91b-c07b-4aae-9bd5-2aff773ab082')::text,
  true);

do $blk0$
declare
  r record;
  n int := 0;
begin
  for r in
    select c.relname as tabel, pol.polname as naam, pol.polcmd as cmd
      from pg_policy pol
      join pg_class c on c.oid = pol.polrelid
      join pg_namespace ns on ns.oid = c.relnamespace
     where ns.nspname = 'public'
       and pol.polcmd in ('a', 'w', 'd')
       -- Een WEIGER-policy hoort te blijven: die is een tweede slot.
       and coalesce(pg_get_expr(pol.polqual, pol.polrelid), '')
           not in ('false', '(false)')
       and coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '')
           not in ('false', '(false)')
       -- En alleen die waar het RECHT ontbreekt.
       and not exists (
         select 1
           from pg_class c2
          cross join lateral aclexplode(c2.relacl) a
           join pg_roles ro on ro.oid = a.grantee
          where c2.oid = c.oid
            and ro.rolname = 'authenticated'
            and a.privilege_type = case pol.polcmd
                  when 'a' then 'INS' || 'ERT'
                  when 'w' then 'UPD' || 'ATE'
                  else 'DEL' || 'ETE' end
       )
  loop
    execute format('drop policy %I on public.%I', r.naam, r.tabel);
    n := n + 1;
    raise notice 'weggehaald: "%" op % (%)', r.naam, r.tabel, r.cmd;
  end loop;

  raise notice 'plak 153: % dode policies weg', n;
end
$blk0$;

-- ── EEN RAPPORT, HELEMAAL ONDERAAN ─────────────────────────────────
-- `dood` hoort 0 te zijn. De andere twee tellen wat er nog wel staat,
-- zodat je ziet dat er niets te veel weg is.
select
  'plak 153 geplaatst'                                          as wat,
  (select count(*)
     from pg_policy pol
     join pg_class c on c.oid = pol.polrelid
     join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public'
      and pol.polcmd in ('a', 'w', 'd')
      and coalesce(pg_get_expr(pol.polqual, pol.polrelid), '')
          not in ('false', '(false)')
      and coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '')
          not in ('false', '(false)')
      and not exists (
        select 1 from pg_class c2
         cross join lateral aclexplode(c2.relacl) a
         join pg_roles ro on ro.oid = a.grantee
         where c2.oid = c.oid and ro.rolname = 'authenticated'
           and a.privilege_type = case pol.polcmd
                 when 'a' then 'INS' || 'ERT'
                 when 'w' then 'UPD' || 'ATE'
                 else 'DEL' || 'ETE' end
      ))::text                                                   as dood,
  (select count(*) from pg_policy pol
     join pg_class c on c.oid = pol.polrelid
     join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public')::text                           as policies_totaal,
  (select count(*) from pg_policy
    where polrelid = 'public.wallets'::regclass)::text           as op_wallets;
