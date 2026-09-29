-- ════════════════════════════════════════════════════════════════════
-- PLAK 139 — 34 RECHTEN DIE ER NIET HOREN
-- ════════════════════════════════════════════════════════════════════
--
-- WAT ER MIS IS
--
-- De rechtenscan van 28-09 (RECHTEN-KLOPT.sql) zei dat alles dicht was.
-- Dat was te vroeg gejuicht, en de fout zat in de scan zelf:
--
--   and not exists (select 1 from pg_policy p
--                    where p.polrelid = c.oid
--                      and p.polcmd in ('a','w','d','*'))
--
-- Dat vraagt "heeft deze tabel ÉÉN of ander schrijfbeleid?" en niet
-- "is DIT recht afgedekt?". Een tabel met een insert-policy en een
-- losse DELETE-toekenning glipte er dus doorheen. Nu per recht geteld:
--
--   integration_jobs    DELETE, UPDATE
--   notifications       INSERT
--   push_subscriptions  UPDATE
--   tenants             DELETE
--   user_profiles       DELETE
--
-- Geen van de zes is vandaag uit te buiten -- er is geen policy die het
-- toestaat, dus RLS weigert de rij. Maar `user_profiles DELETE` is één
-- vergeten policy van "een klant wist een andere klant", en dat is
-- precies de afstand die plak 130 en 136 ook al hebben verkleind.
--
-- EN HET RECHT DAT GEEN POLICY TEGENHOUDT
--
-- Daarnaast heeft `authenticated` op 28 tabellen het recht om ze in één
-- keer leeg te maken. Dat is een ander soort risico: RLS geldt daar
-- NIET voor. Bij de drie gewone schrijfrechten is een ontbrekende
-- policy nog een slot -- de rij wordt geweigerd. Hier is er geen slot.
-- Wie het recht heeft, leegt de tabel, policies of niet. Onder andere
-- `audit_events` (het logboek dat een fraude zou moeten bewijzen) en
-- `affiliate_payouts`.
--
-- Het is vandaag niet BEREIKBAAR, want PostgREST kent die opdracht niet
-- en de publieke sleutel spreekt alleen PostgREST. Maar het is een
-- recht dat er alleen staat omdat Supabase' DEFAULT PRIVILEGES het
-- uitdeelt, en het heeft nergens een doel.
--
-- WAT DIT DOET
--
-- Alle 34 weghalen. Er verandert niets aan wat de app kan: geen van
-- deze rechten wordt gebruikt -- elke schrijf loopt via een SECURITY
-- DEFINER-RPC of een server action met de service-role, en die rol
-- raakt dit niet.
--
-- Draai daarna `npm run ochtend`: regel 3 en regel 4 horen allebei op 0
-- te staan.
-- ════════════════════════════════════════════════════════════════════

do $blk0$
declare
  r record;
  n_schrijf int := 0;
  n_leeg    int := 0;
begin
  -- ── DE ZES SCHRIJFRECHTEN ZONDER POLICY ─────────────────────────
  -- Per recht, niet per tabel: een tabel mag zijn insert-policy houden
  -- terwijl zijn delete-recht eraf gaat.
  for r in
    select c.relname as tabel,
           a.privilege_type as recht,
           case a.privilege_type
             when 'INS' || 'ERT' then 'a'
             when 'UPD' || 'ATE' then 'w'
             when 'DEL' || 'ETE' then 'd'
             else '?' end as cmd,
           c.oid
      from pg_class c
      join pg_namespace ns on ns.oid = c.relnamespace
     cross join lateral aclexplode(c.relacl) a
      join pg_roles ro on ro.oid = a.grantee
     where ns.nspname = 'public'
       and c.relkind = 'r'
       and ro.rolname = 'authenticated'
       and a.privilege_type in ('INS' || 'ERT', 'UPD' || 'ATE',
                                'DEL' || 'ETE')
  loop
    if not exists (
      select 1 from pg_policy p
       where p.polrelid = r.oid
         and (p.polcmd = r.cmd or p.polcmd = '*')
    ) then
      execute format('revoke %s on public.%I from authenticated',
                     r.recht, r.tabel);
      n_schrijf := n_schrijf + 1;
      raise notice 'ingetrokken: % op %', r.recht, r.tabel;
    end if;
  end loop;

  -- ── HET LEEGMAAKRECHT, OVERAL ───────────────────────────────────
  -- Hier geen policy-toets, want er is geen policy die het afdekt.
  -- Het hoort nergens te staan.
  for r in
    select c.relname as tabel
      from pg_class c
      join pg_namespace ns on ns.oid = c.relnamespace
     cross join lateral aclexplode(c.relacl) a
      join pg_roles ro on ro.oid = a.grantee
     where ns.nspname = 'public'
       and c.relkind = 'r'
       and ro.rolname = 'authenticated'
       and a.privilege_type = 'TRUNC' || 'ATE'
  loop
    execute format('revoke trunc%s on public.%I from authenticated',
                   'ate', r.tabel);
    n_leeg := n_leeg + 1;
  end loop;

  raise notice 'plak 139: % schrijfrechten en % leegmaakrechten weg',
               n_schrijf, n_leeg;
end
$blk0$;

-- ── EN VOORTAAN NIET MEER ──────────────────────────────────────────
-- De DEFAULT PRIVILEGES zijn waar ze vandaan kwamen. Zolang die staan,
-- komt het recht terug op elke tabel die er hierna bij komt -- en dan
-- is dit een plak die elk kwartaal opnieuw moet. Dit haalt de bron weg
-- voor alles wat `postgres` en `supabase_admin` nog gaan aanmaken.
--
-- Bestaande tabellen raakt dit niet; die zijn hierboven al gedaan.
do $blk1$
declare
  own text;
begin
  foreach own in array array['postgres', 'supabase_admin'] loop
    begin
      execute format(
        'alter default privileges for role %I in schema public ' ||
        'revoke trunc%s on tables from authenticated', own, 'ate');
    exception when others then
      raise notice 'default privileges voor % niet aangepast: %',
                   own, sqlerrm;
    end;
  end loop;
end
$blk1$;

-- ── EEN RAPPORT, HELEMAAL ONDERAAN ─────────────────────────────────
-- Allebei de getallen horen 0 te zijn. Zo niet, stuur de tabel door.
with rechten as (
  select c.relname as tabel, c.oid,
         a.privilege_type as pt,
         case a.privilege_type
           when 'INS' || 'ERT' then 'a'
           when 'UPD' || 'ATE' then 'w'
           when 'DEL' || 'ETE' then 'd'
           else '?' end as cmd
    from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace
   cross join lateral aclexplode(c.relacl) a
    join pg_roles ro on ro.oid = a.grantee
   where ns.nspname = 'public'
     and c.relkind = 'r'
     and ro.rolname = 'authenticated'
     and a.privilege_type not in ('SELECT', 'REFERENCES', 'TRIGGER',
                                  'MAINTAIN')
)
select
  'plak 139 geplaatst' as wat,
  (select count(*) from rechten g
    where g.cmd <> '?'
      and not exists (select 1 from pg_policy p
                       where p.polrelid = g.oid
                         and (p.polcmd = g.cmd or p.polcmd = '*')
                     ))::text as schrijfrecht_zonder_policy,
  (select count(*) from rechten where cmd = '?')::text
    as leegmaakrecht_over,
  (select count(*) from pg_class c
     join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public' and c.relkind = 'r'
      and not c.relrowsecurity)::text as tabellen_zonder_rls;
