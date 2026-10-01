# TEST 4 — ELKE REIS, ELKE SOORT

> Geschreven 01-10-2026, na test 3. De eigenaar: *"maak alvast slimme
> test 4 en geef ook de prompt, vooral alle mogelijke reizen."*
> Bijgewerkt 01-10 avond: alles wat er die dag bij kwam (R11 rechten per
> lid, R19 beheertools, R20 de lekcontrole, vaste klantcode, factuur-pdf,
> schema in de backup) en **wanneer we live gaan** (onderaan).

---

## Wanneer is het af — en moet alles foutloos zijn?

**Nee, niet alles. Wel alles waar geld of vertrouwen aan hangt.** Een
bug is één van drie soorten, en alleen de eerste houdt live tegen:

| soort | voorbeeld | houdt live tegen? |
|---|---|---|
| **BLOKKER** | een bedrag klopt niet tot op de cent; geld kan dubbel of verdwijnen; een klant ziet een leverancier, type of marge; een klant komt bij een ander z'n gegevens; een knop die geld zou moeten bewegen doet niets; een reis loopt dood | **JA** — eerst fixen, dan de reis opnieuw |
| **HINDERLIJK** | een verkeerde tekst, een lelijke lege staat, een vertaling die mist | nee — fixen in dezelfde ronde als het snel kan, anders op de lijst |
| **WENS** | iets dat mooier of slimmer kan | nee — naar `docs/NEXT_SESSION_FIRST.md` |

**Live met echte klanten** zodra: alle reizen met geld (R1, R3–R9, R11,
R14) staan op **werkt**, R20 (lekcontrole) staat op **schoon**, en er
staat **geen enkele BLOKKER** open. Dat is de regel uit CLAUDE.md: de
acht reizen, binair. Een HINDERLIJK-lijstje is normaal en mag mee live.

## Hoe lang duurt test 4 (tegenover test 3)

Test 3 liep van 30-09 21:35 tot 01-10 middag: vier accounts, en
onderweg tientallen fixes — elke reis vond iets. Test 4 heeft meer
accounts (negen) maar er is sindsdien veel gefixt, dus per reis minder
oponthoud. Schatting:

- **actief werk: 6 tot 10 uur**, waarvan jij alleen de wachtwoorden en
  Join-knoppen doet (± 20 minuten verspreid);
- **plus één nacht**, omdat de facturen, de automatische afschrijving en
  de backup (R8, R17) alleen 's nachts draaien;
- dus **twee dagen kalender**, als er geen BLOKKER opduikt. Elke blokker
  kost een fix + deploy (± 15 minuten) en de reis opnieuw.

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

**Eén taal, plus een supersnelle NL-check** (de eigenaar, 01-10: "test
4 hoeft niet in 2 talen ... tweetalig kan wel maar gewoon echt een super
snelle check, geen tijd aan besteden"). De reizen lopen in het Engels.
R2 is één snelle ronde in het Nederlands, maximaal tien minuten, aan het
eind. "Slim" betekent hier: niet alles met alles vermenigvuldigen
(dat zijn honderden runs), maar elke **tak** minstens één keer laten
lopen, op het account waar hij van nature voorkomt.

**Een reis is binair: werkt of werkt niet.** Een reis werkt pas als
hij gelopen is in de browser, met een sessie per rol, met elk bedrag
tot op de cent tegen de database gehouden.

---

## Blok 0 — eerst dicht: de lekken uit de controle van 01-10

Drie agents liepen op 01-10 alles na (scherm, data achter de pagina,
mails/pdf/meldingen). Gefixt en live (537b797b + plak 191): meldingsdata
met de typeslug, "Slash" in de ZANEL-bankgegevens, "Meta Premium",
de privacy-export, accountnamen met HK/GH, en de tabel bank_accounts
die elke klant kon lezen.

**Nog open — BLOKKER voor live, eerste werk van test 4:**

| # | wat | waarom het telt | aanpak |
|---|---|---|---|
| L1 | `ad_accounts.platform` is de interne typeslug (`hk-meta-premium`, `eu-meta-psm`) en de klant leest zijn eigen rijen (ook via `top_ups_view`) | staat in de JSON achter elk accountscherm | klanten lezen hun accounts via een eigen view/RPC die `network` (Meta/Google/TikTok) en de bankgroep geeft, niet de slug; de directe klant-policy op ad_accounts gaat dicht |
| L2 | `lib/bank-routing.ts` (slug → bank) en `routes` in `lib/bank-beneficiaries.ts` zitten in de JavaScript van de klant | elke typenaam staat leesbaar in het bestand dat de browser laadt | de bankgroep komt van de server (L1); `routes` naar een bestand alleen voor admins |
| L3 | `ad_account_withdrawals`: supplier_status, external_withdraw_id, sent_to_supplier_at leesbaar voor de klant | nu leeg, straks een transactie-id van de leverancier | naar een tabel alleen voor admins |
| L4 | vrije admin-notities (`ad_accounts.notes`, `advertisers.note`, `top_ups.notes/author`) leesbaar voor de klant | nu schoon, maar één getypte leveranciersnaam lekt | naar een tabel alleen voor admins |

**Stand 01-10 avond — Blok 0 DICHT:**

- L1 DICHT (01-10 avond): plak 192 -> 197 (terug: zes serverpaden lazen nog als klant) -> code 95287ad2 (view, of service-sleutel na eigendomscheck) -> plak 198 (klantregels weg; gecontroleerd: alleen 'Enable ALL for admins') -> plak 199 (view alleen lezen; gecontroleerd).
- L2 dicht: een bundel per rol (components/role-split), typelijsten, MUXUE en
  het eigenaarshandboek naar beheerbestanden.
- L3 bewust geaccepteerd: de leveranciersvelden bij terugboekingen zijn leeg en
  bevatten nooit een naam (alleen een id); de kolomnaam zegt "supplier".
- L4 dicht: plak 193 weigert een leveranciers- of typenaam in een notitie die de
  klant kan lezen.
- **Gemeten als klant (PSM0022)**: alle 74 tabellen/views opgevraagd met de
  klantsessie (12 leesbaar, 0 treffers), alle 44 JavaScript-bestanden (0
  leveranciers- of typenamen), alle 12 schermen (0 treffers). Script:
  scripts/leak-scan-browser.js.

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
Wegwerp-mailboxen werken. De codes worden **PSM0023** en verder (PSM0022
is het factuurtest-account van de eigenaar). **Sinds plak 187 ligt de
code vast bij het uitnodigen** — het uitnodigscherm toont "PSM00xx
reserved for them"; controleer dat de klant na het aanmelden precies die
code heeft.

| # | rol | plan / community | taal | wallet | ad account (type) | wat dit account bewijst |
|---|---|---|---|---|---|---|
| **T4-A** | adverteerder | **Flex** (EUR 75, 1 inbegrepen, 5%) | EN | EUR | **Meta-EU-PSM** (API) | de API-tak: automatisch funden, live saldo, terugboek-plafond = live saldo |
| **T4-B** | adverteerder | **Prime** (EUR 200, 2 inbegrepen, 3%) | EN | **USD** | **Google** (handmatig) | USD van top-up tot factuur; tweede account inbegrepen (geen EUR 50) |
| **T4-C** | adverteerder | **Launch** (EUR 150, 1 inbegrepen, 3,5%) | EN | EUR | **TikTok** (handmatig) | TikTok-velden (BC ID, landen); een extra account = EUR 50 van de wallet |
| **T4-N** | adverteerder | **NSA**-community (5%) | EN | EUR | **Meta-HK-Premium** (handmatig) | de community-fee op elk scherm; de HK-bankroute bij de top-up |
| **T4-F** | affiliate | — | EN | EUR + USD | — | link, referral, commissie, uitbetaling in beide valuta |
| **T4-R** | adverteerder via de link van T4-F | Flex | EN | EUR | Meta-EU-PSM-GH (handmatig) | attributie, commissie op top-up én op plan, clawback bij terugboeking |
| **T4-V** | teamlid van T4-A, **zonder** rechten | — | EN | — | — | meekijken: ziet alles van T4-A, kan niets dat geld verplaatst |
| **T4-W** | teamlid van T4-A, **met** Exchange + Fund | — | EN | — | — | rechten per lid (plak 184): precies de aangevinkte knoppen werken, de rest niet — ook niet op de server |
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
- **Klantcode vast:** na "Create invite" staat er "PSM00xx reserved for
  them"; twee uitnodigingen achter elkaar krijgen twee verschillende
  codes; opnieuw uitnodigen naar hetzelfde adres houdt dezelfde code;
  na aanmelden heeft de klant exact die code (`invitations.client_code`
  = `advertisers.tenant_client_code`).
- **Factuurmail bij aanmelden:** wie met een plan binnenkomt krijgt
  meteen de eerste factuur + een mail **met de pdf als bijlage**, binnen
  enkele seconden (`notification_emails.sent_at`).
- **Database:** `advertisers` (code, tenant), `subscriptions` (plan,
  bedrag, status), `advertiser_plans`, `wallets` (2 rijen per klant),
  `user_profiles.locale`.

### R2 — Taal: supersnelle check (max 10 minuten, aan het eind)

Eén account (T4-B), avatar → NL, en dan alleen kijken -- niets
uitvoeren:

- elk tabblad één keer open; elke dialoog één keer open en dicht;
- staat er een Engelse ZIN, een afgebroken knop of een "Sep" in plaats
  van "sep."? Noteer het in één regel; fixen hoort bij een later rondje,
  tenzij het een knop onleesbaar maakt;
- terug naar EN, herladen: blijft het EN?
- **beheerkant, 2 minuten:** Manual → taal Nederlands (met de hand
  geschreven) en één andere taal (bv. Polski): de eerste keer "Downloading
  the … language pack", daarna het hele handboek vertaald.

Bewust Engels (geen fout): top-up, exchange, wallet, ad account, fee,
referral, Pay now; de factuur-pdf, de e-mails, partnerbeschrijvingen,
de beheerkant.

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
- **Herontwerp 01-10 — loop elk van deze ook langs:**
  - Stap 1 = wallet + valuta + **bedrag**. Het vak staat in de valuta
    die je STUURT (teken en snelknoppen mee; HKD-knoppen in HKD-sommen).
    Een USD-wallet opent op USD.
  - Andere valuta dan de wallet: bon met je stuurt / dagkoers /
    omgerekend / **conversion fee 0,6%** / wij schrijven bij; dat netto
    bedrag is EXACT wat in `wallet_topups.amount` komt (tegen de koers in
    `exchange_rates`, tot op de cent). Minimum in de betaalvaluta, dekt de fee.
  - Kleine regel onder de koers: "Koers bijgewerkt … · middenkoers".
  - Stap 2 opent met "Maak precies X over"; alle bankgegevens in de
    donkere kaart; adres per veld kopieerbaar; rekeninghoudersregel als
    voetregel; één kenmerk-ticket (een open top-up heeft zijn eigen kleine
    kenmerk in de melding). Kopieerknoppen echt plakken om te testen.
  - Stap 3: samenvatting + bewijs (ook slepen). Zonder vinkje "aparte
    overboeking" blijft Submit uit.
  - Route/valuta verandert na stap 1 → terug naar stap 1, vak leeg,
    bewijs weg, melding.
  - Succes past op één telefoonscherm; bedrag = ingediend bedrag.
  - Concept: sluit en open twee keer; het bedrag komt terug, alleen in
    dezelfde valuta.
- **Beheer, herontwerp:** de Verify-bevestiging toont de slip;
  Details/Reject/Slip op één rij (ook bij ad top-ups); **Other amount**
  en **Precharge** alleen in Details; geen Precharge zolang een ander
  bedrag is voorgesteld.

### R4 — Exchange (T4-A en T4-B)

- EUR → USD en USD → EUR. Fee 0,6%. "Wat landt er" tegen de koers van
  dat moment. Meer dan het saldo → geweigerd.
- **Eigenaar:** het exchange-overzicht (`/exchanges`) → detail → koers,
  wallet voor en na, en de match met het grootboek.
- **Database:** `wallet_exchanges`, twee ledgerregels, saldi.
- **Herontwerp 01-10:** je betaalt (cursor staat er meteen in, Max) /
  omdraaiknop / je ontvangt; wallet voor → na onder beide kaarten; bon
  met koers, omgerekend, fee 0,6%, je ontvangt; koersregel met tijd. Op
  360 px niets buiten beeld.

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
- **Facturen-pdf:** downloaden, en de pdf staat na betaling in
  `Facturen/<jaar>/<maand>/` op Drive (nacht, R17).
- **De mail heeft de pdf als bijlage**: bij de nachtelijke factuur én via
  de knop **Email** op /invoices (beheer). Een betaalde factuur gemaild
  = de "paid"-versie. Een geannuleerde factuur: knop weg.
- **Geen telefoonnummer** in een mail; onderaan alleen "Ask us in your
  WhatsApp group".

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
- **Affiliate per community** (plak 188): Settings → Plans & Communities
  → op de NSA-kaart "Affiliate program: Off". T4-N ziet dan geen "Earn"
  en geen aanmeldknop meer; een directe aanroep van de aanmelding wordt
  geweigerd ("not available on your plan"). Daarna weer **On** zetten.

### R10 — Ook adverteren (T4-U)

- Een affiliate vraagt "Advertise with us too" → beheer keurt goed →
  na herladen een adverteerdersdashboard, met link en verdiensten
  intact. Eén keer weigeren met reden.

### R11 — Team (T4-A eigenaar, T4-V zonder rechten, T4-W met rechten)

- T4-A → Team → nodig twee collega's uit → T4-V en T4-W melden zich aan.
  De aanmeldpagina zegt "you are joining PSM00xx's team" en vraagt niet
  naar een referral.
- **Team-scherm:** eerst op een lid klikken, dan pas zijn instellingen
  (accordeon). Per recht een schakelaar: Top up, Exchange, Fund an ad
  account, Request an ad account, Withdraw from an ad account, Pay
  invoices, Company details.
- **T4-W:** zet Exchange en Fund aan. T4-W kan precies die twee; de
  andere knoppen zijn er niet of zeggen waarom.
- **T4-V ziet:** de saldi, ad accounts, facturen en het rapport van
  T4-A; in het avatarmenu "Team member · PSM00xx".
- **T4-V kan niet:** top-up, exchange, funden, aanvragen, betalen, het
  team wijzigen.
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

- "What we hold" op het dashboard: RockAds, Falkyn, **Bestads**, Wise,
  **Slash** (ZANEL, het credit-saldo — op 01-10 $2,669.95). Tijdens het
  laden staan ze er alle vijf als skelet; geen "synced just now".
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
- **In de zip** (sinds 01-10): `schema.sql` (plak 190 — het hele
  schema), `NOODPLAN.md` en `docs/` (RESTORE_DRILL, RUNBOOK, …), naast
  tables/, auth/, storage/ en manifest.json. Geen `schema-ONTBREEKT.txt`.
- **Oefening A** uit `docs/RESTORE_DRILL.md` (de zip) is gedaan op 01-10.
  Oefening B (PITR naar een nieuw project) is niet nodig voor test 4;
  plan hem voor de eerste grote groep klanten (zie NOODPLAN §3).

### R17 — De nacht (de dag erna)

- Billing-run gedraaid? Nieuwe facturen, mails, geen dubbele.
- Backup-mail binnen? Factuur-pdf's op Drive?
- `npm run ochtend && npm run rondje`, en de telling uit
  `RESTORE-DRILL-TELLING.sql`: regel 6 nog **0**.

### R18 — Wat een klant NIET mag zien (doorlopend, bij elke reis; zie ook R20)

Bij elk klantscherm (alle T4-accounts behalve beheer):

- Netwerk-tab / de JSON van elke lees: geen `supplier`, `rockads`,
  `falkyn`, `seamx`, type-slug (`eu-meta-psm`), kostprijs, marge.
- Geen privé-WhatsApp-knop naar de eigenaar; alleen "Stuur ons een
  bericht in je PSMxxxx-groep".
- Een klant kan via de URL (`?view=...`, een id van een ander) niets
  van een andere klant openen.

### R19 — De beheertools van 01-10 (eigenaar + een gewone admin)

- **Bankknop** (bankicoon rechtsboven, elke admin): elke bank × valuta
  open; elk gegeven kopieert; klant kiezen → naam en code in het bericht;
  "Open WhatsApp" opent met de tekst. Het bericht noemt **geen**
  leverancier of accounttype.
- **Bestads-saldo** (Owner → Supplier balance): + Add entry voor elke
  soort (We sent met EUR → koers en wisselgat; Client top-up met klant uit
  de lijst; Fee; DST; Correction ±). Een **correctie door een gewone
  admin** wacht bovenaan → de eigenaar keurt goed / wijst af met reden →
  pas dan telt hij. End balance invullen → "Matches" of "Check ±$x".
  Een top-up in de app op een Bestads-account (T4-N) verschijnt vanzelf
  als "App"-regel, met "our fee" erbij.
- **Rooster** (More → Schedule): eigenaars staan er niet op. Gewone admin:
  My preferences opslaan. Eigenaar: Auto-fill → diensten volgens de
  voorkeuren, gaten rood; Copy last week; Lock until → een gewone admin
  kan die dagen niet meer wijzigen; roostermaker en urenkijker kiezen.
  Mobiel: dagstrook met stippen.
- **On now** onder "Welcome back" zodra er een dienst loopt.
- **Uren**: "Hours this week" alleen voor eigenaars en de gekozen admin;
  een gewone admin ziet het blok niet (en de tabel is niet leesbaar uit
  de browser).
- **Handboek**: 18 hoofdstukken; een gewone admin ziet de vier
  eigenaarshoofdstukken niet.
- **Partners** (beheer): een partner toevoegen met icoon, verbergen,
  verwijderen (twee klikken); de klant ziet de tegel meteen.

### R20 — De lekcontrole: wat een klant nooit mag zien

Eén keer helemaal, met een adverteerder (T4-N, HK-account), een
adverteerder met een API-account (T4-A) en een affiliate (T4-F):

- **Woorden** die nergens mogen staan — niet op het scherm, niet in de
  JSON achter de pagina, niet in een mail, pdf, melding of export:
  RockAds, SeamX, Falkyn, Bestads, Gradyn, Slash, Muxue (als
  leverancier), "We pay", supplier fee, marge, en de interne typenamen en
  afkortingen: `hk-meta-premium`, `hk-meta-business`, `eu-meta-psm`,
  `eu-meta-psm-gh`, Meta-HK-…, Meta-EU-PSM, GH, HK.
- **Hoe**: elk klantscherm open, DevTools → Network → elke respons
  doorzoeken op die woorden; de mails en pdf's uit R1/R3/R8 doorzoeken.
- **Uitkomst van de codecontrole van 01-10** staat in het logboek
  (regel R20); wat daar gevonden is, is gefixt of staat er als open.

---

### R21 — Elke schermmaat

De eigenaar, 01-10: "ik zag vaak bugs op verschillende maten telefoons en
desktop". Vijf breedtes, in het ingebouwde paneel (resize) en in Chrome:

| breedte | staat voor |
|---|---|
| **360** | kleine Android (Samsung A-serie) |
| **390** | iPhone 12–16 (de standaard van elke reis) |
| **430** | grote iPhone (Pro Max / Plus) |
| **768** | tablet / smal laptopvenster |
| **1440** | desktop |

Per breedte, voor elk KLANTscherm (dashboard, wallet, top-up-dialoog
alle stappen, exchange, ad accounts, aanvraag, funden, terugboeken,
billing, referrals, team, partners, help, instellingen) en de
belangrijkste BEHEERschermen (dashboard, wallet topups, ad-account
topups, aanvragen, invoices, supplier balance, schedule, manual):

- **geen zijwaartse scroll** van de pagina: `document.documentElement.scrollWidth`
  mag niet groter zijn dan de breedte — Claude meet dit per scherm met
  één script;
- **geen afgekapte knop of bedrag**, geen tekst over een andere heen;
- **elke dialoog past**: de knoppen onderaan zijn bereikbaar, ook met het
  toetsenbord open; sluiten kan altijd;
- **de onderbalk** (mobiel) bedekt geen knop of laatste regel;
- **tabellen** scrollen binnen hun kader, niet de hele pagina.

Een vondst is een BLOKKER als een knop met geld onbereikbaar of
onleesbaar wordt, anders HINDERLIJK.

## Volgorde

1. Laag 0.
2. R1 voor alle T4-accounts (de eigenaar typt, Claude bereidt voor).
3. Per account de reizen in deze volgorde: R3 → R4
   → R5 → R6 → R7 → R8 → R12 → R13. Eerst T4-A (de API-tak, het
   grootste risico), dan T4-B (USD), dan T4-N, T4-C, T4-0.
4. Affiliate-blok: R9 (T4-F + T4-R), R10 (T4-U).
5. R11 (team).
6. R14, R15 (beheer) — grotendeels al gelopen als tweede tab bij de
   reizen hierboven; hier de rest.
7. R19 (beheertools), R16 (backups), en de volgende ochtend R17.
8. R2: de supersnelle NL-check (max 10 minuten).
9. R18 loopt de hele tijd mee; R20 en R21 elk één keer helemaal, aan het eind.

## Wat test 4 klaar maakt

Elke regel in het logboek heeft een uitkomst: **werkt** (met het
bedrag op het scherm en het bedrag in de database), of **werkt niet**
(met wat er mis is en de commit die het fixte, of wat er van de
eigenaar nodig is).

---

## Logboek

| reis | account | taal | uitkomst | scherm | database | fix / open |
|---|---|---|---|---|---|---|
| R1 | T4-A | EN | werkt | uitnodiging -> aanmelden -> bedrijf -> dashboard | PSM0030, plan + bedrijf | mislukte aanmelding ruimt login op (42bf5fad); grens alleen zonder geldige uitnodiging (8a88d3a2) |
| R1 | T4-B | EN | half | aangemeld; bedrijfsgegevens nog niet | PSM0024, plan, bedrijf 0 | open: onboarding in het paneel |
| R1 | T4-C | EN | half | aangemeld; bedrijfsgegevens nog niet | PSM0025, plan, bedrijf 0 | open: onboarding |
| R1 | T4-N | EN | half | aangemeld; bedrijfsgegevens nog niet | PSM0026, NSA-plan, bedrijf 0 | open: onboarding |
| R1 | T4-F | EN | half | aangemeld als affiliate | PSM0028 | open: dashboard lopen (R9) |
| R1 | T4-R | EN | werkt | link van T4-F (/auth/sign-up?t=prime-scale-media&ref=PSM0028): 'Invited by a partner · Referral code PSM0028' -> e-mailbevestiging -> dashboard met 'Get started'. Bedrijfsgegevens opgeslagen | PSM0031; referral_links pending -> active; companies 1 | zonder uitnodiging GEEN plan: beheer moest Launch toewijzen + activeren |
| R1 | T4-V | EN | werkt | teamuitnodiging -> aanmelden -> dashboard (na fix 0642aa8b) | subject_members viewer | zie R11 |
| R1 | T4-U | EN | half | aangemeld als affiliate | PSM0027 | open: R10 |
| R1 | T4-0 | EN | werkt | zonder plan: Billing zegt het een keer; aanvragen geblokkeerd | PSM0029, geen plan, bedrijf 1 | geen plan != gratis plan (6921ffca, plak 196) |
| R1 | T4-W | EN | werkt | teamuitnodiging -> aanmelden -> meteen dashboard | subject_members viewer -> [exchange, fund] | zie R11 |
| R2 | T4-B (snelle check) | NL | | | | |
| R3 | T4-A EUR | EN | werkt | alle dialoogtakken (EUR/USD wallet x EUR/USD/GBP/HKD), herontwerp in 4 rondes; Verify door Lasse | wallet_topups 500 EUR completed; wallet EUR 0.00 -> 500.00; ledger 1 regel +500.00 (0.00 -> 500.00, actor); melding wallet_topup_completed | herontwerp topup (263db364 .. 14a7d9fa); kopieerknop in dialoog (7022c035); Other amount/Precharge naar Details (66d36cee). Open: reject-met-reden en Other amount (twee admins) nog te lopen |
| R3 | T4-A USD → EUR-wallet | EN | werkt (indienen + weigeren met reden) | stap 1 bon: $1.000 × 0,88243363 = €882,43, fee €5,29, bijschrijving €877,14; stap 2 'maak precies $1.000 over' | wallet_topups 877.14 EUR pending, ref 0231606101, één keer | 0,6% bij andere valuta (119c9809). Geweigerd door Lasse met 'No payment found': status rejected + reden; wallet bleef 500.00, 1 ledgerregel; melding wallet_topup_rejected (877.14 + reden); klant ziet 'Rejected' + 'Why?' met precies die reden |
| R3 | T4-B USD | EN | | | | |
| R3 | T4-N HK | EN | | | | |
| R4 | T4-A EUR -> USD | EN | werkt | cursor meteen in het vak; EUR 100 x 1,1243 = $112,43, fee $0,67, ontvangt $111,76; wallet voor/na klopt; koersregel 'bijgewerkt 22:15' | wallet EUR 400.00 / USD 111.76; ledger -100.00 EUR en +111.76 USD; wallet_exchanges 100 -> 111.76, fee 0.67, koers 0.889442 (Wise); /exchanges toont hem bovenaan | bevestiging opnieuw ontworpen (040bb7d9). Hinderlijk: /exchanges loopt op 455 px rechts buiten beeld. Open: T4-B USD -> EUR |
| R5 | T4-A Meta + TikTok | EN | werkt | aanvragen geblokkeerd tot de abonnementsfactuur betaald is (klopt). Meta: 'inbegrepen, geen kosten, 1 van 1'. TikTok USD: '$56, $111,76 -> $55,76'. Alle drie de platformtakken tonen hun eigen velden. Beide zichtbaar ('$56.00 came off your wallet'). Beheer: Meta goedgekeurd als AA-PSM0030-EU-01 (Meta-EU-PSM-RA, 5%) | Meta: request_fee 0, plan_included, wallet bleef 325.00; TikTok: request_fee 56 USD, ledger -56.00 USD (111.76 -> 55.76, ad_account_request_create_paid); ad_accounts: eu-meta-psm EUR 5% active; Meta-aanvraag completed | — |
| R5 | T4-B Google (2e inbegrepen) | EN | | | | |
| R5 | T4-C TikTok (extra, EUR 50) | EN | | | | |
| R5 | T4-N Meta-HK | EN | | | | |
| R5 | T4-0 geen plan | EN | | | | |
| R6 | T4-A | EN | werkt | fee-offerte na L1 werkt: EUR 100 -> fee 5% EUR 5,00 -> landt EUR 95,00, wallet 325 -> 225; klant ziet alleen 'Meta', geen type. Beheer: Verify vraagt 'ik heb het bij Rockads gefund' + 'de klant krijgt bericht' | top_ups #13: 100.00 / fee 5.00 / 95.00, wallet_debited, pending -> completed; ledger -100.00 (325 -> 225, top_up_create_for_advertiser); melding topup_completed | bevestiging opnieuw ontworpen (b7899347) |
| R6 | T4-B / T4-C / T4-N handmatig | EN | | | | |
| R7 | T4-A | EN | werkt | 'Up to EUR 95.00' (gefund min eerder teruggevraagd); EUR 100 geweigerd met uitleg; EUR 20 -> bevestiging -> 'Request sent'. Beheer: goedkeuren vraagt 'balans zelf gecontroleerd' (leverancier in mock-modus: 'not read') | wallet EUR 225.00 -> 245.00; ledger +20.00 (ad_account_withdrawal_approve); melding withdrawal_approved | live plafond niet te testen: leverancier staat op mock |
| R7 | T4-C handmatig plafond | EN | | | | |
| R7 | T4-R clawback | EN | | | | |
| R8 | T4-A EUR | EN | werkt | Billing: Flex EUR 75, 'Pay EUR 75.00 from wallet' -> bevestiging 'EUR 400 -> 325' -> 'This month is paid, next 1 Nov' | invoice 150: total 75.00, paid, paid_from wallet; ledger -75.00 (400 -> 325, invoice_pay_from_wallet); subscription active | titel was 'Renew your plan?' bij de eerste betaling -> 'Pay your plan?' (9ee0d9c7) |
| R8 | T4-B USD | EN | | | | |
| R8 | T4-0 geen plan | EN | | | | |
| R9 | T4-F + T4-R | EN | deels | beheer: 'Affiliates waiting for you (2)' -> T4R 'signed up through T4F' -> Approve toont '20% van top-up-winst · 50% van elke betaalde factuur'. Abonnement Launch EUR 150 aangemaakt + geactiveerd. T4-R: top-up EUR 150 (geen minimum voor de eerste planbetaling, geen fee-regel bij EUR->EUR) -> geverifieerd (slip in de bevestiging, laadt na ~20 s) -> 'Pay your plan?' EUR 150 -> 0 | invoice 155 EUR 150 paid (wallet); referral_commissions: subscription_pct 75.00 EUR (50% van 150.00), unpaid, PSM0028 | hinderlijk: slip-voorbeeld laadt traag (serveracties in de rij); abonnementskaart toont '01-10 -> 01-10'. T4-F: verdiensten EUR 75 (lifetime/maand), 3 meldingen kloppen (aangemeld / goedgekeurd / EUR 75 commissie van PSM0031); Wallet: EUR 75 owed, Starter, 'EUR 125.00 to go' en Request payout uit (minimum EUR 200); Referrals: Starter 1/4, 'EUR 925 more to Riser', link + T4R EUR 75. Open: uitbetaling boven het minimum + beheer betaalt uit/weigert (vergt meer commissie); Export niet aangeklikt (download) |
| R10 | T4-F (weigeren) + T4-U (goedkeuren) | EN | deels | weigeren op T4-F: 'Ask to advertise too' -> 'Request sent'; beheer 'Refuse this request?' met reden (verplicht) -> T4-F ziet 'Not this time: <reden>. You can ask again' + 'Ask again' | n.v.t. | open: T4-U goedkeuren -> adverteerdersdashboard, link en verdiensten intact |
| R11 | T4-A + T4-V + T4-W | EN | werkt | T4-A Team -> twee uitnodigingen (link ook zichtbaar). Aanmeldpagina: 'Viewing PSM0030 as viewer', geen referral. BLOKKER gevonden + gefixt: na Join landde V op 'we can''t open your account' (0642aa8b). V ziet T4-A: EUR 245.00 / USD 55.76, account, Flex, facturen; geen enkele geldknop (wallet: alleen saldi; accounts: Tax rates/Details; billing: View/Download); avatar 'Team member · PSM0030' | subject_members: V viewer van T4-A, permissions []; invitation accepted. Server: alle zes geldfuncties eisen _psm_can(advertiser, perm) -> viewer zonder rechten wordt geweigerd (uit de definities gelezen, niet aangeroepen) | hinderlijk: 'First name is required' blijft staan na invullen tot Join  T4-W (Exchange + Fund): wallet toont alleen Exchange (geen Top up), accounts alleen Top up/Details (geen Request), billing geen Pay, Details geen Withdraw. Exchange EUR 10 -> $11,18 (fee $0,07, 'Wise mid-market rate'); Fund EUR 10 -> fee EUR 0,50 -> EUR 9,50. TWEE FIXES: rechtenpaneel liep door elkaar op een telefoon (f137447c); twee rechten snel achter elkaar bewaarde er één (65bf9fa3). BLOKKER: Fund-recht werkte niet, fee-offerte zocht alleen een eigen advertiser (03864342). | subject_members W: [exchange, fund]. wallet_exchanges 10 -> 11.18, fee 0.07, door t4w; wallet EUR 245 -> 235 -> 225, USD 55.76 -> 66.94; top_ups 10.00/0.50/9.50 pending, ledger -10.00 | — |
| R12 | alle | | | | | |
| R13 | T4-A, T4-B | | | | | |
| R14 | beheer | EN | deels | wallet top-ups: verify (EUR 500, EUR 150) + weigeren met reden (EUR 877,14, klant ziet 'Why?'); ad top-ups: verify (EUR 95, met 'funded at Rockads' + 'customer told') + weigeren met reden (EUR 9,50); aanvragen: goedgekeurd (Meta) + geweigerd met reden (TikTok: $56 terug, USD 66.94 -> 122.94, ad_account_request_reject_refund); terugboekingen: goedgekeurd (EUR 20, met 'balans zelf gecontroleerd'); referrals: goedgekeurd (T4-R); ook-adverteren: geweigerd met reden (T4-F) | ad top-up #14 rejected + reden; wallet T4-A 225.00 -> 235.00 (refund_wallet_on_topup_rejected); melding topup_rejected | audit_events sinds 01-10 19:00: elke beslissing met de juiste persoon (Lasse: 3x wallet_topups, 2x top_ups, terugboeking, referral, abonnement; T4-W: exchange + top-up onder eigen naam). Open: terugboeking weigeren, uitbetaling, verwijderverzoeken |
| R15 | eigenaar | EN | deels | dashboard: What we hold RockAds €2.210,31/$5.357,70, Falkyn €973,68/$3.500, Bestads $3.500, Wise €4.271,19/$2.454,89, Slash $2.669,95; samen €7.455,18 + $17.482,54 = €23.000,74 (x 0,889205 klopt). Vandaag: wallet in €500, ad topups €95, fees €5, exchanges €110, subs €75 -- precies wat Test 4 deed. Queues: 1 aanvraag, 1 ad top-up, 1 affiliate. /exchanges: zie R4 | n.v.t. (leveranciers-saldi) | open: RockAds-reconciliatie, account koppelen, plannen beheren |
| R16 | eigenaar | | | | | |
| R17 | de nacht | | | | | |
| R18 | doorlopend | | | | | |
| R19 | beheertools | EN | | | | |
| R20 | lekcontrole | EN | | | | |
| R21 | schermmaten 360/390/430/768/1440 | EN | | | | |
