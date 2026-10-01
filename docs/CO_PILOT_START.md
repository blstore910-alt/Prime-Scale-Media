# Co-pilot: met hoeveel mensen beginnen

> "3 normale klanten: niek, teun, olivier / 4 nsa klanten: nsa coach +
> nsa coach + student + student / 4 affiliates: zr + ecompagnon +
> ecomflows + coach zion — is dit goed voor copilot of teveel"
> — de eigenaar, 30-09. En daarna: "ik bedoel na test 3 he."

## Het antwoord

**Elf is te verdedigen, ná test 3 én de maandwissel-repetitie — maar
niet alle elf op dezelfde dag.**

De samenstelling is goed gekozen, en dat is belangrijker dan het
aantal. Elke groep raakt een ander deel van de app:

| groep | aantal | wat zij als enige aanraken |
|---|---|---|
| gewone adverteerders | 3 | het standaardplan, de gewone fee |
| NSA-klanten | 4 | de community-fee (5%) en alles wat daarvan afhangt |
| affiliates | 4 | referral-links, commissie, uitbetaling |

Vier affiliates op zeven adverteerders is verhoudingsgewijs veel, maar
dat is juist goed: de affiliate-kant is het minst gelopen deel van de
app en heeft de meeste rekenstappen (commissie per referral, clawback
bij een terugboeking, uitbetaling in twee valuta).

## Waarom niet alle elf tegelijk

Niet vanwege de app. Vanwege de **handmatige wachtrijen**.

Er is in deze app precies één ding dat vanzelf geld verplaatst: de
maandelijkse incasso. Al het andere wordt door een mens aangeklikt:

- elke opwaardering wordt met de hand geverifieerd tegen de bank;
- elk ad-account wordt met de hand aangevraagd en gevuld;
- elke terugboeking met de hand goedgekeurd;
- elke commissie-uitbetaling met de hand gedaan;
- de DST wordt per klant per week ingevoerd.

Dat laatste is de stille kostenpost. Zeven adverteerders is zeven
DST-invoeren per week, elke week, en dat is werk dat niet wacht tot het
uitkomt.

De getallen van de laatste 30 dagen (11 walletverificaties, 9
ad-account-topups, 13 accountaanvragen) zijn **grotendeels ons eigen
testverkeer** en zeggen dus niets over de echte last. Daarom is de
maat hier niet een voorspelling maar een ontwerpvraag: hoeveel
handelingen per klant per week wil je zelf doen, en hoeveel dagen wil
je erover doen voor je het weet?

## De volgorde die ik zou aanhouden

1. **Eén klant eerst, twee tot drie dagen alleen.** Liefst een gewone
   adverteerder, niet een NSA en niet een affiliate — dat is het pad
   met de minste onbekenden, en als daar iets misgaat weet je dat het
   niet aan de fee of de commissie ligt.
2. **Daarna de rest van de adverteerders**, twee erbij per dag.
3. **De affiliates als laatste groep**, want hun commissie kan pas
   ontstaan als er adverteerders zijn die iets doen. Een affiliate die
   op dag één binnenkomt ziet een leeg dashboard en dat is een slechte
   eerste indruk van het deel dat hem moet motiveren.

Tussen stap 1 en 2 hoort één ding te gebeuren dat verder niets kost:
**kijken of de nachtelijke run schoon gelopen heeft**
(`docs/MAANDWISSEL_REPETITIE.md`).

## Wat er aan staat en wat niet

Voor de eerste klant erin gaat, moet dit besloten zijn — het staat nu
nog open:

- **`SUPPLIER1_MODE` — en dit stond hier eerst verkeerd.** Ik schreef
  dat het vullen van een ad-account "naar de mock gaat" en dus een
  bestelling zou zijn die nergens aankomt. **Dat klopt niet.** Nagemeten
  op de code en op de data:

  `autoPushGate` eist TWEE vlaggen, `SUPPLIER1_MODE=live` én
  `SUPPLIER1_AUTOPUSH` aan. Ontbreekt er een, dan wordt er **geen
  taakregel geschreven** -- niet eens een die later alsnog zou
  afgaan -- en de reden staat er letterlijk bij: *"pushes stay manual
  (admin funds the account in the supplier portal)"*. Op de database
  staan **nul** rijen in `integration_jobs`, ooit. De mock wordt dus
  niet bereikt en Falkyn ook niet.

  Met andere woorden: het vullen van een ad-account is vandaag
  handwerk, net als elke andere geldstap in deze app. Dat is geen
  openstaand risico maar de bestaande werkwijze. Het aanzetten van de
  automatische push is een aparte beslissing, en die hoeft niet voor
  de eerste klanten.
- **De Slash-koppeling** staat op "unreadable" tot de user-sleutel er
  is. Dat raakt alleen het overzicht "What we hold", niet een klant.
- **Wise-automatch** blijft uit. De referenties van het oude systeem
  matchen niet, dat is bekend en correct.

## Waar ik naar zou kijken in de eerste week

Niet naar schermen — naar deze vier getallen, één keer per dag:

```bash
npm run ochtend      # twaalf controles, alles hoort op 0
npm run rondje       # achttien controles, niets op FOUT
```

En specifiek:

1. **staat er een opwaardering langer dan een dag in de wachtrij** —
   dat is de klant die zit te wachten en het niet zegt;
2. **is er een abonnement op `past_due` gegaan** — dan heeft de
   nachtelijke incasso iemand niet kunnen afschrijven;
3. **is er een bankstorting binnengekomen die nergens bij hoort** —
   iemand heeft overgeboekt zonder de aanvraag af te maken (zie de
   notitie hieronder);
4. **staat er een commissie op provisioneel die allang definitief had
   moeten zijn.**

## Eén ding dat we onderweg zagen en niet gerepareerd hebben

De klant krijgt zijn **betaalkenmerk al te zien in stap 2** van de
opwaarderingsdialoog, vóór hij op Verzenden drukt. Hij kan dus
overboeken en daarna de dialoog wegklikken — en dan komt er geld
binnen met een kenmerk waar geen aanvraag bij hoort.

Het is minder erg dan het klinkt: het kenmerk blijft voor die klant
hetzelfde tot er wél een aanvraag verstuurd wordt (gemeten: een
afgebroken USD-poging en de daaropvolgende EUR-aanvraag kregen
allebei `0018-0663477024`). De storting matcht dus alsnog zodra hij
de aanvraag afmaakt. Maar hij staat tot die tijd in de
onbekende-stortingen-lijst. Met elf klanten is dat te overzien; het
staat in `docs/NEXT_SESSION_FIRST.md`.
