# De maandwissel-repetitie

> "we zouden ook een test doen zodat ik niet een maand hoef te wachten"
> — de eigenaar, 30-09
>
> "doe maar dingen zodat we zien of die binnen 1 2 dagen aanslaat"

Het abonnementsgeld is het enige in deze app dat **uit zichzelf** van
een klant afgaat. Alle andere bedragen worden door iemand aangeklikt:
een opwaardering wordt met de hand geverifieerd, een ad-account wordt
met de hand gevuld, een uitbetaling met de hand goedgekeurd. De
maandelijkse incasso niet. Die gebeurt om 03:00 terwijl niemand kijkt.

Daarom is dit het laatste dat geoefend moet worden voor er echte
klanten in gaan. En daarom hoeft dat niet een maand te duren.

## Wat er om 03:00 draait

`vercel.json` -> `/api/cron/subscription-billing` -> de RPC
`subscription_billing_run()`. Eén transactie, dus het lukt voor
iedereen of voor niemand. Twee lussen, in deze volgorde:

**Lus 1 — facturen maken.** Elk abonnement met
`status in ('active','past_due')` en `next_payment_date <= now()`
krijgt een factuur, `due_date = now() + 7 dagen`, en
`next_payment_date` schuift één maand op **vanaf de oude datum** — dus
een abonnement dat negen dagen achterloopt krijgt één inhaalfactuur en
niet negen.

**Lus 2 — incasseren.** Elke `unpaid` abonnementsfactuur waarvan de
`due_date` verstreken is, op een abonnement dat niet
cancelled/inactive/paused is, van een klant die niet uitgezet is,
gaat door `invoice_pay_from_wallet`. Lukt dat niet — meestal te weinig
saldo — dan gaat het abonnement op `past_due` en krijgt de klant een
bericht. Stond hij al op `past_due`, dan geen tweede bericht.

Er is **geen knop** in de beheerschermen die deze run start. 03:00 of
niets.

## Wat er vannacht (30-09 -> 01-10) sowieso gebeurt

Gemeten op 30-09 om 09:40, met `npm run check`:

| | wie | wat |
|---|---|---|
| **facturen maken** | PSM0006, PSM0012, PSM0013, PSM0018 | vier nieuwe facturen van EUR 200 |
| **incasseren** | PSM0006, PSM0012, PSM0013 | drie pogingen |

De eerste drie zijn **oude testaccounts** van eerdere doorlopen
(`@robustq.com`, "Walkthrough" in de naam) en ze hebben alle drie
**EUR 0** in hun wallet. Er gaat vannacht dus geen cent van een echte
klant af, en alle drie de incasso's mislukken en blijven `past_due`.

Dat PSM0006 sinds 21-09 niet meer gefactureerd is, komt door plak 160:
tot die plak zette de run ze op `inactive`, en `inactive` zit in geen
van beide lussen. Ze vielen stil uit de boeken. Sinds plak 160 staan
ze op `past_due` en doen ze weer mee — vannacht is hun eerste ronde.

Twee van de drie paden zijn daarmee geoefend:

- [x] een factuur maken op de dag dat hij hoort te komen
- [x] een incasso die **mislukt** -> `past_due` + bericht
- [ ] een incasso die **lukt** -> geld eraf, factuur op `paid`

## Wat plak 163 toevoegt

Dat derde pad kan vannacht niet vanzelf: de enige klant mét saldo is
PSM0018, en diens factuur vervalt pas 07-10 (zeven dagen, plak 162).

Plak 163 zet de vervaldatum van die ene factuur op één minuut geleden.
Meer niet. De run doet vannacht gewoon zijn werk en neemt hem mee.

Om de repetitie mogelijk te maken staat er nu **EUR 500** op de wallet
van PSM0018 (twee opwaarderingen, 300 + 200, allebei door de hele reis
heen: dialoog, slip, wachtrij, verify door Lasse).

## Wat je morgenochtend hoort te zien

Bij **PSM0018**:

| | voor | na |
|---|---|---|
| wallet EUR | 500,00 | **300,00** |
| factuur `0018-142` | unpaid | **paid** |
| abonnement | active | **active** (niet past_due) |
| `next_payment_date` | 30-09 | **31-10** |
| | | en een **nieuwe** factuur van EUR 200, vervalt 07-10 |

Bij **PSM0006 / PSM0012 / PSM0013**: elk één nieuwe factuur van
EUR 200, abonnement blijft `past_due`, wallet blijft 0.

## Het nakijken, in één opdracht

```bash
npm run check -- -f supabase/checks/NAKIJKEN-MAANDWISSEL.sql
```

Die vraagt precies de tabel hierboven op. Klopt hij, dan is de
incassomotor geoefend op alle drie de paden en hoeft er niet op een
echte maandwissel gewacht te worden.

## Wat dit NIET oefent

Eerlijk blijven over wat er buiten valt:

- **Een incasso die faalt terwijl er wél geld op staat** — bijvoorbeeld
  een EUR-factuur tegen een wallet die alleen USD heeft. Dat pad loopt
  via `canExchangeToPay` op het scherm, maar de nachtelijke run wisselt
  niet om; hij faalt en zet `past_due`. Dat is een keuze, geen fout,
  maar hij is nooit in het echt gezien.
- **Twee maandwissels achter elkaar.** De inhaalregel (één factuur, niet
  negen) is uit de code gelezen en aan PSM0006 gemeten, maar nooit twee
  nachten op rij gedraaid.
- **De herinnering "due in a few days"** (`createDueSoonReminders`)
  draait wel mee maar is niet apart nagelopen.
