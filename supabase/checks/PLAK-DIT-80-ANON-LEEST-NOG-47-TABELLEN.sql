-- ════════════════════════════════════════════════════════════════════
--  PLAK 80 — anon mag nog 47 tabellen lezen, en twee daarvan dragen
--             onze inkoopprijs
--
--  Plak 79 heeft het SCHRIJVEN dichtgezet: 38 tabellen waar anon kon
--  invoegen, bijwerken, verwijderen of leegmaken — tenants,
--  user_profiles, exchange_rates, bank_ledger_entries, plans,
--  ad_account_costs. Rij 3 zei daarna "geen". Goed.
--
--  RIJ 4 LIET HET GROOTSTE STAAN. anon mag nog 47 tabellen LEZEN, en
--  daar zitten deze bij:
--
--      ad_account_costs        supplier_fee_pct  -> onze inkoopprijs
--      commission_rules        supplier_fee_pct  -> idem
--      ad_account_type_suppliers                 -> idem
--      supplier_ad_accounts                      -> welke accounts van
--                                                   wie zijn
--      bank_ledger_entries, audit_events, logs, wallets, invoices,
--      user_profiles, tenants, referral_commissions, wise_incoming_
--      transfers ...
--
--  De regel van de eigenaar, en hij staat in CLAUDE.md: de
--  leveranciersfee en onze marge komen nooit in beeld bij een klant of
--  een affiliate — niet in de UI, niet in een mail, niet op een factuur,
--  en niet in de JSON erachter. Een SELECT-recht voor anon is de JSON
--  erachter, voor iemand die niet eens een account heeft.
--
--  IS HET VANDAAG BEREIKBAAR? Op de meeste tabellen niet: er is voor
--  anon geen policy die matcht, dus RLS geeft nul rijen terug. Maar dat
--  is één losse policy verwijderd van wél. En een SELECT laat geen spoor
--  na, dus "er is niets gebeurd" kan ik hier niet hard maken — alleen
--  dat er niets IN de data op misbruik wijst.
--
--  WAT DIT BLOK DOET. Het trekt SELECT voor anon in op elke tabel in
--  public, MET ÉÉN UITZONDERING: tenants. Die blijft staan omdat een
--  aanmeldlink een tenant-slug draagt (?t=prime-scale-media) en ik niet
--  heb kunnen vaststellen of die pagina hem vóór het inloggen uit de
--  tabel leest. Liever één tabel te veel open dan de aanmeldpagina stuk.
--
--  NAGEMETEN NA PLAK 79: de aanmeldpagina met een referrallink rendert
--  nog steeds "Referral code PSM0008", zonder console-fouten, ook nu
--  advertisers voor anon dicht is. Die code komt uit de URL en de rest
--  loopt via get_invite_by_token, een definer-functie — die heeft geen
--  tabelrecht voor anon nodig.
--
--  NA HET PLAKKEN: open https://app.primescalemedia.com/auth/login en
--  een aanmeldlink in een PRIVÉVENSTER (niet ingelogd). Rendert allebei?
--  Dan is het goed. Zo niet, zeg welke pagina en ik zet die ene tabel
--  terug met één regel.
--
--  Plak alles in één keer. Onderaan komt ÉÉN tabel.
-- ════════════════════════════════════════════════════════════════════

drop table if exists _p80;
create temp table _p80(nr int, wat text, uitkomst text);

-- ── A. WAT ER NU OPEN STAAT, VÓÓRDAT ER IETS VERANDERT ───────────────
do $blk0$
declare v_txt text;
begin
  begin
    select coalesce(string_agg(c.relname, ' · ' order by c.relname), 'geen')
      into v_txt
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
       and has_table_privilege('anon', c.oid, 'SELECT')
       and c.relname in ('ad_account_costs', 'commission_rules',
                         'ad_account_type_suppliers', 'supplier_ad_accounts');
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _p80 values (1, 'onze inkoopprijs, vóór dit blok', v_txt);
end
$blk0$;

-- ── B. INTREKKEN, BEHALVE tenants ────────────────────────────────────
do $blk1$
declare
  r      record;
  v_n    int := 0;
  v_done text := '';
begin
  for r in
    select c.relname
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'r'
       and has_table_privilege('anon', c.oid, 'SELECT')
       -- De enige uitzondering. Een aanmeldlink draagt ?t=<slug>, en ik
       -- heb niet kunnen vaststellen of die pagina de tenant vóór het
       -- inloggen uit deze tabel haalt. Liever één te veel open dan de
       -- aanmeldpagina stuk.
       and c.relname <> 'tenants'
     order by c.relname
  loop
    begin
      execute format('revoke select on table public.%I from anon', r.relname);
      v_n := v_n + 1;
      v_done := v_done || r.relname || ' · ';
    exception when others then
      v_done := v_done || r.relname || ' MISLUKT (' || sqlerrm || ') · ';
    end;
  end loop;

  insert into _p80 values (2, 'ingetrokken',
    case when v_n = 0 then 'er stond er geen meer open'
         else v_n::text || ' tabellen: ' || left(rtrim(v_done, ' ·'), 1200) end);
end
$blk1$;

-- ── C. EN DE VIEWS, WANT DIE STAAN ER OOK ────────────────────────────
--  Een view met security_invoker erft de RLS van zijn tabellen, maar het
--  SELECT-recht is van de view zelf. Zonder dit blijft er een deur open
--  naast een die net dicht is.
do $blk2$
declare
  r      record;
  v_n    int := 0;
  v_done text := '';
begin
  for r in
    select c.relname
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind in ('v', 'm')
       and has_table_privilege('anon', c.oid, 'SELECT')
     order by c.relname
  loop
    begin
      execute format('revoke select on table public.%I from anon', r.relname);
      v_n := v_n + 1;
      v_done := v_done || r.relname || ' · ';
    exception when others then
      v_done := v_done || r.relname || ' MISLUKT (' || sqlerrm || ') · ';
    end;
  end loop;

  insert into _p80 values (3, 'views',
    case when v_n = 0 then 'er stond er geen meer open'
         else v_n::text || ': ' || rtrim(v_done, ' ·') end);
end
$blk2$;

-- ── D. WAT ER NU STAAT (alleen lezen) ────────────────────────────────
do $blk3$
declare v_txt text;
begin
  begin
    select coalesce(string_agg(c.relname, ' · ' order by c.relname), 'geen')
      into v_txt
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'v', 'm')
       and has_table_privilege('anon', c.oid, 'SELECT');
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _p80 values (4, 'wat anon nog mag lezen',
    coalesce(v_txt, 'geen') || '  (tenants blijft bewust staan)');

  begin
    select case when count(*) = 0 then 'geen — onze inkoopprijs is niet meer te bevragen zonder account'
                else 'LET OP: ' || string_agg(c.relname, ' · ' order by c.relname) end
      into v_txt
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and has_table_privilege('anon', c.oid, 'SELECT')
       and c.relname in ('ad_account_costs', 'commission_rules',
                         'ad_account_type_suppliers', 'supplier_ad_accounts');
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _p80 values (5, 'onze inkoopprijs, na dit blok', v_txt);

  begin
    select coalesce(string_agg(p.proname, ' · ' order by p.proname), 'geen')
      into v_txt
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f' and p.pronargs > 0
       and has_function_privilege('anon', p.oid, 'EXECUTE');
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _p80 values (6, 'en functies die anon nog mag aanroepen', v_txt);
end
$blk3$;

select nr as "#", wat as "wat", uitkomst as "uitkomst" from _p80 order by nr;
