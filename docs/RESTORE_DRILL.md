# Herstellen — wat we doen als er werk verloren gaat

De eigenaar, 01-10: "we gaan een echte backup testen. Wat als er 1 uur
of 8 uur werk verloren gaat, hoe gaan we te werk en herstellen."

Dit document is het draaiboek. Het eind ervan is een **oefening** die
we echt draaien, met een logboek waarin de uitkomst komt.

---

## 1. Wat er is om uit te herstellen

| laag | waar | hoe ver terug | wat het dekt |
|---|---|---|---|
| **A. Supabase PITR** (point-in-time) | Supabase → Database → Backups | tot op de minuut, binnen de bewaartermijn (7 dagen bij de kleinste add-on) | de hele database, ook auth. **Niet** de bestanden in storage |
| **B. Supabase dagelijkse backup** | idem, tabblad *Scheduled backups* | één per dag, 7 dagen (Pro) | idem, maar alleen op het moment van de backup |
| **C. Onze zip op Drive** | `PSM/Backups/<jaar>/<maand>/` | één per nacht (01:30 UTC), zolang je ze bewaart | elke tabel, de logins (zonder wachtwoorden), de bestanden in storage. **Buiten Supabase** — dit is wat over is als het project zelf weg is |
| **D. audit_events** | in de database | alles sinds 28-08 | elke wijziging aan een geldtabel, met de rij **ervoor en erna** en wie het deed. Het chirurgische mes |
| **E. wallet_ledger** | in de database | alles sinds 28-09 | elke saldobeweging, met saldo voor en na. Geschreven door een trigger, dus niet te omzeilen |
| **F. Buiten ons** | Wise, RockAds/Falkyn, Brevo, Vercel | eigen bewaartermijnen | de waarheid over geld dat binnenkwam (Wise), wat er op ad accounts staat (leverancier-API), welke mails er gingen (Brevo), welke acties de server deed (Vercel-logs) |

**Eerst nagaan, eenmalig:** staat PITR aan? Supabase → Project →
Database → Backups. Staat er *Point in time* met een bewaartermijn, dan
is laag A er. Zo niet, dan is het slechtste geval **24 uur** werk kwijt
(laag B of C) in plaats van **2 minuten**. De add-on kost per maand een
vast bedrag (zie de prijs in het dashboard) — voor een app waar klantgeld
doorheen gaat is dat het goedkoopste wat er op deze lijst staat.

## 2. De gouden regels

1. **Eerst bevriezen, dan denken.** Vercel → Environment Variables →
   `MAINTENANCE_MODE=true` → Redeploy. Elke schrijfactie in de app
   weigert dan, ook de nachtelijke billing. Geen nieuwe schade terwijl
   je uitzoekt.
2. **Nooit herstellen bovenop productie als het ook chirurgisch kan.**
   Een PITR terug naar 14:00 wist óók alles wat klanten na 14:00 goed
   deden: top-ups die binnenkwamen, aanvragen, betalingen. Dat werk moet
   je dan met de hand terugzetten — precies wat je wilde voorkomen.
3. **Herstel naar een NIEUW project, haal daar uit wat je nodig hebt.**
   Supabase kan een backup of PITR-moment terugzetten in een apart
   project (*Restore to a new project*). Productie blijft staan; je
   vergelijkt en kopieert alleen de rijen die kapot zijn.
4. **Het grootboek beslist.** Na elk herstel: `npm run ochtend` en
   `supabase/checks/RESTORE-DRILL-TELLING.sql`. Regel 6 ("wallets die
   niet bij hun ledger passen") moet **0** zijn.
5. **Pas ontdooien als de telling klopt.** `MAINTENANCE_MODE` weg →
   Redeploy.

## 3. Scenario: 1 uur werk weg

*Voorbeeld:* om 14:00 draait een kapotte plak of een bug die rijen
verkeerd zet; om 15:00 ziet iemand het.

Een uur is klein genoeg om **chirurgisch** te herstellen. Geen PITR op
productie.

1. **Bevriezen** (regel 1). Noteer de tijd.
2. **Afbakenen:** wat is er tussen 14:00 en nu veranderd?
   ```sql
   select table_name, action, count(*)
     from public.audit_events
    where occurred_at >= '2026-10-01 14:00+02'
    group by 1, 2 order by 3 desc;
   ```
   Kijk welke tabellen en hoeveel rijen. Een bug raakt meestal één
   tabel of één soort wijziging.
3. **Goed van fout scheiden.** Per rij laat `before_data` zien hoe hij
   was en `after_data` hoe hij werd. Wijzigingen door klanten (top-up
   ingediend, aanvraag gedaan) zijn goed; de wijzigingen van de bug zijn
   de rijen met het foute patroon.
4. **Terugzetten** met een plak die per rij `before_data` terugschrijft —
   alleen de kolommen die de bug raakte. Zoals elke plak: één tabel als
   verslag, en eerst als `select` draaien om te zien wat hij zou doen.
5. **Geld nalopen.** Raakte de bug een saldo? Dan staat dat in
   `wallet_ledger` met `balance_before` en `balance_after` per beweging.
   Herstel een saldo **altijd met een correctie die zelf in het
   grootboek komt** (de wallet-correctie in de admin), nooit met een
   kale `update wallets`: dan klopt het grootboek daarna niet meer.
6. **Telling** (regel 4) → **ontdooien** (regel 5).
7. **Klanten**: wie heeft iets gezien dat niet klopte? Eén bericht in hun
   WhatsApp-groep, met wat er gebeurde en dat het hersteld is.

*Als de schade breder is dan een paar tabellen:* herstel PITR naar
13:59 in een **nieuw project**, en kopieer daaruit de aangetaste tabellen
(of rijen) naar productie. Het werk dat klanten na 14:00 deden, blijft
dan staan.

## 4. Scenario: 8 uur werk weg

*Voorbeeld:* de database moest terug naar vannacht (het project is
kapot, of er is breed iets mis), en alles van 08:00 tot 16:00 is weg. Of:
er is geen PITR en de laatste backup is van vannacht.

Nu is het werk zelf weg, niet alleen beschadigd. Het moet **opnieuw
opgebouwd** worden uit wat er buiten de database van bestaat.

1. **Bevriezen** (regel 1), en zet een bericht in de klantgroepen: "we
   herstellen, betalingen en aanvragen van vandaag komen terug, doe niets
   dubbel".
2. **Herstellen** naar het laatste goede moment:
   - met PITR: naar het moment vlak voor het probleem;
   - zonder PITR: Supabase *Scheduled backup* van vannacht;
   - is het **project zelf** weg: nieuw project, en de zip van Drive
     inlezen (`tables/*.json`, en `storage/` terug in de buckets). Eerst
     `npm run backup:verify -- <zip>`.
3. **Wat er die 8 uur gebeurde, uit bronnen buiten de database:**

   | wat | bron | hoe terug |
   |---|---|---|
   | geld dat binnenkwam | **Wise** | de Wise-feed draait door; ontbrekende stortingen komen opnieuw binnen via de feed of uit het Wise-overzicht van die dag |
   | top-ups die klanten indienden | de klant heeft het **betaalbewijs** nog, en de bewijzen staan in storage als storage niet mee terugging | klant vragen opnieuw in te dienen met hetzelfde kenmerk, of de admin zet hem neer |
   | geld naar ad accounts | **RockAds / Falkyn** | de leverancier-API toont elke funding met tijd en bedrag; die zijn echt gebeurd, ook al weet onze database het niet meer |
   | facturen | de nachtelijke billing | idempotent: opnieuw draaien maakt precies de ontbrekende aan |
   | betaalde facturen | de pdf staat op Drive (`Facturen/`) zodra hij betaald was en de nacht voorbij was | |
   | mails die eruit gingen | **Brevo** → Transactional → Logs | laat zien wat een klant te horen kreeg |
   | acties van admins | **Vercel** → Logs (server actions) | wie wat goedkeurde |

4. **Per bron terugzetten, in deze volgorde:** stortingen (geld in) →
   top-ups verifiëren → ad-account fundings (tegen de leverancier) →
   terugboekingen → facturen. Geld eerst, want daar hangt de rest aan.
5. **Telling** (regel 4): elke wallet tegen zijn grootboek, en de
   ad-account saldi tegen de leverancier.
6. **Ontdooien**, en een bericht aan de klanten dat alles terug is.

## 5. De oefening — echt draaien

Doel: weten dat het werkt **voordat** het nodig is, en hoe lang het duurt.

**A. De zip (10 minuten, kan elke week)**

1. Download de zip van vannacht uit `PSM/Backups/...`.
2. `npm run backup:verify -- <pad-naar-zip>`
   → verwacht: "Alles klopt: N tabellen, M rijen", exit 0.
3. Open `manifest.json`: staat er niets onder `failed`?

**B. Een echt herstel (30–60 minuten, eens per kwartaal)**

1. Supabase → Database → Backups → kies een moment (PITR) of de backup
   van vannacht → **Restore to a new project**. *Niet* "restore" op het
   productieproject.
2. Wacht tot het nieuwe project klaar is. Noteer hoe lang dat duurde:
   dat is je hersteltijd.
3. Draai `supabase/checks/RESTORE-DRILL-TELLING.sql` in de SQL-editor
   van het nieuwe project én van productie. Leg ze naast elkaar:
   - de aantallen moeten gelijk zijn tot het gekozen moment;
   - regel 6 moet in allebei **0** zijn.
4. Oefen scenario 3 op het **nieuwe** project: kies een wallet, doe
   alsof een bug hem leeg zette, en zet hem terug met `before_data` uit
   `audit_events`. Klopt regel 6 daarna nog?
5. Gooi het oefenproject weg (Settings → General → Delete project) — het
   kost geld zolang het bestaat.
6. Schrijf de uitkomst in het logboek hieronder.

## 6. Nulmeting (productie, 01-10-2026 06:11 UTC)

Uit `RESTORE-DRILL-TELLING.sql`, om een eerste oefening tegen te houden:

| wat | waarde |
|---|---|
| advertisers | 22 |
| user_profiles | 27 |
| wallets | 22 |
| som saldo EUR | 1593.50 |
| som saldo USD | 1668.37 |
| wallets die niet bij hun ledger passen | **0** |
| invoices (betaald) | 39 (27) |
| ad_accounts | 13 |
| wise_incoming_transfers | 388 |
| audit_events | 3947 |

## 7. Logboek van oefeningen

| datum | wie | soort (A zip / B herstel) | hersteltijd | telling klopt? | wat viel op |
|---|---|---|---|---|---|
| | | | | | |
