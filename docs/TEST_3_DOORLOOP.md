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
| T3-A | accounts | | | |
| T3-A | ad-account aanvragen | | | |
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
| T3-F | payout aanvragen | knop **`Request payout` staat UIT**, met de reden eronder: "As soon as you have EUR 200,00 or USD 200,00 in commission, the button below opens." | uit, want er is nog niets verdiend | **KLOPT, en dit is de goede vorm** -- geen knop die niets doet maar een knop die uit staat mét de drempel erbij. Leidingwerk nagekeken: de levende RPC `affiliate_payout_request_multi` is SECURITY DEFINER en **mag** door `authenticated` (de oude enkelvoudige `affiliate_payout_request` mag dat niet, en wordt nergens gebruikt). De drempel is per affiliate te verlagen via `affiliate_payout_min_set`, waarbij 0 betekent "mag om alles vragen" -- **dus reis 7 is af te maken zonder EUR 200 echte commissie.** **Wat ontbreekt: een referral.** Dat vraagt een aanmelding via de link hierboven, en een aanmelding is een wachtwoord, dus die is van de eigenaar. |
| T3-R | aanmelden via de link van T3-F | | | |
| T3-R | attributie zichtbaar bij T3-F | | | |
| eigenaar | dashboard (390px) | adverteerders **19**, affiliates **5**, abonnementen billing now **7**, achterstallige facturen **3**, bankgeld **95** | 19 / 5 / 7 (4 actief + 3 past_due) / 3 op deze tenant / 95 | **KLOPT, 5 van 5.** De 7 is plak 160 die werkt: de drie stil uitgevallen abonnementen staan weer op past_due, en het zijn exact de drie achterstallige facturen (125, 136, 138). Mijn eerste telling van 5 achterstallige was fout -- ik vergat de tenant; 2 daarvan staan op psm-e2e. |
| eigenaar | de overige 38 schermen | **25 beheerroutes gelopen**, geen enkele met een foutmelding, geen lege staat boven echte rijen. Gemeten en tegen de database gehouden: `/users` **Advertisers 14 / Affiliates 5 / 14 active**; `/subscriptions` **4 active, 3 past due, 2 inactive**; `/ledger` **0 -- "The books add up" over 19 wallets**; `/reconciliation` 1 te onderzoeken; `/finance-check` 97 wachtend op een mens, EUR 46.790 / USD 41.300; `/audit` toont plak 163 om 11:51 als `invoices UPDATE` op naam van **Bart**; `/invites` alle drie de T3-accounts **accepted**; `/admins` drie admins (Lasse=jij, Admin 1, Bart). | dashboard zei 19 adverteerders; ledger moet sluiten; de plak moet op de auditregel staan | **KLOPT, en de twee cijfers die tegen elkaar leken in te gaan doen dat niet.** Dashboard 19 telt `advertisers`-RIJEN; `/users` telt `user_profiles` op ROL -- database: advertiser 14, affiliate 5, admin 3, dus 14+5=19. Allebei goed, zelfde woord, andere verzameling. En de ledgerclaim houdt: **0 van de 21 wallets wijkt af** van de som van zijn eigen bewegingen; PSM0018 is 500,00 ledger tegen 500 saldo. Eén kleinigheid: `/help` (admin) zegt "Wallet -> **Add Balance**" en die knop heet "Top up". |
| medewerker-admin | de 39 min eigenaar-alleen | | | |
| read-only admin | elke wachtrijknop weigert | *(wacht op een sessie)* | elke knop hoort te weigeren | **OPEN** -- vraagt een tweede admin-inlog. |
| admin/owner | **reis 8: weigeren MET reden** | Refuse-dialoog op de affiliate-aanvraag: "They are told, with your reason, and **can apply again later**", naam erbij, `Yes, refuse` **staat uit tot er een reden staat**. Reden ingevuld en ingediend -> toast **"Couldn't save that -- Only the account owner can decide this"**, aanvraag bleef `applied`, geen reden in de database. | de weigering landt, met de reden, en de klant leest hem | **FOUT GEVONDEN, PLAK 165 GELEVERD.** Niet de app: die zei eerlijk wat er mis was (mijn eerste toast-selector miste hem, de POST gaf 200 omdat een server action zijn fout in de payload zet). De fout zit dieper: Lasse staat in `tenant_owners` maar de RPC toetst op `tenants.owner_id = auth.uid()`, en dat is alleen Bart. **Dertien** functies doen dat en **geen enkele** gebruikt `_in_owner_set`. Plak 165 zet de zeven beslisknoppen om; de drie triggers waar de toets een uitzondering geeft blijven staan (beleid). |
| — | laag 3: de vijf geldstappen | | | |
| — | laag 1 opnieuw (na de klantreis) | ochtend **11 van de 12 op 0**; controle 12 "elke factuur heeft een bedrijf" staat op **2**. rondje 18 controles, **niets op FOUT**, twee op KIJKEN (8 oude topups in de wachtrij, 1 klant achter met DST -- allebei werkvoorraad). | alles op 0 | **EEN ECHTE, GEVONDEN DOOR LAAG 1.** De eerste abonnementsfactuur van elke nieuwe klant heeft geen `company_id`: bij PSM0018 is de factuur om 07:41 gemaakt en het bedrijf om 08:55 ingevuld, en niets vult hem later aan. De nachtelijke run doet het wél goed, dus het raakt alleen de allereerste. Zichtbaar is het niet -- `/invoices` haalt de naam via de adverteerder -- maar adres en btw-nummer vallen van de factuur af. **Plak 164 geleverd.** De tweede (PSM0010, 22-09) heeft helemaal geen bedrijfsrij en blijft dus staan. |
| — | plak 157: opruimen | | | |
| — | laag 1 na het opruimen | | | |
