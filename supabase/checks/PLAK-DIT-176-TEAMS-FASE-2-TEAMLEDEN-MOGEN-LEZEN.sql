-- ════════════════════════════════════════════════════════════════════
-- PLAK 176 — TEAMS, FASE 2: TEAMLEDEN MOGEN LEZEN
-- ════════════════════════════════════════════════════════════════════
--
-- Na plak 175. Die zette de fundering neer en iedereen van vandaag als
-- eigenaar van zijn eigen account: 22 van 22 (gemeten 30-09).
--
-- ── WAT ER VERANDERT AAN DE APP VANDAAG: NIETS ────────────────────
--
-- Deze plak geeft een teamlid leestoegang tot de gegevens van het
-- account waar hij lid van is. Maar de ENIGE leden die er nu zijn, zijn
-- de 22 eigenaars uit de backfill -- en die konden hun eigen gegevens
-- al lezen via de bestaande regel. Er krijgt dus niemand iets nieuws
-- te zien tot er in fase 3 iemand echt wordt uitgenodigd. Het rapport
-- onderaan bewijst dat: `leden_die_geen_eigenaar_zijn` hoort 0.
--
-- ── WAAROM ERNAAST EN NIET HERSCHREVEN ────────────────────────────
--
-- Het ontwerp van 17-09 (docs/TEAM_ACCOUNTS.md) zei: herschrijf elke
-- bestaande leesregel, één tabel per plak, en houd elke tegen live voor
-- de volgende. Dat was de juiste voorzichtigheid voor HERSCHRIJVEN --
-- tekstchirurgie op een live policy, waar een fout betekent dat een
-- eigenaar zichzelf buitensluit.
--
-- Deze plak herschrijft niets. Postgres combineert meerdere
-- PERMISSIEVE leesregels op een tabel met OR. Dus komt er per tabel een
-- TWEEDE regel bij, `<tabel>_team_read`, die alleen zegt: "je bent lid
-- van de adverteerder van deze rij." Gevolg:
--
--   * de bestaande eigenaarsregel wordt niet aangeraakt, dus niemand
--     kan zijn eigen toegang kwijtraken;
--   * een extra regel kan alleen toegang TOEVOEGEN, nooit weghalen;
--   * terugdraaien is één `drop policy` per tabel -- ze staan hieronder.
--
-- Daarmee vervalt ook de reden voor één-tabel-per-plak, en staan ze
-- allemaal in deze ene.
--
-- ── WAAROM DE NIEUWE REGEL NIET TE RUIM KAN ZIJN ──────────────────
--
-- `_psm_member_of('advertiser', advertiser_id)` kijkt of er een
-- lidmaatschap bestaat voor PRECIES de adverteerder van deze rij, voor
-- PRECIES de ingelogde gebruiker. Is `advertiser_id` leeg, dan is de
-- vergelijking `subject_id = NULL` en die is nooit waar -- een rij
-- zonder adverteerder wordt dus nooit via een team zichtbaar.
--
-- ── WAT HIER MET OPZET NIET IN ZIT ────────────────────────────────
--
-- * Schrijven. Een teamlid dat iets DOET -- opwaarderen, een account
--   aanvragen, geld terugvragen -- gaat via server actions die de rol
--   toetsen. Dat is fase 3.
-- * Per-ad-account beperken. Met OR-regels kun je toegang toevoegen
--   maar niet inperken; een "alleen deze twee accounts"-lid vraagt een
--   andere vorm en is niet gevraagd.
-- * `notifications`. Die zijn aan een PERSOON gericht, niet aan een
--   account; een teamlid krijgt zijn eigen meldingen, en dat is goed.
-- * De affiliate-kant. Gemeten: `affiliates` heeft één rij, maar er zijn
--   vijf affiliate-gebruikers, en alle vijf hebben een
--   adverteerdersrij. Een affiliate IS dus een adverteerder in deze
--   database, en loopt mee via de regels hieronder.
--
-- ── TERUGDRAAIEN ──────────────────────────────────────────────────
--
--   drop policy if exists wallets_team_read on public.wallets;
--   drop policy if exists wallet_topups_team_read on public.wallet_topups;
--   drop policy if exists top_ups_team_read on public.top_ups;
--   drop policy if exists ad_accounts_team_read on public.ad_accounts;
--   drop policy if exists ad_account_requests_team_read on public.ad_account_requests;
--   drop policy if exists ad_account_withdrawals_team_read on public.ad_account_withdrawals;
--   drop policy if exists invoices_team_read on public.invoices;
--   drop policy if exists subscriptions_team_read on public.subscriptions;
--   drop policy if exists companies_team_read on public.companies;
--   drop policy if exists advertiser_plans_team_read on public.advertiser_plans;
--   drop policy if exists wallet_ledger_team_read on public.wallet_ledger;
--   drop policy if exists dst_charges_team_read on public.dst_charges;
--   drop policy if exists wallet_exchanges_team_read on public.wallet_exchanges;
-- ════════════════════════════════════════════════════════════════════

select set_config(
  'request.headers',
  json_build_object('x-psm-actor',
                    '8bd9b91b-c07b-4aae-9bd5-2aff773ab082')::text,
  true);

-- ── 0. DE POORT: fase 1 moet er staan, en kloppen ────────────────
-- Draait deze plak zonder fase 1, dan bestaat `_psm_member_of` niet en
-- faalt elke regel hieronder. Liever hier stoppen met een zin.
do $blk0$
declare v_eig int; v_adv int;
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = '_psm_member_of') then
    raise exception 'Fase 1 (plak 175) staat er niet -- eerst die draaien.';
  end if;

  select count(*) into v_eig from public.subject_members where subject_kind = 'advertiser';
  select count(*) into v_adv from public.advertisers
   where user_id is not null and tenant_id is not null;
  if v_eig < v_adv then
    raise exception
      'Fase 1 is onvolledig: % eigenaars voor % adverteerders. Draai plak 175 opnieuw (hij is idempotent) en kijk wat er ontbreekt.',
      v_eig, v_adv;
  end if;
end
$blk0$;

-- ── 1. een team-leesregel per tabel ──────────────────────────────
-- Twaalf tabellen met een eigen `advertiser_id`. Allemaal dezelfde vorm.
do $blk1$
declare t text;
begin
  foreach t in array array[
    'wallets', 'wallet_topups', 'top_ups', 'ad_accounts',
    'ad_account_requests', 'ad_account_withdrawals', 'invoices',
    'subscriptions', 'companies', 'advertiser_plans', 'wallet_ledger',
    'dst_charges'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_team_read', t);
    execute format(
      'create policy %I on public.%I for select to authenticated '
      'using (public._psm_member_of(''advertiser'', advertiser_id))',
      t || '_team_read', t);
  end loop;
end
$blk1$;

-- ── 2. wallet_exchanges: geen eigen advertiser_id ────────────────
-- Loopt via de wallet. Dezelfde toets, een stap verder weg.
do $blk2$
begin
  drop policy if exists wallet_exchanges_team_read on public.wallet_exchanges;
  create policy wallet_exchanges_team_read on public.wallet_exchanges
    for select to authenticated
    using (
      exists (
        select 1 from public.wallets w
         where w.id = wallet_exchanges.wallet_id
           and public._psm_member_of('advertiser', w.advertiser_id)
      )
    );
end
$blk2$;

-- ── HET RAPPORT, HELEMAAL ONDERAAN ─────────────────────────────────
--   team_regels                  hoort 13
--   leden_die_geen_eigenaar_zijn hoort 0 -- het BEWIJS dat er vandaag
--                                niemand iets nieuws te zien krijgt
--   bestaande_regels_intact      hoort 14 -- de oude eigenaarsregels,
--                                ongewijzigd
select
  'plak 176 geplaatst'                                              as wat,
  (select count(*)::text from pg_policies
    where schemaname = 'public' and policyname like '%\_team\_read' escape '\') as team_regels,
  (select count(*)::text from public.subject_members
    where role <> 'owner')                                          as leden_die_geen_eigenaar_zijn,
  -- Op (tabel, naam) en niet op naam alleen: "Enable read for
  -- advertisers" staat op wallets EN wallet_topups, en zulke generieke
  -- namen kunnen ook op een tabel staan die hier niets mee te maken heeft.
  (select count(*)::text from pg_policies p
     join (values
       ('ad_account_requests',    'Enable advertisers to read their data'),
       ('ad_account_withdrawals', 'withdrawals_read'),
       ('ad_accounts',            'Enable select for advertisers'),
       ('advertiser_plans',       'advertiser_plans_read_own'),
       ('companies',              'Allow advertisers to read their companies'),
       ('dst_charges',            'dst advertiser reads own'),
       ('invoices',               'Enable advertisers to read their data'),
       ('subscriptions',          'Advertiser can read his data'),
       ('top_ups',                'Enable select for advertisers'),
       ('wallet_exchanges',       'Enable read for advertisers only'),
       ('wallet_exchanges',       'wallet_exchanges_read'),
       ('wallet_ledger',          'wallet_ledger_select'),
       ('wallet_topups',          'Enable read for advertisers'),
       ('wallets',                'Enable read for advertisers')
     ) as v(tabel, naam) on v.tabel = p.tablename and v.naam = p.policyname
    where p.schemaname = 'public')                                  as bestaande_regels_intact;
