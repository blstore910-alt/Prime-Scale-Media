# Morgenochtend, 1 oktober — in deze volgorde

De run van 03:00 heeft dan gedraaid. Dit is wat je nakijkt en wat er
daarna meteen aan de beurt is. Vijf minuten, en je weet of de
incassomotor werkt.

## 1. De uitslag van de nacht (één opdracht)

```bash
npm run check -- -f supabase/checks/NAKIJKEN-MAANDWISSEL.sql
```

Wat er hoort te staan:

| klant | wallet | abonnement | oordeel |
|---|---|---|---|
| PSM0018 | 300,00 | active | `GOED — incasso gelukt, abonnement bleef active` |
| PSM0006 | 0 | past_due | `GOED — factuur erbij, incasso mislukt` |
| PSM0012 | 0 | past_due | idem |
| PSM0013 | 0 | past_due | idem |

Staat er bij PSM0018 **`NIET GEBEURD`**, dan is óf plak 163 niet
gedraaid óf de run niet gelopen. Het verschil zie je aan
`vannacht_erbij`: staat die op 0 bij alle vier, dan heeft de run niet
gedraaid en is dat het echte nieuws.

Staat er **`KIJKEN`**, dan is de factuur wél betaald maar staat het
abonnement niet op `active` — dat is de enige echt onverwachte uitslag
en die wil ik zien voor er iets anders gebeurt.

Daarna de gewone laag 1:

```bash
npm run ochtend && npm run rondje
```

## 1b. De stand van PSM0018 vlak voor de nacht

Gemeten op 30-09 om ~16:00, zodat elk verschil morgen een naam heeft:

| | voor | hoort morgen |
|---|---|---|
| wallet EUR | 500 | **300** |
| wallet USD | 0 | 0 |
| ledgerregels | 2 | **3** (de incasso erbij) |
| abonnement | active, volgende 30-09 | active, **volgende 31-10** |
| abonnementsfactuur unpaid | 1 x EUR 200,00 | **0** |
| abonnementsfactuur paid | 0 | **1 x EUR 200,00** |
| en een NIEUWE unpaid | — | **1 x EUR 200,00, vervalt 07-10** |
| opwaardeerfacturen paid | 2 x EUR 500,00 | ongewijzigd |
| ad-accounts | 0 | 0 |
| aanvragen | 0 | 0 |
| meldingen | 2 | **3 of meer** |

Wijkt er iets af dat hier niet staat, dan is dat het nieuws.

## 2. Wat er dan vanzelf opengaat

De accounts- en aanvraagschermen van PSM0018 zijn nu dicht met
*"Pay your subscription invoice first"*. Als de incasso gelukt is,
horen die open te zijn. **Dat is zelf een controle**: opent een
AUTOMATISCHE betaling dezelfde poort als een handmatige, of kijkt die
poort alleen naar een betaling via de knop?

De query erachter is `["adv-plan-paid"]` in `adv-app.tsx` —
`invoices` waar `type = 'subscription'` en `status = 'paid'`. Een
door de cron betaalde factuur voldoet daaraan, dus het hoort te
werken; maar het is nooit gezien.

## 3. Reis 3, en let op wat GRATIS is

Zodra de poort open is:

- De **eerste twee** ad-accountaanvragen van PSM0018 horen **niets** te
  kosten. `isFree = used < included`, en het plan Prime geeft
  `included_ad_accounts = 2`.
- De **EUR 50** van reis 3 verschijnt pas bij de **derde** aanvraag.

Een gratis eerste aanvraag is dus geen fout. Wat je wél moet zien:
de kaart en de bevestiging zeggen allebei "Included in your plan", en
het saldo beweegt niet.

## 4. Wat er op jou wacht

| | wat | waarom het klemt |
|---|---|---|
| **plak 165** | de tweede eigenaar mag ook beslissen | zonder dit kan Lasse geen affiliate-aanvraag beslissen — reis 7 en 8 staan erop vast |
| **inloggen** | paneel én Chrome staan uit | allebei op `/auth/login` sinds ~15:00 |
| **T3-F in het paneel** | `t3f-3009@robustq.com` | reis 7 heeft een eigen sessie nodig |
| **T3-R aanmelden** | via `…/auth/sign-up?t=prime-scale-media&ref=PSM0017` | dat maakt de referral die reis 7 afmaakt |
| ~~**`SUPPLIER1_MODE`**~~ | *vervallen* | Ik had dit fout: de poort eist twee vlaggen en schrijft zonder die **geen taak** — nul rijen in `integration_jobs`, ooit. Een ad-account vullen is handwerk in de leveranciersportal, net als elke andere geldstap. Geen openstaand risico. |

## 5. Hoe reis 7 daarna dichtgaat

Er is **geen EUR 200 echte commissie** nodig. De drempel is per
affiliate te verlagen met `affiliate_payout_min_set` (0 = mag om alles
vragen). Dus:

1. T3-R meldt zich aan via de link → referral ontstaat
2. eigenaar keurt de referral goed op `/affiliates` (kan pas ná plak 165)
3. T3-R doet iets dat commissie oplevert (een opwaardering)
4. drempel verlagen voor T3-F
5. T3-F vraagt de uitbetaling aan
6. eigenaar beslist erover

Stap 1 is de enige die op jou wacht; 2 tot 6 doe ik.

## 6. Wat er vannacht NIET geoefend wordt

Eerlijk blijven over de gaten:

- een incasso die faalt terwijl er **wel** geld staat, maar in de
  verkeerde valuta (EUR-factuur, alleen USD in de wallet). De
  nachtelijke run wisselt niet om; hij faalt en zet `past_due`. Dat is
  een keuze, maar hij is nooit in het echt gezien.
- **twee** maandwissels achter elkaar. De inhaalregel (één factuur, niet
  negen) is uit de levende code gelezen en aan PSM0006 gemeten, nooit
  twee nachten op rij gedraaid.
- de herinnering "due in a few days" (`createDueSoonReminders`) draait
  wel mee maar is niet apart nagelopen.
