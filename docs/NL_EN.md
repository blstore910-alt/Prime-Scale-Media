# NL/EN — de taalschakelaar

Besloten door de eigenaar op 30-09:

> "veel NSA-klanten zijn Nederlands, vandaar. Sommige dingen Engels
> laten, zoals top-up, exchange, accounts en wallet. Zoveel mogelijk NL,
> kort houden voor knoppen enzovoort, dus zo denken — anders hebben die
> mensen in NL even pech qua design."

## De vier regels

1. **Alleen de klantkant.** Adverteerder-app, affiliate-app,
   auth-schermen, klantdialogen, het klanthandboek, e-mails, de
   factuur-PDF. De beheerkant blijft Engels.

2. **Vaktermen blijven Engels.** De woordenlijst hieronder wordt niet
   vertaald. Een Nederlandse klant zegt "wallet" en "top-up", en een
   vertaling ("portemonnee", "opwaardering") maakt de app vreemder, niet
   vertrouwder.

3. **Kort.** Een knop in het Nederlands is niet langer dan zijn Engelse
   versie. Dat is geen richtlijn maar een test (zie onder).

4. **Het ontwerp wint.** Past een Nederlandse zin niet, dan wordt de
   ZIN korter — nooit de knop breder of de kop op twee regels. "Anders
   hebben die mensen in NL even pech qua design": het ontwerp wordt
   niet voor de langere taal aangepast.

## De woordenlijst — blijft Engels

    wallet · top-up · exchange · ad account · accounts · plan
    dashboard · affiliate · referral · fee · funding · Pay now

De eerste vier noemde de eigenaar zelf. De rest zijn productnamen of
woorden die een Nederlandse adverteerder in het Engels kent.

**Wel Nederlands: factuur en terugboeking.** In een eerste versie stonden
*invoice* en *withdrawal* ook op deze lijst, en de vaktermwachter ving
prompt "terugboeking". Maar dat was mijn oprekking, niet zijn regel -- en
"zoveel mogelijk NL" pleit er juist tegen. Factuur en terugboeking zijn
gewone Nederlandse geldwoorden die elke klant voor zijn boekhouding
gebruikt; geen jargon zoals wallet of top-up.

Bij twijfel: laat staan wat de klant in zijn eigen bankapp of
advertentiemanager ook ziet.

## Hoe "foutloos" wordt afgedwongen

Foutloos betekent hier: een ontbrekende of te lange vertaling kan niet
live gaan. Drie wachters, alle drie een test die faalt:

| wat | hoe |
|---|---|
| **Geen ontbrekende vertaling** | `nl.ts` is getypt als `Record<keyof typeof en, string>`. Een sleutel die in het Engels bestaat en in het Nederlands niet, is een typefout — `tsc` faalt, de build faalt, er gaat niets live. |
| **Geen vertaalde vakterm** | Een test zoekt in `nl.ts` naar de Nederlandse vertalingen van de woordenlijst ("portemonnee", "opwaarderen", "wisselen", …) en faalt als er een staat. |
| **Geen te lange knop** | Sleutels die met `btn.` of `label.` beginnen mogen in het Nederlands niet langer zijn dan in het Engels plus twee tekens. Faalt anders, met de sleutel en beide lengtes erbij. |

## Waar de taal woont

In `user_profiles.locale` (`'en'` of `'nl'`), niet alleen in de browser.
Reden: e-mails en de factuur-PDF worden op de SERVER gemaakt, en die
moeten weten in welke taal de klant leest. Een keuze die alleen in de
browser staat, levert een Nederlandse app en een Engelse factuur op.

Standaard `'en'`. De klant kiest zelf onder Settings.

## Volgorde van bouwen

1. De fundering: woordenboek, types, context, schakelaar, de kolom,
   en de drie wachters. Daarna kan er niets meer half vertaald live
   gaan.
2. Wat een klant het vaakst ziet: dashboard, wallet, billing.
3. Ad accounts, aanvragen, terugboeken.
4. Auth-schermen.
5. Het klanthandboek.
6. E-mails en de factuur-PDF (server-side).
7. Affiliate-app.

Na elke stap is de app bruikbaar in beide talen: wat nog niet vertaald
is staat in het Engels, en dat is een zichtbaar werkpunt, geen fout.

## Wat het kost

Gemeten op 30-09: ruwweg 800–1.200 klantzinnen. Vier tot zes werkdagen,
waarvan het vertalen het kleinste deel is. Het meeste zit in het
uithalen van zinnen uit de componenten en in het nalopen op 390px — en
omdat regel 3 en 4 als test bestaan, is dat nalopen voor de knoppen al
gedaan voordat iemand kijkt.
