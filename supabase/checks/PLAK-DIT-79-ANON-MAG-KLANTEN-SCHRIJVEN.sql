-- ════════════════════════════════════════════════════════════════════
--  PLAK 79 — anon heeft UPDATE op de klantentabel
--
--  GEVONDEN TERWIJL IK IETS ANDERS NAKEEK. Regel 3 van plak 78 zei "LET
--  OP: authenticated mag deze kolom rechtstreeks schrijven", en toen ik
--  uitzocht waarom, stond er dit in de ACL van public.advertisers:
--
--      anon           MAINTAIN, REFERENCES, SELECT, TRIGGER, UPDATE
--      authenticated  MAINTAIN, REFERENCES, SELECT, TRIGGER, UPDATE
--
--  anon is de rol achter de publiceerbare sleutel — die in de
--  paginabundel staat, dus die heeft iedereen die de site opent.
--
--  IS HET VANDAAG BEREIKBAAR? Nee. Op advertisers staan twee policies:
--  "Allow ALL for admins" (_is_admin_of) en advertisers_self_select
--  (alleen SELECT, eigen rij). Voor anon matcht er geen enkele policy,
--  dus RLS weigert elke schrijfpoging. Het recht is dood hout.
--
--  WAAROM HET DAN TOCH WEG MOET. Het is precies het soort recht dat pas
--  telt op de dag dat iemand een policy toevoegt die wat ruimer is dan
--  bedoeld — en dan is er niets meer tussen. De SELECT van anon gaat om
--  dezelfde reden weg: er is geen scherm vóór het inloggen dat een
--  klantrij leest.
--
--  authenticated HOUDT zijn UPDATE. Daar hangt de admin-policy aan, en
--  de kolomlijst van a0_guard_advertisers_session_write is wat een
--  admin-sessie binnen de perken houdt. Dat is de bestaande opzet en die
--  blijft; alleen anon gaat eruit.
--
--  EN DEZELFDE VRAAG VOOR DE REST VAN HET SCHEMA. Blok B loopt elke
--  tabel langs die anon mag SCHRIJVEN en trekt dat recht in, behalve op
--  de twee die het aantoonbaar nodig hebben vóór het inloggen. Het
--  rapport onderaan noemt wat er is ingetrokken, zodat het geen
--  blinde veeg is.
--
--  Plak alles in één keer. Onderaan komt ÉÉN tabel.
-- ════════════════════════════════════════════════════════════════════

drop table if exists _p79;
create temp table _p79(nr int, wat text, uitkomst text);

-- ── A. DE KLANTENTABEL ───────────────────────────────────────────────
do $blk0$
begin
  execute 'revoke update, select, references, trigger on table public.advertisers from anon';
  insert into _p79 values (1, 'anon op de klantentabel',
    'UPDATE en SELECT ingetrokken — er is geen scherm vóór het inloggen dat een klantrij leest of schrijft');
exception when others then
  insert into _p79 values (1, 'anon op de klantentabel', 'MISLUKT: ' || sqlerrm);
end
$blk0$;

-- ── B. EN ELKE ANDERE TABEL DIE ANON MAG SCHRIJVEN ───────────────────
do $blk1$
declare
  r      record;
  v_n    int := 0;
  v_done text := '';
begin
  for r in
    select c.relname, string_agg(distinct a.privilege_type, ', ') as rechten
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace,
           aclexplode(c.relacl) a
     where n.nspname = 'public'
       and c.relkind = 'r'
       and pg_get_userbyid(a.grantee) = 'anon'
       and a.privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
       -- invitations wordt vóór het inloggen gelezen via
       -- get_invite_by_token, en dat is een definer-functie: die heeft
       -- geen tabelrecht voor anon nodig. Niets hier is een uitzondering.
     group by c.relname
     order by c.relname
  loop
    begin
      execute format('revoke insert, update, delete, truncate on table public.%I from anon', r.relname);
      v_n := v_n + 1;
      v_done := v_done || r.relname || ' (' || r.rechten || ') · ';
    exception when others then
      v_done := v_done || r.relname || ' MISLUKT (' || sqlerrm || ') · ';
    end;
  end loop;

  insert into _p79 values (2, 'anon als schrijver, overal',
    case when v_n = 0 then 'er stond er geen meer open'
         else v_n::text || ' tabellen: ' || rtrim(v_done, ' ·') end);
end
$blk1$;

-- ── C. WAT ER NU STAAT (alleen lezen) ────────────────────────────────
do $blk2$
declare v_txt text;
begin
  begin
    select coalesce(string_agg(c.relname || ': ' || x.rechten, ' · ' order by c.relname), 'geen')
      into v_txt
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join lateral (
        select string_agg(distinct a.privilege_type, ', ' order by a.privilege_type) as rechten
          from aclexplode(c.relacl) a
         where pg_get_userbyid(a.grantee) = 'anon'
           and a.privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
      ) x on x.rechten is not null
     where n.nspname = 'public' and c.relkind = 'r';
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _p79 values (3, 'tabellen die anon nog mag schrijven', v_txt);

  begin
    select coalesce(string_agg(c.relname, ' · ' order by c.relname), 'geen')
      into v_txt
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
       and has_table_privilege('anon', c.oid, 'SELECT');
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _p79 values (4, 'tabellen die anon nog mag lezen',
    left(coalesce(v_txt, 'geen'), 900));

  begin
    select coalesce(string_agg(policyname || ' [' || cmd || ']', ' · ' order by policyname), 'geen')
      into v_txt
      from pg_policies where schemaname = 'public' and tablename = 'advertisers';
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _p79 values (5, 'de policies op advertisers', v_txt);

  begin
    select coalesce(count(*)::text, '0') || ' klanten hebben uitbetaalgegevens bewaard'
      into v_txt
      from public.advertisers
     where payout_details is not null and payout_details <> '{}'::jsonb;
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _p79 values (6, 'en werkt het opslaan', v_txt);
end
$blk2$;

select nr as "#", wat as "wat", uitkomst as "uitkomst" from _p79 order by nr;
