# TEST 3 — DE DOORLOOP, MET VERSE ACCOUNTS

> Geschreven 29-09, na test 1 en test 2. Herzien dezelfde avond op één
> punt van de eigenaar, en dat punt verandert de hele test: **elk rol
> krijgt een NIEUW account.**

---

## Wat we al gedaan hebben

Uitgezocht uit de git-historie, niet uit het hoofd.

| | wanneer | vorm | uitkomst |
|---|---|---|---|
| **J1–J8** | 16–21 sept | de acht reizen met de hand op productie (`docs/JOURNEY_LOG.md`) | hier komen de acht reizen in CLAUDE.md vandaan |
| **Test 1** | 22–25 sept | **zeventien sweeps per FOUTSOORT**: A1–A7, D1–D3, F1–F4, S1–S3, T4 | ~146 commits. D1 was de bankfeed (277 stortingen van EUR 366.718 onder een badge die 0 zei), F3 de affiliate-uitbetalingen, D2 de valuta. **Liep niet af** — "vind elke fout van soort X" heeft geen eindvoorwaarde, en dat staat nu als reden in CLAUDE.md |
| **Test 2** | 26–29 sept | **zestien blokken per REIS**: `p0` t/m `p15`. Binair per blok | blok 0 t/m 14 dicht; blok 15 (opruimen) staat achter test 3 |

---

## Waarom test 3 anders is, en waarom verse accounts het verschil maken

Test 1 zocht fouten per soort. Test 2 zocht ze per reis. Allebei
zochten ze **fouten**, en allebei deden ze dat op accounts die al een
geschiedenis hadden.

Dat laatste is de zwakke plek, en de eigenaar zag hem: *"voor de test
altijd een nieuwe account gebruiken lijkt me, zodat we goed testen en
niet met oude accounts en oude koppelingen."*

Hij heeft gelijk, en om een scherpere reden dan netheid:

> **Op een OUD account kun je alleen controleren of het scherm klopt
> met de database.** Dat vangt een rekenfout. Het vangt NIET een
> ontbrekende rij, want je weet niet wat er zou moeten staan — twaalf
> topups of dertien, wie zegt het.
>
> **Op een VERS account weet je het wel.** Je hebt precies één topup
> gedaan, van precies EUR 50. Een scherm dat 0 toont, of 2, of EUR
> 48,50 waar EUR 50 hoort, is meteen fout — zonder dat je iets hoeft op
> te zoeken.

Verse accounts veranderen de test dus van *"klopt dit met de
database"* naar *"klopt dit met wat ik zojuist gedaan heb"*. Dat
tweede is een veel strengere vraag, en het is de vraag die een klant
ook stelt.

En het sluit een gat dat test 1 en 2 allebei hadden: **de eerste
minuten van een account**. PSM0005 en PSM0016 zijn dagen oud en door
tientallen rondes heen gegaan. Hoe een gloednieuwe klant het ziet —
lege schermen, nul-staten, de eerste factuur, de eerste wallet — is
precies wat een nieuwe klant straks ziet, en dat hebben we nooit in
één keer doorlopen.

---

## De vier verse accounts

Eén per rol, elk via de ECHTE uitnodigingsweg — dat loopt J1 meteen
mee. Codes worden PSM0017 en verder.

| # | rol | hoe aangemaakt | waarvoor |
|---|---|---|---|
| **T3-A** | adverteerder, gewoon plan | uitnodiging met plan, geen referrer | de hele klantreis: wallet, topup, ad-account, factuur, abonnement |
| **T3-N** | adverteerder, NSA-community | uitnodiging met de NSA-community erop | de afwijkende fee (5%) en wat daarvan op elk scherm terechtkomt |
| **T3-F** | affiliate | uitnodiging als affiliate | link, referral, commissie, uitbetaling |
| **T3-R** | adverteerder via T3-F's link | aanmelden via de referral-URL | de attributie, en de commissie die daaruit volgt |

**Alles wat je nodig hebt per account:** een verse mailbox (dezelfde
wegwerpdiensten als eerder werken), en jouw vingers voor het
wachtwoord en de Join.

**De oude zestien blijven staan tot test 3 klaar is.** Ze zijn de
vergelijking: als een vers account iets anders doet dan PSM0005, wil
je dat kunnen zien. Daarna gaan ze weg met plak 157, en daarna pas
begint de co-pilot.

---

## De browser

De browser heet **`Baris Laptop`**. Controleer dat aan de app en niet
aan de lijst met verbonden browsers -- die namen zeggen niets, en
`onThisComputer` stond op de verkeerde. Navigeer naar `/dashboard` en
lees wie er "Welcome back" krijgt.

En let op het verschil tussen de verkeerde BROWSER (los op met
`switch_browser`) en het verkeerde ACCOUNT in de goede browser (dat
is een in- en uitlog, dus van de eigenaar).

## De drie lagen

Elke laag mag pas beginnen als de vorige schoon is.

### Laag 1 — de machine (10 seconden, geen mens)

```bash
npm run ochtend && npm run rondje
```

- **`ochtend`** (12 controles) — staat de database goed? RLS, rechten,
  weesregels, NaN, kloppen de saldi met hun eigen bewegingen.
- **`rondje`** (18 controles) — hangt het nog aan elkaar? Aanslagen die
  afgaan op 80% van een grens, en dezelfde bedragen van twee kanten
  uitgerekend.

**Stopregel: is hier iets FOUT, dan begint laag 2 niet.** Een scherm
lopen boven een kapotte basis kost tijd en bewijst niets.

**En na afloop nog een keer**, met de verse accounts erin. Dan zijn er
bewegingen die er bij de eerste run niet waren, en dat is precies
wanneer een controle iets kan vinden.

### Laag 2 — elk scherm, per rol (Claude rijdt)

**39 schermen.** Niet elk scherm is voor elke rol.

| rol | schermen |
|---|---|
| eigenaar | alle 39 |
| medewerker-admin | de 39 min eigenaar-alleen (profit, /audit, /admins, settings/finance) |
| **read-only** admin | één ronde langs de wachtrijen: elke knop hoort te weigeren |
| adverteerder (T3-A) | dashboard, wallet, top-ups, invoices, my-subscription, my-referrals, profile, notifications, help, accounts |
| NSA-adverteerder (T3-N) | dezelfde tien, met de fee als vraag bij elk bedrag |
| affiliate (T3-F) | dashboard, referrals, commissions, wallet, profile, notifications |

Per scherm, en dit is het slimme deel:

1. Openen op 390px.
2. **Het koptekstcijfer automatisch tegen de database houden** met
   `npm run check`. Niet "ziet er goed uit" — uitrekenen.
3. **En tegen wat je zelf gedaan hebt.** Dat is de winst van een vers
   account: je weet het antwoord al voordat het scherm het geeft.
4. Kijken naar precies vier dingen, want dat zijn de vier die dit
   project kent: een cijfer boven een mislukte lees, een lijst die
   stil is afgekapt, een knop die niets doet, en een lege staat boven
   echte rijen.
5. Doorlopen, niet terugkomen.

**Elke tak van elke dialoog**, ook de takken die we niet kiezen — de
opwaardeerdialoog is vier valuta's maal twee wallets, en de helft van
de fouten in deze app woont in de tak die niemand opende.

### Laag 3 — alleen wat echt geld verplaatst (de eigenaar)

- een echte overboeking + slip, en die verifiëren;
- een ad-account funden en bij de leverancier zien landen;
- een commissie-uitbetaling op betaald zetten;
- een factuur betalen vanuit de wallet;
- geld terug van een ad-account goedkeuren.

Elk één keer, met het bedrag vooraf opgeschreven en achteraf tegen de
database gelegd.

---

## De volgorde, in het geheel

1. Laag 1 — schoon beginnen.
2. Vier verse accounts aanmaken (jij: wachtwoord + Join).
3. Laag 2 — 39 schermen per rol.
4. Laag 3 — de vijf geldstappen.
5. Laag 1 opnieuw — bewijst dat stap 2 t/m 4 niets hebben gebroken.
6. **Plak 157**: alle testaccounts eraf, de oude zestien én de vier
   verse. Met de lijst van de eigenaar.
7. Laag 1 nog één keer — bewijst dat het opruimen niets heeft laten
   liggen. `rondje` C1 en C2 staan er precies voor: geld in een wallet
   zonder eigenaar.
8. **Dan pas** de co-pilot met echte mensen.

---

## Wat test 3 klaar maakt

- Laag 1 helemaal schoon, **drie keer**: vóór, na, en na het opruimen.
- Elk van de 39 schermen één keer geopend per rol die hem hoort te
  zien, met zijn koptekstcijfer tegen de database **en** tegen wat er
  op dat account gedaan is.
- De vijf stappen van laag 3 gelopen, met bedragen die aan twee kanten
  kloppen.
- Alles wat het opleverde gefixt, niet genoteerd.
- De testaccounts eraf, met `rondje` op nul erna.

---

## EEN VRAAG DIE UIT DE EERSTE WANDELING KWAM

De allereerste abonnementsfactuur vervalt na **3 dagen**; elke
volgende na **7**. Dat is geen fout maar een keuze: de trigger
`_invoice_first_subscription_due_date` doet het met zoveel woorden.

Maar die keuze en de route om te betalen passen niet op elkaar. Een
verse klant moet, in deze volgorde:

1. bedrijfsgegevens invullen -- tot dan is opwaarderen geblokkeerd
   ("Add your company details first", staat zo op zijn dashboard);
2. een bankoverboeking doen -- een tot twee werkdagen;
3. wachten tot een admin die verifieert -- met de hand.

Dat past niet in drie dagen. En sinds plak 160 blijft hij daarna
netjes in `past_due` staan en wordt hij aangemaand -- dus een klant
die niets fout deed krijgt op dag drie een bericht dat hij achterloopt.
Vóór plak 160 viel hij stil uit de boeken, wat erger was maar minder
zichtbaar.

**BEANTWOORD, 30-09:** "7 dagen prima, ook voor eerste." De
uitzondering gaat eruit — **plak 162**, die ook de facturen repareert
die al met een kortere termijn zijn uitgegeven (vandaag is dat
factuur 142 van PSM0018).

---

## Logboek

Eén regel per scherm. `gemeten` is wat er OP het scherm stond;
`hoort` is wat wij op dat verse account gedaan hebben. Zijn die twee
niet gelijk, dan is het een bevinding — ook als de database het scherm
gelijk geeft.

| rol | scherm | gemeten | hoort | uitkomst |
|---|---|---|---|---|
| — | laag 1 vooraf | ochtend 12/12 op 0 (op factuur 131 na, historisch); rondje 18 regels, **niets op FOUT**, twee op KIJKEN (8 topups >7 dagen in de wachtrij, 1 klant achter met DST -- allebei werkvoorraad) | alles op 0 | **SCHOON — laag 2 mag beginnen** |
| T3-A | uitnodiging verstuurd | `t3a-3009@robustq.com`, Advertiser, plan **Prime** (EUR200/mo · 2 accounts · 3%), geen referrer, TURLIT. Dialoog: alle vier de plannen en allebei de valuta geopend voor ik koos. Database 21:35 `pending`. | 1 pending invite | **VERSTUURD — wacht op signup** |
| T3-A | dashboard (390px) | wallet EUR 0,00 / USD 0,00 · openstaand EUR 200,00 due 3 okt · 0 ad-accounts · plan Unpaid · 3 stappen te gaan | wallet 0/0 · factuur 142 EUR 200 unpaid, gemaakt 30-09 07:41 vervalt 03-10 07:41 · 0 accounts · 0 bedrijf | **KLOPT, alles.** Maar zie de vraag hieronder over die 3 dagen. |
| T3-A | wallet | saldo EUR 0,00 / USD 0,00 · geen activiteit · knop Top up actief, Exchange grijs met reden | wallet 0/0, want er is nog niets gestort | **KLOPT** |
| T3-A | wallet opwaarderen (alle takken) | **stap 1** wallet EUR, overboekvaluta USD/EUR/GBP/HKD alle vier ingedrukt: elke niet-EUR zet er "You'll pay in X; your EUR wallet is credited from…" bij, EUR terecht niet. **stap 2** TURLIT LLC Wise (Belgie), IBAN `BE86967511906550`, SWIFT `TRWIBEB1XXX`, SEPA/SWIFT-schakelaar, kenmerk `0018-5714322060`, geen bedragveld. **stap 3** bedrag + snelkeuzes EUR 1.000/3.000/5.000/10.000 en de slip is **verplicht** ("Add the payment slip to submit"). EUR 300 + slip verstuurd. Database: 300 EUR `pending`, slip in storage, wallet nog 0. Daarna als Lasse geverifieerd -- wachtrij 1 -> 0. Scherm klant: EUR 300,00 en de regel "30 Sep · 0018-5714322060 · Wallet top-up · EUR 300,00 · Credited". | EUR 300 erop, status completed, 1 ledgerregel, audit op naam van Lasse | **KLOPT tot op de cent.** Database na afloop: `300 / EUR / completed / Lasse / wallet_eur 300 / 1 ledgerregel / 2 auditregels`. Dit is reis 2 uit CLAUDE.md, **dicht**. |
| T3-A | top-ups (walletgeschiedenis) | twee regels, allebei `Credited`: 30 Sep EUR 300,00 ref `0018-5714322060` en 30 Sep EUR 200,00 ref `0018-0663477024` | twee geslaagde opwaarderingen, samen EUR 500 | **KLOPT.** Database: 2 completed, som 500, 2 ledgerregels, saldo 500 -- `saldo_vs_topups = KLOPT`. |
| T3-A | accounts | *(geblokkeerd)* scherm zegt "**Pay your subscription invoice first** -- that is what your included ad accounts come from", met een knop `Go to billing`. Zelfde tekst op `Requests`. | geen ad-accounts, en een poort die uitlegt waarom | **GEBLOKKEERD TOT VANNACHT, en dat is goed gedrag** -- geen dode knop maar een gesloten poort met de reden en de weg ernaartoe. Gaat vanzelf open als de incasso van 03:00 factuur 142 betaalt, en dat is meteen een extra controle: opent een AUTOMATISCHE betaling dezelfde poort als een handmatige. |
| T3-A | ad-account aanvragen | *(geblokkeerd)* | **LET OP voor vannacht: de eerste twee aanvragen horen GRATIS te zijn.** `isFree = used < included`, en het plan Prime geeft `included_ad_accounts = 2`; PSM0018 heeft er 0. De EUR 50 van reis 3 verschijnt dus pas bij de **derde** aanvraag. | **GEBLOKKEERD TOT VANNACHT.** Genoteerd zodat een gratis eerste aanvraag straks niet als fout gelezen wordt. De code zegt zelf dat hij `ad_account_request_create_paid` spiegelt -- of die twee het eens zijn is precies wat de agents nu nakijken. De USD-tak valt terug op `null` en niet op 0 wanneer de koers onbekend is, met zoveel woorden: "0 would read as free, which is a different thing entirely". |
| T3-A | invoices (Billing) | PRIME · Active · EUR 200/maand · "Renewed 30 Sep 2026". **This month**: Monthly fee, **Due 7 Oct 2026 · EUR 200,00, in 7 days**. Lijst: `0018-144` opwaardering EUR 200 Paid, `0018-143` opwaardering EUR 300 Paid, `0018-142` Monthly plan EUR 200 Due. | drie facturen: 1 abonnement unpaid + 2 opwaarderingen paid; vervaldatum 07-10 na plak 162 | **KLOPT, alle drie.** De zeven dagen van plak 162 staan er ook echt. Ik dacht eerst dat de lijst een regel oversloeg -- dat was mijn eigen regex die de volgende rij opat, niet de app. |
| T3-A | my-subscription -> "Pay now" (tak geopend, NIET betaald) | knop `Pay EUR 200,00 from wallet` opent een bevestiging: "Renew your plan?", plan-hero EUR 200,00 per month Prime, **"Straight from your EUR wallet. No undo"**, en **`Your EUR wallet  EUR 500,00 -> EUR 300,00`**, Due 7 Oct 2026, knoppen `Go back` / `Yes, pay EUR 200,00`. `Go back` sluit hem, er verandert niets. | een bevestiging voor er geld weggaat, met het saldo voor en na | **KLOPT tot op de cent** (500 - 200 = 300). Dit is precies de modal die de eigenaar vroeg na zijn misklik. **Niet afgemaakt met opzet**: factuur 142 moet vannacht open staan voor de repetitie (plak 163). De echte betaling doe ik morgen op de factuur van vannacht. |
| T3-A | my-referrals (Affiliate program) | "Application received -- We're setting up your rate", met drie stappen: **You applied 30 Sep 2026, 11:05** / We set your rate / Your link goes live. Geen link en geen percentage zichtbaar. | een aanvraag die wacht, en NIETS over tarief of link tot hij goedgekeurd is | **KLOPT.** Database: `advertisers.affiliate_status = applied`, `affiliate_applied_at` 30-09 09:05 UTC = 11:05 hier. De aanvraag is **door mij** ontstaan bij het uitproberen van de bevestigingsmodal op "Join the affiliate program"; hij staat nu in de beheerwachtrij ("Affiliates waiting for you 1"). |
| T3-A | profile (Settings) | naam `ADV1 TEST`, inlog `t3a-3009@robustq.com`, bedrijf `T3 Alpha Media B.V.`, `t3a-3009@robustq.com`, `+31612345678`, `Keizersgracht 123`, `1015 CJ`, `Amsterdam`, `Netherlands`, btw `NL861234567B01`, niet-btw **uit**, KvK `87654321`, site `t3alpha.example` | wat wij bij het invullen van het bedrijf hebben ingetypt | **KLOPT, veld voor veld**, gehouden tegen `companies` op de live database -- alle elf gelijk. (Let op: de kolommen heten daar `official_email`, `vat_no`, `zipcode`, `state`, `website_url`.) |
| T3-A | notifications | twee berichten: "Money is in your wallet -- we credited EUR 200,00" (17 min) en "...EUR 300,00" (25 min). Badge `2`. `Mark all read` haalt de badge weg, de knop verdwijnt, en de **berichten blijven staan**. | precies twee, in die volgorde, met die bedragen -- want dat zijn onze twee opwaarderingen | **KLOPT.** Gelezen is niet gewist: na terugkomen staan beide er nog. |
| T3-A | help | drie vragen (ad-account vullen / hoe snel live / geld terug) en een WhatsApp-knop. De link draagt een vooringevulde tekst die **meebeweegt met de staat van de klant**: "I applied for the affiliate program -- a question:". | uitleg zonder leveranciersnaam, en een werkende weg naar ons | **KLOPT.** Geen SeamX/Rockads, geen accounttype, geen marge in de tekst of in de link. |
| T3-N | uitnodiging verstuurd | `t3n-3009@robustq.com`, Advertiser, community **NSA**: de samenvatting wisselt van 'Plan' naar 'Community' en zegt **Free — no subscription**, 2 accounts, **5%** fee. Database 21:39 `pending`. | 1 pending invite | **VERSTUURD — wacht op signup** |
| T3-N | de tien schermen, met de fee als vraag | **vanaf de beheerkant al geverifieerd** (eigen sessie nog nodig): PSM0019 `ADV3 TEST`, rol advertiser, op `/users` **"Not billed here -- NSA - 2 incl - 5%"**, wallet EUR 0,00 / USD 0,00, Active. | NSA: geen abonnement, 2 accounts, 5% opwaardeerfee | **KLOPT tegen `plans`**: op de tenant Prime Scale Media staat NSA op EUR 0,00/mnd, `included_ad_accounts` 2, `topup_fee_pct` 5,00 -- en Prime op 200,00/2/3,00. De acht rijen in `plans` zijn vier plannen maal twee tenants, geen duplicaten. **De tien klantschermen wachten op een sessie van T3-N in het paneel.** |
| T3-F | uitnodiging verstuurd | `t3f-3009@robustq.com`, Affiliate. Database 21:38 `pending`. | 1 pending invite | **VERSTUURD — wacht op signup** |
| T3-F | dashboard | `Welcome back, AF1 TEST` · TOTAL EARNINGS EUR 0,00 · 0 REFERRED · 0 ACTIVE · Lifetime/This month/Spend driven allemaal 0,00 | verse affiliate: nul van alles | **KLOPT, en de nullen zijn echt** -- database: PSM0017, rol `affiliate`, status `approved`, **0 referral_links, 0 commissies**, wallet 0/0. Het scherm heeft ook een echte `statsUnavailable`-tak ("This is NOT a zero -- reload to try again"), dus een mislukte lees wordt geen 0. **Twee fouten gevonden en gefixt:** de quote ontbrak hier helemaal (AFFILIATE_QUOTES en BOTH_QUOTES werden nergens gerenderd), en de eerste reparatie koos de verkeerde lijst -- elke affiliate heeft een `advertisers`-rij, dus die test was altijd waar. Nu op rol. |
| T3-F | referrals | link `https://app.primescalemedia.com/auth/sign-up?t=prime-scale-media&ref=PSM0017` · TIER 1/4 Starter, Riser EUR 1.000 / Scaler EUR 3.000 / Legend EUR 10.000, "EUR 1.000,00 more to reach Riser" · Earned/Awaiting/Paid out/Spend driven alle vier 0,00 · "No referrals yet -- share your link and they appear here." | een eigen link, tier 1, nul overal | **KLOPT.** Alle **zeven** takken ingedrukt: periode All time / This month (1-30 sep) / Last month (1-31 aug), en type All / Top-ups / Plans / Bonus. Elke tak wisselt het periodelabel en houdt de bedragen op 0,00. "Awaiting payout" zegt er zelf bij "All time, not this period" en beweegt terecht niet mee. |
| T3-F | commissions | "Every commission · 1 - 30 Sep 2026 · **0 commissions**", EARNED EUR 0,00, sorteren op Newest/Oldest/Largest aanwezig | nul commissies, want nul referrals | **KLOPT -- en hier zat de vraag die ertoe doet.** De affiliate leest NIET uit `referral_commissions`: die tabel staat op RLS met `role = 'admin'` voor élke select, dus een affiliate krijgt daar nul rijen. Het portaal gaat via de RPC `affiliate_referral_stats` (SECURITY DEFINER, anon nee, authenticated ja), en die geeft terug: `referral_link_id, referred_advertiser_*, commission_type/pct/currency, spend_usd/eur, topup_count, earnings_usd/eur, unpaid_usd/eur, link_status`. **Geen `supplier_fee_pct`, geen `supplier_cost`, geen accounttype.** De regel "geen kosten of marge op een klantrij" houdt dus ook in de JSON. |
| T3-F | wallet | STILL OWED TO YOU: EUR 0,00 (0,00 earned in total) / USD 0,00 · "**Paid by hand, always.** Nothing leaves automatically, and we confirm every transfer here with its reference." · "No commission yet." | nul te vorderen, en handmatig uitbetalen | **KLOPT** -- database wallet 0/0, en de belofte klopt met hoe het gebouwd is (elke uitbetaling is een beslissing van een mens). |
| T3-F | **payout aanvragen -- REIS 7 DICHT** | Hele keten gelopen: abonnement Flex EUR 75 op T3-R -> factuur -> T3-R waardeert EUR 75 op (geverifieerd door Lasse) -> betaalt met "Pay now" -> **commissie EUR 37,50** bij T3-F. Drempel vrijgegeven op **0** via `Release`. Aanvraag: **beide takken** ingedrukt -- EUR (37,50 -> 37,50, geen kosten) en **USD (EUR 37,50 -> $42,60 min 0,6% = $42,34, koers 0,8802)**. Stap 2 vraagt bankgegevens, `Send the request` staat uit tot de rekeninghouder erin staat. Verstuurd als **Payout PSM0017-01**. Als Lasse: `Send back` bekeken (knop uit tot er een reden staat, netjes geannuleerd), daarna `Mark as paid` -- die zegt er zelf bij dat hij **geen geld verplaatst**. | 50% van EUR 75 = EUR 37,50, en de USD-omrekening tegen de levende koers | **KLOPT TOT OP DE CENT -- REIS 7 DICHT.** Database: commissie `37.50 EUR / paid`, uitbetaling `37.50 EUR / paid / ref TEST3 30-09 handmatig`, drempel `0.00` -- opgeslagen als **nul en niet als null**, het onderscheid waar `pure-payout-min.ts` voor waarschuwt. USD nagerekend: 37,50 / 0,88022588 = 42,60; 0,6% = 0,26; blijft 42,34. |
| T3-R | aanmelden via de link van T3-F | PSM0020 `T3R test2` meldde zich om 13:57 aan via `…/auth/sign-up?t=prime-scale-media&ref=PSM0017`. Dashboard zegt **"Welcome"** (niet "Welcome back"), quote uit de **adverteerders**lijst, en de reden onder de uitgeschakelde knop staat er zichtbaar. | een referral op naam van PSM0017, en een verse klant zonder plan | **KLOPT.** `referral_links` rij `pending`, affiliate PSM0017. **Let op:** wie via een link binnenkomt krijgt **geen plan** -- anders dan bij een uitnodiging. Geen abonnement, geen factuur, dus ook geen commissie tot een admin een plan toekent. |
| T3-R | attributie zichtbaar bij T3-F | Beheerwachtrij: "T3R test2 PSM0020 · **Signed up through AF1 TEST PSM0017**". Approve-dialoog noemt de voorwaarden vooraf: **20% van de top-up-winst · 50% van elke betaalde factuur**. Na goedkeuren: "Referral approved -- Nothing to book yet". | de attributie klopt en het tarief staat vast voor je tekent | **KLOPT.** Database: `referral_links.status = active`, beslist 14:26. Het tarief komt uit de standaardregels, niet van de link -- precies wat de dialoog zegt. |
| eigenaar | dashboard (390px) | adverteerders **19**, affiliates **5**, abonnementen billing now **7**, achterstallige facturen **3**, bankgeld **95** | 19 / 5 / 7 (4 actief + 3 past_due) / 3 op deze tenant / 95 | **KLOPT, 5 van 5.** De 7 is plak 160 die werkt: de drie stil uitgevallen abonnementen staan weer op past_due, en het zijn exact de drie achterstallige facturen (125, 136, 138). Mijn eerste telling van 5 achterstallige was fout -- ik vergat de tenant; 2 daarvan staan op psm-e2e. |
| eigenaar | de overige 38 schermen | **25 beheerroutes gelopen**, geen enkele met een foutmelding, geen lege staat boven echte rijen. Gemeten en tegen de database gehouden: `/users` **Advertisers 14 / Affiliates 5 / 14 active**; `/subscriptions` **4 active, 3 past due, 2 inactive**; `/ledger` **0 -- "The books add up" over 19 wallets**; `/reconciliation` 1 te onderzoeken; `/finance-check` 97 wachtend op een mens, EUR 46.790 / USD 41.300; `/audit` toont plak 163 om 11:51 als `invoices UPDATE` op naam van **Bart**; `/invites` alle drie de T3-accounts **accepted**; `/admins` drie admins (Lasse=jij, Admin 1, Bart). | dashboard zei 19 adverteerders; ledger moet sluiten; de plak moet op de auditregel staan | **KLOPT, en de twee cijfers die tegen elkaar leken in te gaan doen dat niet.** Dashboard 19 telt `advertisers`-RIJEN; `/users` telt `user_profiles` op ROL -- database: advertiser 14, affiliate 5, admin 3, dus 14+5=19. Allebei goed, zelfde woord, andere verzameling. En de ledgerclaim houdt: **0 van de 21 wallets wijkt af** van de som van zijn eigen bewegingen; PSM0018 is 500,00 ledger tegen 500 saldo. Eén kleinigheid: `/help` (admin) zegt "Wallet -> **Add Balance**" en die knop heet "Top up". |
| eigenaar | **DST** (reis 8: een wachtrij met werk erin) | "**Slash did not answer, so we do not know what it is holding**" met hun eigen foutmelding erbij -- geen 0. "One customer is behind on DST -- PSM0005, 10 dagen, laatste week eindigde 20-09" **met de knop die het oplost ernaast**. RESERVED NOT YET INVOICED EUR 20,00, LINES IN VIEW 1, regel: PSM0005 · United Kingdom · 2% van EUR 1.000,00 · 14-20 sep = EUR 20,00. | een onbekende die zich niet als nul voordoet, en 2% van 1.000 = 20 | **KLOPT tot op de cent** -- `dst_charges`: base 1000,00 x rate 2,000% = 20,00, herberekend en gelijk, en het is de enige regel. Dialoog: **beide takken** (One customer / All customers) ingedrukt, klantkeuze telt **20 opties = 19 adverteerders + placeholder** (onafhankelijke bevestiging dat de 14 op /users een rolfilter is en geen afgekapte lijst), landen AT 5 / FR 3 / IT 3 / ES 3 / TR 5 / GB 2 / ** 0 -- gelijk aan `tax_rates` voor deze tenant (7 landen x 2 tenants = 14 rijen, geen duplicaten). `Record` staat uit tot het formulier klopt. **Niet ingediend**: een DST-regel is een bedrag dat een klant betaalt. |
| — | **reis 3 + 4 vooraf doorzocht** (4 lenzen tegelijk, zoals CLAUDE.md voorschrijft) | 30 bevindingen over geldreken, dode eindjes en zelfverzekerde nullen. | elke bevinding tegen de LEVENDE database houden voor je iets gelooft | **VIER VAN DE ZWAARSTE VERVIELEN BIJ HET METEN**, en dat is precies waarom die regel er staat: (a) "twee actieve koersrijen dus maybeSingle gooit" -- er is er **één per tenant** (USD->EUR 0,88022588), de agent citeerde een code-comment over een oude toestand; (b) "de gratis-telling verschilt tussen client en RPC" -- de **levende** RPC telt `ad_accounts` EN `ad_account_requests`, net als de client; de migratiefile in de repo is verouderd; (c) "niets schrijft `charged_amount`" -- de levende RPC schrijft hem wél, 3 van de 13 rijen hebben hem; (d) "vier geldkolommen zijn nog `real`" -- drie, en niet die vier (over zijn `ad_accounts.min_topup` en `exchange_rates.gbp/hkd`). Ook vervallen: "de adverteerder ziet Request Fee zonder valuta" -- die component staat ondanks zijn naam op `/accounts`, en dat is `requireAdmin`. En de metadata van alle 13 aanvragen bevat **geen** leverancierfee, marge of accounttype. **Zes hielden wel stand en zijn gefixt**: de vierde toestand van de Verify-dialoog, `fee: ?? 0` (0% voor altijd), de weggegooide fout bij een terugbetaling, de koersquery zonder tenantfilter, de reden die alleen in een `title` stond, en twee "doe X eerst" zonder de knop die X doet. |
| — | **wat er uit de lenzen gefixt is** (9 stuks, allemaal op reis 3 of 4) | 1. Verify-dialoog had geen vierde toestand -- `isLoading` is vals bij een uitgeschakelde query, dus kop + ondertitel + leeg vak op het scherm dat geld vrijgeeft. 2. `fee: suggested.pct ?? 0` -- geen leeg veld maar een PRIJS: 0% op elke toekomstige top-up, voor altijd. Plus: de reset wachtte niet op het plantarief, en `z.coerce.number()` maakte van "" alsnog 0. 3. De terugbetaling bij een weigering gooide de fout van zijn factuurlees weg en meldde dan "nothing to refund". 4. De koersquery stond op `enabled: open` zonder tenantfilter -> zelfverzekerde 58 met de waarschuwing onderdrukt. 5. Uitgeschakelde Top up-knop met de reden alleen in een `title` (onzichtbaar op een telefoon). 6+7. "Doe X eerst" op de Accounts-kop en het tabblad Requests zonder de knop die X doet. 8. "Request a EUR account instead" terwijl die keuze buiten meta-ads niet bestaat. 9. ~~Het netto stond in dollars boven een fee in euro's~~ -- **mijn fout, en hij hoort hier niet in dit rijtje**: die kolom staat in `topups/topup-row.tsx`, en dat bestand staat **al in `docs/UNREACHABLE.md`** als dood (alleen gemount door het even dode `topups-table.tsx`). Het scherm dat een beheerder echt ziet is `psm-verify-ad-topups`, en dat gebruikt `landedOnAccount` al -- nagekeken op productie: EUR 190,00 naast "paid EUR 200,00 - fee EUR 10,00", allemaal euro's. De reparatie is op zich goed en de test erop houdt het patroon vast, maar hij verandert niets voor wie dan ook. CLAUDE.md zegt met zoveel woorden dat je de routekaart NAKIJKT voor je een view aanraakt; dat heb ik hier niet gedaan. De andere acht zijn wel bereikbaar -- per bestand nagegaan. | elk scherm zegt wat waar is, en een onbekende doet zich niet voor als een nul of een prijs | **ALLE NEGEN GEFIXT EN LIVE.** Drie nieuwe tests, elk gecontroleerd met de fout ingezaaid. Lokale `next build` groen bij elke push. |
| admin/owner | **reis 8: "alles gelogd"** | 17 tabellen die de acht reizen aanraken nagelopen op de live database: **16 dragen de `_audit_row_change`-trigger** en allemaal ook `_touch_updated_at`. De zeventiende is `wallet_ledger`. | elke zakelijke wijziging moet uit `audit_events` te herbouwen zijn | **KLOPT, en het gat dat ik dacht te zien is er geen.** `wallet_ledger` heeft geen auditregel en geen `updated_at` -- maar die tabel IS het logboek, hij heeft helemaal geen `updated_at`-kolom, en er staat een eigen trigger `wallet_ledger_no_change` op die elke wijziging weigert met `raise exception 'wallet_ledger is append-only'`. `authenticated` mag hem bovendien niet updaten of wissen. Dat is sterker dan achteraf loggen. Zelfde verhaal bij `tenant_owners`: geen `updated_at`-kolom, dus niets te missen. |
| admin/owner | **reis 8: draagt elke weigering een reden?** | Alle weigeringen op de live database geteld: ad-accountaanvragen **4**, ad-account-topups **1**, wallet-topups **3** -- en **nul** daarvan zonder reden. De dialogen die ik zelf opende (wallet-topup en affiliate-aanvraag) geven `Yes, ...` pas vrij nadat er een reden staat. | geen enkele weigering zonder reden, en de klant leest hem | **KLOPT over de hele database.** Wat nog ontbreekt is de knopdruk zelf van begin tot eind, en die wacht op plak 165. Kanttekening: de wallet-weigerdialoog laat "test" (vier tekens) door terwijl er "at least a few words" staat -- de tekst belooft meer dan de code afdwingt. Cosmetisch, genoteerd. |
| admin/owner | **reis 8: bereikte elke weigering de klant?** | Zes soorten meldingen geteld: `wallet_topup_rejected` 4, `withdrawal_rejected` 2, `topup_rejected` 1, `affiliate_payout_rejected` 1, `affiliate_refused` 1 -- **allemaal met de reden in de payload**. (`subscription_past_due` 5 zonder reden, terecht: die heeft een bedrag, geen reden.) | elke weigering een melding, en die melding draagt de reden | **KLOPT.** Eén oneffenheid nagetrokken: 4 meldingen tegen 3 geweigerde rijen. De vierde wijst naar een top-up die nu `completed` is -- die rij is op 23-09 geweigerd en daarna alsnog bijgeschreven, en de melding "geweigerd" staat nog in de bel van die klant. **Vandaag kan dat niet meer**: `wallet_topup_admin_verify` zet `for update` op de rij en weigert alles wat niet `pending` is (`raise exception 'Topup is not pending'`). Dat is meteen het antwoord op de vraag over twee mensen die tegelijk klikken: de tweede wacht en krijgt een nette weigering. |
| eigenaar | **de zeven wachtrijtellers** | DST 1 · wallet-topups 1 (na mijn verificatie 0) · achterstallige facturen 3 · affiliates wachtend 1 · ad-accountaanvragen 0 · ad-account-topups 0 · affiliate-uitbetalingen 0 | elk cijfer onafhankelijk nagerekend op de database | **ZEVEN VAN ZEVEN.** De enige afwijking is *achterstallige facturen*: database 4 tegen 3 op het scherm -- en dat is plak 163, die PSM0018's factuur op vervallen zette **na** die schermlezing. Twee onafhankelijke berekeningen die het eens zijn, en het ene verschil heeft een naam. |
| — | **het grootboek: kan een functie het overslaan?** | Gemeten: **geen enkele** geld-RPC schrijft zelf naar `wallet_ledger` -- niet `invoice_pay_from_wallet`, niet `wallet_topup_admin_verify`, niet `ad_account_withdrawal_approve`, niet `top_up_create_for_advertiser`, niet `wallet_exchange`. En toch klopt hij voor alle 21 wallets. | elke saldowijziging hoort een regel te krijgen, ook een die iemand met de hand plakt | **DE LEDGER LIGT ONDER DE TABEL, NIET IN DE FUNCTIES.** Een trigger `wallet_ledger_record` op `wallets` schrijft hem bij elke INSERT of UPDATE. Daarmee kan een nieuwe functie hem niet vergeten en een met de hand geplakte UPDATE in de SQL-editor ook niet. Dat sluit het gat dat sinds 18-09 als open stond ("twaalf functies muteren saldi ter plekke, niets legt vast waarom"). |
| T3-A | **reis 1 nagerekend op de data** | Wat de aanmelding heeft aangemaakt: adverteerdersrij 1, user_profile 1, wallet 1, abonnement 1, advertiser_plans 1 (hun eigen tarief), bedrijf 1, eerste factuur 1, uitnodiging `accepted` 1, auditregels 2. | precies EEN van alles -- niet nul en niet twee | **KLOPT, negen van negen.** Het getal dat ertoe doet is niet dat ze bestaan maar dat het er **één** is: een aanmelding die halverwege opnieuw begint geeft twee wallets of twee abonnementen, en dan klopt elk saldo daarna nooit meer. Dat is hier niet gebeurd. |
| medewerker-admin | de 39 min eigenaar-alleen | | | |
| read-only admin | elke wachtrijknop weigert | *(wacht op een sessie)* | elke knop hoort te weigeren | **OPEN** -- vraagt een tweede admin-inlog. |
| admin/owner | **reis 8: weigeren MET reden** | Refuse-dialoog op de affiliate-aanvraag: "They are told, with your reason, and **can apply again later**", naam erbij, `Yes, refuse` **staat uit tot er een reden staat**. Reden ingevuld en ingediend -> toast **"Couldn't save that -- Only the account owner can decide this"**, aanvraag bleef `applied`, geen reden in de database. | de weigering landt, met de reden, en de klant leest hem | **GEFIXT DOOR PLAK 165 (gedraaid 30-09, 7 van 7 omgezet) EN DAARNA ECHT GEDAAN.** Als Lasse geweigerd: scherm zegt "Application refused -- They see your reason on their Referrals page", database `affiliate_status = refused` met de volledige reden, de melding `affiliate_refused` is zojuist verstuurd **met de reden in de payload**, en de auditregels gingen van 2 naar 3. **REIS 8 IS DAARMEE DICHT.** PSM0018 kan zich opnieuw aanmelden -- de dialoog zegt dat er zelf bij. Oorspronkelijke fout: Niet de app: die zei eerlijk wat er mis was (mijn eerste toast-selector miste hem, de POST gaf 200 omdat een server action zijn fout in de payload zet). De fout zit dieper: Lasse staat in `tenant_owners` maar de RPC toetst op `tenants.owner_id = auth.uid()`, en dat is alleen Bart. **Dertien** functies doen dat en **geen enkele** gebruikt `_in_owner_set`. Plak 165 zet de zeven beslisknoppen om; de drie triggers waar de toets een uitzondering geeft blijven staan (beleid). |
| — | laag 3: de vijf geldstappen | | | |
| — | laag 1 opnieuw (na de klantreis) | ochtend **11 van de 12 op 0**; controle 12 "elke factuur heeft een bedrijf" staat op **2**. rondje 18 controles, **niets op FOUT**, twee op KIJKEN (8 oude topups in de wachtrij, 1 klant achter met DST -- allebei werkvoorraad). | alles op 0 | **EEN ECHTE, GEVONDEN DOOR LAAG 1.** De eerste abonnementsfactuur van elke nieuwe klant heeft geen `company_id`: bij PSM0018 is de factuur om 07:41 gemaakt en het bedrijf om 08:55 ingevuld, en niets vult hem later aan. De nachtelijke run doet het wél goed, dus het raakt alleen de allereerste. Zichtbaar is het niet -- `/invoices` haalt de naam via de adverteerder -- maar adres en btw-nummer vallen van de factuur af. **Plak 164 geleverd.** De tweede (PSM0010, 22-09) heeft helemaal geen bedrijfsrij en blijft dus staan. |
| — | plak 157: opruimen | | | |
| — | laag 1 na het opruimen | | | |
| T3-R + eigenaar | **reis 4: ad-account vullen -- DICHT** | T3-R financierde AA-PSM0020-EU-01 met **EUR 100** uit zijn wallet (fee 4% = EUR 4,00, netto EUR 96,00), saldo EUR 250 -> EUR 150, status `pending`. Als Lasse op **Verify** met beide vinkjes: eerst de melding **"Verify a top-up with the Verify button, not by changing its status."** Na plak 170 opnieuw gedrukt: "Topup verified successfully". | de database, niet de toast | **KLOPT TOT OP DE CENT -- REIS 4 DICHT.** Na afloop: `#12 / completed / EUR / binnen 100,00 / fee 4,00 / netto 96,00 / eur_value 100,00 / wallet_debited true / geverifieerd 30-09 17:54:57 / AA-PSM0020-EU-01`, wallet EUR 150,00. **Wat de knopdruk blootlegde is het vermelden waard:** de wacht uit plak 134 (gemaakt zodat een medewerker-admin niet rechtstreeks kon PATCHen) weigerde de overgang naar `completed` **zonder uitzondering** -- ook die van `top_up_admin_verify` zelf. Gemeten: trigger `BEFORE INSERT OR UPDATE` zonder `when`-clausule, laatste geslaagde verificatie **28-09 14:49**. Sinds 28 september was geen enkele ad-account-topup meer af te ronden, terwijl het geld bij de AANVRAAG van de wallet gaat -- er stond dus EUR 96 van een klant vast. Plak 170 geeft de RPC een transactie-lokale vlag (`psm.topup_verify`) die de wacht honoreert; een handmatige PATCH heeft hem niet. **Alleen te vinden door te drukken** -- de code las goed. |
| eigenaar | **RockAds: klopt het, verliezen we niks?** | Op de vraag van de eigenaar uitgezocht wat de API ons kan vertellen. `/api/supplier-recon` gebouwd (admin-gated, alleen GET). | ons eigen boek tegen wat RockAds teruggeeft | **DRIE VAN DE VIER KUNNEN WE VANDAAG NIET.** (1) *Wat wij naar hen overmaken*: *niet leesbaar* -- `bank_ledger_entries` heeft **0 rijen**, dat boek is nooit geopend. (2) *Wat wij doortoppen*: onze kant wel -- 9 afgeronde ad-account-topups, **EUR 710,00 bruto, EUR 26,30 fee (3,70%), EUR 683,70 netto**. (3) *DST*: **1 regel ooit**, met de hand. (4) *Verliezen we niks / de 2%*: **nee, niet vast te stellen op een echte klant.** De inkoopprijs staat in `ad_account_costs` op **precies de zes E2E-testaccounts** (wij 5,00% / RockAds 2,5% / marge 2,50%) en op **geen enkele** van de zeven echte -- daar is de marge onbekend. RockAds stuurt `commission.rate` wél mee bij elk ad-account en de adapter leest het uit, maar niemand bewaart het. **Wat de weg korter maakt:** hun documentatie staat niet openbaar, dus de routes zijn aan de API zelf gevraagd zonder sleutel -- 401 = bestaat, 404 = bestaat niet, en een onzin-subpad geeft netjes 404, dus het verschil zegt echt iets. `/wallets/{id}/transactions`, `/ad-accounts/{id}/transactions` en `/ad-accounts/{id}/insights` **bestaan alle drie en zijn nooit aangeroepen**; `/transactions`, `/statements`, `/deposits` en `/payments` bestaan niet. Die laatste is de DST-grondslag, die nu met de hand per klant per week wordt ingetypt. |
| T3-R + eigenaar | **reis 6: geld terug van een ad-account -- DICHT** | **Klantkant** (paneel, `kosot10190@deertees.com`, 390px): Details op AA-PSM0020-EU-01 toont `FUNDED €100,00 / FUNDED, AFTER FEES €96,00 / FEES PAID €4,00`. Terugboekdialoog: plafond **"Up to €96,00"**, en hij zegt er zelf bij dat hij de BESTEDING er niet van aftrekt ("we check the real balance before approving"). **Zes takken ingedrukt:** de max-knop vult 96 en zet Review aan; `150` en `96.01` zetten hem uit **met het bedrag erbij** ("That is more than is on this account. The most you can ask back is €96.00."); `0` en `-5` houden hem uit; `25` zet hem aan. Stap 2 is een bevestiging met account, bedrag, bestemming, notitie en de waarschuwing dat lopende campagnes dat budget kwijt zijn. `Back` **bewaart bedrag en notitie**. Verstuurd -> "Request sent -- an admin will review it" en de klant ziet "Return requested from an ad account €25,00 · Requested". **Beheerkant** (Chrome, Lasse): WD-326679 in de wachtrij; Approve-dialoog toont **"Balance at the platform: not read"** met de reden erbij, en `Yes, approve it` staat **UIT** tot "I have checked the balance myself" aan staat. Goedgekeurd -> "Withdrawal approved -- wallet credited". | de database, en tegen wat wij op dit verse account gedaan hebben | **KLOPT TOT OP DE CENT -- REIS 6 DICHT.** Rij: `approved / EUR / 25,00 / 18:58:17`, wallet **€150,00 -> €175,00** en de USD-wallet onaangeroerd. **De valuta volgde het account**, en dat was de vraag: een agent meldde dat trigger `_withdrawal_is_always_usd` een EUR-opname als USD zou wegschrijven. Gemeten op de LIVE database: die trigger bestaat daar niet meer, hij heet `trg_withdrawal_takes_the_account_currency` en leest `ad_accounts.currency` -- plak 22 en 87 zijn geland. Zelfde verhaal bij de twee functies die op "altijd USD" rekenden: `_withdrawal_within_the_account`, `_claw_back_referral_commission` en `ad_account_withdrawal_approve` **kennen alle drie de valuta** op live (plak 68). Drie zware bevindingen, alle drie alleen waar voor de migratiebestanden. **Het grootboek vertelt de hele klant in vier regels**, en reis 3 staat er in: `+300 _wallet_topup_balance_sync (0 -> 300)`, `-50 ad_account_request_create_paid (300 -> 250)`, `-100 top_up_create_for_advertiser (250 -> 150)`, `+25 ad_account_withdrawal_approve (150 -> 175)`. **Clawback: geen, en terecht** -- er bestaan twee clawbackrijen van 24-09 dus het mechanisme werkt, maar PSM0017's enige commissie op deze klant (€37,50) staat op `paid` en de functie kapt af op wat nog OPENSTAAT. Beleidspunt voor de eigenaar, geen fout: bij een uitbetaalde commissie op geld dat daarna terugkomt, blijft de commissie staan. |
| eigenaar | **de dekkingscontrole vraagt de VERKEERDE leverancier** | De Approve-dialoog zegt "the supplier is in mock mode, so there is no real balance to read". Maar AA-PSM0020-EU-01 is een **Meta-EU-PSM-RA**-account, dus RockAds -- en RockAds is live: `/api/supplier-recon` leest daar vandaag **2 wallets, 98 ad-accounts en 504 mutaties**. De mock-mode die de dialoog noemt is SUPPLIER1 (SeamX). | wat de dialoog zegt tegen welke leverancier het account hoort | **OPEN, en het raakt de vraag van de eigenaar** ("stel het is een API ad account, dan dus alleen wat er live op dat ad acc staat als max refundable"). `readAdAccountLiveBalance` leest `balance_cents` -- de SeamX-vorm -- en vraagt het dus altijd aan supplier1, ook voor een RockAds-account. RockAds geeft per ad-account wel een `balance` terug (`fetchRockadsAdAccount`, al in de adapter). Het gedrag is verder GOED: geen verzonnen nul, de reden staat erbij en de knop blijft uit tot een mens bevestigt. Wat ontbreekt is dat hij de goede leverancier vraagt. |
