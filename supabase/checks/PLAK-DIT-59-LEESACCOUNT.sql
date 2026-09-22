-- ════════════════════════════════════════════════════════════════════
--  PLAK 59 — een leesaccount (VERSIE 2)
--
--  VERSIE 1 STRUIKELDE. Hij gaf "permission denied to alter role", en
--  omdat één exception-vanger om het HELE blok zat rolde daarmee ook de
--  aangemaakte login weer terug: tabel zei "de login bestaat niet".
--
--  De boosdoener was een regel die de login uitdrukkelijk NIET-superuser
--  maakte. Dat mag alleen een echte superuser, en Supabase geeft die niet
--  uit. Die regel is ook overbodig: een nieuwe login heeft van zichzelf
--  al geen enkel van die rechten. Hij is weg.
--
--  En nu heeft ELKE stap zijn eigen vanger. Valt er één om, dan zegt de
--  tabel welke, en de rest blijft staan.
--
--  WAAROM DIT BESTAAT. Een bedrag op het scherm tegen de database houden
--  kost nu tien minuten: ik schrijf een plak, jij plakt hem, jij stuurt
--  de tabel terug. Met deze login doe ik dat zelf, in twee seconden, via
--  `npm run check`. Die kan alleen lezen: elke opdracht draait binnen
--  BEGIN READ ONLY ... ROLLBACK en alles wat niet met select begint gaat
--  er niet eens uit.
--
--  WAT JIJ MOET DOEN
--    1  vul hieronder je eigen NIEUWE wachtwoord in (regel met <== )
--       letters en cijfers, minstens 12 tekens, geen leestekens
--    2  plak alles in één keer in de SQL-editor
--    3  lees regel 8 onderaan: die zegt wat je in de connectiestring zet
--
--  Het wachtwoord hoort bij deze nieuwe leeslogin. Het is NIET je
--  Supabase-inlog en NIET het database-wachtwoord. Je verzint het nu, en
--  je typt het straks nog één keer als `npm run check -- --init` erom
--  vraagt. Het komt niet in git en niet in de chat.
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
  v_role  text := 'psm_check';
  v_db    text := current_database();
  v_obj   text;
  v_ok    int  := 0;
  v_bad   int  := 0;
  v_why   text := '';
  v_rls   boolean := false;
begin
  if v_pass = 'ZET-HIER-JE-EIGEN-WACHTWOORD' or length(v_pass) < 12 then
    insert into _p59 values (1, 'wachtwoord',
      'NIETS GEDAAN — zet eerst je eigen wachtwoord op de regel met <== VERANDER DIT (minstens 12 tekens)');
    return;
  end if;

  -- ── 1. DE LOGIN ───────────────────────────────────────────────────
  begin
    if exists (select 1 from pg_roles where rolname = v_role) then
      execute format('alter role %I with login password %L', v_role, v_pass);
      insert into _p59 values (1, 'de login', v_role || ' bestond al — wachtwoord vervangen');
    else
      execute format('create role %I with login password %L', v_role, v_pass);
      insert into _p59 values (1, 'de login', v_role || ' aangemaakt');
    end if;
  exception when others then
    insert into _p59 values (1, 'de login', 'MISLUKT: ' || sqlerrm);
    return;  -- zonder login heeft de rest geen zin
  end;

  -- ── 2. MAG HIJ ERBIJ ──────────────────────────────────────────────
  begin
    execute format('grant connect on database %I to %I', v_db, v_role);
    execute format('grant usage on schema public to %I', v_role);
    insert into _p59 values (2, 'toegang', 'mag verbinden en in public kijken');
  exception when others then
    insert into _p59 values (2, 'toegang', 'MISLUKT: ' || sqlerrm);
  end;

  -- ── 3. LEESRECHT, TABEL VOOR TABEL ────────────────────────────────
  --  Eén grote "grant select on all tables" valt om zodra er één tabel
  --  van iemand anders tussen zit -- en neemt dan alles mee. Dus per
  --  stuk, en tellen wat wel en niet lukte.
  for v_obj in
    select table_name from information_schema.tables
     where table_schema = 'public' and table_type in ('BASE TABLE', 'VIEW')
     order by table_name
  loop
    begin
      execute format('grant select on public.%I to %I', v_obj, v_role);
      v_ok := v_ok + 1;
    exception when others then
      v_bad := v_bad + 1;
      if v_why = '' then v_why := v_obj || ' (' || sqlerrm || ')'; end if;
    end;
  end loop;
  insert into _p59 values (3, 'leesrecht',
    v_ok::text || ' tabellen en views mag hij lezen' ||
    case when v_bad = 0 then '' else '; ' || v_bad::text || ' niet, eerste: ' || v_why end);

  -- ── 4. OOK OP WAT ER LATER BIJKOMT ────────────────────────────────
  begin
    execute format('alter default privileges in schema public grant select on tables to %I', v_role);
    insert into _p59 values (4, 'later bijgemaakte tabellen', 'mag hij ook lezen');
  exception when others then
    insert into _p59 values (4, 'later bijgemaakte tabellen', 'niet ingesteld: ' || sqlerrm);
  end;

  -- ── 5. GRENDELS OP ZIJN SESSIE ────────────────────────────────────
  begin
    execute format('alter role %I set statement_timeout = ''20s''', v_role);
    execute format('alter role %I set default_transaction_read_only = on', v_role);
    insert into _p59 values (5, 'grendels',
      'elke sessie van deze login staat standaard op alleen-lezen, met een limiet van 20 seconden');
  exception when others then
    insert into _p59 values (5, 'grendels', 'niet ingesteld: ' || sqlerrm);
  end;

  -- ── 6. LANGS ROW LEVEL SECURITY KIJKEN ────────────────────────────
  --  Zonder dit valt de login onder RLS, en ziet hij overal NUL rijen --
  --  precies de zelfverzekerde nul die we niet willen. Mag alleen als de
  --  postgres-rol dat recht zelf heeft.
  begin
    execute format('alter role %I bypassrls', v_role);
    v_rls := true;
    insert into _p59 values (6, 'langs RLS kijken', 'JA');
  exception when others then
    insert into _p59 values (6, 'langs RLS kijken', 'NEE — ' || sqlerrm);
  end;

  -- ── 7. WAT JE MOET INVULLEN ───────────────────────────────────────
  if v_rls then
    insert into _p59 values (8, 'ZET DIT IN DE CONNECTIESTRING',
      'gebruiker psm_check.<projectcode> met het wachtwoord dat je hierboven verzon');
  else
    insert into _p59 values (8, 'ZET DIT IN DE CONNECTIESTRING',
      'psm_check ziet door RLS overal nul rijen, dus NIET gebruiken. ' ||
      'Neem gebruiker postgres.<projectcode> met het DATABASE-wachtwoord ' ||
      '(Project Settings -> Database -> Reset database password als je het niet meer weet). ' ||
      'npm run check laat dan nog steeds alleen selects door.');
  end if;
end
$blk0$;

-- ── 8. WAT ER NU ECHT STAAT (alleen lezen) ───────────────────────────
do $blk1$
declare v_txt text;
begin
  begin
    select 'kan inloggen=' || r.rolcanlogin::text ||
           ' · langs RLS=' || r.rolbypassrls::text ||
           ' · superuser=' || r.rolsuper::text ||
           ' · mag select op tenants=' ||
           has_table_privilege(r.rolname, 'public.tenants', 'select')::text
      into v_txt
      from pg_roles r
     where r.rolname = 'psm_check';
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _p59 values (7, 'controle', coalesce(v_txt, 'de login bestaat niet'));
end
$blk1$;

select nr as "#", wat as "wat", uitkomst as "uitkomst" from _p59 order by nr;
