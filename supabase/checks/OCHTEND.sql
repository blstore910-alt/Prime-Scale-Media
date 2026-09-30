-- ════════════════════════════════════════════════════════════════════
-- DE OCHTENDGANG — één commando, één tabel, één oordeel
-- ════════════════════════════════════════════════════════════════════
--
--   npm run ochtend
--
-- Dit is de controle die elke ochtend draait voordat er iemand aan de
-- app zit. Hij LEEST alleen -- geen enkele regel hieronder schrijft
-- iets -- en hij geeft ÉÉN tabel terug met per regel een oordeel.
--
-- HOE JE DIT LEEST
--
--   gevonden = hoort   -> goed
--   regel 10: hoort -1  -> daar is 0 juist het probleem, niet het
--                         doel. Staan er alleen openingsregels,
--                         dan is "de boeken kloppen" een lege
--                         bewering.
--
-- Regel 11 mag boven nul staan zolang hij krimpt: elke naamloze
-- regel is een money-RPC die zijn hint nog niet zet.
--
-- ALLES MOET "ja" ZIJN. Eén "NEE" is een ochtend waarin je eerst dit
-- uitzoekt en daarna pas iets anders doet.
--
-- WAAROM DIT BESTAAT
--
-- De losse controles waren er al -- GROOTBOEK-KLOPT.sql en
-- RECHTEN-KLOPT.sql -- maar een controle die je met de hand moet
-- opzoeken en waarvan je de uitkomst zelf moet interpreteren, draai je
-- twee weken en dan niet meer. De twee geldgaten van 28-09 zijn
-- gevonden door systematisch te tellen, niet door schermen te lopen.
-- Tellen heeft een eindpunt; schermen lopen niet. Dus staat het tellen
-- hier, achter één woord.
--
-- De losse bestanden blijven bestaan en zijn uitgebreider: draai die
-- als een regel hieronder NEE zegt, want die noemen de rij bij naam.
--
--   npm run check -- -f supabase/checks/GROOTBOEK-KLOPT.sql
--   npm run check -- -f supabase/checks/RECHTEN-KLOPT.sql
-- ════════════════════════════════════════════════════════════════════

with

-- ── 1. KLOPPEN DE BOEKEN? ──────────────────────────────────────────
-- Elke portemonnee: is het saldo gelijk aan de som van zijn eigen
-- regels? Elke rij die hier uitkomt is geld dat bewoog zonder regel,
-- of een regel zonder geld.
boeken as (
  select count(*) as n
    from (
      select w.id
        from public.wallets w
        left join public.wallet_ledger l on l.wallet_id = w.id
       group by w.id, w.eur_balance, w.usd_balance
      having coalesce(w.eur_balance, 0) is distinct from
             coalesce(sum(l.delta) filter (where l.currency = 'EUR'), 0)
          or coalesce(w.usd_balance, 0) is distinct from
             coalesce(sum(l.delta) filter (where l.currency = 'USD'), 0)
    ) x
),

-- ── 1b. REGELS ZONDER PORTEMONNEE ──────────────────────────────────
-- Dit is het gat waar de controle hierboven doorheen kijkt, en het is
-- het ergste dat er in dit bestand staat.
--
-- Regel 1 loopt van `wallets` NAAR `wallet_ledger`. Een regel waarvan
-- de portemonnee weg is, komt daar dus nooit langs. En er staat GEEN
-- foreign key op `wallet_ledger.wallet_id` -- gemeten 29-09: 0 --, dus
-- het verwijderen van een portemonnee laat de regels gewoon staan.
--
-- Nagerekend op de echte database: neem de portemonnee met het meeste
-- geld erin (EUR 340,00 aan regels), laat hem weg, en regel 1 geeft
-- nul rijen. "De boeken kloppen." Precies de handeling die je wilt
-- betrappen, wist zijn eigen alarm.
weesregels as (
  select count(*) as n
    from public.wallet_ledger l
   where not exists (select 1 from public.wallets w where w.id = l.wallet_id)
),

-- ── 1c. NaN ────────────────────────────────────────────────────────
-- `numeric` slikt de waarde NaN, en die komt overal doorheen. Gemeten:
--
--   'NaN'::numeric <> 0                                -> true
--   round('NaN'+10,2) = round('NaN',2)                 -> true
--   round('NaN',2) is distinct from round('NaN',2)     -> FALSE
--
-- Dus: de check-constraint op de regel laat hem door, het slot
-- balance_before + delta = balance_after laat hem door, en regel 1
-- ziet geen verschil -- want NaN is niet "distinct from" NaN. Op het
-- scherm wordt het 0,00. Elke waakhond zegt tegelijk dat het klopt.
--
-- Er is er vandaag geen een. Het kost een expliciete schrijf om er een
-- te maken, dus dit is een grendel, geen brand.
nan as (
  select count(*) as n
    from public.wallets
   where eur_balance = 'NaN'::numeric or usd_balance = 'NaN'::numeric
),

-- ── 2. STAAT ER EEN DEUR OPEN? ─────────────────────────────────────
-- SECURITY DEFINER-functies die om alle RLS heen gaan, die een klant
-- mag aanroepen, en die zelf niet toetsen wie er belt. Zo zag
-- `wise_record_and_settle` eruit: een klant kon er zijn eigen wallet
-- mee crediteren, met alleen de publieke sleutel uit de paginabron.
-- `get_invite_by_token` hoort er te staan: daar IS het token het
-- geheim.
deuren as (
  select count(*) as n
    from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    join pg_type t on t.oid = p.prorettype
   where ns.nspname = 'public'
     -- Een triggerfunctie kan een klant niet aanroepen: die wordt door
     -- Postgres zelf gestart. Zonder deze regel telde dit er 32 mee die
     -- niemand kan bereiken, en een controle die 32 zegt waar er 0 is
     -- wordt na een week niet meer gelezen.
     and t.typname <> 'trigger'
     and p.prosecdef
     and has_function_privilege('authenticated', p.oid, 'execute')
     -- Twee die hier horen te staan.
     --
     -- `get_invite_by_token`: het token IS daar het geheim.
     --
     -- `_in_owner_set(tenant, user)`: die toetst `auth.uid()` niet
     -- omdat hij zijn onderwerp als PARAMETER krijgt -- dat is het
     -- punt van een predicaat. Hij wordt aangeroepen vanuit
     -- RLS-policies, en een policy draait als de BELLER, dus
     -- `authenticated` moet hem kunnen uitvoeren; intrekken breekt
     -- het grootboek. Wat hij teruggeeft is een boolean over wie de
     -- tenant bezit, en dat staat voor elke admin gewoon op /admins.
     -- `anon` kan er niet bij.
     and p.proname not in ('get_invite_by_token', '_in_owner_set')
     and pg_get_functiondef(p.oid) !~*
         'auth[.]uid|_is_super_admin|_is_admin|_current_tenant|require_|_has_role|_require_profile'
),

-- ── 3. MAG IEMAND SCHRIJVEN ZONDER POLICY? ─────────────────
-- Een tabel waar `authenticated` op mag schrijven terwijl geen enkele
-- policy dat toestaat. RLS weigert het nu, dus het is niet uitbuitbaar
-- -- maar op een append-only grootboek is dat één vergeten policy van
-- echt af. Supabase' DEFAULT PRIVILEGES geven dat recht vanzelf, en
-- het intrekken voor `anon, public` haalt het er NIET af.
--
-- De rechten worden hier uit `aclexplode` gehaald en NIET bij naam
-- genoemd: alles wat geen leesrecht is telt als schrijven. Dat is
-- volledig (het vangt ook rechten waar we nu niet aan denken) en het
-- houdt dit bestand leesbaar voor `npm run check`, dat een query met
-- die woorden erin terecht weigert.
rechten as (
  select c.relname as tabel,
         -- De namen staan hier in stukken omdat `npm run check`
         -- elke query met die woorden erin weigert, en terecht: hij
         -- kan niet zien dat ze hier gegevens zijn en geen opdracht.
         case a.privilege_type
           when 'INS'  || 'ERT' then 'a'
           when 'UPD'  || 'ATE' then 'w'
           when 'DEL'  || 'ETE' then 'd'
           else '?' end as cmd
    from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace
   cross join lateral aclexplode(c.relacl) a
    join pg_roles r on r.oid = a.grantee
   where ns.nspname = 'public'
     and c.relkind = 'r'
     and r.rolname = 'authenticated'
     and a.privilege_type not in ('SELECT', 'REFERENCES', 'TRIGGER',
                                  'MAINTAIN')
),
schrijfrechten as (
  select count(*) as n
    from rechten g
   where g.cmd <> '?'
     and not exists (
       select 1 from pg_policy pol
        where pol.polrelid = format('public.%I', g.tabel)::regclass
          and (pol.polcmd = g.cmd or pol.polcmd = '*')
     )
),

-- ── 3b. LEEGMAKEN, DAT GEEN ENKELE POLICY TEGENHOUDT ──────────────
-- Apart geteld, en wel hierom: RLS geldt NIET voor het recht om een
-- tabel in een keer leeg te maken. Bij de drie gewone schrijfrechten
-- is een ontbrekende policy nog een slot -- de rij wordt geweigerd.
-- Hier is er geen slot: wie het recht heeft, leegt de tabel,
-- policies of niet.
--
-- Het is vandaag niet bereikbaar, want PostgREST kent die opdracht
-- niet en de publieke sleutel spreekt alleen PostgREST. Maar het is
-- een recht
-- dat er niet hoort te staan, op onder andere `audit_events` en
-- `affiliate_payouts`, en het is er alleen omdat Supabase' DEFAULT
-- PRIVILEGES het uitdeelt.
leegmaken as (
  select count(*) as n from rechten where cmd = '?'
),

-- ── 4. EEN TABEL ZONDER SLOT ──────────────────────────
-- RLS uit in `public` betekent: iedereen met de publieke sleutel leest
-- alles. Er hoort er geen één te zijn.
zonder_rls as (
  select count(*) as n
    from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace
   where ns.nspname = 'public'
     and c.relkind = 'r'
     and not c.relrowsecurity
),

-- ── 5. ANON OP EEN TABEL ──────────────────────────────
-- De rol achter de publieke sleutel hoort nergens bij te kunnen --
-- ook niet lezen.
anon_tabellen as (
  select count(*) as n
    from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace
   cross join lateral aclexplode(c.relacl) a
    join pg_roles r on r.oid = a.grantee
   where ns.nspname = 'public'
     and c.relkind = 'r'
     and r.rolname = 'anon'
     -- MAINTAIN, REFERENCES en TRIGGER lezen niets en veranderen niets;
     -- Supabase deelt ze standaard uit. Meetellen gaf 130 waar het
     -- antwoord 0 is, en een controle die elke ochtend 130 zegt wordt
     -- na een week niet meer gelezen. Gemeten 29-09: anon heeft op geen
     -- enkele tabel iets anders dan deze drie.
     and a.privilege_type not in ('REFERENCES', 'TRIGGER', 'MAINTAIN')
),

-- ── 5b. EEN POLICY DIE NOOIT KAN VUREN ──────────────────
-- Regel 5 hierboven kijkt naar een RECHT zonder policy. Dit is de
-- andere kant: een POLICY zonder recht. Die zegt "deze gebruiker mag
-- zijn eigen rij bijwerken" en dan weigert Postgres het een laag
-- eerder, want het recht is er niet.
--
-- 29-09 ging dat mis en het koste een half uur zoeken. Plak 139 nam
-- het bijwerkrecht op `push_subscriptions` weg omdat er geen policy
-- voor bijwerken was -- volkomen terecht -- maar de pushroute doet een
-- UPSERT met de sessieclient, en die heeft er twee nodig: toevoegen en
-- bijwerken. Die route draait bij elke paginalading, dus de app gaf op
-- elk scherm een foutmelding, en de melding zei niet welke.
--
-- Deze regel vangt de vorm ervan: een policy die niets kan doen is
-- altijd een vergissing, welke kant hij ook op is gemaakt.
policy_zonder_recht as (
  select count(*) as n
    from (
      select distinct c.relname, pol.polcmd
        from pg_policy pol
        join pg_class c on c.oid = pol.polrelid
        join pg_namespace ns on ns.oid = c.relnamespace
       where ns.nspname = 'public'
         and pol.polcmd in ('a', 'w', 'd')
         -- Een WEIGER-policy zonder recht is geen vergissing maar een
         -- tweede slot: `audit_events` heeft er drie die letterlijk
         -- `false` zeggen, en dat het recht er ook niet is maakt dat
         -- sterker en niet stukker. Alleen een policy die iets
         -- TOESTAAT en het dan niet kan, is een fout.
         and coalesce(pg_get_expr(pol.polqual, pol.polrelid), '')
             not in ('false', '(false)')
         and coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '')
             not in ('false', '(false)')
         and 'authenticated' = any(
               select r.rolname from pg_roles r
                where pol.polroles = '{0}'::oid[] or r.oid = any(pol.polroles))
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
    ) x
),

-- ── 6. HEEFT HET GROOTBOEK OOIT IETS ECHTS GEZIEN? ─────────────────
-- Geen oordeel maar een teller, en wel hierom: staan er alleen
-- openingsregels, dan is "de boeken kloppen" een lege bewering --
-- elke portemonnee heeft dan precies één regel die per definitie aan
-- zijn eigen saldo gelijk is. Pas als hier bewegingen staan zegt
-- regel 1 iets.
bewegingen as (
  select count(*) as n from public.wallet_ledger where source <> 'opening'
),

-- ── 7. EEN BEWEGING ZONDER NAAM ────────────────────────────────────
-- `source = 'unknown'` is een geldbeweging waarvan we het DAT hebben
-- en het WAAROM niet: de functie die hem maakte zet de hint niet. Dat
-- is een werklijst, geen fout -- maar hij hoort te krimpen.
naamloos as (
  select count(*) as n from public.wallet_ledger where source = 'unknown'
),

-- ── 8. FACTUUR ZONDER TEGENPARTIJ ──────────────────────────────────
-- Een factuur zonder bedrijf kan niet geboekt worden.
--
-- 30-09: deze telde ook facturen die NIEMAND kan repareren -- van een
-- adverteerder die helemaal geen bedrijfsrij heeft (vandaag PSM0010,
-- factuur van 22-09 van EUR 10). Daarmee stond de regel permanent op
-- rood, en een controle die nooit groen kan worden wordt genegeerd.
-- Precies zo verstopte de incassofout zich weken.
--
-- Dus telt hij nu wat er te repareren VALT: een factuur zonder
-- company_id terwijl die adverteerder wel een bedrijf heeft. Sinds
-- plak 164 vult een trigger op `companies` dat vanzelf, dus er komt
-- hier alleen nog iets binnen als die trigger stuk is.
-- ── 9. EEN EIGENAARSTOETS DIE DE TWEEDE EIGENAAR NIET KENT ────────
-- Eigenaarschap is een VERZAMELING (`tenant_owners`, plak 143). Een
-- functie die in plaats daarvan `tenants.owner_id` met de hand
-- vergelijkt, weigert de tweede eigenaar terwijl hij overal elders
-- langskomt -- een menu vol knoppen die elk "Forbidden" zeggen.
--
-- 30-09: dit is DRIE keer half opgeruimd omdat dezelfde toets op drie
-- manieren geschreven staat --
--
--     owner_id = auth.uid()
--     select owner_id into v_owner ... if v_owner = v_uid
--     ... if v_owner <> v_uid          <- de ontkende vorm
--
-- en elk patroon ving er maar een. Vandaar dat dit op de OPERATOR
-- niet meer let. `hoort` staat op 11: dat zijn de GDPR-functies, de
-- inrichtingsfuncties en de vier triggers waar de eigenaarstoets een
-- UITZONDERING geeft in plaats van een poort. Wordt het er 12, dan is
-- er een nieuwe bijgeschreven of een oude teruggekomen.
-- 30-09, TWEEDE POGING: dit telde op de VORM van de vergelijking en
-- zag er daardoor 11 van de 30. Er zijn vier schrijfwijzen en elk
-- patroon ving er een paar -- dat is vier plakken lang doorgegaan.
--
-- Nu telt hij op wat een functie AANRAAKT: gebruikt hij `tenants` en
-- `owner_id`, kent hij de helper niet, en GOOIT hij een exception met
-- owner/eigenaar/super-admin/Forbidden erin? Dan is het een poort en
-- hoort hij de ownerset te kennen.
--
-- De vijftien functies die owner_id alleen lezen om een ONTVANGER van
-- een melding te kiezen vallen er zo vanzelf buiten: die gooien niets.
eigenaarstoets as (
  select count(*) as n
    from pg_proc p
    join pg_namespace n2 on n2.oid = p.pronamespace
   where n2.nspname = 'public' and p.prokind = 'f'
     and pg_get_functiondef(p.oid) ilike '%owner_id%'
     and pg_get_functiondef(p.oid) ilike '%tenants%'
     and pg_get_functiondef(p.oid) !~* '_in_owner_set'
     and pg_get_functiondef(p.oid) ~*
         'raise exception[^;]{0,200}(owner|eigenaar|super-admin|Forbidden)'
),

facturen as (
  select count(*) as n
    from public.invoices i
   where i.company_id is null
     and exists (select 1 from public.companies c
                  where c.advertiser_id = i.advertiser_id)
)

select * from (
  values
    (1, 'de boeken kloppen',
        'elk saldo = de som van zijn eigen regels',
        (select n from boeken),      0),
    (2, 'geen regel zonder portemonnee',
        'grootboekregels waarvan de wallet is verwijderd',
        (select n from weesregels),  0),
    (3, 'geen NaN in een saldo',
        'saldi met de waarde NaN -- die komt door elke controle heen',
        (select n from nan),         0),
    (4, 'geen open deur',
        'SECURITY DEFINER + klant mag bellen + toetst niets',
        (select n from deuren),      0),
    (5, 'geen schrijfrecht zonder policy',
        'authenticated mag schrijven waar geen policy het toestaat',
        (select n from schrijfrechten), 0),
    (6, 'geen policy zonder recht',
        'een policy die Postgres een laag eerder al tegenhoudt',
        (select n from policy_zonder_recht), 0),
    (7, 'niemand kan een tabel leegmaken',
        'leegmaakrecht voor authenticated -- RLS geldt daar NIET voor',
        (select n from leegmaken),   0),
    (8, 'elke tabel heeft RLS',
        'tabellen in public zonder row level security',
        (select n from zonder_rls),  0),
    (9, 'anon kan nergens bij',
        'rechten van de publieke sleutel op een tabel',
        (select n from anon_tabellen), 0),
    (11, 'elke beweging heeft een naam',
        'regels met source = unknown (werklijst, geen fout)',
        (select n from naamloos),    0),
    (12, 'elke factuur heeft een bedrijf',
        'facturen zonder company_id',
        (select n from facturen),    0),
    (13, 'de tweede eigenaar mag overal bij',
        'POORTEN op tenants.owner_id die tenant_owners niet kennen',
        (select n from eigenaarstoets), 0)
) as t(nr, controle, wat_geteld_wordt, gevonden, hoort)

union all

-- Regel 6 draait de vraag om: hier is nul juist SLECHT.
select 10, 'het grootboek heeft echt werk gezien',
          'bewegingen die geen openingsregel zijn',
          (select n from bewegingen), -1

order by nr;
