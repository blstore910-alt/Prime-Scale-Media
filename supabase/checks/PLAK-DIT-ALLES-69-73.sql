-- ════════════════════════════════════════════════════════════════════
--  ALLES WAT NOG MOET — plak 69, 70, 71, 72 en 73 in één keer
--
--  Plak dit hele bestand in de SQL-editor en druk op Run. Onderaan komt
--  ÉÉN tabel met een regel per stap, met de plaknummers ernaast.
--
--  DE VOLGORDE IS NIET WILLEKEURIG:
--    71  maakt de wachter die 72 later op twee tabellen zet
--    69  het geld van de affiliate
--    70  waar de commissie op slaat
--    73  de valuta op elke bon
--    72  de afsluiting voor anon — helemaal achteraan, zodat zijn veger
--        ook de functies vangt die de blokken hierboven aanmaken
--
--  ELK BLOK VANGT ZIJN EIGEN FOUT OP. Er is geen enkel blok dat een
--  ander blok kan meesleuren: wat mislukt staat in de tabel onderaan
--  met MISLUKT ervoor, en de rest gaat gewoon door. Een blok dat "stond
--  al goed" zegt heeft niets gedaan — dit bestand mag twee keer draaien.
--
-- ────────────────────────────────────────────────────────────────────
--  WAT ER IN HET KORT GEBEURT
--
--  71  AFWIJZEN MET EEN REDEN, OOK OP AANVRAGEN EN OPNAMES
--      ad_account_withdrawals heeft ÉÉN reason-kolom en twee schrijvers.
--      De klant zet daar neer waaróm hij geld terugvraagt; afwijzen doet
--      reason = coalesce(p_reason, reason). Dus MET een reden wordt zijn
--      zin overschreven — weg — en ZONDER reden krijgt hij zijn eigen
--      woorden terug alsof wij ze geschreven hebben. Ons antwoord krijgt
--      een eigen kolom, en beide wachtrijen eisen voortaan een reden.
--
--  69  WAT JE NOG KRIJGT VS WAT AL GEVRAAGD IS
--      Vier geldfouten op de affiliate-reis. De ergste: commissie die al
--      in een lopende uitbetalingsaanvraag vastzit telde nog steeds mee
--      als "nog aan jou verschuldigd" — EUR 1.200 aan aanspraak op EUR
--      700 aan commissie. Vandaag onzichtbaar (0 commissies), morgen niet.
--
--  70  WAAR KOMT DIE ELF CENT VANDAAN
--      De commissieregel krijgt het bedrag waar hij OP slaat: de storting
--      zelf, of de factuur. Geen fee, geen percentage, geen inkoop — die
--      hele keten staat al op /affiliates en hoort alleen daar.
--
--  73  ELKE BON STAAT IN EURO'S
--      Nagemeten: alle acht bonnen die deze reis ooit maakte dragen
--      currency NULL, en het scherm print NULL als EUR. Een creditering
--      van USD 100 wordt dus overal als EUR 100 getoond. Plus: het bedrag
--      ging door ::real (float4) voordat het in numeric(14,2) belandde.
--
--  72  WAT ANON NIET MAG — DE BELANGRIJKSTE
--      De publiceerbare sleutel staat in de paginabundel. Zonder account
--      kon je de hele rate limiter wissen, volledig CRUD doen op
--      public.admins (de tabel die een Google-token van de eigenaar
--      draagt), de meldingenbel van élke admin volschrijven, elke tenant
--      lezen en met een adverteerder-id zijn feepercentage opvragen.
--      NAGEMETEN: er is nog niets misbruikt. Maar een SELECT laat geen
--      spoor na, dus dat geldt alleen voor wat je kunt zien.
-- ════════════════════════════════════════════════════════════════════

drop table if exists _plak;
create temp table _plak(plak text, nr int, wat text, uitkomst text);



-- ####################################################################
-- ##  PLAK 71
-- ####################################################################

-- ════════════════════════════════════════════════════════════════════
--  PLAK 71 — reis D1: afwijzen MET een reden, ook op de twee wachtrijen
--             die hem nog niet eisten
--
--  D1 IS ÉÉN EIS: verifiëren en afwijzen MET een reden, en de klant
--  krijgt bericht. Plak 64 heeft dat vastgezet op wallet_topups en
--  top_ups. Nagemeten vandaag: ad_account_requests en
--  ad_account_withdrawals hebben die trigger NIET. Op die twee is de
--  reden nog steeds alleen een regel in een dialoog, en een dialoog is
--  geen regel.
--
--  A  EEN OPNAME AFWIJZEN OVERSCHREEF DE WOORDEN VAN DE KLANT.
--     ad_account_withdrawals heeft ÉÉN reason-kolom en twee schrijvers.
--     De klant zet daar neer waaróm hij geld terugvraagt; de functie
--     doet bij afwijzen:
--
--         set status = 'rejected', reason = coalesce(p_reason, reason)
--
--     Dus: met een reden wordt de zin van de klant overschreven — die is
--     weg, en met hem de enige vastlegging van wat hij vroeg. ZONDER
--     reden blijft zijn eigen zin staan, en krijgt hij zijn eigen
--     woorden terug alsof wij ze geschreven hebben. Allebei fout, en de
--     tweede is de ergste: het ziet eruit als een antwoord.
--
--     Er komt een aparte kolom `decision_reason` voor ons antwoord.
--     `reason` blijft van de klant.
--
--  B  EEN AANVRAAG AFWIJZEN KON ZONDER REDEN.
--     ad_account_requests heeft wel een eigen `rejection_reason`, maar
--     niets dwingt hem af buiten het scherm om. Dezelfde trigger als op
--     de andere twee.
--
--  C  _withdrawal_within_the_account STAAT OPEN VOOR ANON.
--     Nagemeten: has_function_privilege('anon', ..., 'EXECUTE') = true.
--     De revoke-veger van plak 68 ving hem niet, want zijn naam begint
--     met een underscore en niet met wallet_/top_up_/ad_account_. Hij
--     rekent uit hoeveel er van een ad-account af mag — dat is een
--     saldo, en niemand die niet is ingelogd hoort het te kunnen vragen.
--
--  Plak alles in één keer. Onderaan komt ÉÉN tabel.
-- ════════════════════════════════════════════════════════════════════


-- ── A1. ONZE REDEN KRIJGT ZIJN EIGEN KOLOM ───────────────────────────
do $blk0$
begin
  alter table public.ad_account_withdrawals
    add column if not exists decision_reason text;
  insert into _plak values ('71', 1, 'een eigen kolom voor ons antwoord',
    'ad_account_withdrawals.decision_reason toegevoegd — reason blijft van de klant');
exception when others then
  insert into _plak values ('71', 1, 'een eigen kolom voor ons antwoord', 'MISLUKT: ' || sqlerrm);
end
$blk0$;

-- ── A2. DE FUNCTIE SCHRIJFT IN DE NIEUWE KOLOM ───────────────────────
--  Chirurgisch, op de tekst die NU draait: één regel vervangen, en
--  alleen als hij herkend wordt. Half aanpassen is erger dan niet.
do $blk1$
declare
  v_oid oid;
  v_def text;
  v_new text;
  v_sig text;
begin
  select p.oid,
         'public.' || quote_ident(p.proname) || '(' ||
           pg_get_function_identity_arguments(p.oid) || ')'
    into v_oid, v_sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'ad_account_withdrawal_reject'
   limit 1;

  if v_oid is null then
    insert into _plak values ('71', 2, 'de reden van de klant blijft staan', 'functie niet gevonden');
    return;
  end if;

  v_def := pg_get_functiondef(v_oid);

  if position('decision_reason' in v_def) > 0 then
    insert into _plak values ('71', 2, 'de reden van de klant blijft staan', 'stond al goed');
    return;
  end if;

  -- De functies staan hier met CRLF, dus zoeken op witruimte die alles
  -- toelaat.
  v_new := regexp_replace(
    v_def,
    'reason[[:space:]]*=[[:space:]]*coalesce\(p_reason,[[:space:]]*reason\)',
    'decision_reason = nullif(btrim(coalesce(p_reason, '''')), '''')',
    'gi');

  if v_new = v_def then
    insert into _plak values ('71', 2, 'de reden van de klant blijft staan',
      'NIET AANGEPAST (de regel niet herkend, niets veranderd)');
    return;
  end if;

  execute v_new;
  execute 'revoke all on function ' || v_sig || ' from public, anon';
  execute 'grant execute on function ' || v_sig || ' to authenticated, service_role';

  insert into _plak values ('71', 2, 'de reden van de klant blijft staan',
    'aangepast: ons antwoord gaat naar decision_reason, reason blijft van de klant');
exception when others then
  insert into _plak values ('71', 2, 'de reden van de klant blijft staan', 'MISLUKT: ' || sqlerrm);
end
$blk1$;

-- ── B. GEEN WEIGERING ZONDER REDEN, OOK HIER ─────────────────────────
--  Eén wachter, twee kolomnamen: de tabellen noemen hem verschillend.
create or replace function public._guard_rejection_needs_reason_col()
returns trigger
language plpgsql
set search_path to 'public'
as $blk2$
declare
  v_col text := tg_argv[0];
  v_val text;
  v_new jsonb := to_jsonb(new);
  v_old jsonb := to_jsonb(old);
begin
  if coalesce(v_new ->> 'status', '') <> 'rejected'
     or coalesce(v_old ->> 'status', '') = 'rejected' then
    return new;
  end if;

  v_val := v_new ->> v_col;
  if coalesce(btrim(coalesce(v_val, '')), '') = '' then
    raise exception 'een weigering heeft een reden nodig — de klant krijgt hem te zien'
      using errcode = '22023';
  end if;
  return new;
end;
$blk2$;

do $blk3$
declare
  r      record;
  v_done text := '';
begin
  for r in
    select * from (values
      ('ad_account_requests',    'rejection_reason'),
      ('ad_account_withdrawals', 'decision_reason')
    ) as t(tab, col)
  loop
    begin
      -- Alleen als de kolom er is: anders weigert de trigger elke
      -- afwijzing, en dat is erger dan de fout die hij moet stoppen.
      if not exists (
        select 1 from information_schema.columns
         where table_schema = 'public' and table_name = r.tab and column_name = r.col
      ) then
        v_done := v_done || r.tab || ': kolom ' || r.col || ' bestaat niet, overgeslagen · ';
        continue;
      end if;

      execute format('drop trigger if exists a1_guard_rejection_needs_reason on public.%I', r.tab);
      execute format('create trigger a1_guard_rejection_needs_reason
                        before update on public.%I
                        for each row execute function public._guard_rejection_needs_reason_col(%L)',
                     r.tab, r.col);
      v_done := v_done || r.tab || ' (' || r.col || ') · ';
    exception when others then
      v_done := v_done || r.tab || ' MISLUKT (' || sqlerrm || ') · ';
    end;
  end loop;

  insert into _plak values ('71', 3, 'weigering zonder reden', rtrim(v_done, ' ·'));
end
$blk3$;

-- ── C. EEN SALDO IS NIET VOOR ANON ───────────────────────────────────
do $blk4$
declare
  r      record;
  v_n    int := 0;
  v_done text := '';
begin
  for r in
    select 'public.' || quote_ident(p.proname) || '(' ||
             pg_get_function_identity_arguments(p.oid) || ')' as sig,
           p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       and p.pronargs > 0
       and has_function_privilege('anon', p.oid, 'EXECUTE')
       and p.proname like '\_%'
  loop
    begin
      -- Intrekken van PUBLIC en dan teruggeven aan authenticated.
      -- Alleen `from anon` helpt niet (anon erft van PUBLIC), en
      -- alleen intrekken breekt RLS: een policy die _require_profile
      -- of _is_super_admin_of aanroept draait als de LEZER, niet als
      -- de eigenaar van de functie.
      execute 'revoke all on function ' || r.sig || ' from public, anon';
      execute 'grant execute on function ' || r.sig || ' to authenticated, service_role';
      v_n := v_n + 1;
      v_done := v_done || r.proname || ' · ';
    exception when others then
      v_done := v_done || r.proname || ' MISLUKT · ';
    end;
  end loop;

  insert into _plak values ('71', 4, 'interne functies die anon mocht aanroepen',
    case when v_n = 0 then 'er stond er geen meer open'
         else v_n::text || ' ingetrokken: ' || rtrim(v_done, ' ·') end);
end
$blk4$;

-- ── D. WAT ER NU STAAT (alleen lezen) ────────────────────────────────
do $blk5$
declare v_txt text;
begin
  begin
    select coalesce(string_agg(c.relname, ' · ' order by c.relname), 'geen')
      into v_txt
      from pg_trigger t join pg_class c on c.oid = t.tgrelid
     where not t.tgisinternal and t.tgname = 'a1_guard_rejection_needs_reason';
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _plak values ('71', 5, 'tabellen die een reden eisen', v_txt);

  begin
    select coalesce(string_agg(p.proname, ' · ' order by p.proname), 'geen')
      into v_txt
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f' and p.pronargs > 0
       and has_function_privilege('anon', p.oid, 'EXECUTE')
       and p.proname not in ('get_invite_by_token');
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _plak values ('71', 6, 'functies die anon nog mag aanroepen',
    coalesce(nullif(v_txt, 'geen'), 'geen — alleen get_invite_by_token blijft bewust open'));

  begin
    select coalesce(count(*)::text, '0') ||
           ' afgewezen opnames zonder eigen antwoord van ons'
      into v_txt
      from public.ad_account_withdrawals w
     where lower(coalesce(w.status, '')) = 'rejected'
       and coalesce(btrim(coalesce(w.decision_reason, '')), '') = '';
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _plak values ('71', 7, 'oude afwijzingen', v_txt);
end
$blk5$;


-- ####################################################################
-- ##  PLAK 69
-- ####################################################################

-- ════════════════════════════════════════════════════════════════════
--  PLAK 69 — reis F1 (de affiliate), gevonden met vier brillen tegelijk
--
--  VIER GELDFOUTEN EN TWEE POORTEN. Geen van alle is vandaag zichtbaar:
--  de twee echte affiliates hebben samen 0 commissies. Alle vier komen
--  binnen bereik zodra er één binnenkomt, en drie ervan laten het scherm
--  een ander bedrag noemen dan de server uitkeert.
--
--  A  "NOG AAN JOU VERSCHULDIGD" TELDE MEE WAT AL GEVRAAGD IS.
--     affiliate_referral_stats filtert unpaid_* alleen op
--     status = 'unpaid', terwijl affiliate_payout_request ÉN op
--     payout_id is null filtert. Een commissie die al in een lopende
--     aanvraag vastzit houdt status 'unpaid' — dus:
--
--       EUR 500 openstaand, affiliate vraagt uitbetaling aan.
--       Er komt EUR 200 bij.
--       De wallet leest "Still owed to you EUR 700,00"
--         en eronder "Requested 23 sep: EUR 500,00".
--
--     EUR 1.200 aan aanspraak op EUR 700 aan commissie. De wachtrij van
--     de eigenaar toont EUR 500. Bij de volgende aanvraag geeft de
--     server EUR 200 terug terwijl de kaart nog 700 zei.
--
--  B  "LIFETIME EARNED" VERLOOR GELD DAT AL VERREKEND WAS.
--     Dezelfde clawback-lateral wordt van earnings_* én unpaid_*
--     afgetrokken. Voor wat je nog krijgt is dat juist; voor wat je ooit
--     verdiende niet: een terugdraaiing die al van een BETAALDE
--     uitbetaling is afgetrokken, drukt de levenslange verdienste voor
--     altijd omlaag. EUR 1.000 verdiend, EUR 200 teruggedraaid en
--     verrekend: de portal zegt EUR 1.000, het boek van de eigenaar
--     EUR 800. De portal heeft ongelijk — die 200 is teruggekomen. En
--     het duwt de tier: op een drempel van 1.000 staat er "Riser" boven
--     EUR 800 aan echte verdienste.
--
--  C  DE VLOER PER LINK LIET GELD VERDWIJNEN TUSSEN ZIN EN KNOP.
--     unpaid_* wordt per referral afgekapt met greatest(...,0), dus een
--     clawback die groter is dan wat er op DIE link nog open staat valt
--     stil weg. affiliate_payout_request verrekent over het hele boek en
--     laat hem niet vallen:
--
--       Link A: EUR 100 verdiend en al uitbetaald, daarna EUR 100
--               teruggedraaid  ->  greatest(0 - 100, 0) = 0
--       Link B: EUR 400 open
--       Scherm: "Still owed to you: EUR 400,00"
--       Knop  : de server schrijft EUR 300,00
--
--     EUR 100 verdwijnt tussen de zin en de knop ernaast. De vloer gaat
--     eraf en de clawback-set wordt dezelfde als die van de RPC
--     (payout_id is null).
--
--  D  "UW UITBETALING IS ONDERWEG" NOEMDE HET GEVRAAGDE BEDRAG.
--     affiliate_payout_decide rekent v_settled uit — wat er werkelijk
--     verrekend is, nadat teruggedraaide commissies zijn losgemaakt — en
--     schrijft het verschil netjes in `reason` voor de eigenaar. Het
--     BERICHT aan de affiliate droeg v_row.amount. EUR 800 gevraagd,
--     EUR 50 teruggedraaid, EUR 750 overgemaakt: het scherm van de
--     affiliate zegt EUR 800,00.
--
--  E  IEDERE TENANTGENOOT LAS DE HELE PRIJSLIJST.
--     ad_account_types_read test alleen "je zit in deze tenant" — geen
--     rol, geen is_active. Een affiliate leest daarmee elke
--     default_fee_pct én api_topup_enabled, dus welke families via de
--     API van de leverancier lopen. Geen leveranciersnaam en geen
--     kostprijs in die tabel, maar het is onze prijs- en
--     automatiseringskaart.
--
--  F  ÉÉN RIJ CONTROLEREN, EEN GROEP BIJWERKEN.
--     affiliate_payout_cancel controleert eigendom op de aangesproken
--     rij en werkt daarna de hele groep bij zonder dat predicaat. Vandaag
--     onbereikbaar (group_id is per aanvraag een nieuwe uuid en geen
--     enkele groep overspant twee affiliates — nagemeten), dus dit is
--     diepteverdediging, geen open gat.
--
--  Plak alles in één keer. Onderaan komt ÉÉN tabel.
-- ════════════════════════════════════════════════════════════════════


-- ── A+B+C. WAT JE NOG KRIJGT, EN WAT JE OOIT VERDIENDE ───────────────
create or replace function public.affiliate_referral_stats(
  p_from timestamp with time zone default null::timestamp with time zone,
  p_to   timestamp with time zone default null::timestamp with time zone)
returns table(referral_link_id uuid, referred_advertiser_id uuid, referred_advertiser_name text,
              referred_advertiser_email text, referred_advertiser_code text, commission_type text,
              commission_pct numeric, commission_currency text, spend_usd numeric, spend_eur numeric,
              topup_count integer, earnings_usd numeric, earnings_eur numeric,
              unpaid_usd numeric, unpaid_eur numeric, link_status text)
language plpgsql
security definer
set search_path to 'public'
as $blk0$
declare
  v_uid uuid := auth.uid();
  v_aff uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  select a.id into v_aff
    from public.advertisers a
   where a.user_id = v_uid
   order by a.created_at desc
   limit 1;
  if v_aff is null then
    return;
  end if;

  return query
  select
    d.id, d.referred_advertiser_id, d.referred_advertiser_name::text,
    regexp_replace(d.referred_advertiser_email::text, '^(.)[^@]*@', '\1***@'),
    d.referred_advertiser_tenant_client_code::text,
    null::text, null::numeric, null::text,
    coalesce(sp.spend_usd, 0)::numeric, coalesce(sp.spend_eur, 0)::numeric,
    coalesce(sp.topup_count, 0)::int,
    -- B: wat je OOIT verdiende trekt ELKE terugdraaiing af, ook een die
    --    al van een betaalde uitbetaling is afgehaald -> cba, niet cb.
    greatest(coalesce(ea.earn_usd, 0) - coalesce(cba.usd, 0), 0)::numeric,
    greatest(coalesce(ea.earn_eur, 0) - coalesce(cba.eur, 0), 0)::numeric,
    -- C: geen vloer per link. De som over de links moet gelijk zijn aan
    --    wat affiliate_payout_request over het hele boek berekent, en
    --    die kapt niet per referral af.
    (coalesce(ea.unpaid_usd, 0) - coalesce(cb.usd, 0))::numeric,
    (coalesce(ea.unpaid_eur, 0) - coalesce(cb.eur, 0))::numeric,
    coalesce(rl.status, 'active')::text
  from public.referral_links_with_details d
  join public.referral_links rl on rl.id = d.id
  left join lateral (
    select
      sum(t.topup_amount) filter (where t.topup_usd is null
                                     or upper(coalesce(t.currency, 'EUR')) = 'USD') as spend_usd,
      sum(t.topup_amount) filter (where t.topup_usd is not null
                                     and upper(coalesce(t.currency, 'EUR')) = 'EUR') as spend_eur,
      count(*) as topup_count
    from public.top_ups t
    where t.advertiser_id = d.referred_advertiser_id
      and t.tenant_id = d.tenant_id
      and t.status = 'completed'
      and coalesce(t.is_deleted, false) = false
      and (p_from is null or coalesce(t.verified_at, t.created_at) >= p_from)
      and (p_to   is null or coalesce(t.verified_at, t.created_at) <= p_to)
  ) sp on true
  left join lateral (
    select
      sum(rc.amount) filter (where upper(rc.currency) = 'USD' and coalesce(rc.status, 'unpaid') in ('unpaid', 'paid')) as earn_usd,
      sum(rc.amount) filter (where upper(rc.currency) = 'EUR' and coalesce(rc.status, 'unpaid') in ('unpaid', 'paid')) as earn_eur,
      -- A: een commissie die al in een lopende aanvraag vastzit is niet
      --    meer vrij om te vragen. Dat is precies de test die
      --    affiliate_payout_request zelf doet.
      sum(rc.amount) filter (where upper(rc.currency) = 'USD' and coalesce(rc.status, 'unpaid') = 'unpaid'
                               and rc.payout_id is null) as unpaid_usd,
      sum(rc.amount) filter (where upper(rc.currency) = 'EUR' and coalesce(rc.status, 'unpaid') = 'unpaid'
                               and rc.payout_id is null) as unpaid_eur
    from public.referral_commissions rc
    where rc.referral_link_id = d.id
      and (p_from is null or rc.created_at >= p_from)
      and (p_to   is null or rc.created_at <= p_to)
  ) ea on true
  -- cb: de terugdraaiingen die NOG NERGENS aan hangen. Dezelfde set als
  --     affiliate_payout_request gebruikt, dus scherm en server komen op
  --     hetzelfde uit.
  left join lateral (
    select sum(c.amount) filter (where upper(c.currency) = 'USD') as usd,
           sum(c.amount) filter (where upper(c.currency) = 'EUR') as eur
      from public.referral_clawbacks c
     where c.referral_link_id = d.id
       and c.payout_id is null
       and (p_from is null or c.created_at >= p_from)
       and (p_to   is null or c.created_at <= p_to)
  ) cb on true
  -- cba: ALLE terugdraaiingen, voor de levenslange verdienste.
  left join lateral (
    select sum(c.amount) filter (where upper(c.currency) = 'USD') as usd,
           sum(c.amount) filter (where upper(c.currency) = 'EUR') as eur
      from public.referral_clawbacks c
     where c.referral_link_id = d.id
       and (p_from is null or c.created_at >= p_from)
       and (p_to   is null or c.created_at <= p_to)
  ) cba on true
  where d.affiliate_advertiser_id = v_aff
    and coalesce(rl.status, 'active') in ('active', 'pending')
  order by d.referred_advertiser_name nulls last;
end;
$blk0$;

-- Een nieuwe functie krijgt van Postgres uitvoerrecht voor PUBLIC — dus
-- ook voor anon. Intrekken hoort in HETZELFDE blok als de create.
do $blk1$
begin
  execute 'revoke all on function public.affiliate_referral_stats(timestamptz, timestamptz) from public, anon';
  execute 'grant execute on function public.affiliate_referral_stats(timestamptz, timestamptz) to authenticated, service_role';
  insert into _plak values ('69', 1, 'wat je nog krijgt / ooit verdiende',
    'aangepast: al gevraagde commissie telt niet meer mee, levenslang verliest geen verrekende clawback, en de vloer per link is eraf');
exception when others then
  insert into _plak values ('69', 1, 'wat je nog krijgt / ooit verdiende', 'MISLUKT: ' || sqlerrm);
end
$blk1$;

-- ── D. HET BERICHT NOEMT WAT ER IS OVERGEMAAKT ───────────────────────
do $blk2$
declare
  v_def text;
  v_new text;
  v_oid oid;
begin
  select p.oid into v_oid
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'affiliate_payout_decide'
   limit 1;

  if v_oid is null then
    insert into _plak values ('69', 2, 'bericht bij een betaalde uitbetaling', 'functie niet gevonden');
    return;
  end if;

  v_def := pg_get_functiondef(v_oid);

  if position('''amount'', v_settled' in v_def) > 0 then
    insert into _plak values ('69', 2, 'bericht bij een betaalde uitbetaling', 'stond al goed');
    return;
  end if;

  -- Alleen de regel in de notificatie-insert, herkenbaar aan het
  -- payout_id dat er direct voor staat. De andere v_row.amount-plekken
  -- (de reason-tekst) blijven staan: die MOETEN het gevraagde bedrag
  -- noemen, dat is juist het verschil dat ze uitleggen.
  v_new := replace(v_def,
    '''payout_id'', v_row.id, ''amount'', v_row.amount',
    '''payout_id'', v_row.id, ''amount'', v_settled');

  if v_new = v_def then
    insert into _plak values ('69', 2, 'bericht bij een betaalde uitbetaling',
      'NIET AANGEPAST (de regel niet herkend, niets veranderd)');
    return;
  end if;

  execute v_new;
  execute 'revoke all on function public.affiliate_payout_decide(uuid, text, text, text) from public, anon';
  execute 'grant execute on function public.affiliate_payout_decide(uuid, text, text, text) to authenticated, service_role';
  insert into _plak values ('69', 2, 'bericht bij een betaalde uitbetaling',
    'aangepast: het bericht noemt nu wat er werkelijk verrekend is');
exception when others then
  insert into _plak values ('69', 2, 'bericht bij een betaalde uitbetaling', 'MISLUKT: ' || sqlerrm);
end
$blk2$;

-- ── E. DE PRIJSLIJST IS NIET VOOR IEDEREEN IN DE TENANT ──────────────
do $blk3$
begin
  execute 'drop policy if exists ad_account_types_read on public.ad_account_types';
  execute $pol$
    create policy ad_account_types_read on public.ad_account_types
      for select to authenticated
      using (
        exists (
          select 1 from public.user_profiles up
           where up.user_id   = auth.uid()
             and up.tenant_id = ad_account_types.tenant_id
             and lower(coalesce(up.role, '')) in ('advertiser', 'admin')
             and coalesce(up.is_active, true)
             and lower(coalesce(up.status, 'active')) <> 'inactive'
        )
      )
  $pol$;
  insert into _plak values ('69', 3, 'wie leest de ad-account-types',
    'alleen een ACTIEVE advertiser of admin in dezelfde tenant — een affiliate en een gedeactiveerd account niet meer');
exception when others then
  insert into _plak values ('69', 3, 'wie leest de ad-account-types', 'MISLUKT: ' || sqlerrm);
end
$blk3$;

-- ── F. WAT JE MAG INTREKKEN IS WAT VAN JOU IS ────────────────────────
create or replace function public.affiliate_payout_cancel(p_payout_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $blk4$
declare
  v_uid   uuid := auth.uid();
  v_row   public.affiliate_payouts;
  v_group uuid;
begin
  if v_uid is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;

  select p.* into v_row
    from public.affiliate_payouts p
    join public.advertisers a on a.id = p.affiliate_advertiser_id
   where p.id = p_payout_id and a.user_id = v_uid
   for update of p;

  if v_row.id is null then
    raise exception 'Payout not found' using errcode = 'P0002';
  end if;
  if v_row.status <> 'requested' then
    raise exception 'This payout has already been answered' using errcode = '42501';
  end if;

  v_group := coalesce(v_row.group_id, v_row.id);

  -- Alles hieronder draagt nu OOK affiliate_advertiser_id. Het eigendom
  -- werd op één rij getest en de schrijfactie raakte een verzameling.
  update public.referral_commissions rc
     set payout_id = null
    from public.affiliate_payouts p
   where p.id = rc.payout_id
     and coalesce(p.group_id, p.id) = v_group
     and p.affiliate_advertiser_id = v_row.affiliate_advertiser_id;

  update public.referral_clawbacks cb
     set payout_id = null
    from public.affiliate_payouts p
   where p.id = cb.payout_id
     and coalesce(p.group_id, p.id) = v_group
     and p.affiliate_advertiser_id = v_row.affiliate_advertiser_id;

  update public.affiliate_payouts
     set status = 'cancelled', decided_at = now()
   where coalesce(group_id, id) = v_group
     and status = 'requested'
     and affiliate_advertiser_id = v_row.affiliate_advertiser_id;

  return jsonb_build_object('ok', true);
end;
$blk4$;

do $blk5$
begin
  execute 'revoke all on function public.affiliate_payout_cancel(uuid) from public, anon';
  execute 'grant execute on function public.affiliate_payout_cancel(uuid) to authenticated, service_role';
  insert into _plak values ('69', 4, 'een aanvraag intrekken',
    'de drie groepsbrede updates dragen nu het affiliate-predicaat; anon mag hem niet meer aanroepen');
exception when others then
  insert into _plak values ('69', 4, 'een aanvraag intrekken', 'MISLUKT: ' || sqlerrm);
end
$blk5$;

-- ── G. WAT ER NU STAAT (alleen lezen) ────────────────────────────────
do $blk6$
declare v_txt text;
begin
  begin
    select case
             when pg_get_functiondef(p.oid) ilike '%rc.payout_id is null%'
              and pg_get_functiondef(p.oid) ilike '%) cba on true%'
             then 'goed: al gevraagde commissie eruit, levenslang compleet'
             else 'LET OP: nog de oude vorm' end
      into v_txt
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'affiliate_referral_stats'
     limit 1;
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _plak values ('69', 5, 'controle op affiliate_referral_stats', coalesce(v_txt, 'niet gevonden'));

  begin
    select coalesce(string_agg(p.proname, ' · ' order by p.proname), 'geen')
      into v_txt
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f' and p.pronargs > 0
       and has_function_privilege('anon', p.oid, 'EXECUTE')
       and (p.proname like 'affiliate\_%' or p.proname like 'referral\_%');
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _plak values ('69', 6, 'affiliate-functies die anon nog mag aanroepen',
    coalesce(nullif(v_txt, 'geen'), 'geen'));

  begin
    select coalesce(count(*)::text, '0') || ' commissies zitten in een lopende aanvraag'
      into v_txt
      from public.referral_commissions rc
      join public.affiliate_payouts p on p.id = rc.payout_id
     where p.status = 'requested';
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _plak values ('69', 7, 'is er al iets misgegaan', v_txt);
end
$blk6$;


-- ####################################################################
-- ##  PLAK 70
-- ####################################################################

-- ════════════════════════════════════════════════════════════════════
--  PLAK 70 — waar komt die elf cent vandaan
--
--  DE VRAAG VAN DE EIGENAAR (23-09): "hier meer details, hoeveel topup
--  er is gedaan, zeer klein subtiel, en hoeveel fee we hebben geind, en
--  als we evt ook 2% supplier fee hebben maar dan moet er staan 'the fee
--  we pay' ofzo, en dan de berekening — dus zeer klein subtiel, 11 cent
--  uitkomen."
--
--  DE HELE BEREKENING BESTAAT AL, maar op het ADMIN-scherm. Ga naar
--  /affiliates, open een affiliate, en elke commissieregel draagt daar:
--
--      "20% of profit €0.53 (fee €3.00 − supplier 2% = €2.45)"
--
--  Dat staat in components/affiliate/affiliates-book.tsx (calcLine).
--  Daar hoort hij ook, en alleen daar.
--
--  WAAROM NIET OP HET SCHERM VAN DE KLANT OF DE AFFILIATE. De regel die
--  in CLAUDE.md staat en die de eigenaar zelf gegeven heeft: de
--  leveranciersfee en onze marge komen nooit in beeld bij een klant of
--  een affiliate — "niet in de UI, niet in een mail, niet op een factuur,
--  en niet in de JSON achter de pagina". En het is niet genoeg om alleen
--  de leverancier weg te laten: commissie = 20% × (fee − leverancier).
--  Wie de commissie ziet én het percentage ziet, rekent de winst uit; wie
--  daarbij de fee kent — en de klant kent zijn eigen fee, die staat op
--  zijn factuur — heeft de inkoopprijs. Twee onschuldige velden naast
--  elkaar zijn samen de marge.
--
--  WAT ER WÉL BIJ KAN, EN WAT DIT BLOK DOET. Het bedrag waar de
--  commissie op slaat: de storting zelf, of de factuur bij een
--  abonnement. Dat is het eigen bedrag van de verwezen klant, de
--  affiliate ziet de som ervan al als "Spend driven", en er zit geen
--  fee, geen percentage en geen inkoop in. Daarmee leest de regel
--  straks:
--
--      F2 Walkthrough
--      22 sep 2026 · Top-up · Meta · PSM0007 · op €97,00        €0,11
--
--  Genoeg om te zien waar hij vandaan komt, zonder te zeggen wat wij
--  eraan verdienen.
--
--  Plak alles in één keer. Onderaan komt ÉÉN tabel.
-- ════════════════════════════════════════════════════════════════════


drop function if exists public.affiliate_commission_list(timestamptz, timestamptz);

create function public.affiliate_commission_list(
  p_from timestamptz default null,
  p_to   timestamptz default null)
returns table (
  commission_id uuid,
  created_at timestamptz,
  referral_link_id uuid,
  referred_advertiser_code text,
  referred_advertiser_name text,
  kind text,
  amount numeric,
  currency text,
  status text,
  network text,
  -- NIEUW: het bedrag waar de commissie op slaat. De storting, of de
  -- factuur bij een abonnement. Nooit de winst (rc.base_amount), nooit
  -- het percentage, nooit de inkoop.
  source_amount numeric)
language plpgsql
stable
security definer
set search_path to 'public'
as $blk0$
declare
  v_uid uuid := auth.uid();
  v_aff uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select a.id into v_aff
    from public.advertisers a
   where a.user_id = v_uid
   order by a.created_at desc
   limit 1;
  if v_aff is null then
    return;
  end if;

  return query
  select
    rc.id,
    rc.created_at,
    rc.referral_link_id,
    ra.tenant_client_code::text,
    rup.full_name::text,
    coalesce(rc.source,
             case when rc.type = 'onetime' then 'onetime'
                  when rc.subscription_invoice_id is not null then 'subscription'
                  else 'topup' end)::text,
    case when rc.status = 'on_hold' then null else rc.amount end,
    upper(coalesce(rc.currency, 'EUR'))::text,
    case coalesce(rc.status, 'unpaid')
      when 'paid' then 'paid'
      when 'on_hold' then 'processing'
      when 'reversed' then 'reversed'
      else 'owed' end::text,
    -- Het netwerk, nooit het type.
    case
      when lower(coalesce(x.platform, '')) ~ '(meta|facebook)' then 'Meta'
      when lower(coalesce(x.platform, '')) ~ '(google|gdn|youtube)' then 'Google'
      when lower(coalesce(x.platform, '')) ~ 'tiktok' then 'TikTok'
      else null
    end::text,
    -- De storting zelf, of de factuur. Een eenmalige bonus hangt aan
    -- niets, die blijft leeg in plaats van 0 te tonen.
    case
      when rc.topup_id is not null then t.topup_amount
      when rc.subscription_invoice_id is not null then i.amount
      else null
    end::numeric
  from public.referral_commissions rc
  join public.referral_links rl on rl.id = rc.referral_link_id
  left join public.advertisers ra on ra.id = rl.referred_advertiser_id
  left join public.user_profiles rup on rup.id = ra.profile_id
  left join public.top_ups t on t.id = rc.topup_id
  left join public.ad_accounts x on x.id = t.account_id
  left join public.invoices i on i.id = rc.subscription_invoice_id
  where rl.affiliate_advertiser_id = v_aff
    and (p_from is null or rc.created_at >= p_from)
    and (p_to   is null or rc.created_at <= p_to)
  order by rc.created_at desc;
end;
$blk0$;

-- Een nieuwe functie krijgt van Postgres uitvoerrecht voor PUBLIC — dus
-- ook voor anon. Intrekken hoort in HETZELFDE blok als de create.
do $blk1$
begin
  execute 'revoke all on function public.affiliate_commission_list(timestamptz, timestamptz) from public, anon';
  execute 'grant execute on function public.affiliate_commission_list(timestamptz, timestamptz) to authenticated, service_role';
  insert into _plak values ('70', 1, 'affiliate_commission_list',
    'opnieuw aangemaakt met source_amount (de storting of de factuur); geen fee, geen percentage, geen inkoop');
exception when others then
  insert into _plak values ('70', 1, 'affiliate_commission_list', 'MISLUKT: ' || sqlerrm);
end
$blk1$;

-- ── WAT ER NU STAAT (alleen lezen) ───────────────────────────────────
do $blk2$
declare v_txt text;
begin
  begin
    select case when pg_get_functiondef(p.oid) ilike '%base_amount%'
                  or pg_get_functiondef(p.oid) ilike '%supplier_cost%'
                  or pg_get_functiondef(p.oid) ilike '%rc.pct%'
                then 'LET OP: er staat een margeveld in'
                else 'goed: geen winst, geen percentage, geen inkoop' end
      into v_txt
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'affiliate_commission_list'
     limit 1;
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _plak values ('70', 2, 'lekt de lijst onze marge', coalesce(v_txt, 'functie niet gevonden'));

  begin
    select coalesce(string_agg(
             coalesce(ra.tenant_client_code, '?') || ': ' ||
             coalesce(to_char(rc.amount, 'FM999G990D00'), '-') || ' ' ||
             upper(coalesce(rc.currency, 'EUR')) || ' op ' ||
             coalesce(to_char(coalesce(t.topup_amount, i.amount), 'FM999G990D00'), 'niets'),
             ' · ' order by rc.created_at desc), 'geen commissies')
      into v_txt
      from public.referral_commissions rc
      join public.referral_links rl on rl.id = rc.referral_link_id
      left join public.advertisers ra on ra.id = rl.referred_advertiser_id
      left join public.top_ups t on t.id = rc.topup_id
      left join public.invoices i on i.id = rc.subscription_invoice_id;
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _plak values ('70', 3, 'wat de regels straks zeggen', v_txt);
end
$blk2$;


-- ####################################################################
-- ##  PLAK 73
-- ####################################################################

-- ════════════════════════════════════════════════════════════════════
--  PLAK 73 — elke bon van een storting staat in euro's, wat er ook
--             gecrediteerd is
--
--  NAGEMETEN OP LIVE:
--
--      select type, currency, count(*) from invoices group by 1,2;
--      ad_account_topup | (null) | 5
--      wallet_topup     | (null) | 3
--
--  Alle acht. Geen enkele bon die deze reis ooit heeft geproduceerd
--  draagt een valuta.
--
--  WAT ER GEBEURT. Twee triggers schrijven die bon als een admin op
--  Verify drukt: create_invoice_for_wallet_topup en
--  create_invoice_on_topup_completed. Allebei zetten de valuta netjes IN
--  de items-jsonb — en allebei laten de KOLOM invoices.currency leeg.
--  En invoiceCurrencyCode() (lib/pure-invoice-currency.ts) negeert
--  items[0] met opzet en geeft "EUR" terug bij NULL, omdat dat is wat
--  invoice_pay_from_wallet doet: upper(coalesce(v_inv.currency, 'EUR')).
--
--  Dus: een admin verifieert de openstaande storting van USD 100.
--  usd_balance gaat met 100,00 omhoog, wat klopt. De bon zegt total
--  100,00, currency NULL, items[0].currency 'USD'. En de facturenlijst
--  van de klant, de rij op /invoices en de twee bevestigingsvensters
--  printen alle vier € 100,00 voor een creditering van $ 100. Tot nu toe
--  waren alle acht toevallig euro's.
--
--  EN EEN BEDRAG DOOR EEN FLOAT. Allebei de triggers doen
--  v_amount::real voordat ze in numeric(14,2) schrijven. real is float4:
--  zeven significante cijfers. Een storting van EUR 131.072,55 wordt
--  131072,54 — één cent minder dan er gecrediteerd is, op de bon die de
--  klant bewaart. Plak 17 heeft precies dat weggehaald bij de
--  abonnementstrigger en deze twee overgeslagen.
--
--  WELKE VALUTA HOORT ERBIJ. Bij een wallet-storting: die van de
--  storting. Bij een ad-account-storting hangt het ervan af wie de rij
--  heeft ingediend — topup_usd is de scheidslijn die de hele app
--  gebruikt (lib/pure-topup-landed.ts): staat hij gevuld, dan is
--  topup_amount in `currency`; staat hij leeg, dan is het een adminrij
--  en zijn de kolommen dollars.
--
--  Onderaan staat de backfill voor de acht bonnen die er al zijn.
--
--  Plak alles in één keer. Onderaan komt ÉÉN tabel.
-- ════════════════════════════════════════════════════════════════════


-- ── A. DE BON VAN EEN WALLET-STORTING ────────────────────────────────
do $blk0$
begin
  execute $fn$
    create or replace function public.create_invoice_for_wallet_topup()
    returns trigger
    language plpgsql
    as $body$
    declare
      v_tenant_id  uuid;
      v_company_id uuid;
      v_amount     numeric;
      v_currency   varchar;
    begin
      v_amount   := coalesce(NEW.amount, 0);
      v_currency := upper(coalesce(NEW.currency, 'EUR'));

      select a.tenant_id into v_tenant_id
        from public.advertisers a where a.id = NEW.advertiser_id;
      select c.id into v_company_id
        from public.companies c where c.advertiser_id = NEW.advertiser_id limit 1;

      insert into public.invoices (
        tenant_id, company_id, items, sub_total, total, currency,
        advertiser_id, type, status, paid_at
      ) values (
        v_tenant_id, v_company_id,
        jsonb_build_array(jsonb_build_object(
          'name', 'Prepaid Service Balance',
          'quantity', v_amount, 'rate', 1, 'tax', 0,
          'amount', v_amount, 'currency', v_currency,
          'wallet_topup_reference_no', NEW.reference_no,
          'wallet_topup_id', NEW.id)),
        -- round(), niet ::real. real is float4 en gooit centen weg op een
        -- bedrag dat de klant bewaart.
        round(v_amount, 2), round(v_amount, 2),
        -- DE KOLOM, niet alleen de jsonb. invoiceCurrencyCode negeert
        -- items[0] met opzet, omdat invoice_pay_from_wallet dat ook doet.
        v_currency,
        NEW.advertiser_id, 'wallet_topup', 'paid', now()
      );
      return NEW;
    end
    $body$;
  $fn$;
  insert into _plak values ('73', 1, 'de bon van een wallet-storting',
    'draagt nu zijn eigen valuta, en het bedrag gaat niet meer door een float');
exception when others then
  insert into _plak values ('73', 1, 'de bon van een wallet-storting', 'MISLUKT: ' || sqlerrm);
end
$blk0$;

-- ── B. DE BON VAN EEN AD-ACCOUNT-STORTING ────────────────────────────
do $blk1$
begin
  execute $fn$
    create or replace function public.create_invoice_on_topup_completed()
    returns trigger
    language plpgsql
    as $body$
    declare
      v_tenant_id  uuid;
      v_company_id uuid;
      v_amount     numeric;
      v_currency   varchar;
    begin
      if OLD.status is distinct from 'pending'
         or NEW.status is distinct from 'completed' then
        return NEW;
      end if;

      v_amount := coalesce(NEW.topup_amount, 0);
      -- topup_amount is USD op een ADMIN-rij en de betaalvaluta op een rij
      -- die de klant zelf indiende. topup_usd is de scheidslijn die de
      -- hele app gebruikt (lib/pure-topup-landed.ts).
      v_currency := case
                      when NEW.topup_usd is not null
                        then upper(coalesce(NEW.currency, 'EUR'))
                      else 'USD'
                    end;

      select a.tenant_id into v_tenant_id
        from public.advertisers a where a.id = NEW.advertiser_id;
      select c.id into v_company_id
        from public.companies c where c.advertiser_id = NEW.advertiser_id limit 1;

      insert into public.invoices (
        tenant_id, company_id, items, sub_total, total, currency,
        advertiser_id, type, status, paid_at
      ) values (
        v_tenant_id, v_company_id,
        jsonb_build_array(jsonb_build_object(
          'name', 'Advertising Service Credit',
          'quantity', v_amount, 'rate', 1, 'tax', 0,
          'amount', v_amount, 'currency', v_currency,
          'topup_id', NEW.id)),
        round(v_amount, 2), round(v_amount, 2), v_currency,
        NEW.advertiser_id, 'ad_account_topup', 'paid', now()
      );
      return NEW;
    end
    $body$;
  $fn$;
  insert into _plak values ('73', 2, 'de bon van een ad-account-storting',
    'draagt nu zijn eigen valuta, bepaald op topup_usd, en geen float meer');
exception when others then
  insert into _plak values ('73', 2, 'de bon van een ad-account-storting', 'MISLUKT: ' || sqlerrm);
end
$blk1$;

-- ── C. EN DE ACHT BONNEN DIE ER AL STAAN ─────────────────────────────
do $blk2$
declare v_n int := 0;
begin
  update public.invoices i
     set currency = upper(coalesce(i.items -> 0 ->> 'currency', 'EUR'))
   where i.currency is null
     and i.type in ('wallet_topup', 'ad_account_topup');
  get diagnostics v_n = row_count;
  insert into _plak values ('73', 3, 'de bonnen die er al stonden',
    v_n::text || ' bijgewerkt uit hun eigen items-regel');
exception when others then
  insert into _plak values ('73', 3, 'de bonnen die er al stonden', 'MISLUKT: ' || sqlerrm);
end
$blk2$;

-- ── D. WAT ER NU STAAT (alleen lezen) ────────────────────────────────
do $blk3$
declare v_txt text;
begin
  begin
    select coalesce(string_agg(t || ': ' || c || ' x' || n::text, ' · ' order by t, c), 'geen')
      into v_txt
      from (
        select i.type as t, coalesce(i.currency, '(leeg)') as c, count(*) as n
          from public.invoices i
         where i.type in ('wallet_topup', 'ad_account_topup')
         group by 1, 2
      ) x;
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _plak values ('73', 4, 'valuta per soort bon', v_txt);

  begin
    select coalesce(count(*)::text, '0') || ' bonnen zonder valuta over de hele tabel'
      into v_txt
      from public.invoices where currency is null;
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _plak values ('73', 5, 'nog leeg', v_txt);

  begin
    select case when count(*) = 0 then 'geen'
                else count(*)::text || ' bonnen waarvan het totaal afwijkt van hun eigen regel' end
      into v_txt
      from public.invoices i
     where i.type in ('wallet_topup', 'ad_account_topup')
       and round(coalesce((i.items -> 0 ->> 'amount')::numeric, 0), 2)
           <> round(coalesce(i.total, 0), 2);
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _plak values ('73', 6, 'heeft de float al centen gekost', v_txt);
end
$blk3$;


-- ####################################################################
-- ##  PLAK 72
-- ####################################################################

-- ════════════════════════════════════════════════════════════════════
--  PLAK 72 — wat anon niet mag, en wat een oud-medewerker niet meer mag
--
--  DIT IS DE BELANGRIJKSTE VAN VANDAAG. De publiceerbare sleutel staat
--  in de paginabundel: die heeft iedereen die de site opent. Alles
--  hieronder is daarmee bereikbaar, zonder account en zonder inloggen.
--
--  NAGEMETEN: er is nog NIETS misbruikt. Elke beslissing op top_ups is
--  door de eigenaar genomen, geen enkel walletsaldo staat negatief, de
--  ene geweigerde storting klopt tot op de cent, admins.google_refresh_
--  token is leeg, en er staat geen vervalste logregel buiten de
--  demotenant. Maar een SELECT laat geen spoor na, dus "niet misbruikt"
--  geldt alleen voor wat je kunt zien.
--
--  A  rate_limit_prune STAAT OPEN VOOR ANON, EN HEEFT GEEN ONDERGRENS.
--     Zijn broer rate_limit_check is netjes ingetrokken; de functie die
--     de emmers WIST niet. Eén POST met p_older_than_seconds = -99999999
--     raakt elke rij: inlogpogingen, uitnodigingen, het aanmaken van
--     stortingen en de financiële rem in withdrawal-actions.ts staan
--     daarna allemaal weer op nul. In een lus draaien en de limiter telt
--     nooit meer tot iets. Het alarm in de cron leest dezelfde tabel, dus
--     dat valt ook stil.
--
--  B  public.admins HEEFT RLS UIT EN ANON HEEFT ER VOLLEDIG CRUD OP.
--     Er staan twee policies op — die doen NIETS zolang RLS uit staat.
--     De tabel is gebouwd om google_refresh_token te dragen: een
--     langlevend Google-token van de eigenaar. Vandaag leeg; de dag dat
--     Google gekoppeld wordt is het te laat. Niets in de code leest deze
--     tabel, dus intrekken kost niks.
--
--  C  EEN MEDEWERKER-ADMIN KAN SALDO UIT HET NIETS MAKEN.
--     _guard_top_ups_session_write legt zijn kolomlijst alleen op bij
--     UPDATE. Bij INSERT kijkt hij naar de tenant en verder niets — en
--     `wallet_debited` is een kolom die de aanroeper zet, geen feit dat
--     het systeem vaststelt. Dus: rij invoegen met wallet_debited = true
--     en status pending, dan top_up_admin_reject aanroepen, en
--     refund_wallet_on_topup_rejected zet EUR 10.000 in een wallet waar
--     niemand voor betaald heeft. De wachtrij toont een geweigerde
--     betaling, wat er volstrekt normaal uitziet. Zelfde vorm met
--     affiliate_id: rij invoegen, op completed zetten, en er staat
--     commissie op een storting die nooit is gedaan.
--
--  D  raise_integration_failure STAAT OPEN VOOR ANON. Die schrijft een
--     melding naar élke actieve admin van een tenant, met 500 tekens die
--     de aanroeper meegeeft — in dezelfde bel waar het geld wordt
--     goedgekeurd, in de eigen opmaak van de app.
--
--  E  DE LOGREGEL DIE DE EIGENAAR LEEST IS DOOR IEDEREEN TE SCHRIJVEN.
--     Policy logs_write_unchanged is `with check (true)`, en insert_log
--     schrijft de tenant die de AANROEPER meegeeft. Een adverteerder zet
--     er "WALLET_ADJUSTED" in met de profiel-id van de eigenaar erop, en
--     het activiteitenscherm toont een correctie die de eigenaar nooit
--     gemaakt heeft. audit_events zelf is wél dichtgetimmerd, dus het
--     forensische spoor overleeft — het scherm waar men naar kijkt niet.
--
--  F  TWEE GELD-RPC'S MISSEN DE STATUS-CONTROLE.
--     ad_account_request_reject_refund en wallet_precharge_cancel kijken
--     naar role en is_active, maar niet naar status <> 'inactive'. Elke
--     andere wachter in de app kijkt naar allebei. Een weggestuurde
--     medewerker die op status is uitgezet, wordt door elk scherm
--     geweigerd en kan via PostgREST nog steeds EUR 50 terugduwen in een
--     wallet of een voorschot intrekken.
--
--  G  IEDEREEN DIE INGELOGD IS LEEST ELKE TENANT.
--     tenants_signed_in_select is `auth.uid() is not null`. Dat geeft
--     naam, slug, eigenaar en status van elke andere tenant — en de
--     tenant-id's die D hierboven nodig heeft.
--
--  H  TWEE PRIJS-RPC'S ZIJN AAN TE ROEPEN ZONDER IN TE LOGGEN.
--     _effective_topup_fee_pct en _effective_subscription_amount geven,
--     met een adverteerder-id, precies het feepercentage en het
--     kortingsbedrag dat die klant betaalt.
--
--  Plak alles in één keer. Onderaan komt ÉÉN tabel.
-- ════════════════════════════════════════════════════════════════════


-- ── A. DE LIMIETEN WISSEN IS NIET VOOR IEDEREEN ──────────────────────
do $blk0$
begin
  execute $fn$
    create or replace function public.rate_limit_prune(p_older_than_seconds integer default 86400)
    returns integer
    language sql
    security definer
    set search_path to 'public'
    as $body$
      with deleted as (
        delete from public.rate_limit_buckets
         where window_start < clock_timestamp()
               -- Een ondergrens van een uur: een negatieve of piepkleine
               -- waarde wiste anders ALLES, inclusief de emmer van de
               -- aanroeper zelf.
               - make_interval(secs => greatest(coalesce(p_older_than_seconds, 86400), 3600))
         returning 1
      )
      select count(*)::integer from deleted;
    $body$;
  $fn$;
  execute 'revoke all on function public.rate_limit_prune(integer) from public, anon, authenticated';
  execute 'grant execute on function public.rate_limit_prune(integer) to service_role';
  insert into _plak values ('72', 1, 'de limieten wissen',
    'alleen service_role, en niet verder terug dan een uur');
exception when others then
  insert into _plak values ('72', 1, 'de limieten wissen', 'MISLUKT: ' || sqlerrm);
end
$blk0$;

-- ── B. public.admins ─────────────────────────────────────────────────
do $blk1$
begin
  execute 'alter table public.admins enable row level security';
  execute 'alter table public.admins force row level security';
  execute 'revoke all on table public.admins from anon, authenticated';
  execute 'grant select, insert, update, delete on table public.admins to service_role';
  insert into _plak values ('72', 2, 'de tabel met het Google-token',
    'RLS aan en geforceerd, anon en authenticated hebben er niets meer op');
exception when others then
  insert into _plak values ('72', 2, 'de tabel met het Google-token', 'MISLUKT: ' || sqlerrm);
end
$blk1$;

-- ── C. DRIE KOLOMMEN DIE EEN AANROEPER NIET ZET ──────────────────────
do $blk2$
declare v_done text := '';
begin
  begin
    execute 'revoke insert (wallet_debited, verified_at, affiliate_id),
                    update (wallet_debited, verified_at, affiliate_id)
               on table public.top_ups from anon, authenticated';
    v_done := 'top_ups: wallet_debited, verified_at, affiliate_id ingetrokken';
  exception when others then
    v_done := 'top_ups MISLUKT: ' || sqlerrm;
  end;
  insert into _plak values ('72', 3, 'saldo uit het niets', v_done);
end
$blk2$;

-- ── D. HET ALARM IS VOOR DE CRON ─────────────────────────────────────
do $blk3$
declare
  r      record;
  v_done text := '';
begin
  for r in
    select 'public.' || quote_ident(p.proname) || '(' ||
             pg_get_function_identity_arguments(p.oid) || ')' as sig, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('raise_integration_failure',
                         'audit_events_capture_monthly_stats',
                         'audit_events_archive_candidates')
  loop
    begin
      execute 'revoke all on function ' || r.sig || ' from public, anon, authenticated';
      execute 'grant execute on function ' || r.sig || ' to service_role';
      v_done := v_done || r.proname || ' · ';
    exception when others then
      v_done := v_done || r.proname || ' MISLUKT (' || sqlerrm || ') · ';
    end;
  end loop;
  insert into _plak values ('72', 4, 'alarm en onderhoud zijn voor de cron',
    case when v_done = '' then 'geen van de drie gevonden' else rtrim(v_done, ' ·') end);
end
$blk3$;

-- ── E. DE LOGREGEL DRAAGT DE TENANT VAN DE AANROEPER ─────────────────
do $blk4$
begin
  execute 'drop policy if exists "logs_write_unchanged" on public.logs';
  execute $pol$
    create policy logs_write_admin on public.logs
      for insert to authenticated
      with check (
        public._is_admin_of(tenant_id)
        and author_profile_id = public.get_current_profile_id()
      )
  $pol$;
  insert into _plak values ('72', 5, 'wie schrijft in het activiteitenlog',
    'alleen een admin van diezelfde tenant, en alleen onder zijn eigen profiel-id');
exception when others then
  insert into _plak values ('72', 5, 'wie schrijft in het activiteitenlog', 'MISLUKT: ' || sqlerrm);
end
$blk4$;

do $blk5$
begin
  execute $fn$
    create or replace function public.insert_log(
      p_action text, p_db_action text, p_table_name text,
      p_record_id uuid, p_data_snapshot jsonb, p_tenant_id uuid default null)
    returns void
    language plpgsql
    security definer
    set search_path to 'public'
    as $body$
    declare v_profile uuid; v_tenant uuid;
    begin
      select up.id, up.tenant_id into v_profile, v_tenant
        from public.user_profiles up
       where up.user_id = auth.uid()
         and up.role = 'admin'
         and coalesce(up.is_active, true)
         and coalesce(up.status, 'active') <> 'inactive'
       order by up.created_at asc
       limit 1;
      if v_profile is null then
        return;
      end if;
      -- De tenant is die van de AANROEPER, nooit die uit het bericht.
      insert into public.logs (author_profile_id, tenant_id, action, db_action,
                               table_name, reference_record_id, data_snapshot)
      values (v_profile, v_tenant, p_action, p_db_action,
              p_table_name, p_record_id, p_data_snapshot);
    end
    $body$;
  $fn$;
  execute 'revoke all on function public.insert_log(text, text, text, uuid, jsonb, uuid) from public, anon';
  execute 'grant execute on function public.insert_log(text, text, text, uuid, jsonb, uuid) to authenticated, service_role';
  insert into _plak values ('72', 6, 'insert_log',
    'schrijft de tenant en het profiel van de aanroeper; het argument p_tenant_id wordt genegeerd');
exception when others then
  insert into _plak values ('72', 6, 'insert_log', 'MISLUKT: ' || sqlerrm);
end
$blk5$;

-- ── F. UITGEZET IS UITGEZET ──────────────────────────────────────────
do $blk6$
declare
  r      record;
  v_def  text;
  v_new  text;
  v_sig  text;
  v_done text := '';
begin
  for r in
    select p.oid, p.proname,
           'public.' || quote_ident(p.proname) || '(' ||
             pg_get_function_identity_arguments(p.oid) || ')' as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('ad_account_request_reject_refund', 'wallet_precharge_cancel')
  loop
    begin
      v_def := pg_get_functiondef(r.oid);
      v_sig := r.sig;

      if position('up.status' in v_def) > 0 then
        v_done := v_done || r.proname || ': stond al goed · ';
        continue;
      end if;

      -- Alleen de regel die de admin opzoekt. Witruimte-tolerant, want
      -- de functies staan hier met CRLF.
      v_new := regexp_replace(
        v_def,
        'and[[:space:]]+coalesce\(up\.is_active,[[:space:]]*true\)',
        'and coalesce(up.is_active, true)' || chr(13) || chr(10) ||
        '     and coalesce(up.status, ''active'') <> ''inactive''',
        'gi');

      if v_new = v_def then
        v_done := v_done || r.proname || ': NIET AANGEPAST (regel niet herkend) · ';
        continue;
      end if;

      execute v_new;
      execute 'revoke all on function ' || v_sig || ' from public, anon';
      execute 'grant execute on function ' || v_sig || ' to authenticated, service_role';
      v_done := v_done || r.proname || ': aangepast · ';
    exception when others then
      v_done := v_done || r.proname || ' MISLUKT (' || sqlerrm || ') · ';
    end;
  end loop;

  insert into _plak values ('72', 7, 'een uitgezette admin',
    case when v_done = '' then 'geen van beide functies gevonden' else rtrim(v_done, ' ·') end);
end
$blk6$;

-- ── G. EEN TENANT IS VOOR ZIJN EIGEN MENSEN ──────────────────────────
do $blk7$
begin
  execute 'drop policy if exists tenants_signed_in_select on public.tenants';
  execute $pol$
    create policy tenants_member_select on public.tenants
      for select to authenticated
      using (
        exists (
          select 1 from public.user_profiles up
           where up.user_id = auth.uid() and up.tenant_id = tenants.id
        )
      )
  $pol$;
  insert into _plak values ('72', 8, 'wie leest een tenant',
    'alleen iemand met een profiel IN die tenant');
exception when others then
  insert into _plak values ('72', 8, 'wie leest een tenant', 'MISLUKT: ' || sqlerrm);
end
$blk7$;

-- ── H. EEN PRIJS VRAAG JE INGELOGD ───────────────────────────────────
do $blk8$
declare
  r      record;
  v_n    int := 0;
  v_done text := '';
begin
  for r in
    select 'public.' || quote_ident(p.proname) || '(' ||
             pg_get_function_identity_arguments(p.oid) || ')' as sig, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       and p.pronargs > 0
       and has_function_privilege('anon', p.oid, 'EXECUTE')
       -- get_invite_by_token MOET open: die draait op het aanmeldscherm,
       -- vóórdat iemand is ingelogd.
       and p.proname <> 'get_invite_by_token'
  loop
    begin
      -- INTREKKEN VAN PUBLIC, DAN TERUGGEVEN AAN authenticated. Alleen
      -- `from anon` helpt niet: anon erft van PUBLIC. En alleen
      -- intrekken breekt RLS, want een policy die _require_profile of
      -- is_admin_user aanroept draait als de LEZER, niet als de
      -- eigenaar van de functie — zonder EXECUTE geeft elke select op
      -- die tabel een fout.
      execute 'revoke all on function ' || r.sig || ' from public, anon';
      execute 'grant execute on function ' || r.sig || ' to authenticated, service_role';
      v_n := v_n + 1;
      v_done := v_done || r.proname || ' · ';
    exception when others then
      v_done := v_done || r.proname || ' MISLUKT · ';
    end;
  end loop;

  insert into _plak values ('72', 9, 'elke functie die anon nog mocht aanroepen',
    case when v_n = 0 then 'er stond er geen meer open'
         else v_n::text || ' ingetrokken: ' || rtrim(v_done, ' ·') end);
end
$blk8$;

-- ── I. EN DE LAATSTE TWEE WACHTRIJEN DIE ZONDER REDEN KONDEN ─────────
--  Plak 71 doet ad_account_requests en ad_account_withdrawals; deze twee
--  bewaren hun tekst in `reason`, dus ze hebben dezelfde wachter nodig
--  met een andere kolomnaam.
do $blk9$
declare
  r      record;
  v_done text := '';
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = '_guard_rejection_needs_reason_col'
  ) then
    insert into _plak values ('72', 10, 'weigering zonder reden',
      'OVERGESLAGEN — plak 71 moet eerst, die maakt de wachter');
    return;
  end if;

  for r in select unnest(array['wallet_refunds', 'wallet_adjustments']) as tab loop
    begin
      execute format('drop trigger if exists a1_guard_rejection_needs_reason on public.%I', r.tab);
      execute format('create trigger a1_guard_rejection_needs_reason
                        before update on public.%I
                        for each row execute function public._guard_rejection_needs_reason_col(%L)',
                     r.tab, 'reason');
      v_done := v_done || r.tab || ' · ';
    exception when others then
      v_done := v_done || r.tab || ' MISLUKT (' || sqlerrm || ') · ';
    end;
  end loop;

  insert into _plak values ('72', 10, 'weigering zonder reden', rtrim(v_done, ' ·'));
end
$blk9$;

-- ── J. WAT ER NU STAAT (alleen lezen) ────────────────────────────────
do $blk10$
declare v_txt text;
begin
  begin
    select coalesce(string_agg(p.proname, ' · ' order by p.proname), 'geen')
      into v_txt
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f' and p.pronargs > 0
       and has_function_privilege('anon', p.oid, 'EXECUTE');
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _plak values ('72', 11, 'functies die anon nog mag aanroepen',
    coalesce(nullif(v_txt, 'geen'), 'geen'));

  begin
    select coalesce(string_agg(c.relname || ' (' ||
             case when c.relrowsecurity then 'RLS aan' else 'RLS UIT' end || ')',
             ' · ' order by c.relname), 'geen')
      into v_txt
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
       and not c.relrowsecurity
       and has_table_privilege('anon', c.oid, 'SELECT');
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _plak values ('72', 12, 'tabellen zonder RLS die anon mag lezen', v_txt);

  begin
    select coalesce(count(*)::text, '0') || ' top_ups-rijen met wallet_debited = true'
      into v_txt
      from public.top_ups where wallet_debited = true;
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _plak values ('72', 13, 'is er al saldo uit het niets gemaakt', v_txt);

  begin
    select coalesce(count(*)::text, '0') || ' wallets met een negatief saldo'
      into v_txt
      from public.wallets
     where coalesce(eur_balance, 0) < 0 or coalesce(usd_balance, 0) < 0;
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _plak values ('72', 14, 'en klopt het saldo nog', v_txt);
end
$blk10$;

-- ════════════════════════════════════════════════════════════════════
--  ÉÉN TABEL, want de editor toont alleen de laatste resultaatset.
-- ════════════════════════════════════════════════════════════════════
select plak as "plak",
       nr   as "#",
       wat  as "wat",
       uitkomst as "uitkomst"
  from _plak
 order by case plak when '71' then 1 when '69' then 2 when '70' then 3
                    when '73' then 4 when '72' then 5 else 9 end, nr;
