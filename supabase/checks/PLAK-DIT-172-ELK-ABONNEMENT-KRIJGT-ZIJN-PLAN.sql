-- ════════════════════════════════════════════════════════════════════
-- PLAK 172 — ELK ABONNEMENT KRIJGT ZIJN PLAN
-- ════════════════════════════════════════════════════════════════════
--
-- De eigenaar, 30-09: "iedereen die we abbo geven, ook al is
-- handmatig, moet wel een naam krijgen toch? Doe dan gewoon standaard
-- Prime ofzo, als we zo doen anders klopt er niks van."
--
-- ── WAAROM DIT GELD RAAKT EN NIET ALLEEN EEN NAAM ─────────────────
--
-- `advertiser_plans` draagt niet alleen de naam. Er staat ook in
-- hoeveel ad-accounts inbegrepen zijn en welke opwaardeerfee geldt.
-- Zonder die rij weet de app dat niet, en dan valt hij terug op iets
-- anders.
--
-- Gemeten op PSM0020: abonnement EUR 75, actief, GEEN planrij. Hij
-- betaalde EUR 50 voor een ad-accountaanvraag die een plan
-- waarschijnlijk had inbegrepen. Zijn kaart zei terecht "No plan set"
-- naast "Active", en dat is wat de eigenaar opviel.
--
-- Oorzaak: `create_subscription_from_invite` is de enige schrijver van
-- die tabel, en wie via een AFFILIATE-LINK binnenkomt heeft geen
-- uitnodiging.
--
-- ── NIET "STANDAARD PRIME" ────────────────────────────────────────
--
-- Dat was het voorstel, en het bedrag spreekt het tegen. De plannen
-- van deze tenant hebben allemaal hun eigen prijs:
--
--     NSA      EUR   0,00   2 inbegrepen   5,00%
--     Flex     EUR  75,00   1 inbegrepen   5,00%
--     Launch   EUR 150,00   1 inbegrepen   3,50%
--     Prime    EUR 200,00   2 inbegrepen   3,00%
--
-- Prime op PSM0020 zetten zou EUR 200 beweren boven een abonnement van
-- EUR 75 -- precies het "dan klopt er niks van". Het BEDRAG wijst het
-- plan aan: EUR 75 is Flex.
--
-- ── WAT DEZE PLAK DOET, EN WAT MET OPZET NIET ─────────────────────
--
-- Alleen waar PRECIES EEN actief plan op bedrag EN valuta past:
--
--     PSM0020   EUR  75,00  active     -> Flex
--     PSM0011   EUR 150,00  inactive   -> Launch
--
-- Blijft staan, en dat is een beslissing:
--
--     PSM0010   EUR  10,00  active     -> GEEN passend plan.
--                Tien euro per maand staat niet in de catalogus. Dat
--                is een prijsafspraak die iemand ooit met de hand
--                heeft gemaakt, en welk plan daarbij hoort is niet aan
--                mij. Raden zou hem 2 of 1 inbegrepen accounts en 3%
--                of 5% fee geven, en dat verschil is echt geld.
--     E2E0001   4x EUR 500  cancelled  -> testrommel, opgezegd.
--
-- ── EN WAAROM DIT NIET NOG EEN KEER GEBEURT ───────────────────────
--
-- De code is vandaag mee aangepast: `createSubscriptionAsAdmin` zoekt
-- nu zelf het plan op bij het bedrag wanneer er geen gekozen is, en
-- alleen bij een exacte treffer. Deze plak haalt het verleden in; de
-- code houdt de toekomst dicht.
--
-- Geen `execute`, geen functie herschreven -- alleen rijen.
-- ════════════════════════════════════════════════════════════════════

select set_config(
  'request.headers',
  json_build_object('x-psm-actor',
                    '8bd9b91b-c07b-4aae-9bd5-2aff773ab082')::text,
  true);

do $blk1$
declare r record; v_n int := 0;
begin
  for r in
    select a.id            as advertiser_id,
           a.tenant_id     as tenant_id,
           p.id            as plan_id,
           p.name          as plan_naam,
           p.monthly_fee,
           p.currency,
           p.included_ad_accounts,
           p.topup_fee_pct
      from public.subscriptions s
      join public.advertisers a on a.id = s.advertiser_id
      left join public.advertiser_plans ap on ap.advertiser_id = a.id
      join public.plans p
        on p.tenant_id = a.tenant_id
       and p.currency  = s.currency
       and p.monthly_fee = s.amount
       and p.is_active
     where ap.advertiser_id is null
       and s.status <> 'cancelled'
       -- Precies EEN passend plan. Twee van hetzelfde bedrag is een
       -- keuze die een mens moet maken.
       and (select count(*) from public.plans p2
             where p2.tenant_id = a.tenant_id
               and p2.currency = s.currency
               and p2.monthly_fee = s.amount
               and p2.is_active) = 1
  loop
    insert into public.advertiser_plans
      (advertiser_id, tenant_id, plan_id, monthly_fee, plan_currency,
       included_ad_accounts, topup_fee_pct)
    values
      (r.advertiser_id, r.tenant_id, r.plan_id, r.monthly_fee, r.currency,
       r.included_ad_accounts, r.topup_fee_pct)
    on conflict (advertiser_id) do nothing;
    v_n := v_n + 1;
    raise notice 'plan % gezet op adverteerder %', r.plan_naam, r.advertiser_id;
  end loop;
  raise notice 'klaar: % rijen', v_n;
end
$blk1$;

-- ── HET RAPPORT, HELEMAAL ONDERAAN ─────────────────────────────────
-- `zonder_plan_nu` hoort op 5 te staan: de vier opgezegde E2E-rijen en
-- PSM0010, die met opzet blijft wachten op jouw beslissing over welk
-- plan bij EUR 10 hoort. `psm0020` hoort `Flex` te zeggen.
select
  'plak 172 geplaatst'                                             as wat,
  (select count(*)::text
     from public.subscriptions s
     join public.advertisers a on a.id = s.advertiser_id
     left join public.advertiser_plans ap on ap.advertiser_id = a.id
    where ap.advertiser_id is null)                                as zonder_plan_nu,
  (select coalesce(p.name,'nog geen')
     from public.advertisers a
     left join public.advertiser_plans ap on ap.advertiser_id = a.id
     left join public.plans p on p.id = ap.plan_id
    where a.tenant_client_code = 'PSM0020')                        as psm0020,
  (select coalesce(p.name,'nog geen')
     from public.advertisers a
     left join public.advertiser_plans ap on ap.advertiser_id = a.id
     left join public.plans p on p.id = ap.plan_id
    where a.tenant_client_code = 'PSM0011')                        as psm0011,
  (select coalesce(string_agg(a.tenant_client_code || ' ' ||
                              s.currency || ' ' || s.amount::text, ', '), '-')
     from public.subscriptions s
     join public.advertisers a on a.id = s.advertiser_id
     left join public.advertiser_plans ap on ap.advertiser_id = a.id
    where ap.advertiser_id is null and s.status <> 'cancelled')    as blijft_open;
