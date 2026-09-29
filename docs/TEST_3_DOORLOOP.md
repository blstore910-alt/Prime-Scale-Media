# TEST 3 — DE DOORLOOP

> Geschreven 29-09, na test 1 en test 2. Draait **nadat de blokken
> klaar zijn** en **vóór het opruimen**, want hij heeft de
> testaccounts nodig.

---

## Eerst: welke twee tests we al gedaan hebben

Uitgezocht uit de git-historie en de documenten, niet uit het hoofd.

### Test 1 — de zeventien sweeps (22 t/m 25 september)

Per FOUTSOORT, zeventien sporen naast elkaar. Dit is de "1 t/m 17".

| spoor | commits | waar het over ging |
|---|---|---|
| A1 | 2 | meldingen en hun vak |
| A2 | 2 | de wallet die niet optelde — twee bewegingen ontbraken |
| A3 | 2 | EUR 50 betaald en nergens zichtbaar |
| A4 | 12 | bedragvelden, het funden, `050` in plaats van `50` |
| A5 | 4 | het afschrift van de klant |
| A7 | 5 | instellingen, plus A1 opnieuw met een verse klant |
| D1 | 20 | de bankfeed: 277 stortingen van EUR 366.718 onder een badge die 0 zei |
| D2 | 10 | valuta — het ad-account kwam er in dollars uit terwijl je euro koos |
| D3 | 20 | prijzen, voorschotten en perks |
| F1 | 20 | goedkeuren, statussen op aanvragen |
| F2 | 2 | waar die elf cent vandaan komt |
| F3 | 21 | uitbetaling aan affiliates — aanvraag, wachtrij, afhandeling |
| F4 | 12 | commissiesoorten, de dode 'Mark paid' |
| S1 | 1 | de seeders |
| S2 | 6 | /affiliates sorteerbaar, verdiensten per referral |
| S3 | 3 | het bankboek en een pond; de audit kende 17 van 35 tabellen |
| T4 | 4 | de koers hing aan de planner van Vercel |

**Wat het opleverde:** ~146 commits, en de faalsoorten die dit
project nu bij naam kent.

**Waarom het niet afliep:** "vind elke fout van soort X" heeft geen
eindvoorwaarde. Elke ronde vond iets, en niets ervan was wat ons van
live afhield. Dat staat inmiddels in CLAUDE.md als de reden om het om
te draaien.

Daarvóór, 16 t/m 21 september, liep de **J1–J8-doorloop met de hand**
op productie (`docs/JOURNEY_LOG.md`). Daar komen de acht reizen in
CLAUDE.md vandaan.

### Test 2 — de zestien blokken (26 t/m 29 september)

Per REIS in plaats van per foutsoort. Blok 0 t/m 15, commits met
`p0`…`p15`. Een blok is binair: het werkt of het werkt niet.

Per blok eerst vier agents op de bestanden van dát blok, dan het
scherm zelf lopen op 390px, elk cijfer tegen de database, fixen,
gate, push.

**Stand nu: 15 van de 16 dicht.** Blok 15 (opruimen) is het enige dat
open staat en wacht op de lijst van de eigenaar.

**Wat het opleverde, en test 1 niet:** de fouten die je alleen ziet
door de pagina te openen. Drie stuks binnen vier minuten op 29-09, geen
ervan gevonden door een test of een agent.

---

## Waarom test 3 geen derde sweep is

Test 1 zocht fouten per soort en liep niet af. Test 2 zocht ze per
reis en liep wél af. Allebei zochten ze **fouten**.

Test 3 vraagt iets anders: **loopt het geheel nog soepel?** Niet "zit
hier een bug" maar "kan een mens er in één keer doorheen". Dat is een
andere vraag, hij is snel te beantwoorden, en hij is herhaalbaar — wat
de eerste twee geen van beide waren.

Drie lagen, en elke laag mag pas beginnen als de vorige schoon is.

---

## Laag 1 — de machine (10 seconden, geen mens)

```bash
npm run ochtend && npm run rondje
```

- **`ochtend`** (12 controles) — staat de database goed? RLS, rechten,
  weesregels, NaN, kloppen de saldi met hun eigen bewegingen.
- **`rondje`** (18 controles, nieuw op 29-09) — hangt het nog aan
  elkaar? Twee dingen die `ochtend` niet doet:

  **A. Aanslagen die afgaan vóórdat er gelogen wordt.** PostgREST kapt
  stil op 1000 rijen en een `.limit(n)` kapt stil op n. Dat is precies
  wat op 29-09 gebeurde: /finance-check stond op 100 en er wachtten er
  92. Acht rijen. Deze regels gaan af op 80%.

  **B. Hetzelfde getal, van twee kanten.** Waar een bedrag op twee
  schermen staat wordt het hier los uitgerekend en vergeleken. Nu:
  EUR 44.640,00 en USD 41.300,06 wachtend op de bank (finance-check én
  ledger), EUR 99,96 commissies (/commissions én wat *We keep*
  aftrekt).

  Plus: geld in een wallet zonder eigenaar (de aanslag onder blok 15),
  dubbele klantcodes, dubbele factuurnummers, en bedragen in een valuta
  die geen enkel scherm optelt.

**Stopregel: is hier iets FOUT, dan begint laag 2 niet.** Een scherm
lopen boven een kapotte basis kost tijd en bewijst niets.

## Laag 2 — elk scherm één keer, per rol (±45 min, Claude rijdt)

**39 schermen**, en niet elk scherm is voor elke rol. De matrix staat
hieronder; `docs/ROUTE_MAP.md` zegt welk bestand wat rendert.

Wat er per scherm gebeurt, en dit is het slimme deel:

1. Openen.
2. **Het koptekstcijfer automatisch tegen de database houden** met
   `npm run check`. Niet kijken of het "er goed uitziet" — uitrekenen
   of het klopt.
3. Kijken naar precies vier dingen, want dat zijn de vier die dit
   project kent: een cijfer boven een mislukte lees, een lijst die stil
   is afgekapt, een knop die niets doet, en een lege staat boven echte
   rijen.
4. Doorlopen, niet terugkomen. Een scherm dat laag 1 al bewezen heeft
   krijgt geen tweede blik.

| rol | schermen |
|---|---|
| eigenaar | alle 39 |
| medewerker-admin | de 39 min de eigenaar-alleen (profit, /audit, /admins, settings/finance) |
| adverteerder | dashboard, wallet, top-ups, invoices, my-subscription, my-referrals, profile, notifications, help, accounts |
| affiliate | dashboard, referrals, commissions, wallet, profile, notifications |
| read-only admin | één ronde langs de wachtrijen: elke knop hoort te weigeren |

Die laatste rij is nieuw en hoort erbij: read-only is op 29-09 gebouwd
en op 29-09 bleek hij omzeild op `updateUserProfile`. Hij is nog nooit
door een mens gezien.

**Wat de eigenaar hier doet:** één keer inloggen per rol. Daarna rijdt
Claude.

## Laag 3 — alleen wat echt geld verplaatst (±30 min, de eigenaar)

Wat alleen hij kan of mag:

- een echte overboeking + slip, en die verifiëren;
- een ad-account funden en bij de leverancier zien landen;
- een commissie-uitbetaling op betaald zetten;
- een factuur betalen vanuit de wallet;
- geld terug van een ad-account goedkeuren.

Elk daarvan is één keer, met het bedrag vooraf opgeschreven en achteraf
tegen de database gelegd.

## Daarna, en pas daarna: opruimen

Plak 157 met de lijst erin. En als het gedaan is **laag 1 nog een
keer** — dat is de goedkoopste manier om te bewijzen dat het opruimen
niets kapot heeft gemaakt. C1 en C2 in `rondje` staan er precies voor:
geld in een wallet zonder eigenaar.

---

## Wat test 3 klaar maakt

- Laag 1 helemaal GOED, twee keer: vóór het opruimen en erna.
- Elk van de 39 schermen één keer geopend per rol die hem hoort te
  zien, met zijn koptekstcijfer tegen de database.
- De vijf stappen van laag 3 gelopen, met bedragen die aan twee kanten
  kloppen.
- Alles wat het opleverde gefixt, niet genoteerd.
