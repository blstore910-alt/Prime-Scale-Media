-- ════════════════════════════════════════════════════════════════════
--  PLAK 59 — een leesaccount, zodat een controle geen tien minuten kost
--
--  WAAROM. Elke keer dat een bedrag op het scherm tegen de database moet
--  worden gehouden, is het nu: ik schrijf een plak, jij plakt hem, jij
--  stuurt de tabel terug. Vijf tot vijftien minuten voor een vraag die
--  de database in twee milliseconden beantwoordt. Over zestien reizen is
--  dat het grootste deel van een dag.
--
--  WAT DIT BLOK MAAKT. Eén login die ALLEEN MAG LEZEN. Geen insert, geen
--  update, geen delete, geen rechten om iets te veranderen — dat kan hij
--  niet, ook niet als iemand het hem vraagt. Daarnaast draait
--  `npm run check` elke opdracht binnen BEGIN READ ONLY ... ROLLBACK en
--  weigert alles wat niet met select begint. Twee sloten, los van elkaar.
--
--  WAT JIJ MOET DOEN
--    1  vul hieronder je eigen wachtwoord in (regel met <== VERANDER DIT)
--    2  plak alles in één keer in de SQL-editor
--    3  lees de tabel onderaan; regel 5 zegt of het werkt
--    4  zet de string in .env.check zoals .env.check.example laat zien
--
--  HET WACHTWOORD KOMT NOOIT IN DE CHAT en nooit in git. Ik zie het niet
--  en heb het niet nodig — het staat in een bestand dat git negeert.
--
--  ROW LEVEL SECURITY. Een gewone nieuwe login valt ONDER RLS, en zonder
--  ingelogde gebruiker geeft dat overal nul rijen. Dat is precies de
--  "zelfverzekerde nul" die we niet willen. Daarom probeert dit blok het
--  recht BYPASSRLS te geven. Lukt dat niet (Supabase staat het niet
--  altijd toe), dan zegt regel 5 dat, en dan gebruik je de gewone
--  postgres-string uit het dashboard — het script houdt dan zelf de deur
--  dicht.
--
--  Onderaan komt ÉÉN tabel.
-- ════════════════════════════════════════════════════════════════════

drop table if exists _p59;
create temp table _p59(nr int, wat text, uitkomst text);

do $blk0$
declare
  -- ┌──────────────────────────────────────────────────────────────┐
  v_pass text := 'ZET-HIER-JE-EIGEN-WACHTWOORD';  -- <== VERANDER DIT
  -- └──────────────────────────────────────────────────────────────┘
  v_role text := 'psm_check';
  v_db   text := current_database();
  v_new  boolean;
begin
  if v_pass = 'ZET-HIER-JE-EIGEN-WACHTWOORD' or length(v_pass) < 12 then
    insert into _p59 values (1, 'wachtwoord',
      'NIETS GEDAAN — zet eerst je eigen wachtwoord in de regel met <== VERANDER DIT (minstens 12 tekens)');
    return;
  end if;
  insert into _p59 values (1, 'wachtwoord', 'gezet (niet zichtbaar in deze tabel)');

  -- ── 1. DE LOGIN ───────────────────────────────────────────────────
  v_new := not exists (select 1 from pg_roles where rolname = v_role);
  if v_new then
    execute format('create role %I with login password %L', v_role, v_pass);
  else
    execute format('alter role %I with login password %L', v_role, v_pass);
  end if;
  -- Geen enkel recht om iets te maken of te worden.
  execute format('alter role %I nosuperuser nocreatedb nocreaterole noinherit noreplication', v_role);
  insert into _p59 values (2, 'login',
    v_role || (case when v_new then ' aangemaakt' else ' bestond al, wachtwoord vervangen' end));

  -- ── 2. WAT HIJ MAG ZIEN ───────────────────────────────────────────
  execute format('grant connect on database %I to %I', v_db, v_role);
  execute format('grant usage on schema public to %I', v_role);
  execute format('grant select on all tables in schema public to %I', v_role);
  execute format('alter default privileges in schema public grant select on tables to %I', v_role);
  -- En uitdrukkelijk niets meer dan dat.
  execute format('revoke create on schema public from %I', v_role);
  insert into _p59 values (3, 'rechten', 'alleen SELECT op public, ook op tabellen die later bijkomen');

  -- ── 3. LANGZAME VRAGEN KUNNEN NIETS OMGOOIEN ──────────────────────
  begin
    execute format('alter role %I set statement_timeout = ''20s''', v_role);
    execute format('alter role %I set default_transaction_read_only = on', v_role);
    insert into _p59 values (4, 'grendels',
      'elke sessie van deze login staat standaard op alleen-lezen, met een limiet van 20 seconden');
  exception when others then
    insert into _p59 values (4, 'grendels', 'niet gelukt: ' || sqlerrm);
  end;

  -- ── 4. LANGS RLS KIJKEN ───────────────────────────────────────────
  begin
    execute format('alter role %I bypassrls', v_role);
    insert into _p59 values (5, 'ziet hij de hele database?',
      'JA — klaar. Zet de string in .env.check met gebruiker ' || v_role);
  exception when others then
    insert into _p59 values (5, 'ziet hij de hele database?',
      'NEE (' || sqlerrm || ') — deze login valt onder RLS en zou overal nul rijen zien. ' ||
      'Gebruik in .env.check de gewone postgres-string uit Project Settings -> Database. ' ||
      'Het script laat dan nog steeds alleen selects door.');
  end;
exception when others then
  insert into _p59 values (9, 'MISLUKT', sqlerrm);
end
$blk0$;

-- ── 5. WAT ER NU ECHT STAAT (alleen lezen) ───────────────────────────
do $blk1$
declare v_txt text;
begin
  begin
    select case when r.rolname is null then 'de login bestaat niet'
                else 'login=' || r.rolcanlogin::text ||
                     ' · bypassrls=' || r.rolbypassrls::text ||
                     ' · superuser=' || r.rolsuper::text ||
                     ' · mag select op tenants=' ||
                     has_table_privilege(r.rolname, 'public.tenants', 'select')::text
           end
      into v_txt
      from (select * from pg_roles where rolname = 'psm_check') r;
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _p59 values (6, 'controle', coalesce(v_txt, 'de login bestaat niet'));

  begin
    select coalesce(string_agg(privilege_type, ', ' order by privilege_type), 'geen')
      into v_txt
      from information_schema.table_privileges
     where grantee = 'psm_check' and table_schema = 'public' and table_name = 'wallets';
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _p59 values (7, 'wat mag hij met wallets', v_txt);
end
$blk1$;

select nr as "#", wat as "wat", uitkomst as "uitkomst" from _p59 order by nr;
