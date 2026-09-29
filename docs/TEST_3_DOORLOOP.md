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

## Logboek

Eén regel per scherm. `gemeten` is wat er OP het scherm stond;
`hoort` is wat wij op dat verse account gedaan hebben. Zijn die twee
niet gelijk, dan is het een bevinding — ook als de database het scherm
gelijk geeft.

| rol | scherm | gemeten | hoort | uitkomst |
|---|---|---|---|---|
| — | laag 1 vooraf | | | |
| T3-A | uitnodiging -> signup -> onboarding | | | |
| T3-A | dashboard | | | |
| T3-A | wallet | | | |
| T3-A | wallet opwaarderen (alle takken) | | | |
| T3-A | top-ups | | | |
| T3-A | accounts | | | |
| T3-A | ad-account aanvragen | | | |
| T3-A | invoices | | | |
| T3-A | my-subscription | | | |
| T3-A | my-referrals | | | |
| T3-A | profile | | | |
| T3-A | notifications | | | |
| T3-A | help | | | |
| T3-N | uitnodiging met NSA-community | | | |
| T3-N | de tien schermen, met de fee als vraag | | | |
| T3-F | uitnodiging -> signup als affiliate | | | |
| T3-F | dashboard | | | |
| T3-F | referrals | | | |
| T3-F | commissions | | | |
| T3-F | wallet | | | |
| T3-F | payout aanvragen | | | |
| T3-R | aanmelden via de link van T3-F | | | |
| T3-R | attributie zichtbaar bij T3-F | | | |
| eigenaar | de 39 schermen | | | |
| medewerker-admin | de 39 min eigenaar-alleen | | | |
| read-only admin | elke wachtrijknop weigert | | | |
| — | laag 3: de vijf geldstappen | | | |
| — | laag 1 opnieuw | | | |
| — | plak 157: opruimen | | | |
| — | laag 1 na het opruimen | | | |
