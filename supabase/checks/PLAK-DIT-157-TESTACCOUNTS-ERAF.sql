-- ════════════════════════════════════════════════════════════════════
-- PLAK 157 — DE TESTACCOUNTS ERAF, IN DE VOLGORDE DIE GEEN GELD LAAT
--            LIGGEN
-- ════════════════════════════════════════════════════════════════════
--
-- LEES DIT EERST. Deze plak doet standaard NIETS. Er staan twee knoppen
-- bovenaan en allebei staan ze veilig:
--
--   v_codes    := array[]::text[]   -- leeg: er gebeurt niets
--   v_dry_run  := true              -- alleen tellen, niets weghalen
--
-- Zet de codes erin, draai hem met v_dry_run = true, LEES HET RAPPORT,
-- en pas daarna v_dry_run = false. Het rapport is in allebei de standen
-- hetzelfde: in de droge stand zegt het wat er zou gebeuren, in de
-- echte stand wat er gebeurd is.
--
-- ── WAAROM DE VOLGORDE HET HELE PUNT IS ───────────────────────────
--
-- Gemeten op deze database, 29-09, niet aangenomen:
--
--   advertisers -> wallets            SET NULL
--   wallets     -> wallet_ledger      RESTRICT
--   user_profiles -> advertisers      CASCADE
--   auth.users  -> user_profiles      CASCADE
--
-- Lees die vier samen en je ziet de val. Een adverteerder weghalen
-- BLOKKEERT NIET -- de wallet blijft staan met `advertiser_id = null`,
-- met het geld er nog in. En die wallet kun je daarna niet meer
-- weghalen ook, want zijn grootboekregels houden hem met RESTRICT
-- tegen. Het resultaat is geld in de database dat bij niemand hoort en
-- dat er niet meer uit kan.
--
-- Over de achttien testaccounts gaat dat vandaag om
-- **EUR 1.118,50 en USD 1.668,37** in zeven wallets, met tien
-- grootboekregels eronder.
--
-- En de val heeft een tweede helft: `auth.users -> user_profiles` is
-- CASCADE. Eén rij weghalen in het Auth-scherm van Supabase neemt dus
-- het profiel mee, dat neemt de adverteerder mee, en die neemt
-- abonnementen, DST-regels, affiliates, commissieregels en
-- referral-links mee -- terwijl de wallet, de facturen, de topups en de
-- ad-accounts als wees achterblijven. Eén klik, en de helft is weg en
-- de andere helft is stuurloos.
--
-- Daarom gaat deze plak van de bladeren naar de wortel:
--
--   1. grootboekregels van de wallets van dit account  (de RESTRICT)
--   2. de wallets zelf                                 (het geld)
--   3. topups, wallet-topups, exchanges                (geldgeschiedenis)
--   4. facturen                                        (zie de knop)
--   5. ad-accounts, aanvragen, bedrijven, uitnodigingen
--   6. de auth-gebruiker -- en CASCADE doet de rest in één keer:
--      profiel -> adverteerder -> abonnementen, DST, affiliate,
--      commissieregels, referral-links, plannen, perks, payouts
--
-- ── WAT ER NIET WEGGAAT, EN WAAROM ────────────────────────────────
--
-- `audit_events` heeft NUL foreign keys (gemeten). Het blijft dus
-- staan, ook als de rij waar het over gaat verdwijnt, en dat is precies
-- de bedoeling: het is de enige plek waar terug te lezen is dat dit
-- heeft plaatsgevonden. Deze plak raakt het niet aan -- hij SCHRIJFT er
-- juist in, want de `_audit_row_change`-trigger staat op deze tabellen.
--
-- ── DE FACTUURKNOP ────────────────────────────────────────────────
--
-- `v_keep_invoices` staat op **true**: genummerde facturen blijven
-- staan, met een lege adverteerder. Dat is de boekhoudkundige kant --
-- een uitgegeven nummer hoort niet te verdwijnen uit de reeks.
--
-- Staat hij op false, dan gaan ze mee. Voor testdata is dat het
-- schoonst: een genummerde factuur zonder klant is een gat in de reeks
-- dat later niemand meer kan verklaren.
--
-- De eigenaar kiest. Het rapport telt ze apart zodat de keuze zichtbaar
-- is in plaats van impliciet.
-- ════════════════════════════════════════════════════════════════════

-- De naam op de auditregel. In de SQL-editor is auth.uid() leeg, dus
-- zonder dit staat de hele opruiming op naam van niemand.
select set_config(
  'request.headers',
  json_build_object('x-psm-actor',
                    '8bd9b91b-c07b-4aae-9bd5-2aff773ab082')::text,
  true);

drop table if exists _plak157_report;
create temp table _plak157_report (
  volgorde  int,
  code      text,
  naam      text,
  wat       text,
  aantal    text
);

do $blk0$
declare
  -- ══════════════════════════════════════════════════════════════
  -- DE TWEE KNOPPEN. Hier, en nergens anders.
  -- ══════════════════════════════════════════════════════════════
  v_codes         text[]  := array[]::text[];   -- bv. array['PSM0001','PSM0003']
  v_dry_run       boolean := true;              -- true = alleen tellen
  v_keep_invoices boolean := true;              -- true = facturen blijven
  -- ══════════════════════════════════════════════════════════════

  r_code    text;
  v_adv     uuid;
  v_profile uuid;
  v_user    uuid;
  v_naam    text;
  v_n       bigint;
  v_i       int := 0;
  v_missing text[] := array[]::text[];
begin
  if array_length(v_codes, 1) is null then
    insert into _plak157_report values
      (0, '—', '—', 'GEEN CODES INGEVULD — er is niets gedaan', '0');
    return;
  end if;

  -- ── EERST CONTROLEREN, DAN PAS IETS DOEN ──────────────────────
  -- Een typefout in een code mag geen half uitgevoerde opruiming
  -- opleveren. Bestaat er één niet, dan stopt alles.
  foreach r_code in array v_codes loop
    if not exists (select 1 from public.advertisers
                    where tenant_client_code = r_code) then
      v_missing := v_missing || r_code;
    end if;
  end loop;

  if array_length(v_missing, 1) is not null then
    insert into _plak157_report values
      (0, array_to_string(v_missing, ', '), '—',
       'DEZE CODES BESTAAN NIET — er is niets gedaan', '0');
    return;
  end if;

  foreach r_code in array v_codes loop
    v_i := v_i + 1;

    select a.id, a.profile_id, p.user_id,
           coalesce(p.full_name, p.email, '?')
      into v_adv, v_profile, v_user, v_naam
      from public.advertisers a
      left join public.user_profiles p on p.id = a.profile_id
     where a.tenant_client_code = r_code;

    -- ── 1. GROOTBOEKREGELS: de RESTRICT die de wallet vasthoudt ──
    select count(*) into v_n
      from public.wallet_ledger l
      join public.wallets w on w.id = l.wallet_id
     where w.advertiser_id = v_adv;
    insert into _plak157_report values
      (v_i, r_code, v_naam, '1. grootboekregels', v_n::text);
    if not v_dry_run then
      delete from public.wallet_ledger l
       using public.wallets w
       where w.id = l.wallet_id and w.advertiser_id = v_adv;
    end if;

    -- ── 2. DE WALLETS, MET HET GELD EROP ─────────────────────────
    -- Dit is de regel waar het om gaat. Sla hem over en het geld
    -- blijft liggen bij niemand.
    select count(*), coalesce(sum(eur_balance),0), coalesce(sum(usd_balance),0)
      into v_n, v_adv_eur, v_adv_usd
      from public.wallets where advertiser_id = v_adv;
    insert into _plak157_report values
      (v_i, r_code, v_naam, '2. wallets (EUR/USD erop)',
       v_n::text || ' (' || v_adv_eur::text || ' / ' || v_adv_usd::text || ')');
    if not v_dry_run then
      delete from public.wallet_exchanges we
       using public.wallets w
       where w.id = we.wallet_id and w.advertiser_id = v_adv;
      delete from public.wallets where advertiser_id = v_adv;
    end if;

    -- ── 3. GELDGESCHIEDENIS ──────────────────────────────────────
    select (select count(*) from public.top_ups where advertiser_id = v_adv)
         + (select count(*) from public.wallet_topups where advertiser_id = v_adv)
      into v_n;
    insert into _plak157_report values
      (v_i, r_code, v_naam, '3. topups + wallet-topups', v_n::text);
    if not v_dry_run then
      delete from public.top_ups where advertiser_id = v_adv;
      delete from public.wallet_topups where advertiser_id = v_adv;
    end if;

    -- ── 4. FACTUREN ──────────────────────────────────────────────
    select count(*) into v_n
      from public.invoices where advertiser_id = v_adv and number is not null;
    insert into _plak157_report values
      (v_i, r_code, v_naam,
       case when v_keep_invoices
            then '4. genummerde facturen BLIJVEN (zonder klant)'
            else '4. genummerde facturen GAAN MEE' end,
       v_n::text);
    if not v_dry_run and not v_keep_invoices then
      delete from public.invoices where advertiser_id = v_adv;
    end if;

    -- ── 5. ACCOUNTS, AANVRAGEN, BEDRIJVEN, UITNODIGINGEN ─────────
    select (select count(*) from public.ad_accounts where advertiser_id = v_adv)
         + (select count(*) from public.ad_account_requests where advertiser_id = v_adv)
         + (select count(*) from public.companies where advertiser_id = v_adv)
      into v_n;
    insert into _plak157_report values
      (v_i, r_code, v_naam, '5. ad-accounts + aanvragen + bedrijf', v_n::text);
    if not v_dry_run then
      delete from public.ad_account_requests where advertiser_id = v_adv;
      delete from public.ad_accounts where advertiser_id = v_adv;
      delete from public.companies where advertiser_id = v_adv;
      delete from public.fee_change_requests where advertiser_id = v_adv;
    end if;

    -- ── 6. DE LOGIN, EN CASCADE DOET DE REST ─────────────────────
    -- auth.users -> user_profiles -> advertisers is twee keer CASCADE,
    -- dus deze ene regel neemt het profiel, de adverteerder,
    -- abonnementen, DST-regels, de affiliate, commissieregels,
    -- referral-links, plannen en perks in één keer mee.
    select (select count(*) from public.subscriptions where advertiser_id = v_adv)
         + (select count(*) from public.dst_charges where advertiser_id = v_adv)
         + (select count(*) from public.affiliates where advertiser_id = v_adv)
         + (select count(*) from public.commission_rules where affiliate_advertiser_id = v_adv)
         + (select count(*) from public.referral_links
             where affiliate_advertiser_id = v_adv or referred_advertiser_id = v_adv)
      into v_n;
    insert into _plak157_report values
      (v_i, r_code, v_naam, '6. gaat mee via CASCADE (subs/DST/affiliate/links)',
       v_n::text);

    if not v_dry_run then
      -- Commissies hangen met SET NULL aan hun link, dus ze zouden als
      -- wees achterblijven wanneer de link casqueert. Voor een
      -- testaffiliate is dat geen boekhouding maar rommel.
      delete from public.referral_commissions rc
       using public.referral_links rl
       where rl.id = rc.referral_link_id
         and (rl.affiliate_advertiser_id = v_adv
              or rl.referred_advertiser_id = v_adv);

      if v_user is not null then
        delete from auth.users where id = v_user;
      else
        -- Geen login gevonden: dan het profiel zelf, en anders in elk
        -- geval de adverteerder. Nooit stilletjes overslaan.
        if v_profile is not null then
          delete from public.user_profiles where id = v_profile;
        else
          delete from public.advertisers where id = v_adv;
        end if;
      end if;
    end if;
  end loop;

  insert into _plak157_report values
    (999, '—', '—',
     case when v_dry_run
          then 'DROGE STAND — er is NIETS weggehaald. Zet v_dry_run op false.'
          else 'UITGEVOERD.' end,
     array_length(v_codes, 1)::text || ' account(s)');
end
$blk0$;

-- ── HET RAPPORT, HELEMAAL ONDERAAN ─────────────────────────────────
-- De SQL-editor toont alleen de laatste uitkomst, dus dit is de enige
-- select in het bestand.
select volgorde, code, naam, wat, aantal
  from _plak157_report
 order by volgorde, wat;
