# TEST 4 — ELKE REIS, ELKE SOORT

> Geschreven 01-10-2026, na test 3. De eigenaar: *"maak alvast slimme
> test 4 en geef ook de prompt, vooral alle mogelijke reizen."*

---

## Waarom test 4 anders is dan test 3

Test 3 liep de acht reizen op **vier** verse accounts. Dat bewees dat
de reizen werken — voor de soort account die we kozen. Het bewees niet
dat ze werken voor **elke** soort:

- een ad account met API (Meta-EU-PSM, automatisch gefund en met een
  live saldo als plafond voor terugboeken) gedraagt zich anders dan een
  handmatig account (Google, TikTok, Meta-HK);
- een USD-wallet, een NSA-fee van 5%, een plan met twee inbegrepen
  accounts, een klant zonder plan — elk is een tak die test 3 niet
  opende;
- en sinds test 3 zijn er dingen bij die nog nooit door een klant zijn
  gelopen: **Nederlands**, **teams (meekijken)**, de **partnergids**,
  de **hulp** in de app, de **factuurmail**, de **backups**.

Test 4 is daarom geen nieuwe soort test maar een **matrix**: dezelfde
reizen, maar over elke soort account, elke valuta en elke rol.

**Niet in twee talen** (de eigenaar, 01-10: "test 4 hoeft niet in 2
talen"). Alles loopt in het Engels. De Nederlandse vertaling is een
apart, later rondje; R2 hieronder is daarom optioneel. "Slim" betekent hier: niet alles met alles vermenigvuldigen
(dat zijn honderden runs), maar elke **tak** minstens één keer laten
lopen, op het account waar hij van nature voorkomt.

**Een reis is binair: werkt of werkt niet.** Een reis werkt pas als
hij gelopen is in de browser, met een sessie per rol, met elk bedrag
tot op de cent tegen de database gehouden.

---

## Laag 0 — voor er een scherm opengaat

```bash
npm run ochtend && npm run rondje
```

Staat er iets op FOUT, dan begint test 4 niet. En:

- `supabase/checks/RESTORE-DRILL-TELLING.sql` → regel 6 ("wallets die
  niet bij hun ledger passen") moet **0** zijn. Nulmeting 01-10: 0.
- `curl -s https://app.primescalemedia.com/api/version` → de sha die je
  verwacht.
- Open plakken? Alle open plakken eerst, als file.

---

## De verse accounts (T4)

Elk via de **echte** weg aangemaakt — dat test reis 1 meteen mee. De
eigenaar typt elk wachtwoord en drukt elke Join; Claude doet de rest.
Wegwerp-mailboxen werken. De codes worden PSM0021 en verder.

| # | rol | plan / community | taal | wallet | ad account (type) | wat dit account bewijst |
|---|---|---|---|---|---|---|
| **T4-A** | adverteerder | **Flex** (EUR 75, 1 inbegrepen, 5%) | EN | EUR | **Meta-EU-PSM** (API) | de API-tak: automatisch funden, live saldo, terugboek-plafond = live saldo |
| **T4-B** | adverteerder | **Prime** (EUR 200, 2 inbegrepen, 3%) | EN | **USD** | **Google** (handmatig) | USD van top-up tot factuur; tweede account inbegrepen (geen EUR 50) |
| **T4-C** | adverteerder | **Launch** (EUR 150, 1 inbegrepen, 3,5%) | EN | EUR | **TikTok** (handmatig) | TikTok-velden (BC ID, landen); een extra account = EUR 50 van de wallet |
| **T4-N** | adverteerder | **NSA**-community (5%) | EN | EUR | **Meta-HK-Premium** (handmatig) | de community-fee op elk scherm; de HK-bankroute bij de top-up |
| **T4-F** | affiliate | — | EN | EUR + USD | — | link, referral, commissie, uitbetaling in beide valuta |
| **T4-R** | adverteerder via de link van T4-F | Flex | EN | EUR | Meta-EU-PSM-GH (handmatig) | attributie, commissie op top-up én op plan, clawback bij terugboeking |
| **T4-V** | teamlid (viewer) van T4-A | — | EN | — | — | meekijken: ziet alles van T4-A, kan niets dat geld verplaatst |
| **T4-U** | affiliate die óók wil adverteren | — | EN | — | — | de "Advertise with us too"-route naar een adverteerdersdashboard |
| **T4-0** | adverteerder **zonder** plan | — | EN | EUR | — | de lege staten: geen plan, aanvragen geblokkeerd, wat er dan staat |

Beheerkant: **eigenaar** (Baris) in Chrome `Baris Laptop`, en waar
nodig de tweede eigenaar (Lasse, contact@primescalemedia.com) voor één
check op de auditregel ("wie deed dit").

**NOEM ALTIJD HET E-MAILADRES** waarmee ingelogd moet worden. Zet de
adressen in de tabel hierboven zodra ze bestaan.

---

## De reizen

Elke reis heeft: **wie**, **stappen**, **wat er moet staan**, **wat je
tegen de database houdt**, en **welke takken**. "Takken" zijn de keuzes
in een dialoog die je ALLEMAAL opent (Next, Back, kijken wat er
verandert), ook als je er maar één echt uitvoert.

### R1 — Uitnodigen en aanmelden (alle T4-accounts)

- **Takken van het uitnodigformulier:** adverteerder / affiliate;
  elk plan (Flex, Prime, Launch, NSA, geen); referrer wel/niet;
  valuta. Elke keuze → kijk wat de samenvatting zegt.
- **Stappen:** uitnodiging → mail → aanmelden → bevestigingsmail →
  inloggen → onboarding/bedrijfsgegevens → dashboard.
- **Randen:** verlopen uitnodiging; e-mail die al een account heeft;
  bevestigingsmail opnieuw (wacht-teller); wachtwoord < 12 tekens;
  "wachtwoord vergeten" → herstellink → nieuw wachtwoord.
- **Database:** `advertisers` (code, tenant), `subscriptions` (plan,
  bedrag, status), `advertiser_plans`, `wallets` (2 rijen per klant),
  `user_profiles.locale`.

### R2 — Taal (OPTIONEEL, niet nodig om test 4 af te maken)

- Avatar → EN | NL. Na herladen blijft de keuze (staat in
  `user_profiles.locale`).
- **Elk scherm** in NL openen: dashboard, wallet, accounts, aanvragen,
  facturen, rapport, meldingen, opties, team, partners, hulp. En elke
  dialoog: top-up, exchange, ad-account aanvragen, funden, terugboeken,
  uitbetaling.
- **Moet Engels blijven:** top-up, exchange, wallet, ad account, fee,
  referral, Pay now — de woordenlijst in `docs/NL_EN.md`.
- **Zoek actief naar:** Engelse zinnen in NL; knoppen die afbreken of
  over twee regels gaan; datums ("30 sep." en niet "30 Sep"); de
  dagquote; meldingen; statuslabels; kolomkoppen op mobiel.
- **Weet wat nog Engels is** (geen fout, staat op de lijst): de pdf
  van een factuur, de e-mails, partnerbeschrijvingen (komen uit de
  database), de beheerkant.

### R3 — Wallet top-up (T4-A EUR, T4-B USD, T4-N HK-route)

- **Takken:** 4 overmaakvaluta × 2 wallets. Per combinatie: welke bank,
  welk minimum, welk bedrag "maak minimaal over", wat wordt
  bijgeschreven. Next, Back, wisselen.
- **Randen:** een tweede top-up terwijl er één openstaat (kenmerk van
  de vorige); bewijs als HEIC (moet geweigerd met uitleg); bestand >
  10 MB; geen bewijs.
- **Beheer:** verifiëren (bedrag = bijgeschreven), en een tweede
  **weigeren met reden** → de klant ziet de reden, in zijn taal.
- **Database:** `wallet_topups` (status, bedrag), `wallets`
  (saldo), `wallet_ledger` (balance_before/after), melding verstuurd.

### R4 — Exchange (T4-A en T4-B)

- EUR → USD en USD → EUR. Fee 0,6%. "Wat landt er" tegen de koers van
  dat moment. Meer dan het saldo → geweigerd.
- **Eigenaar:** het exchange-overzicht (`/exchanges`) → detail → koers,
  wallet voor en na, en de match met het grootboek.
- **Database:** `wallet_exchanges`, twee ledgerregels, saldi.

### R5 — Ad account aanvragen (T4-A, T4-B, T4-C, T4-N, T4-0)

- **Takken per platform:** Meta (1 tot 5 BM ID's; 6e geweigerd; leeg
  geweigerd), Google (e-mail verplicht), TikTok (BC ID, e-mail,
  landen). Valuta en tijdzone.
- **Prijs:** inbegrepen in het plan (geen fee) / extra (EUR 50 van de
  wallet, saldo voor → na getoond) / te weinig saldo (geblokkeerd met
  "top eerst up") / **geen plan** (T4-0: geblokkeerd met uitleg).
- **Beheer:** goedkeuren → account aanmaken; en één **weigeren met
  reden** → de EUR 50 komt terug (melding "Je aanvraagfee is terug").
- **Database:** `ad_account_requests`, `invoices` (fee), wallet,
  ledger.

### R6 — Ad account funden (alle adverteerders)

- **De fee per type:** Meta-EU-PSM 5% (of het plan-tarief als dat
  lager is — check wat de regel is), Google, TikTok, Meta-HK, NSA 5%.
  Het scherm toont fee + "komt op het account"; dat moet tot op de cent
  kloppen met wat er geboekt wordt.
- **API-tak (T4-A):** de funding gaat automatisch naar de leverancier;
  controleer de status en het bedrag bij de leverancier (RockAds).
- **Handmatig (T4-B/C/N):** beheer verifieert; en één keer weigeren
  met reden → geld terug in de wallet.
- **Database:** `top_ups` (bedrag, fee, landed), wallet, ledger,
  `integration_jobs` (API).

### R7 — Geld terug van een ad account (T4-A API, T4-C handmatig)

- **Plafond:** handmatig = gefund min al teruggevraagd; API = het
  **live saldo** bij de leverancier, en het scherm zegt dat het live
  saldo de grens is.
- Meer vragen dan het plafond → geweigerd met het maximum.
- **Beheer:** goedkeuren → geld in de wallet; en één weigeren met
  reden. Ook: **beheer zet er een klaar namens de klant** (met
  verplichte notitie) en een andere admin keurt goed.
- **T4-R:** een terugboeking op een account van een aangebrachte klant
  → de openstaande commissie gaat omlaag (clawback), uitbetaalde
  commissie blijft.
- **Database:** `ad_account_withdrawals`, wallet, ledger,
  `referral_clawbacks`.

### R8 — Plan en facturen (T4-A, T4-B, T4-0)

- **Nachtrun (03:00 UTC):** een plan op zijn vervaldatum krijgt een
  factuur, de klant een **mail** en een melding. Controleer de mail.
  Niet dubbel: een tweede run maakt niets extra.
- **Betalen:** Pay now uit de wallet (saldo voor/na); te weinig in
  EUR maar wel in USD → "Exchange en betaal"; te weinig in beide →
  "Top up en betaal".
- **Herinnering** een paar dagen voor de vervaldatum; **automatisch
  afschrijven** na de vervaldatum; **niet te innen** → past due.
- **Na betaling:** `next_payment_date` schuift een maand op (zie plak
  180 — dat ging één keer mis).
- **Beheer:** een abonnement maken zónder plan → geweigerd met de
  lijst plannen; met plan → bedrag past bij het plan.
- **Facturen-pdf:** downloaden, en (zodra Drive gekoppeld is) staat de
  pdf in `Facturen/<jaar>/<maand>/`.

### R9 — Affiliate (T4-F, T4-R)

- Link kopiëren; T4-R meldt zich ermee aan → T4-F krijgt "iemand
  meldde zich aan"; beheer **keurt de referral goed** (en bij een
  tweede: weigeren met reden).
- **Commissie** uit: een top-up van T4-R, een planbetaling van T4-R,
  eventueel de welkomstbonus. Per soort het bedrag tegen
  `referral_commissions` en `commission_rules`.
- **Niveau** (Starter → Riser → ...) volgt de totale verdiensten.
- **Uitbetaling:** onder het minimum → knop dicht met "nog X";
  erboven → aanvragen in EUR, in USD, en "alles in EUR" met omrekenfee;
  bankgegevens; intrekken; beheer betaalt uit met kenmerk / weigert met
  reden.
- **Export** (CSV) met de periodefilter.

### R10 — Ook adverteren (T4-U)

- Een affiliate vraagt "Advertise with us too" → beheer keurt goed →
  na herladen een adverteerdersdashboard, met link en verdiensten
  intact. Eén keer weigeren met reden.

### R11 — Team (T4-A eigenaar, T4-V viewer)

- T4-A → Team → nodig een collega uit → link kopiëren → T4-V meldt
  zich aan met die link.
- **T4-V ziet:** de saldi, ad accounts, facturen en het rapport van
  T4-A, met de banner "alleen lezen".
- **T4-V kan niet:** top-up, exchange, funden, aanvragen, betalen, het
  team wijzigen. Elke knop zegt waarom.
- **En op de server:** een directe aanroep van een geldactie als
  viewer moet geweigerd worden (niet alleen een verborgen knop).
- T4-A haalt T4-V weg → T4-V ziet niets meer van T4-A. Een
  uitnodiging intrekken.

### R12 — Meldingen (iedereen)

- Opties → Meldingen: per groep en per soort aan/uit. Zet er één uit →
  die melding komt niet meer (in de app), de rest wel.
- Elke melding uit R3–R11 in de juiste taal, met het juiste bedrag.

### R13 — Partners en hulp (T4-A, T4-B)

- Partners: tegels, "Meer info" opent in een nieuw tabblad.
- Hulp: elk hoofdstuk open, in de taal van het account. Klopt wat er
  staat met wat de app doet (knopnamen, waar iets zit)?
- **Geen leveranciersnaam** (RockAds, Falkyn), geen accounttype, geen
  marge — niet in de tekst en niet in de JSON achter de pagina.

### R14 — Beheerqueues (eigenaar)

- Elke queue: wallet top-ups, ad-account top-ups, aanvragen,
  terugboekingen, referrals, uitbetalingen, ook-adverteren,
  verwijderverzoeken. **Verifiëren** en **weigeren met reden**, elk
  minstens één keer. De reden komt bij de klant aan.
- **Alles gelogd:** `audit_events` heeft per actie wie en wat.

### R15 — Eigenaarsschermen

- Supplier-tegoed (RockAds, Falkyn, Wise) — Slash verborgen.
- RockAds-reconciliatie (`/api/supplier-recon`): erin, eruit, 2%,
  DST, afwijkende tarieven.
- Een ad account koppelen aan een RockAds-account; de naam neemt over.
- Exchanges-overzicht.
- Plannen beheren.

### R16 — Backups (eigenaar, zodra Drive gekoppeld is)

- `docs/BACKUP_DRIVE_SETUP.md` gevolgd → Vercel → Cron Jobs → Run
  `/api/cron/system-backup` → zip in `Backups/<jaar>/<maand>/` + mail.
- `npm run backup:verify -- <zip>` → "Alles klopt", exit 0.
- Run `/api/cron/invoice-drive` → elke betaalde factuur van T4 staat in
  de juiste maandmap; `invoices.drive_file_id` gevuld.
- **Oefening A** uit `docs/RESTORE_DRILL.md` (de zip), en plan
  oefening B (herstel naar een nieuw project).

### R17 — De nacht (de dag erna)

- Billing-run gedraaid? Nieuwe facturen, mails, geen dubbele.
- Backup-mail binnen? Factuur-pdf's op Drive?
- `npm run ochtend && npm run rondje`, en de telling uit
  `RESTORE-DRILL-TELLING.sql`: regel 6 nog **0**.

### R18 — Wat een klant NIET mag zien (doorlopend, bij elke reis)

Bij elk klantscherm (alle T4-accounts behalve beheer):

- Netwerk-tab / de JSON van elke lees: geen `supplier`, `rockads`,
  `falkyn`, `seamx`, type-slug (`eu-meta-psm`), kostprijs, marge.
- Geen privé-WhatsApp-knop naar de eigenaar; alleen "Stuur ons een
  bericht in je PSMxxxx-groep".
- Een klant kan via de URL (`?view=...`, een id van een ander) niets
  van een andere klant openen.

---

## Volgorde

1. Laag 0.
2. R1 voor alle T4-accounts (de eigenaar typt, Claude bereidt voor).
3. Per account de reizen in deze volgorde: R2 (taal zetten) → R3 → R4
   → R5 → R6 → R7 → R8 → R12 → R13. Eerst T4-A (de API-tak, het
   grootste risico), dan T4-B (USD + NL), dan T4-N, T4-C, T4-0.
4. Affiliate-blok: R9 (T4-F + T4-R), R10 (T4-U).
5. R11 (team).
6. R14, R15 (beheer) — grotendeels al gelopen als tweede tab bij de
   reizen hierboven; hier de rest.
7. R16 (backups), en de volgende ochtend R17.
8. R18 loopt de hele tijd mee.

## Wat test 4 klaar maakt

Elke regel in het logboek heeft een uitkomst: **werkt** (met het
bedrag op het scherm en het bedrag in de database), of **werkt niet**
(met wat er mis is en de commit die het fixte, of wat er van de
eigenaar nodig is).

---

## Logboek

| reis | account | taal | uitkomst | scherm | database | fix / open |
|---|---|---|---|---|---|---|
| R1 | T4-A | EN | | | | |
| R1 | T4-B | EN | | | | |
| R1 | T4-C | EN | | | | |
| R1 | T4-N | EN | | | | |
| R1 | T4-F | EN | | | | |
| R1 | T4-R | EN | | | | |
| R1 | T4-V | EN | | | | |
| R1 | T4-U | EN | | | | |
| R1 | T4-0 | EN | | | | |
| R2 | (optioneel) | NL | | | | |
| R3 | T4-A EUR | EN | | | | |
| R3 | T4-B USD | EN | | | | |
| R3 | T4-N HK | EN | | | | |
| R4 | T4-A / T4-B | | | | | |
| R5 | T4-A Meta API | EN | | | | |
| R5 | T4-B Google (2e inbegrepen) | EN | | | | |
| R5 | T4-C TikTok (extra, EUR 50) | EN | | | | |
| R5 | T4-N Meta-HK | EN | | | | |
| R5 | T4-0 geen plan | EN | | | | |
| R6 | T4-A API | EN | | | | |
| R6 | T4-B / T4-C / T4-N handmatig | EN | | | | |
| R7 | T4-A live plafond | EN | | | | |
| R7 | T4-C handmatig plafond | EN | | | | |
| R7 | T4-R clawback | EN | | | | |
| R8 | T4-A EUR | EN | | | | |
| R8 | T4-B USD | EN | | | | |
| R8 | T4-0 geen plan | EN | | | | |
| R9 | T4-F + T4-R | EN | | | | |
| R10 | T4-U | EN | | | | |
| R11 | T4-A + T4-V | EN | | | | |
| R12 | alle | | | | | |
| R13 | T4-A, T4-B | | | | | |
| R14 | beheer | EN | | | | |
| R15 | eigenaar | EN | | | | |
| R16 | eigenaar | | | | | |
| R17 | de nacht | | | | | |
| R18 | doorlopend | | | | | |
