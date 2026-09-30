-- ════════════════════════════════════════════════════════════════════
-- PLAK 163 — DE MAANDWISSEL-REPETITIE (één testfactuur, vannacht)
-- ════════════════════════════════════════════════════════════════════
--
-- De eigenaar, 30-09: "we zouden ook een test doen zodat ik niet een
-- maand hoef te wachten" en "doe maar dingen zodat we zien of die
-- binnen 1 2 dagen aanslaat".
--
-- ── WAT ER VANNACHT SOWIESO AL GEBEURT ────────────────────────────
--
-- Om 03:00 draait `subscription_billing_run()` via Vercel. Gemeten,
-- vandaag 09:40, wat hij gaat vinden:
--
--   FACTUREN MAKEN (4)   PSM0006, PSM0012, PSM0013, PSM0018
--   INCASSEREN    (3)    PSM0006, PSM0012, PSM0013
--
-- Die eerste drie zijn oude testaccounts van eerdere doorlopen
-- (@robustq.com, "Walkthrough" in de naam) en ze hebben alle drie
-- **EUR 0** in hun wallet. Er gaat vannacht dus GEEN geld van een
-- echte klant af. Ze blijven `past_due` en krijgen geen nieuw bericht,
-- want dat kregen ze al.
--
-- Dat is op zich een goede repetitie van twee van de drie paden:
--
--   [x] een factuur maken op de dag dat hij hoort te komen
--   [x] een incasso die MISLUKT -> past_due
--   [ ] een incasso die LUKT   -> geld gaat er af, factuur op paid
--
-- Dat derde pad is precies het pad dat ertoe doet, want dat is het
-- enige dat uit zichzelf geld van een klant afhaalt. En het kan
-- vannacht niet gebeuren: de enige klant mét saldo is PSM0018, en
-- diens factuur vervalt pas 07-10 (zeven dagen, plak 162).
--
-- ── WAT DEZE PLAK DOET ────────────────────────────────────────────
--
-- Eén regel: de vervaldatum van de ENE openstaande abonnementsfactuur
-- van PSM0018 gaat naar één minuut geleden. Daarmee valt hij vannacht
-- binnen de incassoronde en is de repetitie compleet.
--
-- Wat je morgenochtend hoort te zien bij PSM0018:
--
--   wallet             EUR 300,00  ->  EUR 100,00
--   deze factuur       unpaid      ->  paid
--   abonnement         active      ->  active   (NIET past_due)
--   volgende datum     30-09       ->  31-10
--   en er staat een NIEUWE factuur van EUR 200, vervalt 07-10
--
-- ── WAAROM DIT VEILIG IS ──────────────────────────────────────────
--
-- * Eén klant, en die klant is `PSM0018` -- vandaag aangemaakt voor
--   test 3, e-mail op @robustq.com. De WHERE noemt hem met zoveel
--   woorden; hij kan geen tweede rij raken.
-- * Alleen een factuur die `unpaid` is en aan een abonnement hangt.
-- * De plak weigert als hij niet exact één rij vindt. Geen gok.
-- * Niets aan de incassocode zelf verandert. We zetten alleen de klok
--   van één testfactuur vooruit; de run doet vannacht zijn gewone werk.
-- * Terugdraaien is één update naar `created_at + interval '7 days'`
--   -- maar dat hoeft niet: na de repetitie is de factuur betaald en
--   staat de volgende gewoon op 07-10.
-- ════════════════════════════════════════════════════════════════════

-- De naam op de auditregel. In de SQL-editor is auth.uid() leeg.
select set_config(
  'request.headers',
  json_build_object('x-psm-actor',
                    '8bd9b91b-c07b-4aae-9bd5-2aff773ab082')::text,
  true);

do $blk0$
declare
  v_inv     uuid;
  v_aantal  int;
  v_saldo   numeric;
  v_bedrag  numeric;
begin
  select count(*) into v_aantal
    from public.invoices i
    join public.advertisers a on a.id = i.advertiser_id
   where a.tenant_client_code = 'PSM0018'
     and i.status = 'unpaid'
     and i.subscription_id is not null
     and i.period_start is not null;

  if v_aantal <> 1 then
    raise exception
      'Verwacht precies 1 openstaande abonnementsfactuur bij PSM0018, gevonden %. '
      'Niets gedaan -- eerst kijken wat er veranderd is.', v_aantal;
  end if;

  select i.id, i.total into v_inv, v_bedrag
    from public.invoices i
    join public.advertisers a on a.id = i.advertiser_id
   where a.tenant_client_code = 'PSM0018'
     and i.status = 'unpaid'
     and i.subscription_id is not null
     and i.period_start is not null;

  select coalesce(w.eur_balance, 0) into v_saldo
    from public.wallets w
    join public.advertisers a on a.id = w.advertiser_id
   where a.tenant_client_code = 'PSM0018';

  -- Een repetitie die niet kan slagen is geen repetitie. Liever hier
  -- weigeren dan morgenochtend een mislukte incasso als "het werkt
  -- niet" lezen terwijl er gewoon te weinig op stond.
  if coalesce(v_saldo, 0) < v_bedrag then
    raise exception
      'PSM0018 heeft EUR % in de wallet en de factuur is EUR %. '
      'Eerst opwaarderen, anders oefent dit het MISLUKTE pad dat we al hebben.',
      coalesce(v_saldo, 0), v_bedrag;
  end if;

  update public.invoices
     set due_date = now() - interval '1 minute'
   where id = v_inv;
end
$blk0$;

-- ── HET RAPPORT, HELEMAAL ONDERAAN ─────────────────────────────────
-- `staat_klaar` hoort 1 te zijn en `saldo_nu` 300.
select
  'plak 163 geplaatst'                                           as wat,
  (select count(*)::text
     from public.invoices i
     join public.advertisers a on a.id = i.advertiser_id
     join public.subscriptions s on s.id = i.subscription_id
    where a.tenant_client_code = 'PSM0018'
      and i.status = 'unpaid' and i.period_start is not null
      and i.due_date <= now()
      and s.status not in ('cancelled', 'inactive', 'paused'))    as staat_klaar,
  (select coalesce(w.eur_balance, 0)::text
     from public.wallets w
     join public.advertisers a on a.id = w.advertiser_id
    where a.tenant_client_code = 'PSM0018')                       as saldo_nu,
  (select count(*)::text
     from public.invoices i
     join public.advertisers a on a.id = i.advertiser_id
     join public.subscriptions s on s.id = i.subscription_id
    where i.status = 'unpaid' and i.period_start is not null
      and i.due_date <= now()
      and s.status not in ('cancelled', 'inactive', 'paused'))    as incasso_vannacht_totaal,
  'morgenochtend: wallet 100, factuur paid, abonnement active, nieuwe factuur 07-10'
                                                                  as wat_je_hoort_te_zien;
