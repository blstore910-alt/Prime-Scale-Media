-- =====================================================================
-- ALLES-IN-1-V2. Vervangt ALLES-IN-1.sql EN ALLES-IN-2.sql.
-- =====================================================================
-- Gooi die twee weg. Dit is een bestand, plak het in z'n geheel.
--
-- WAT ER MIS WAS. pg_get_functiondef() GOOIT een fout zodra hij een
-- aggregate tegenkomt ("array_agg is an aggregate function"), en Postgres
-- mag die aanroep uitvoeren VOORDAT hij de nspname-filter toepast. Drie
-- blokken zoeken zo een functie op, dus die liepen er alle drie op stuk —
-- en omdat een fout in een DO-blok het hele bestand afbreekt, kwam er
-- daarna niets meer doorheen.
--
-- Hier is dat op drie manieren dichtgezet:
--   1. _fndef_safe() vangt de fout af en geeft lege tekst terug
--   2. elke zoekopdracht filtert eerst op prokind = 'f'
--   3. ELK DEEL heeft z'n eigen exception-handler, dus een deel dat
--      faalt geeft een WAARSCHUWING en rolt alleen zichzelf terug
--
-- Verder zoals altijd: veilig om twee keer te draaien, elk deel kijkt
-- eerst, elk deel dat de vorm niet herkent weigert en zegt het, en alle
-- leesvragen staan achteraan zodat een mislukte SELECT nooit een fix kan
-- blokkeren.
--
-- Onderaan staat een regel met ja/nee-kolommen. Die wil ik zien, plus de
-- leesvragen eronder.
-- =====================================================================

set search_path = public;

-- pg_get_functiondef gooit op een aggregate, op een window-functie en op
-- sommige interne C-functies. Elke zoekopdracht hieronder gaat hierdoor.
-- Wordt aan het eind weer opgeruimd.
create or replace function public._fndef_safe(p_oid oid)
returns text
language plpgsql
stable
as $fnsafe$
begin
  return pg_get_functiondef(p_oid);
exception when others then
  return '';
end;
$fnsafe$;


-- =====================================================================
-- A1 — logs en wallet_exchanges hebben NERGENS row-level security
-- =====================================================================
-- Geen `enable row level security` en geen policy voor die twee in de
-- hele supabase/ map. Beide worden vanuit de BROWSER gelezen met de
-- publieke anon-sleutel plus het token van de ingelogde gebruiker, dus
-- zonder policy beslist alleen de tabel zelf — en die beslist niets.
--
--   logs               data_snapshot = volledige voor/na-kopieen van
--                      zakelijke rijen, plus namen en werkmails van ons
--                      personeel. Admin-materiaal.
--   wallet_exchanges   de FX-geschiedenis van elke wallet.
--                      `.eq("wallet_id", ...)` is een filter dat de
--                      BELLER kiest, dus het beschermt niets.
--
-- Policy eerst, dan pas het slot: RLS aanzetten zonder werkende policy
-- zet het scherm van een admin op zwart.
do $a1$
declare
  v_has_tenant boolean;
begin
  if to_regprocedure('public._is_admin_of(uuid)') is null then
    raise warning 'A1: _is_admin_of bestaat hier niet - overgeslagen, anders zet ik schermen op zwart.';
    return;
  end if;

  if to_regclass('public.logs') is null then
    raise notice 'A1: logs bestaat hier niet.';
  else
    select exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'logs'
         and column_name = 'tenant_id'
    ) into v_has_tenant;

    if not v_has_tenant then
      raise warning 'A1: logs heeft geen tenant_id - niets gedaan, zie leesvraag F.';
    else
      drop policy if exists logs_admin_read on public.logs;
      create policy logs_admin_read on public.logs
        for select to authenticated
        using (public._is_admin_of(tenant_id));

      -- SCHRIJVEN BLIJFT EXACT ZOALS HET WAS. Ik weet niet wat deze tabel
      -- vult - hij staat in geen migratie en nergens in de app staat een
      -- insert erop, dus het is een trigger of iets van vroeger. RLS
      -- aanzetten zonder insert-policy zou dat stil blokkeren, en een
      -- audit-spoor dat stopt merk je pas als je het nodig hebt.
      drop policy if exists logs_write_unchanged on public.logs;
      create policy logs_write_unchanged on public.logs
        for insert to authenticated
        with check (true);

      alter table public.logs enable row level security;
      raise notice 'A1: logs is nu alleen LEESBAAR voor een actieve admin van die tenant.';
    end if;
  end if;

  if to_regclass('public.wallet_exchanges') is null then
    raise notice 'A1: wallet_exchanges bestaat hier niet.';
  elsif not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'wallet_exchanges'
       and column_name = 'wallet_id'
  ) then
    raise warning 'A1: wallet_exchanges heeft geen wallet_id - niets gedaan.';
  else
    select exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'wallet_exchanges'
         and column_name = 'tenant_id'
    ) into v_has_tenant;

    drop policy if exists wallet_exchanges_read on public.wallet_exchanges;

    -- De klant leest z'n EIGEN wisselgeschiedenis, via de wallet naar de
    -- advertiser naar auth.uid(). De admin die van z'n tenant. Beide
    -- takken, want de klant kwijtraken uit z'n eigen geschiedenis is net
    -- zo fout als de leak.
    if v_has_tenant then
      create policy wallet_exchanges_read on public.wallet_exchanges
        for select to authenticated
        using (
          public._is_admin_of(tenant_id)
          or exists (
            select 1 from public.wallets w
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
            select 1 from public.wallets w
              join public.advertisers a on a.id = w.advertiser_id
             where w.id = wallet_exchanges.wallet_id
               and a.user_id = auth.uid()
          )
          or exists (
            select 1 from public.wallets w
             where w.id = wallet_exchanges.wallet_id
               and public._is_admin_of(w.tenant_id)
          )
        );
    end if;

    alter table public.wallet_exchanges enable row level security;
    raise notice 'A1: wallet_exchanges is nu eigen-wallet of eigen-tenant.';
  end if;
exception when others then
  raise warning 'A1 MISLUKT (%) - niets gewijzigd in dit deel. De rest loopt door.', sqlerrm;
end;
$a1$;


-- =====================================================================
-- A2 — een UITGEZETTE admin houdt elk bankbewijs in de opslag
-- =====================================================================
-- 20260918140000 heeft 33 policies omgezet naar de helper die ook op "nog
-- actief" test. Alle 33 zitten op public.* tabellen. storage.objects
-- stond niet in die lijst, dus slip_admin_read test nog steeds alleen op
-- rol en tenant. Een admin die je vanmiddag hebt uitgezet houdt een
-- geldig JWT en kan vanaf de browserconsole nog een signed URL maken voor
-- elk betaalbewijs in de tenant: rekeninghouder, IBAN, bedrag.
do $a2$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and policyname = 'slip_admin_read'
  ) then
    raise notice 'A2: slip_admin_read bestaat hier niet - overgeslagen.';
    return;
  end if;

  drop policy if exists slip_admin_read on storage.objects;
  create policy slip_admin_read on storage.objects
    for select to authenticated
    using (
      bucket_id = 'wallet_payment_slips'
      and exists (
        select 1 from public.user_profiles up
         where up.user_id = auth.uid()
           and up.role = 'admin'
           -- Dit komt erbij. Precies de twee kolommen die _is_admin_of
           -- gebruikt; hier uitgeschreven omdat een policy in het
           -- storage-schema geen tenant-kolom naast zich heeft.
           and coalesce(up.is_active, true) = true
           and coalesce(up.status, 'active') <> 'inactive'
      )
    );
  raise notice 'A2: een uitgezette admin komt niet meer bij de bankbewijzen.';
exception when others then
  raise warning 'A2 MISLUKT (%) - waarschijnlijk geen rechten op storage.objects vanuit deze sessie. Doe het dan via Dashboard > Storage > Policies.', sqlerrm;
end;
$a2$;


-- =====================================================================
-- A3 — de hele uitnodiging naar een ANONIEME beller
-- =====================================================================
-- get_invite_by_token doet `select to_jsonb(i) || ...`, dus het geeft
-- ELKE kolom van invitations terug aan iedereen die een uitnodigingslink
-- heeft, voor registratie. Daar zit in: commission_type,
-- commission_rate, commission_amount, affiliate_id (wat wij een derde
-- partij betalen voor deze doorverwijzing - onze kostprijs), plus
-- monthly_fee, topup_fee_pct, included_ad_accounts, plan_id, sender_id
-- en token.
--
-- De sign-up pagina leest er zes. Dat is de lijst.
do $a3$
begin
  if to_regprocedure('public.get_invite_by_token(text)') is null then
    raise notice 'A3: get_invite_by_token bestaat hier niet.';
    return;
  end if;

  execute $ddl$
    create or replace function public.get_invite_by_token(p_token text)
    returns jsonb
    language sql
    security definer
    set search_path = public
    stable
    as $body$
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
    $body$;
  $ddl$;

  revoke all on function public.get_invite_by_token(text) from public;
  grant execute on function public.get_invite_by_token(text) to anon, authenticated;
  raise notice 'A3: de uitnodiging geeft nog zeven velden terug, geen commissie en geen prijs.';
exception when others then
  raise warning 'A3 MISLUKT (%) - de oude functie staat er nog precies zoals hij was.', sqlerrm;
end;
$a3$;


-- =====================================================================
-- A4 — de clawback pakt de OUDSTE referral-link, de accrual de ACTIEVE
-- =====================================================================
-- De trigger die de commissie AANMAAKT filtert op
-- `coalesce(rl.status,'active') = 'active'`. De functie die hem
-- TERUGHAALT doet `order by rl.created_at limit 1` zonder status-filter.
-- Dus bij een adverteerder met een afgewezen link uit januari en een
-- actieve uit maart: alle commissie staat op maart, de clawback kiest
-- januari, vindt nul en haalt nul terug. Bij 3% over 100.000 euro is dat
-- 1.200 euro die blijft staan.
do $a4$
declare
  v_src text;
  v_new text;
  v_fn  text;
begin
  -- prokind = 'f' EN _fndef_safe: hier liep de vorige versie op stuk.
  select p.proname into v_fn
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prokind = 'f'
     and position('order by rl.created_at' in public._fndef_safe(p.oid)) > 0
   limit 1;

  if v_fn is null then
    raise notice 'A4: geen functie met "order by rl.created_at" gevonden - zie leesvraag A.';
    return;
  end if;

  select public._fndef_safe(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = v_fn and p.prokind = 'f'
   limit 1;

  if position('coalesce(rl.status' in v_src) > 0 then
    raise notice 'A4: % filtert al op status - niets gedaan.', v_fn;
    return;
  end if;

  v_new := replace(
    v_src,
    'order by rl.created_at',
    'and coalesce(rl.status, ''active'') = ''active''
   order by rl.created_at desc'
  );

  if v_new = v_src then
    raise warning 'A4: replace raakte niets - niets gedaan.';
    return;
  end if;

  execute v_new;
  raise notice 'A4: % pakt nu de ACTIEVE link, nieuwste eerst - net als de accrual.', v_fn;
exception when others then
  raise warning 'A4 MISLUKT (%) - niets gewijzigd, zie leesvraag A.', sqlerrm;
end;
$a4$;


-- =====================================================================
-- A5 — een korting van -50% is een TOESLAG
-- =====================================================================
-- advertiser_perks.amount is een percentage zonder enige grens.
-- Toegepast als `round(bedrag * (1 - least(korting,100)/100.0), 2)`:
-- iemand typt 0.2 waar hij 20% bedoelt -> 200 wordt 199,60. Iemand typt
-- -50 -> 200 wordt 300. `least(..., 100)` klemt alleen de bovenkant af.
--
-- NOT VALID met opzet: bestaande rijen worden niet gecontroleerd, dus dit
-- kan nooit stukgaan op data die er al staat.
do $a5$
begin
  if to_regclass('public.advertiser_perks') is null then
    raise notice 'A5: advertiser_perks bestaat hier niet.';
    return;
  end if;
  if exists (
    select 1 from pg_constraint
     where conrelid = 'public.advertiser_perks'::regclass
       and conname = 'advertiser_perks_amount_sane'
  ) then
    raise notice 'A5: de grens staat er al.';
    return;
  end if;

  alter table public.advertiser_perks
    add constraint advertiser_perks_amount_sane
    check (
      amount is null
      or kind not in ('topup_discount', 'subscription_discount')
      or (amount >= 0 and amount <= 100)
    ) not valid;

  raise notice 'A5: een kortingspercentage moet nu tussen 0 en 100 liggen.';
exception when others then
  raise warning 'A5 MISLUKT (%) - niets gewijzigd.', sqlerrm;
end;
$a5$;


-- =====================================================================
-- A6 — refunds en goedgekeurde correcties op het rapport van de klant
-- =====================================================================
-- wallet_refunds en wallet_adjustments zijn admin-only, en dat klopt voor
-- de TABEL: daar staat `reason` in (interne notitie) plus de ids van de
-- twee medewerkers. Het klopt niet voor de BEDRAGEN, want dat is het geld
-- van de klant. Een rapport dat ze weglaat telt op naar een getal waar de
-- wallet het niet mee eens is.
--
-- Dus een functie, geen policy: een policy is alles-of-niets per rij en
-- zou de notitie en de personeels-ids meegeven. Deze geeft zeven kolommen
-- en verder niets, en controleert zelf dat de advertiser van de beller
-- is. Alleen goedgekeurde rijen.
do $a6$
begin
  execute $ddl$
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
    as $body$
    begin
      -- SECURITY DEFINER betekent dat RLS hier binnen uit staat, dus DEZE
      -- controle IS de beveiliging. auth.uid() is van de sessie, nooit
      -- iets dat de beller beweert.
      if not exists (
        select 1 from public.advertisers a
         where a.id = p_advertiser_id and a.user_id = auth.uid()
      ) then
        raise exception 'Not your advertiser' using errcode = '42501';
      end if;

      if to_regclass('public.wallet_refunds') is not null then
        return query
          select 'refund'::text, r.id, r.created_at,
                 -abs(r.amount)::numeric,
                 r.currency::text, r.status::text, r.reference::text
            from public.wallet_refunds r
           where r.advertiser_id = p_advertiser_id and r.status = 'approved';
      end if;

      if to_regclass('public.wallet_adjustments') is not null then
        return query
          select 'adjustment'::text, j.id, j.created_at,
                 j.delta::numeric,
                 j.currency::text, j.status::text, j.reference::text
            from public.wallet_adjustments j
           where j.advertiser_id = p_advertiser_id and j.status = 'approved';
      end if;
    end;
    $body$;
  $ddl$;

  revoke execute on function public.my_wallet_extras(uuid) from public, anon;
  grant  execute on function public.my_wallet_extras(uuid) to authenticated;
  raise notice 'A6: refunds en goedgekeurde correcties staan nu op het rapport.';
exception when others then
  raise warning 'A6 MISLUKT (%) - het rapport blijft zonder die twee soorten, zonder foutmelding.', sqlerrm;
end;
$a6$;


-- =====================================================================
-- A7 — de drie views (al bevestigd; hier zodat het ook een migratie is)
-- =====================================================================
-- Een view draait met de rechten van de EIGENAAR tenzij je het anders
-- zegt. Draai NOOIT 20260918200000_money_to_numeric.sql uit een oudere
-- kopie: die bouwt deze views opnieuw op uit pg_get_viewdef, wat alleen
-- de SELECT teruggeeft, dus security_invoker en de grants gaan er stil
-- weer af.
do $a7$
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
      raise notice 'A7: % bestaat hier niet.', v_name;
      continue;
    end if;
    if v_kind = 'm' then
      raise warning 'A7: % is een MATERIALIZED view - zeg het, die gaat anders.', v_name;
      continue;
    end if;
    if v_kind <> 'v' then
      raise warning 'A7: % is geen view (relkind %).', v_name, v_kind;
      continue;
    end if;

    execute format('alter view public.%I set (security_invoker = true)', v_name);
    execute format('grant select on public.%I to authenticated', v_name);
    raise notice 'A7: % leest als de beller.', v_name;
  end loop;
exception when others then
  raise warning 'A7 MISLUKT (%).', sqlerrm;
end;
$a7$;


-- =====================================================================
-- A8 — rate_limit_check niet meer open voor anon
-- =====================================================================
-- SECURITY DEFINER, uitgedeeld aan anon, en de bucket-sleutel komt van de
-- beller. Iedereen op internet kon daarmee een met naam genoemde klant
-- een uur lang uit z'n topups sluiten, en dat elk uur verlengen.
--
-- 20260828150000_rate_limits.sql en consolidated/all-migrations.sql zijn
-- vannacht gecorrigeerd, want die twee zetten de grant bij een herhaling
-- stilletjes TERUG.
do $a8$
begin
  if to_regprocedure('public.rate_limit_check(text, integer, integer)') is null then
    raise notice 'A8: rate_limit_check niet gevonden met die handtekening.';
    return;
  end if;
  revoke execute on function public.rate_limit_check(text, integer, integer)
    from public, anon, authenticated;
  grant execute on function public.rate_limit_check(text, integer, integer)
    to service_role;
  raise notice 'A8: rate limiting is server-only.';
exception when others then
  raise warning 'A8 MISLUKT (%).', sqlerrm;
end;
$a8$;


-- =====================================================================
-- A9 — het e-mailadres van andermans klant
-- =====================================================================
-- affiliate_referral_stats is SECURITY DEFINER en uitgedeeld aan
-- `authenticated`, dus RLS kan niet bijsturen wat het teruggeeft — en het
-- declareert referred_advertiser_email in z'n returns-tabel. De hook die
-- het aanroept hangt in ZOWEL de affiliate-app als de adverteerder-app,
-- dus elke affiliate krijgt het e-mailadres van iedereen die zich onder
-- zijn code heeft aangemeld. Niets rendert het. Een referral-link is
-- publiek deelbaar, dus dat zijn niet per se mensen die ze kennen.
--
-- Dit weigert liever dan dat het gokt, en doet drop+create in een
-- subtransactie: `create or replace` kan het returntype niet wijzigen, en
-- als het opnieuw aanmaken misgaat rolt de DROP mee terug.
do $a9$
declare
  v_src  text;
  v_new  text;
  v_sig  text;
  v_hits int;
begin
  select public._fndef_safe(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'affiliate_referral_stats'
     and p.prokind = 'f'
   limit 1;

  if v_src is null or v_src = '' then
    raise notice 'A9: affiliate_referral_stats niet leesbaar of niet aanwezig.';
    return;
  end if;
  if position('referred_advertiser_email' in v_src) = 0 then
    raise notice 'A9: de e-mailkolom zit er al niet meer in.';
    return;
  end if;

  select count(*) into v_hits
    from regexp_split_to_table(v_src, E'\n') l
   where l like '%referred_advertiser_email%';

  if v_hits <> 2 then
    raise warning 'A9: referred_advertiser_email staat op % regels in plaats van 2 - niets gedaan, zie leesvraag B.', v_hits;
    return;
  end if;

  select string_agg(x.l, E'\n' order by x.rn) into v_new
    from (
      select row_number() over () as rn, l
        from regexp_split_to_table(v_src, E'\n') l
    ) x
   where x.l not like '%referred_advertiser_email%';

  if v_new is null or v_new = v_src then
    raise warning 'A9: er is niets weggehaald - niets gedaan.';
    return;
  end if;

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
  raise notice 'A9: het e-mailadres gaat niet meer mee.';
exception when others then
  raise warning 'A9 MISLUKT (%) - de oude functie staat er nog precies zoals hij was. Zie leesvraag B.', sqlerrm;
end;
$a9$;


-- =====================================================================
-- B1 — uitgezet, en toch geincasseerd
-- =====================================================================
-- Wat er nu gebeurt als je op Deactivate drukt:
--   1. elk abonnement gaat naar 'inactive'
--   2. de FACTUURLUS slaat ze over (filtert op 'active','past_due')
--   3. de INCASSOLUS slaat ze NIET over: die filtert alleen op
--      `s.status <> 'cancelled'`. Een al verstuurde factuur wordt dus
--      gewoon van de wallet afgeschreven op de vervaldatum.
--   4. en als die afschrijving LUKT, zet de trigger op een betaalde
--      factuur de status terug naar 'active' en schuift de periode een
--      maand op. Vanaf dan draait de facturatie weer maandelijks, voor
--      iemand die niet kan inloggen om het te zien of te stoppen.
--
-- Niets in de app schrijft ooit 'cancelled'. De enige status die de
-- facturatie als definitief behandelt, is vanuit het scherm onbereikbaar.
do $b1a$
declare
  v_src text;
  v_new text;
begin
  select public._fndef_safe(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'subscription_billing_run'
     and p.prokind = 'f'
   limit 1;

  if v_src is null or v_src = '' then
    raise notice 'B1a: subscription_billing_run niet leesbaar of niet aanwezig.';
    return;
  end if;
  if position('not in (''cancelled'', ''inactive'', ''paused'')' in v_src) > 0 then
    raise notice 'B1a: de incassolus slaat een uitgezet abonnement al over.';
    return;
  end if;
  if position('and s.status <> ''cancelled''' in v_src) = 0 then
    raise warning 'B1a: de incassolus ziet er anders uit dan verwacht - niets gedaan, zie leesvraag C.';
    return;
  end if;

  v_new := replace(
    v_src,
    'and s.status <> ''cancelled''',
    'and s.status not in (''cancelled'', ''inactive'', ''paused'')'
  );
  if v_new = v_src then
    raise warning 'B1a: replace raakte niets.';
    return;
  end if;
  execute v_new;
  raise notice 'B1a: een uitgezet of gepauzeerd abonnement wordt niet meer geincasseerd.';
exception when others then
  raise warning 'B1a MISLUKT (%) - niets gewijzigd, zie leesvraag C.', sqlerrm;
end;
$b1a$;

do $b1b$
declare
  v_src text;
  v_new text;
  v_fn  text;
begin
  -- `case when status = 'cancelled' then status else 'active' end` zet
  -- ALLES behalve cancelled op actief - dus ook inactive en paused.
  select p.proname into v_fn
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prokind = 'f'
     and position('when status = ''cancelled'' then status else ''active''' in public._fndef_safe(p.oid)) > 0
   limit 1;

  if v_fn is null then
    raise notice 'B1b: geen functie met die case-expressie gevonden - zie leesvraag C.';
    return;
  end if;

  select public._fndef_safe(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = v_fn and p.prokind = 'f'
   limit 1;

  v_new := replace(
    v_src,
    'when status = ''cancelled'' then status else ''active''',
    'when status in (''cancelled'', ''inactive'', ''paused'') then status else ''active'''
  );
  if v_new = v_src then
    raise warning 'B1b: replace raakte niets.';
    return;
  end if;
  execute v_new;
  raise notice 'B1b: % zet een uitgezet abonnement niet meer terug op actief.', v_fn;
exception when others then
  raise warning 'B1b MISLUKT (%) - niets gewijzigd, zie leesvraag C.', sqlerrm;
end;
$b1b$;


-- =====================================================================
-- B2 — een geannuleerd voorschot blokkeert die storting voor altijd
-- =====================================================================
-- De unieke index staat op source_wallet_topup_id zonder naar de status
-- te kijken, terwijl de controle in de functie alleen op 'outstanding'
-- kijkt. Voorschot gegeven, daarna geannuleerd, klant legt het uit, admin
-- drukt opnieuw op Precharge -> de controle laat het door, de INSERT
-- knalt op de index, en de toast leest "duplicate key value violates
-- unique constraint". Geen weg meer vooruit voor die storting.
--
-- Als leesvraag D een storting met TWEE lopende voorschotten laat zien,
-- moet die eerst opgelost worden - dan past de index niet.
do $b2$
declare
  v_idx text;
begin
  if to_regclass('public.wallet_precharges') is null then
    raise notice 'B2: wallet_precharges bestaat hier niet.';
    return;
  end if;

  select i.indexname into v_idx
    from pg_indexes i
   where i.schemaname = 'public'
     and i.tablename = 'wallet_precharges'
     and i.indexdef ilike '%source_wallet_topup_id%'
     and i.indexdef ilike '%unique%'
     and i.indexdef not ilike '%outstanding%'
   limit 1;

  if v_idx is null then
    raise notice 'B2: geen status-loze unieke index gevonden - waarschijnlijk al goed.';
  else
    execute format('drop index if exists public.%I', v_idx);
    raise notice 'B2: oude index % verwijderd.', v_idx;
  end if;

  create unique index if not exists wallet_precharges_open_source_uq
    on public.wallet_precharges (source_wallet_topup_id)
    where source_wallet_topup_id is not null and status = 'outstanding';

  raise notice 'B2: alleen een LOPEND voorschot blokkeert nog een nieuw voorschot.';
exception when others then
  raise warning 'B2 MISLUKT (%) - zie leesvraag D.', sqlerrm;
end;
$b2$;


-- =====================================================================
-- B3 — geen limiet op openstaande withdrawal-aanvragen
-- =====================================================================
-- wallet_topups en ad_account_requests hebben allebei een _cap_pending_*
-- trigger. ad_account_withdrawals niet. Een klant kan hetzelfde saldo
-- twee keer aanvragen; het goedkeurscherm toont noch het saldo van de
-- advertentierekening, noch de andere openstaande aanvraag, en beide
-- goedkeuringen crediteren de wallet.
do $b3$
begin
  if to_regclass('public.ad_account_withdrawals') is null then
    raise notice 'B3: ad_account_withdrawals bestaat hier niet.';
    return;
  end if;

  execute $ddl$
    create or replace function public._cap_pending_withdrawals()
    returns trigger
    language plpgsql
    security definer
    set search_path = public
    as $body$
    declare
      v_open int;
    begin
      if new.status is distinct from 'pending' then
        return new;
      end if;
      select count(*) into v_open
        from public.ad_account_withdrawals w
       where w.ad_account_id = new.ad_account_id
         and w.status = 'pending';
      if v_open >= 3 then
        raise exception 'There are already % withdrawal requests waiting on this ad account. Wait for those to be reviewed first.', v_open
          using errcode = '22000';
      end if;
      return new;
    end;
    $body$;
  $ddl$;

  drop trigger if exists trg_cap_pending_withdrawals on public.ad_account_withdrawals;
  create trigger trg_cap_pending_withdrawals
    before insert on public.ad_account_withdrawals
    for each row execute function public._cap_pending_withdrawals();

  raise notice 'B3: maximaal 3 openstaande withdrawal-aanvragen per advertentierekening.';
exception when others then
  raise warning 'B3 MISLUKT (%).', sqlerrm;
end;
$b3$;


-- =====================================================================
-- B4 — tabellen zonder audit-spoor
-- =====================================================================
-- Elke zakelijke wijziging hoort uit audit_events te reconstrueren zijn.
-- Deze staan niet in de lijst: ze zijn allemaal NA de audit-migratie
-- gemaakt, en de `if exists` in die lus sloeg ze stilletjes over.
--
-- Een perk INTREKKEN zet alleen active = false, en de tabel heeft geen
-- revoked_by. Een medewerker kon dus de fee-vrijstelling van een klant
-- beeindigen zonder dat ergens staat wie dat was.
do $b4$
declare
  v_tbl text;
begin
  if to_regprocedure('public._audit_row_change()') is null then
    raise notice 'B4: _audit_row_change bestaat hier niet.';
    return;
  end if;

  foreach v_tbl in array array[
    'subject_members',
    'subject_member_accounts',
    'notification_preferences',
    'referral_clawbacks',
    'advertiser_plans',
    'advertiser_perks',
    'tax_rates',
    'bank_accounts',
    'wallet_precharges',
    'wallet_refunds',
    'wallet_adjustments'
  ] loop
    begin
      if to_regclass('public.' || v_tbl) is null then
        raise notice 'B4: % bestaat hier niet.', v_tbl;
        continue;
      end if;
      execute format('drop trigger if exists trg_audit_%I on public.%I', v_tbl, v_tbl);
      execute format(
        'create trigger trg_audit_%I after insert or update or delete on public.%I
           for each row execute function public._audit_row_change()',
        v_tbl, v_tbl);
      raise notice 'B4: % heeft nu een audit-spoor.', v_tbl;
    exception when others then
      raise warning 'B4: % overgeslagen (%).', v_tbl, sqlerrm;
    end;
  end loop;
end;
$b4$;

do $b4b$
begin
  if to_regclass('public.advertiser_perks') is null then
    raise notice 'B4b: advertiser_perks bestaat hier niet.';
    return;
  end if;
  if exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='advertiser_perks'
       and column_name='revoked_by'
  ) then
    raise notice 'B4b: revoked_by staat er al.';
    return;
  end if;
  alter table public.advertiser_perks
    add column revoked_by uuid references public.user_profiles(id),
    add column revoked_at timestamptz;
  raise notice 'B4b: revoked_by en revoked_at toegevoegd.';
exception when others then
  raise warning 'B4b MISLUKT (%).', sqlerrm;
end;
$b4b$;


-- =====================================================================
-- B5 — een uitgezette admin kan nog steeds een perk geven of intrekken
-- =====================================================================
-- 20260916100000 zegt in z'n eigen kop dat het acht RPCs NIET aanraakt,
-- en deze twee staan in dat lijstje. Ze autoriseren nog op role = 'admin'
-- alleen. Een medewerker-admin mag de prijs van een plan niet wijzigen
-- (owner-only, met opzet), maar mag die klant wel een 100% subscription
-- waiver geven. Zelfde economische uitkomst.
do $b5$
declare
  r     record;
  v_src text;
  v_new text;
  v_n   int := 0;
begin
  for r in
    select p.oid, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       and p.proname in ('grant_advertiser_perk', 'revoke_advertiser_perk')
  loop
    begin
      v_src := public._fndef_safe(r.oid);
      if v_src = '' then
        raise warning 'B5: % niet leesbaar.', r.proname;
        continue;
      end if;
      if position('coalesce(up.is_active, true)' in v_src) > 0
         or position('_require_profile' in v_src) > 0 then
        raise notice 'B5: % controleert al of het account actief is.', r.proname;
        continue;
      end if;

      v_new := replace(
        v_src,
        'and up.role = ''admin''',
        'and up.role = ''admin''
       and coalesce(up.is_active, true) = true
       and coalesce(up.status, ''active'') <> ''inactive'''
      );
      if v_new = v_src then
        raise warning 'B5: % ziet er anders uit - niets gedaan, zie leesvraag E.', r.proname;
        continue;
      end if;
      execute v_new;
      v_n := v_n + 1;
      raise notice 'B5: % weigert nu een uitgezette admin.', r.proname;
    exception when others then
      raise warning 'B5: % overgeslagen (%).', r.proname, sqlerrm;
    end;
  end loop;

  if v_n = 0 then
    raise notice 'B5: niets gewijzigd.';
  end if;
end;
$b5$;


-- =====================================================================
-- ALLES IN EEN RIJ — dit is de regel die ik wil zien
-- =====================================================================
select
  (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname in ('logs','wallet_exchanges')
      and c.relrowsecurity)                                  as a1_rls_van_2,
  exists (
    select 1 from pg_policies
     where schemaname='storage' and tablename='objects'
       and policyname='slip_admin_read' and qual like '%is_active%')
                                                             as a2_slips_dicht,
  coalesce((select position('jsonb_build_object' in public._fndef_safe(p.oid)) > 0
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='get_invite_by_token'
      and p.prokind='f' limit 1), false)                     as a3_invite_smal,
  exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.prokind='f'
       and public._fndef_safe(p.oid) like '%coalesce(rl.status%'
       and public._fndef_safe(p.oid) like '%rl.created_at desc%')
                                                             as a4_clawback_actief,
  exists (select 1 from pg_constraint
           where conname='advertiser_perks_amount_sane')     as a5_perk_grens,
  (to_regprocedure('public.my_wallet_extras(uuid)') is not null)
                                                             as a6_rapport_extra,
  (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='v'
      and c.relname in ('top_ups_view','referral_links_with_details','referral_commissions_with_details')
      and coalesce((select option_value::boolean from pg_options_to_table(c.reloptions)
                     where option_name='security_invoker'), false))
                                                             as a7_views_van_3,
  not exists (
    select 1 from information_schema.routine_privileges
     where specific_schema='public' and routine_name='rate_limit_check'
       and grantee in ('anon','authenticated'))              as a8_ratelimit_dicht,
  coalesce((select position('referred_advertiser_email' in public._fndef_safe(p.oid)) = 0
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='affiliate_referral_stats'
      and p.prokind='f' limit 1), false)                     as a9_email_weg,
  coalesce((select position('not in (''cancelled'', ''inactive'', ''paused'')' in public._fndef_safe(p.oid)) > 0
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='subscription_billing_run'
      and p.prokind='f' limit 1), false)                     as b1a_incasso_slaat_over,
  exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.prokind='f'
       and public._fndef_safe(p.oid) like '%when status in (''cancelled'', ''inactive'', ''paused'')%')
                                                             as b1b_geen_reactivatie,
  exists (
    select 1 from pg_indexes
     where schemaname='public' and tablename='wallet_precharges'
       and indexdef ilike '%outstanding%' and indexdef ilike '%unique%')
                                                             as b2_voorschot_index,
  exists (select 1 from pg_trigger
           where tgname='trg_cap_pending_withdrawals')       as b3_withdrawal_rem,
  (select count(*) from pg_trigger t
     join pg_class c on c.oid=t.tgrelid
     join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and t.tgname like 'trg_audit_%'
      and c.relname in ('subject_members','subject_member_accounts',
                        'notification_preferences','referral_clawbacks',
                        'advertiser_plans','advertiser_perks','tax_rates',
                        'bank_accounts','wallet_precharges','wallet_refunds',
                        'wallet_adjustments'))               as b4_audited_van_11,
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prokind='f'
      and p.proname in ('grant_advertiser_perk','revoke_advertiser_perk')
      and public._fndef_safe(p.oid) like '%is_active%')      as b5_perks_van_2;


-- =====================================================================
-- =====================================================================
--   ALLEEN LEZEN VANAF HIER. Deze antwoorden heb ik nodig.
-- =====================================================================
-- =====================================================================

-- ── A. De clawback-functie, als A4 hem niet vond ─────────────────────
select
  p.proname,
  position('order by rl.created_at' in public._fndef_safe(p.oid)) > 0 as oude_sortering,
  position('coalesce(rl.status'     in public._fndef_safe(p.oid)) > 0 as statusfilter
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.prokind = 'f'
   and (p.proname ilike '%clawback%' or p.proname ilike '%referral%')
 order by 2 desc, 1;

-- ── B. affiliate_referral_stats, als A9 het niet durfde ──────────────
with src as (
  select public._fndef_safe(p.oid) as def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'affiliate_referral_stats'
     and p.prokind = 'f'
   limit 1
),
lines as (
  select row_number() over () as ln, l as line
    from src, regexp_split_to_table(src.def, E'\n') as l
)
select ln, line from lines where line ilike '%email%' order by ln;

-- ── C. De twee plekken uit B1, als een van de twee weigerde ──────────
select
  p.proname,
  position('s.status <> ''cancelled''' in public._fndef_safe(p.oid)) > 0 as oude_incassofilter,
  position('when status = ''cancelled'' then status else ''active''' in public._fndef_safe(p.oid)) > 0 as oude_reactivatie
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.prokind = 'f'
   and (public._fndef_safe(p.oid) ilike '%subscription%'
        or p.proname ilike '%invoice%')
 order by 2 desc, 3 desc, 1;

-- ── D. Stortingen met meer dan een voorschot ─────────────────────────
select
  p.source_wallet_topup_id            as storting,
  count(*)                            as voorschotten,
  string_agg(p.status, ', ')          as statussen,
  count(*) filter (where p.status = 'outstanding') as lopend
  from public.wallet_precharges p
 where p.source_wallet_topup_id is not null
 group by p.source_wallet_topup_id
having count(*) > 1;

-- ── E. De twee perk-RPCs, als B5 ze niet herkende ────────────────────
select
  p.proname,
  position('up.role = ''admin''' in public._fndef_safe(p.oid)) > 0 as rolcheck,
  position('is_active' in public._fndef_safe(p.oid)) > 0           as actiefcheck
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.prokind = 'f'
   and p.proname in ('grant_advertiser_perk', 'revoke_advertiser_perk');

-- ── F. Hoe zien logs en wallet_exchanges eruit ───────────────────────
select
  c.table_name,
  string_agg(c.column_name, ', ' order by c.ordinal_position) as kolommen
  from information_schema.columns c
 where c.table_schema = 'public'
   and c.table_name in ('logs', 'wallet_exchanges')
 group by c.table_name;

-- ── G. De definitie van top_ups_view ─────────────────────────────────
-- /top-ups leest deze view, en die geeft doorgestreepte (is_deleted)
-- topups gewoon mee - dus een verwijderde PENDING topup staat nog in de
-- wachtrij met een Verify-knop. Ik herbouw die view niet blind, want hij
-- staat in geen migratie. Met deze tekst lever ik de exacte regel.
select pg_get_viewdef('public.top_ups_view'::regclass, true) as top_ups_view_definitie;

-- ── H. Uitgezette klanten met een openstaande factuur ────────────────
-- Dit is de groep die B1 raakt. Rijen hier = mogelijk al geincasseerd
-- terwijl ze geen toegang hadden.
select
  a.tenant_client_code                as klant,
  up.status                           as profiel_status,
  s.status                            as abo_status,
  i.id                                as factuur,
  i.total,
  i.currency,
  i.due_date::date                    as vervalt,
  i.status                            as factuur_status
  from public.invoices i
  join public.subscriptions s on s.id = i.subscription_id
  join public.advertisers a on a.id = i.advertiser_id
  -- user_id, NIET user_profile_id: die kolom bestaat niet op advertisers.
  left join public.user_profiles up
         on up.user_id = a.user_id
        and up.tenant_id = a.tenant_id
 where i.status = 'unpaid'
   and (s.status in ('inactive', 'paused')
        or coalesce(up.is_active, true) = false
        or coalesce(up.status, 'active') = 'inactive')
 order by i.due_date;

-- ── I. Doorgestreepte topups die tot vannacht in de cijfers zaten ────
select
  count(*)                            as verwijderde_topups,
  sum(coalesce(t.fee_amount, 0))      as fee_usd_die_meetelde,
  sum(coalesce(t.topup_amount, 0))    as topup_usd_die_meetelde
  from public.top_ups t
 where t.is_deleted = true;

-- ── J. Staan de testaccounts nog open op productie? ──────────────────
select
  u.email,
  u.email_confirmed_at is not null    as bevestigd,
  u.last_sign_in_at
  from auth.users u
 where u.email like '%@primescalemedia.test'
 order by u.email;

-- ── K. Meer dan een openstaande withdrawal op een rekening ───────────
select
  w.ad_account_id,
  count(*)                            as openstaand,
  sum(w.amount)                       as totaal_aangevraagd,
  w.currency
  from public.ad_account_withdrawals w
 where w.status = 'pending'
 group by w.ad_account_id, w.currency
having count(*) > 1;


-- =====================================================================
-- OPRUIMEN — als allerlaatste, want de leesvragen gebruiken hem nog.
-- =====================================================================
drop function if exists public._fndef_safe(oid);
