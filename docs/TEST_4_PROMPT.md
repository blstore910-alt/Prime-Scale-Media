TEST 4 — ELKE REIS, ELKE SOORT, IN TWEE TALEN. Lees docs/TEST_4.md en
ga verder bij de EERSTE regel in het logboek onderaan die nog geen
uitkomst heeft. Zeg in een zin waar je begint, en begin dan.

WAT TEST 4 IS: dezelfde reizen als test 3, maar over elke soort
account (API en handmatig, EUR en USD, elk plan, NSA, geen plan), elke
rol (adverteerder, affiliate, teamlid, eigenaar) en twee talen (EN en
NL). Elke TAK minstens een keer, op het account waar hij van nature
voorkomt. Een reis is binair: werkt of werkt niet.

DOORWERKEN TOT DE REIS DICHT IS. Niet rapporteren tussendoor. Een reis
is pas af als zijn regel in het logboek staat met het bedrag dat op
het scherm stond EN het bedrag uit de database, tot op de cent, in de
taal van dat account. Openen, meten, fixen, gate, push, nog eens
kijken -- dat is een en dezelfde beurt.

VERSE ACCOUNTS: je weet wat er hoort te staan voordat je kijkt. Een
scherm is goed als het klopt met wat WIJ op dat account deden, niet
alleen met de database.

NOEM ALTIJD HET E-MAILADRES waarmee ingelogd moet worden, en ZEG WELKE
EFFORT een blok nodig heeft als het afwijkt van high.

WAT GEEN REDEN IS OM TE STOPPEN:
- een reis is klaar              -> pak de volgende uit het logboek
- je hebt iets gepusht           -> ga door terwijl de deploy loopt
- een vermoeden van een agent    -> MEET het tegen de live database
- iets wacht op mijn ogen        -> zet het klaar, zeg het in EEN regel
                                    aan het eind, doe intussen de rest
- je wacht op een login van mij  -> doe de accounts die al binnen zijn
- je twijfelt over een detail    -> kies, en schrijf op waarom
- een plak moet nog gedraaid     -> lever hem ALS FILE en ga door

WAT WEL EEN REDEN IS OM TE STOPPEN:
- een wachtwoord, een Join of een in/uitlog  -> alleen ik
- geld dat echt weggaat, of iets verwijderen -> vraag het
- beleid dat van mij is (tarief, marge, wie wat mag) -> vraag het
- iets op productie is stuk                  -> meld direct, gaat voor

DE BROWSERS. Beheerkant in mijn Chrome, `Baris Laptop` -- controleer
aan de APP ("Welcome back, X" op /dashboard), niet aan de lijst.
Klantkant in het ingebouwde paneel. Twee vensters, nooit drie. Wat ik
niet zie gebeurt niet. Kun je een venster niet besturen, zeg het
METEEN in een regel.

LAAG 0 EERST, ELKE OCHTEND:
  npm run ochtend && npm run rondje
  npm run check -- -f supabase/checks/RESTORE-DRILL-TELLING.sql
Staat er iets op FOUT, of is regel 6 niet 0, dan begint er geen reis.

PER REIS:
  1. openen op 390px in het juiste venster, in de taal van het account
  2. ELKE TAK van elke dialoog: elke keuze, Next, Back, kijken wat er
     verandert -- pas dan een echt uitvoeren
  3. het bedrag op het scherm tegen de database (npm run check)
  4. EN tegen wat wij op dit verse account deden
  5. de beheerkant in de tweede tab: verifieren EN weigeren met reden
  6. de melding die de klant krijgt: juiste taal, juist bedrag
  7. de JSON achter het scherm: geen leverancier, type of marge
  8. ik zeg wat anders moet -- jij fixt het
  9. gate: npx tsc --noEmit && npx next lint --max-warnings 0 && npm test
     geketend met &&, NOOIT door tail of grep, lezen op exit-code
 10. desktop, zelfde scherm
 11. logboekregel invullen, dan de volgende

PUSHEN per account gebundeld, niet per fix. Iets kapots gaat meteen.
Een NIEUWE route, pagina of server action: eerst npx next build
lokaal. Alleen `git push origin feat/redesign-advertiser:main`.

TAAL: in NL moet top-up, exchange, wallet, ad account, fee, referral
en Pay now Engels blijven (docs/NL_EN.md). Een Engelse zin die er niet
hoort is een fout; een knop die afbreekt ook. Bekend nog Engels: de
factuur-pdf, de e-mails, partnerbeschrijvingen, de beheerkant.

DE VIER DINGEN WAAR JE NAAR KIJKT, en niet meer:
  - een cijfer boven een lees die niet aankwam
  - een lijst die stil is afgekapt
  - een knop die niets doet
  - een lege staat boven echte rijen

GEEN "WAARSCHIJNLIJK". Lees de code of vraag mij een SQL. Een
zelfverzekerde 0 boven een mislukte lees is een fout.

ZEG METEEN wat je niet hebt kunnen verifieren, en waarom.

AAN HET EIND VAN EEN ACCOUNT, en pas dan: logboek invullen, commit, en
in vier regels -- gelopen / gefixt / open / wat je van mij nodig hebt.
Dan meteen het volgende account.
