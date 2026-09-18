-- =====================================================================
-- ALLES IN 1. Elke openstaande SQL uit de sweeps van vandaag.
-- =====================================================================
-- Plak dit hele bestand in de SQL editor en draai het in één keer.
--
-- REGELS WAAR DIT ZICH AAN HOUDT
--   * Veilig om twee keer te draaien. Elk deel kijkt eerst naar de
--     werkelijke toestand van de database en doet niets als het al goed
--     staat.
--   * Elk deel dat iets NIET zeker weet, WEIGERT en zegt het — in plaats
--     van te gokken. Een blok dat "already applied" meldt terwijl het
--     niets deed, is hoe drie fixes vandaag onzichtbaar verdwenen.
--   * Elke dollar-quote heeft een NAAM — de editor kan een bestand met
--     kale, gebalanceerde dollar-dollar alsnog weigeren.
--   * Alle leesvragen staan ACHTERAAN, zodat een mislukte SELECT nooit
--     een fix kan blokkeren.
--
-- WAT ER IN ZIT
--   DEEL 1  `logs` en `wallet_exchanges` hebben NERGENS row-level
--           security. Twee tabellen die iedere ingelogde gebruiker
--           mogelijk kan lezen; in de ene staan volledige voor/na-
--           snapshots van zakelijke tabellen plus namen en werkmails van
--           het personeel.
--   DEEL 2  Een GEDEACTIVEERDE admin houdt toegang tot elk bankbewijs in
--           de opslag — naam, IBAN, bedrag.
--   DEEL 3  get_invite_by_token geeft de HELE uitnodigingsrij aan een
--           anonieme beller: commissietarief, affiliate_id, maandprijs.
--   DEEL 4  De clawback pakt de OUDSTE referral-link, de accrual de
--           ACTIEVE — dus bij iemand met een afgewezen oude link wordt
--           er nul teruggehaald waar duizenden hoorden.
--   DEEL 5  advertiser_perks.amount is een percentage zonder enige
--           grens: -50 wordt een TOESLAG van 50%.
--   DEEL 6  Refunds en goedgekeurde correcties ontbreken op het
--           financieel rapport van de klant.
--   DEEL 7  De drie views die als eigenaar draaien (al toegepast —
--           staat erin zodat het ook een echte migratie is).
--   DEEL 8  rate_limit_check niet meer open voor anon (idem).
--   DEEL 9  affiliate_referral_stats geeft e-mailadressen van andermans
--           klanten door. WEIGERT als de vorm afwijkt.
--   DEEL 10 Een op PAUSE gezette abonnement wordt door de incasso weer
--           aangezet. WEIGERT als de vorm afwijkt.
--
-- DAARNA: alleen lezen. Die uitkomsten wil ik zien — er staan vijf
-- dingen tussen die ik niet kan beslissen zonder de echte data.
-- =====================================================================

set search_path = public;


-- =====================================================================
-- DEEL 1 — TWEE TABELLEN ZONDER ENIG SLOT
-- =====================================================================
-- Geen `enable row level security` en geen `create policy` voor `logs`
-- of `wallet_exchanges` in de hele supabase/ map. Beide worden vanuit de
-- BROWSER gelezen met de publieke anon-sleutel plus het token van de
-- ingelogde gebruiker, dus zonder policy beslist alleen de tabel zelf —
-- en die beslist niets.
--
--   logs               data_snapshot (volledige voor/na-kopieën van
--                      zakelijke rijen) + author -> full_name, email van
--                      ons personeel. Admin-materiaal.
--   wallet_exchanges   de volledige FX-geschiedenis van elke wallet.
--                      `.eq("wallet_id", ...)` is een filter dat de
--                      BELLER kiest, dus het beschermt niets.
--
-- Dit is kolom-bewust geschreven: als een tabel niet bestaat, of niet de
-- kolom heeft waar de policy op leunt, gebeurt er niets en zegt het dat.
-- RLS aanzetten zonder werkende policy zet het scherm van een admin op
-- zwart, dus het gaat in één blok: policy eerst, dan pas het slot.
do $blk1$
declare
  v_has_tenant boolean;
begin
  -- ── logs ──────────────────────────────────────────────────────────
  if to_regclass('public.logs') is null then
    raise notice 'DEEL 1: logs bestaat hier niet.';
  else
    select exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'logs'
         and column_name = 'tenant_id'
    ) into v_has_tenant;

    if not v_has_tenant then
      raise warning 'DEEL 1: logs heeft geen tenant_id - vertel me hoe die tabel eruitziet, ik gok er niet op.';
    else
      drop policy if exists logs_admin_read on public.logs;
      -- _is_admin_of is de gepatchte helper: admin VAN die tenant EN nog
      -- actief. Het activity-logs scherm filtert zelf al op tenant_id, dus
      -- een actieve admin merkt hier niets van.
      create policy logs_admin_read on public.logs
        for select to authenticated
        using (public._is_admin_of(tenant_id));

      -- ── EN SCHRIJVEN BLIJFT EXACT ZOALS HET WAS ───────────────────
      --
      -- Ik weet niet wat deze tabel vult. Hij staat in geen enkele
      -- migratie (hand-geschreven op live), en nergens in de app staat
      -- een insert erop — dus het is een trigger, of iets wat er ooit
      -- was. RLS aanzetten zonder insert-policy zou dat stilzwijgend
      -- blokkeren, en een audit-spoor dat stopt merk je pas als je het
      -- nodig hebt.
      --
      -- Dit deel gaat over LEZEN. Vandaag kan iedere ingelogde gebruiker
      -- hier ook in schrijven; die situatie laat ik precies zoals hij is
      -- in plaats van er twee dingen tegelijk aan te veranderen. Als de
      -- leesvraag straks laat zien wie de schrijver is, kan die policy
      -- daarna smal.
      drop policy if exists logs_write_unchanged on public.logs;
      create policy logs_write_unchanged on public.logs
        for insert to authenticated
        with check (true);

      alter table public.logs enable row level security;
      raise notice 'DEEL 1: logs is nu alleen LEESBAAR voor een actieve admin van die tenant (schrijven bewust ongewijzigd).';
    end if;
  end if;

  -- ── wallet_exchanges ──────────────────────────────────────────────
  if to_regclass('public.wallet_exchanges') is null then
    raise notice 'DEEL 1: wallet_exchanges bestaat hier niet.';
  else
    if not exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'wallet_exchanges'
         and column_name = 'wallet_id'
    ) then
      raise warning 'DEEL 1: wallet_exchanges heeft geen wallet_id - niets gedaan.';
    else
      select exists (
        select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'wallet_exchanges'
           and column_name = 'tenant_id'
      ) into v_has_tenant;

      drop policy if exists wallet_exchanges_read on public.wallet_exchanges;

      -- De klant leest z'n EIGEN wisselgeschiedenis, via de wallet naar de
      -- advertiser naar auth.uid(). De admin leest die van z'n tenant.
      -- Beide takken staan er, want de klant kwijtraken uit z'n eigen
      -- geschiedenis is net zo fout als de leak.
      if v_has_tenant then
        create policy wallet_exchanges_read on public.wallet_exchanges
          for select to authenticated
          using (
            public._is_admin_of(tenant_id)
            or exists (
              select 1
                from public.wallets w
                join public.advertisers a on a.id = w.advertiser_id
               where w.id = wallet_exchanges.wallet_id
                 and a.user_id = auth.uid()
            )
          );
      else
        create policy wallet_exchanges_read on public.wallet_exchanges
          for select to authenticated
          using (
            exists (
              select 1
                from public.wallets w
                join public.advertisers a on a.id = w.advertiser_id
               where w.id = wallet_exchanges.wallet_id
                 and a.user_id = auth.uid()
            )
            or exists (
              select 1
                from public.wallets w
               where w.id = wallet_exchanges.wallet_id
                 and public._is_admin_of(w.tenant_id)
            )
          );
      end if;

      alter table public.wallet_exchanges enable row level security;
      raise notice 'DEEL 1: wallet_exchanges is nu eigen-wallet of eigen-tenant.';
    end if;
  end if;

  -- Er is met opzet GEEN insert/update/delete policy. Schrijven gaat via
  -- SECURITY DEFINER RPCs (wallet_exchange, de audit trigger), en die
  -- gaan sowieso langs RLS heen. Een directe schrijfactie uit de browser
  -- hoort te weigeren.
end;
$blk1$;


-- =====================================================================
-- DEEL 2 — EEN GEDEACTIVEERDE ADMIN HOUDT ELK BANKBEWIJS
-- =====================================================================
-- 20260918140000 heeft 33 policies omgezet naar de helper die ook op
-- "nog actief" test. Alle 33 zitten op public.* tabellen.
-- storage.objects stond niet in die lijst, dus slip_admin_read test nog
-- steeds alleen op rol en tenant.
--
-- Gevolg: een admin die je vanmiddag hebt uitgezet, houdt een geldig JWT
-- en kan vanaf de browserconsole nog steeds
-- storage.from('wallet_payment_slips').createSignedUrl(...) doen — voor
-- elk betaalbewijs in de tenant: rekeninghouder, IBAN, bedrag.
-- payment-slip-actions.ts is hiervoor al gerepareerd; dat sluit de weg
-- via de app en niet die via de opslag.
do $blk2$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and policyname = 'slip_admin_read'
  ) then
    raise notice 'DEEL 2: slip_admin_read bestaat hier niet - overgeslagen.';
    return;
  end if;

  drop policy if exists slip_admin_read on storage.objects;
  create policy slip_admin_read on storage.objects
    for select to authenticated
    using (
      bucket_id = 'wallet_payment_slips'
      and exists (
        select 1
          from public.user_profiles up
         where up.user_id = auth.uid()
           and up.role = 'admin'
           -- DIT IS WAT ERBIJ KOMT. Precies de twee kolommen die
           -- _is_admin_of gebruikt; hier uitgeschreven omdat een policy
           -- in het storage-schema geen tenant-kolom naast zich heeft om
           -- de helper mee aan te roepen.
           and coalesce(up.is_active, true) = true
           and coalesce(up.status, 'active') <> 'inactive'
      )
    );
  raise notice 'DEEL 2: een uitgezette admin komt niet meer bij de bankbewijzen.';
exception when insufficient_privilege then
  raise warning 'DEEL 2: geen rechten op storage.objects vanuit deze sessie. Doe dit via Dashboard > Storage > Policies, of zeg het en ik schrijf het anders.';
end;
$blk2$;


-- =====================================================================
-- DEEL 3 — DE HELE UITNODIGING NAAR EEN ANONIEME BELLER
-- =====================================================================
-- get_invite_by_token doet `select to_jsonb(i) || ...`, dus het geeft
-- ELKE kolom van invitations terug aan iedereen die een uitnodigingslink
-- heeft — vóór registratie. Daar zit in:
--
--   commission_type, commission_rate, commission_amount, affiliate_id
--       wat wij een derde partij betalen voor deze doorverwijzing.
--       Onze kostprijs, bij de klant in de browser.
--   monthly_fee, topup_fee_pct, included_ad_accounts, plan_id
--       de prijsafspraak, vóórdat iemand ja heeft gezegd.
--   sender_id, token
--
-- De sign-up pagina leest er zes: email, expires_at, role, tenant_id,
-- tenant_name, affiliate_id. Dat is de lijst. affiliate_id blijft, want
-- het formulier gebruikt het om de "wil je ook affiliate worden?" vraag
-- te verbergen als het antwoord al bekend is — het is een id, geen
-- bedrag.
create or replace function public.get_invite_by_token(p_token text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $blk3$
  -- invitations.token is a uuid in the live DB; compare as text so the
  -- param stays a plain string and a malformed token simply won't match
  -- (instead of erroring on an invalid uuid cast).
  --
  -- NAMED FIELDS, NOT to_jsonb(i). See the header above: the row carries
  -- our commission cost and the price, and this is an anon-callable
  -- function whose whole audience is people who do not have an account
  -- yet.
  select jsonb_build_object(
           'id',           i.id,
           'email',        i.email,
           'role',         i.role,
           'tenant_id',    i.tenant_id,
           'affiliate_id', i.affiliate_id,
           'expires_at',   i.expires_at,
           'tenant_name',  t.name
         )
  from public.invitations i
  left join public.tenants t on t.id = i.tenant_id
  where i.token::text = p_token
  limit 1;
$blk3$;

revoke all on function public.get_invite_by_token(text) from public;
grant execute on function public.get_invite_by_token(text) to anon, authenticated;


-- =====================================================================
-- DEEL 4 — DE CLAWBACK PAKT DE VERKEERDE LINK
-- =====================================================================
-- De accrual-trigger die de commissie AANMAAKT filtert op
-- `coalesce(rl.status,'active') = 'active'`. De clawback die hem
-- TERUGHAALT doet `order by rl.created_at limit 1` zonder status-filter.
--
-- Dus: een adverteerder met een afgewezen link uit januari en een actieve
-- uit maart. Alle commissie is op de maart-link geboekt. Er komt een
-- refund; de clawback kiest de januari-link, vindt daar nul verdiend, en
-- haalt nul terug. Bij 3% over 100.000 euro is dat 1.200 euro die
-- blijft staan.
--
-- De vervanging is letterlijk de regel die de accrual al heeft.
do $blk4$
declare
  v_src text;
  v_new text;
  v_fn  text;
begin
  -- Welke functie het is, in plaats van de naam te gokken: pak degene die
  -- deze exacte regel bevat.
  select p.proname into v_fn
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname like '%referral%link%'
     and position('order by rl.created_at' in pg_get_functiondef(p.oid)) > 0
   limit 1;

  if v_fn is null then
    raise notice 'DEEL 4: geen functie gevonden met "order by rl.created_at" - kijk bij de leesvragen achteraan.';
    return;
  end if;

  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = v_fn
   limit 1;

  if position('coalesce(rl.status' in v_src) > 0 then
    raise notice 'DEEL 4: % filtert al op status - niets gedaan.', v_fn;
    return;
  end if;

  v_new := replace(
    v_src,
    'order by rl.created_at',
    'and coalesce(rl.status, ''active'') = ''active''
   order by rl.created_at desc'
  );

  if v_new = v_src then
    raise exception 'DEEL 4: replace raakte niets - ga er niet vanuit dat dit gelopen heeft.';
  end if;

  execute v_new;
  raise notice 'DEEL 4: % pakt nu de ACTIEVE link, nieuwste eerst - net als de accrual.', v_fn;
end;
$blk4$;


-- =====================================================================
-- DEEL 5 — EEN KORTING VAN -50% IS EEN TOESLAG
-- =====================================================================
-- advertiser_perks.amount is een percentage en heeft geen enkele grens.
-- grant_advertiser_perk controleert alleen p_kind. Toegepast als
-- `round(bedrag * (1 - least(korting,100)/100.0), 2)`:
--
--   iemand typt 0.2 waar hij 20% bedoelt  -> 200 wordt 199,60
--   iemand typt -50                       -> 200 wordt 300. Een toeslag.
--
-- `least(..., 100)` klemt alleen de bovenkant af. De onderkant ontbrak.
--
-- NOT VALID, met opzet: bestaande rijen worden niet gecontroleerd, dus
-- dit kan nooit stukgaan op data die er al staat. Wat er vanaf nu in
-- gaat, wordt wel gecontroleerd. De leesvraag achteraan laat zien of er
-- iets bestaands buiten de grens valt.
do $blk5$
begin
  if to_regclass('public.advertiser_perks') is null then
    raise notice 'DEEL 5: advertiser_perks bestaat hier niet.';
    return;
  end if;
  if exists (
    select 1 from pg_constraint
     where conrelid = 'public.advertiser_perks'::regclass
       and conname = 'advertiser_perks_amount_sane'
  ) then
    raise notice 'DEEL 5: de grens staat er al.';
    return;
  end if;

  alter table public.advertiser_perks
    add constraint advertiser_perks_amount_sane
    check (
      amount is null
      or kind not in ('topup_discount', 'subscription_discount')
      or (amount >= 0 and amount <= 100)
    ) not valid;

  raise notice 'DEEL 5: een kortingspercentage moet nu tussen 0 en 100 liggen.';
end;
$blk5$;


-- =====================================================================
-- DEEL 6 — REFUNDS EN CORRECTIES OP HET RAPPORT VAN DE KLANT
-- =====================================================================
-- (Dit is RUN-NOW-5.sql, hier nog een keer zodat alles in één bestand
-- staat. Twee keer draaien kan.)
--
-- wallet_refunds en wallet_adjustments zijn admin-only, en dat klopt voor
-- de TABEL: daar staat `reason` in (een interne notitie) plus de ids van
-- de twee medewerkers die de rij hebben aangemaakt en beoordeeld. Het
-- klopt niet voor de BEDRAGEN, want dat is het geld van de klant. Een
-- rapport dat ze weglaat telt op naar een getal waar de wallet het niet
-- mee eens is, en er kan 500 euro uit een wallet verdwijnen zonder dat
-- het ergens te zien is.
--
-- Dus een functie, geen policy: een policy is alles-of-niets per rij en
-- zou de notitie en de personeels-ids meegeven. Deze geeft zeven kolommen
-- en verder niets, en controleert zelf dat de advertiser van de beller
-- is. Alleen goedgekeurde rijen: een refund die nog in behandeling is, is
-- een admin die nog beslist, en die tonen belooft geld dat geweigerd kan
-- worden.
create or replace function public.my_wallet_extras(p_advertiser_id uuid)
returns table (
  kind       text,
  row_id     uuid,
  at         timestamptz,
  amount     numeric,
  currency   text,
  status     text,
  reference  text
)
language plpgsql
security definer
set search_path = public
as $blk6$
begin
  -- SECURITY DEFINER betekent dat RLS hier binnen uit staat, dus DEZE
  -- controle IS de beveiliging. auth.uid() is van de sessie, nooit iets
  -- dat de beller beweert. Iemand kan een advertiser-rij in meer dan één
  -- tenant hebben, dus dit vraagt of DEZE rij van hem is in plaats van er
  -- eentje te kiezen.
  if not exists (
    select 1 from public.advertisers a
     where a.id = p_advertiser_id and a.user_id = auth.uid()
  ) then
    raise exception 'Not your advertiser' using errcode = '42501';
  end if;

  if to_regclass('public.wallet_refunds') is not null then
    return query
      select 'refund'::text, r.id, r.created_at,
             -- De wallet uit, dus negatief vanuit de klant gezien. Het
             -- hele tekenafspraakje van het rapport is "+ binnen, - eruit".
             -abs(r.amount)::numeric,
             r.currency::text, r.status::text, r.reference::text
        from public.wallet_refunds r
       where r.advertiser_id = p_advertiser_id and r.status = 'approved';
  end if;

  if to_regclass('public.wallet_adjustments') is not null then
    return query
      select 'adjustment'::text, j.id, j.created_at,
             -- delta heeft z'n teken al: +50 erbij, -50 eraf.
             j.delta::numeric,
             j.currency::text, j.status::text, j.reference::text
        from public.wallet_adjustments j
       where j.advertiser_id = p_advertiser_id and j.status = 'approved';
  end if;
end;
$blk6$;

revoke execute on function public.my_wallet_extras(uuid) from public, anon;
grant  execute on function public.my_wallet_extras(uuid) to authenticated;


-- =====================================================================
-- DEEL 7 — DE DRIE VIEWS (al bevestigd; hier zodat het een migratie is)
-- =====================================================================
-- Een view draait met de rechten van de EIGENAAR tenzij je het anders
-- zegt, dus deze drie lazen hun brontabellen met row-level security UIT.
-- Jij hebt dit al toegepast (3 / 3 bevestigd). Het staat hier omdat de
-- fix tot nu toe alleen in supabase/checks/ stond — en wie ooit "plak de
-- migraties" doet, slaat die map over.
--
-- Draai NOOIT 20260918200000_money_to_numeric.sql uit een oudere kopie:
-- die bouwt deze views opnieuw op uit pg_get_viewdef, wat alleen de
-- SELECT teruggeeft, dus security_invoker EN de grants gaan er stil weer
-- af. De versie in de repo is gecorrigeerd.
do $blk7$
declare
  v_name text;
  v_kind "char";
begin
  foreach v_name in array array[
    'top_ups_view',
    'referral_links_with_details',
    'referral_commissions_with_details'
  ] loop
    select c.relkind into v_kind
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = v_name;

    if v_kind is null then
      raise notice 'DEEL 7: % bestaat hier niet.', v_name;
      continue;
    end if;
    if v_kind = 'm' then
      raise warning 'DEEL 7: % is een MATERIALIZED view - die gaat hier niet zo, zeg het.', v_name;
      continue;
    end if;
    if v_kind <> 'v' then
      raise warning 'DEEL 7: % is geen view (relkind %).', v_name, v_kind;
      continue;
    end if;

    execute format('alter view public.%I set (security_invoker = true)', v_name);
    execute format('grant select on public.%I to authenticated', v_name);
    raise notice 'DEEL 7: % leest als de beller.', v_name;
  end loop;
end;
$blk7$;


-- =====================================================================
-- DEEL 8 — rate_limit_check (al bevestigd; hier zodat het een migratie is)
-- =====================================================================
-- SECURITY DEFINER, uitgedeeld aan anon, en de bucket-sleutel komt van de
-- beller. Iedereen op internet kon daarmee een met naam genoemde klant
-- een uur lang uit z'n topups sluiten, en dat elk uur verlengen.
-- Elke echte aanroep in deze app is server-side.
do $blk8$
begin
  if to_regprocedure('public.rate_limit_check(text, integer, integer)') is null then
    raise notice 'DEEL 8: rate_limit_check niet gevonden met die handtekening.';
    return;
  end if;
  revoke execute on function public.rate_limit_check(text, integer, integer)
    from public, anon, authenticated;
  grant execute on function public.rate_limit_check(text, integer, integer)
    to service_role;
  raise notice 'DEEL 8: rate limiting is server-only.';
end;
$blk8$;


-- =====================================================================
-- DEEL 9 — HET E-MAILADRES VAN ANDERMANS KLANT
-- =====================================================================
-- affiliate_referral_stats is SECURITY DEFINER en uitgedeeld aan
-- `authenticated`, dus RLS kan niet bijsturen wat het teruggeeft — en het
-- declareert `referred_advertiser_email` in z'n returns-tabel. De hook die
-- het aanroept hangt in ZOWEL de affiliate-app als de adverteerder-app,
-- dus elke affiliate krijgt het e-mailadres van iedereen die zich onder
-- zijn code heeft aangemeld. Niets rendert het; de schermen tonen de naam
-- en de klantcode. Een referral-link is publiek deelbaar, dus dat zijn
-- niet per se mensen die ze ooit ontmoet hebben.
--
-- DIT WEIGERT LIEVER DAN DAT HET GOKT. De kolom moet uit ZOWEL de
-- handtekening als de select-lijst; een half doorgevoerde wijziging
-- compileert en valt pas om als iemand hem aanroept. Als de tekst er
-- anders uitziet dan verwacht, zegt het dat en doet het niets — en dan
-- staat het antwoord in de leesvraag achteraan.
do $blk9$
declare
  v_src  text;
  v_new  text;
  v_sig  text;
  v_hits int;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'affiliate_referral_stats'
   limit 1;

  if v_src is null then
    raise notice 'DEEL 9: affiliate_referral_stats bestaat hier niet.';
    return;
  end if;
  if position('referred_advertiser_email' in v_src) = 0 then
    raise notice 'DEEL 9: de e-mailkolom zit er al niet meer in.';
    return;
  end if;

  -- Hoe vaak komt hij voor. Bij precies twee (returns-tabel + select)
  -- is de vorm die van de migratie en durf ik het. Bij iets anders niet.
  select count(*) into v_hits
    from regexp_split_to_table(v_src, E'\n') l
   where l like '%referred_advertiser_email%';

  if v_hits <> 2 then
    raise warning 'DEEL 9: referred_advertiser_email staat op % regels in plaats van 2 - niets gedaan. Zie de leesvraag onderaan, dan doe ik het exact.', v_hits;
    return;
  end if;

  -- Regel voor regel, want de twee regels zien er niet hetzelfde uit: in
  -- de returns-tabel staat er een type achter, in de select een bron.
  select string_agg(x.l, E'\n' order by x.rn) into v_new
    from (
      select row_number() over () as rn, l
        from regexp_split_to_table(v_src, E'\n') l
    ) x
   where x.l not like '%referred_advertiser_email%';

  if v_new is null or v_new = v_src then
    raise exception 'DEEL 9: er is niets weggehaald - ga er niet vanuit dat dit gelopen heeft.';
  end if;

  -- ── DROP, DAN CREATE, IN ÉÉN SUBTRANSACTIE ───────────────────────
  --
  -- `create or replace` kan het RETURN TYPE van een bestaande functie
  -- niet wijzigen — en dat is precies wat hier verandert, want de kolom
  -- staat in de returns-tabel. Postgres weigert dat met "cannot change
  -- return type of existing function". Dus eerst weg, dan opnieuw.
  --
  -- Het gevaar daarvan is duidelijk: als het opnieuw aanmaken misgaat —
  -- een komma te veel omdat de kolom toevallig de laatste in de lijst
  -- was — is de functie WEG en is het affiliate-dashboard stuk. Daarom
  -- staat het in een begin/exception blok: dat is een subtransactie, dus
  -- een fout draait ook de DROP terug. Er blijft dan staan wat er stond.
  begin
    select p.oid::regprocedure::text into v_sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'affiliate_referral_stats'
     limit 1;

    execute format('drop function if exists %s', v_sig);
    execute v_new;
    execute format('grant execute on function %s to authenticated',
                   (select p.oid::regprocedure::text
                      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname='public' and p.proname='affiliate_referral_stats'
                     limit 1));
    raise notice 'DEEL 9: het e-mailadres gaat niet meer mee.';
  exception when others then
    raise warning 'DEEL 9: herschrijven mislukt (%). De oude functie staat er nog precies zoals hij was - zie leesvraag G onderaan, dan doe ik het exact.', sqlerrm;
  end;
exception when others then
  raise warning 'DEEL 9: niets gewijzigd (%). Zie leesvraag G onderaan.', sqlerrm;
end;
$blk9$;


-- =====================================================================
-- DEEL 10 — "PAUSE" HOUDT NIET
-- =====================================================================
-- Toen 'inactive' werd toegevoegd aan de statussen die de facturatie
-- overslaat, is 'paused' op drie plekken blijven liggen. Gevolg: je zet
-- een abonnement op pauze, de nachtelijke incasso ziet een status die
-- niet in haar lijstje staat, zet hem weer actief en schrijft af. De
-- klant heeft niets gemerkt en betaalt door.
--
-- Weigert ook liever dan dat het gokt.
do $blk10$
declare
  r      record;
  v_src  text;
  v_new  text;
  v_done int := 0;
begin
  for r in
    select p.oid, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and pg_get_functiondef(p.oid) like '%''inactive''%'
       and pg_get_functiondef(p.oid) ilike '%subscription%'
  loop
    v_src := pg_get_functiondef(r.oid);

    -- Al gedaan?
    if position('''paused''' in v_src) > 0 then
      continue;
    end if;

    -- Alleen de vorm die ik herken: een lijstje met 'inactive' erin.
    v_new := replace(v_src, '''cancelled'', ''inactive''', '''cancelled'', ''inactive'', ''paused''');
    if v_new = v_src then
      v_new := replace(v_src, '''inactive'', ''cancelled''', '''inactive'', ''cancelled'', ''paused''');
    end if;
    if v_new = v_src then
      v_new := replace(v_src, 'in (''inactive'')', 'in (''inactive'', ''paused'')');
    end if;

    if v_new = v_src then
      raise warning 'DEEL 10: % noemt inactive maar niet in een vorm die ik herken - met de hand, of vraag het me.', r.proname;
      continue;
    end if;

    execute v_new;
    v_done := v_done + 1;
    raise notice 'DEEL 10: % slaat een gepauzeerd abonnement nu over.', r.proname;
  end loop;

  if v_done = 0 then
    raise notice 'DEEL 10: niets gewijzigd - zie de leesvraag onderaan voor wat er wel staat.';
  end if;
end;
$blk10$;


-- =====================================================================
-- ALLES IN ÉÉN RIJ — dit is de regel die ik wil zien
-- =====================================================================
select
  (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname in ('logs','wallet_exchanges')
      and c.relrowsecurity)                                    as d1_rls_on_of_2,
  exists (
    select 1 from pg_policies
     where schemaname='storage' and tablename='objects'
       and policyname='slip_admin_read'
       and qual like '%is_active%')                            as d2_slips_closed,
  (select position('jsonb_build_object' in pg_get_functiondef(p.oid)) > 0
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='get_invite_by_token' limit 1)
                                                               as d3_invite_narrowed,
  exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public'
       and pg_get_functiondef(p.oid) like '%coalesce(rl.status%'
       and pg_get_functiondef(p.oid) like '%clawback%')        as d4_clawback_active_link,
  exists (
    select 1 from pg_constraint
     where conname='advertiser_perks_amount_sane')             as d5_perk_bounded,
  (to_regprocedure('public.my_wallet_extras(uuid)') is not null)
                                                               as d6_report_extras,
  (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='v'
      and c.relname in ('top_ups_view','referral_links_with_details','referral_commissions_with_details')
      and coalesce((select option_value::boolean from pg_options_to_table(c.reloptions)
                     where option_name='security_invoker'), false))
                                                               as d7_views_of_3,
  not exists (
    select 1 from information_schema.routine_privileges
     where specific_schema='public' and routine_name='rate_limit_check'
       and grantee in ('anon','authenticated'))                as d8_ratelimit_closed,
  (select position('referred_advertiser_email' in pg_get_functiondef(p.oid)) = 0
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='affiliate_referral_stats' limit 1)
                                                               as d9_email_gone;


-- =====================================================================
-- =====================================================================
--   VANAF HIER WORDT ER ALLEEN GELEZEN.
--   Deze antwoorden heb ik nodig; er zitten dingen tussen die ik niet
--   kan beslissen zonder de echte data.
-- =====================================================================
-- =====================================================================

-- ── A. Is er iets misgegaan met een clawback op een terugboeking? ─────
-- De clawback vuurt op een ad-account WITHDRAWAL. Maar een withdrawal
-- crediteert de WALLET — het geld gaat van de advertentierekening naar de
-- portemonnee en blijft bij ons. De regel in dat bestand zegt "a customer
-- who gets 40% of their money BACK". Hier krijgt niemand iets terug, en
-- de affiliate raakt z'n commissie kwijt. Vijf keer heen en weer en z'n
-- hele verdienste is weg terwijl wij alles nog hebben.
--
-- Dit is een beslissing van jou, geen bug die ik kan wegschrijven. Dit
-- laat zien of het al gebeurd is.
select
  c.id,
  c.created_at::date            as op,
  c.amount,
  c.currency,
  c.reason
  from public.referral_clawbacks c
 order by c.created_at desc
 limit 25;

-- ── B. Staat er geld in een `real` kolom? ─────────────────────────────
-- money_to_numeric zet 14 kolommen om. wallet_topups.amount zit er NIET
-- bij, terwijl de balans-trigger letterlijk `usd_balance + new.amount`
-- doet. Als die kolom float is, erft elke bijschrijving de afrondfout —
-- en `round(new.amount * pct / 100.0, 2)` wordt dan round(double, int),
-- een functie die niet bestaat, wat de procentuele commissie stil laat
-- mislukken.
select
  c.table_name,
  c.column_name,
  c.data_type
  from information_schema.columns c
 where c.table_schema = 'public'
   and c.data_type in ('real', 'double precision')
   and (
     c.column_name in ('amount','delta','outstanding','balance','total',
                       'usd_balance','eur_balance','commission_pct',
                       'fee','fee_amount','topup_amount','amount_usd')
     or c.table_name like 'wallet%'
     or c.table_name like '%topup%'
     or c.table_name like 'referral%'
   )
 order by c.table_name, c.column_name;

-- ── C. Staat er nog een niet-USD withdrawal open? ─────────────────────
-- De AANVRAAG is gerepareerd (die dwingt USD af, met een lange uitleg
-- over een heen-en-weer van +13,95%). De GOEDKEURING controleert niets
-- opnieuw, en de RPC crediteert in de valuta van de rij, één op één. Een
-- oude rij van vóór die fix betaalt bij goedkeuring dus nog steeds tegen
-- de verkeerde koers uit.
select
  w.id,
  w.created_at::date  as aangevraagd,
  w.amount,
  w.currency,
  w.status
  from public.ad_account_withdrawals w
 where w.status = 'pending'
   and upper(coalesce(w.currency, 'USD')) <> 'USD'
 order by w.created_at;

-- ── D. Twee verschillende betekenissen van "fee percent" ──────────────
-- fee_defaults.fee_pct is een BREUK (check <= 1). Alle andere
-- fee-percentages zijn HELE procenten. Niets in SQL rekent ertussen om.
-- Op 10.000 dollar bij 2%: 0,02 gelezen als hele procenten geeft 2 dollar;
-- 2 gelezen als breuk geeft 20.000 dollar.
select
  'fee_defaults.fee_pct'   as waar,
  min(fee_pct)             as laagste,
  max(fee_pct)             as hoogste,
  count(*)                 as rijen
  from public.fee_defaults
union all
select 'plans.topup_fee_pct', min(topup_fee_pct), max(topup_fee_pct), count(*)
  from public.plans
union all
select 'advertiser_plans.topup_fee_pct', min(topup_fee_pct), max(topup_fee_pct), count(*)
  from public.advertiser_plans;

-- ── E. De jaarplan-weigering staat in de verkeerde tak ────────────────
-- De regel "yearly terms are not refunded" is vastgeplakt aan een zin die
-- alleen voorkomt in de tak ZONDER betaalde factuur. De terugbetaling
-- zelf zit in de tak ERBOVEN, met de betaalde factuur. Dus de weigering
-- kan niet draaien, en de controle van die migratie kijkt alleen of de
-- zin ergens in de functie staat — en meldt dus "true".
--
-- Nu nog geen risico: alles is maandelijks. Wel vóórdat iemand op een
-- jaartermijn gaat.
with src as (
  select pg_get_functiondef(p.oid) as def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'change_subscription_amount'
   limit 1
),
lines as (
  select row_number() over () as ln, l as line
    from src, regexp_split_to_table(src.def, E'\n') as l
)
select ln, line
  from lines
 where line ilike '%yearly%'
    or line ilike '%refund%'
    or line ilike '%status = ''paid''%'
    or line like '%else%'
 order by ln;

-- ── F. De terugbetaling van een abonnement pakt geen slot ─────────────
-- Elke andere geldfunctie doet `for update` op de wallet voordat hij een
-- ondergrens controleert. Deze niet, en de bescherming tegen te veel
-- terugbetalen leest een rij terug die een VORIGE aanroep geschreven
-- heeft. Twee keer klikken betaalt twee keer uit.
select
  position('for update' in pg_get_functiondef(p.oid)) > 0 as heeft_slot,
  p.proname
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('change_subscription_amount',
                     'wallet_refund_approve',
                     'wallet_adjustment_approve',
                     'invoice_pay_from_wallet',
                     'top_up_admin_verify',
                     'wallet_exchange')
 order by 1, 2;

-- ── G. affiliate_referral_stats, als DEEL 9 het niet durfde ───────────
with src as (
  select pg_get_functiondef(p.oid) as def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'affiliate_referral_stats'
   limit 1
),
lines as (
  select row_number() over () as ln, l as line
    from src, regexp_split_to_table(src.def, E'\n') as l
)
select ln, line
  from lines
 where line ilike '%email%'
 order by ln;

-- ── H. Wat noemt "inactive" maar niet "paused" ────────────────────────
select
  p.proname,
  position('''paused''' in pg_get_functiondef(p.oid)) > 0 as kent_paused
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and pg_get_functiondef(p.oid) like '%''inactive''%'
 order by 2, 1;

-- ── I. Staan de testaccounts nog open op productie? ───────────────────
-- Er zijn accounts geseed op @primescalemedia.test met een wachtwoord dat
-- in de repo staat. Als hier rijen uitkomen — en zeker als er eentje
-- eigenaar van een tenant is — dan is dat een wachtwoord dat iedereen met
-- toegang tot de code kan lezen.
select
  u.email,
  u.email_confirmed_at is not null as bevestigd,
  u.last_sign_in_at
  from auth.users u
 where u.email like '%@primescalemedia.test'
 order by u.email;

-- ── J. Betaalde commissies die weer op onbetaald zijn gezet ───────────
-- referral_commissions heeft geen paid_at en geen uitbetalingsreferentie,
-- dus als een betaalde rij terug naar unpaid gaat, staat er nergens dat
-- het geld al weg is. De volgende uitbetaalronde betaalt hem nog een keer.
-- De code-kant krijgt een slot; dit laat zien of het al gebeurd is.
select
  status,
  count(*)     as rijen,
  sum(amount)  as totaal,
  currency
  from public.referral_commissions
 group by status, currency
 order by status, currency;
