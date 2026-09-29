TEST 3 — DE DOORLOOP. Lees docs/TEST_3_DOORLOOP.md en ga verder bij de
EERSTE regel in het logboek onderaan die nog geen uitkomst heeft. Zeg
in een zin waar je begint, en begin dan.

DOORWERKEN TOT HET SCHERM DICHT IS. Niet rapporteren tussendoor. Een
scherm is pas af als zijn regel in het logboek staat met het cijfer
dat erop stond EN het cijfer waar het tegen gehouden is. Alles
daarvoor -- openen, meten, fixen, gate, push, nog eens kijken -- is
een en dezelfde beurt.

HET VERSCHIL MET DE VORIGE TWEE TESTS: we lopen op VERSE accounts. Je
weet dus wat er hoort te staan voordat je kijkt. Een scherm is niet
goed omdat het met de database klopt -- het is goed als het klopt met
wat wij op dat account gedaan hebben. Wijkt het af, dan is dat een
fout, ook als de database hetzelfde zegt.

WAT GEEN REDEN IS OM TE STOPPEN:
- een scherm is klaar            -> pak het volgende uit de lijst
- je hebt iets gepusht           -> ga door terwijl de deploy loopt
- een agent is binnen            -> lees hem, MEET hem tegen de live
                                    database, fix wat echt is
- een scherm heeft mijn ogen     -> zet het klaar, zeg het in EEN regel
                                    aan het eind, en doe intussen de rest
- je wacht op een login van mij  -> doe de rollen die al binnen zijn,
                                    en het codewerk van de volgende
- je twijfelt over een detail    -> kies, en schrijf op waarom je koos
- een plak moet nog gedraaid     -> lever hem ALS FILE en ga door

WAT WEL EEN REDEN IS OM TE STOPPEN:
- een wachtwoord, een Join of een in/uitlog  -> alleen ik kan dat
- geld dat echt weggaat, of iets verwijderen -> vraag het
- beleid dat van mij is (marge, ondergrens, wie wat mag) -> vraag het
- iets op productie is stuk                  -> meld direct, dat gaat voor

TWEE VENSTERS, NOOIT DRIE. Paneel = klantkant. Mijn Chrome =
beheerkant. Ik zie ze allebei; wat ik niet zie gebeurt niet. Ik typ
elk wachtwoord, elke Join en elke in- en uitlog. Jij doet al het
andere. Kun je een venster niet besturen, zeg dat METEEN in een regel
in plaats van eromheen te werken.

LAAG 1 EERST, ELKE KEER:
  npm run ochtend && npm run rondje
Staat daar iets op FOUT, dan begint er geen scherm. Een scherm lopen
boven een kapotte basis kost tijd en bewijst niets.

PER SCHERM, IN DEZE VOLGORDE:
  1. openen op 390px in het juiste venster voor die rol
  2. het koptekstcijfer tegen de database met npm run check
  3. EN tegen wat wij op dit verse account gedaan hebben
  4. elke tak van elke dialoog indrukken, ook die we niet kiezen
  5. ik zeg wat anders moet - jij fixt het
  6. gate: npx tsc --noEmit && npx next lint --max-warnings 0 && npm test
     geketend met &&, NOOIT door tail of grep
  7. desktop, zelfde scherm
  8. logboekregel invullen, dan het volgende

PUSHEN per ROL gebundeld, niet per fix. Alleen iets kapots gaat meteen.
Een NIEUWE route of server action: eerst npx next build lokaal.

DE VIER DINGEN WAAR JE NAAR KIJKT, en niet meer:
  - een cijfer boven een lees die niet aankwam
  - een lijst die stil is afgekapt
  - een knop die niets doet
  - een lege staat boven echte rijen

GEEN "WAARSCHIJNLIJK". Lees de code of vraag mij een SQL. Een
zelfverzekerde 0 boven een mislukte lees is een fout. Een bevinding
van een agent is een VERMOEDEN tot je hem tegen de live database hebt
gehouden -- twee van de vier agents hadden het vorige keer mis.

ZEG METEEN wat je niet hebt kunnen verifiëren, en waarom.

AAN HET EIND VAN EEN ROL, en pas dan: vul het logboek in, commit het,
en meld in vier regels -- gelopen / gefixt / open / wat je van mij
nodig hebt. Begin daarna meteen aan de volgende rol.
