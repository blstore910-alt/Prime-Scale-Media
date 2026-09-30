# Wat er na test 3 nog moet, en in welke volgorde

Alle acht reizen staan dicht (30-09). Dit is wat de eigenaar daarna
noemde, met per onderdeel wat er al ligt en wat het kost — gemeten, niet
geschat.

---

## De volgorde die ik zou aanhouden

De eigenaar vroeg: eerst die vier dingen, of eerst test 4?

**Geen van beide eerst.** Er ging vandaag iets voor, en er is één ding
dat vóór allebei hoort.

### 1. Plak 173 — nu (STUK, niet te bouwen)

Geen wens maar een storing. Zie hieronder bij *Subscription invoice via
email*. Drie klanten hebben samen EUR 600 openstaan en is nooit verteld
dat er een factuur was.

### 2. De hersteltest — een middag, en de enige die niet kan wachten

Dit is het enige op de hele lijst dat je **niet meer kúnt doen op het
moment dat je het nodig hebt**. Over een paar weken zitten er elf echte
klanten in met echt geld. Test 4 bewijst dat de schermen kloppen; de
hersteltest bewijst dat het bedrijf een slechte dag overleeft.

`docs/BACKUP_AND_RECOVERY.md` bestaat al — en is nooit uitgevoerd. Een
draaiboek dat niemand heeft gelopen is een aanname.

### 3. Test 4

Pas hierna. Reden: test 4 bestaat om te vangen wat test 3 kapot heeft
gemaakt, en elke feature die je er vóór bouwt maakt hem groter en stelt
het moment uit waarop je weet waar je staat.

### 4. De drie resterende features

In deze volgorde, van "staat er half" naar "grootst":
app guide → partner directory → multi-user.

---

## De vier onderdelen

### Subscription invoice via email — **STUK, plak 173 ligt klaar**

> "klanten moeten voor elke subscription invoice email krijgen, alleen
> subs he verder niets"

**De mails bestaan al en zijn goed.** `lib/pure-billing-email.ts` kent
drie soorten, alledrie abonnement:

    subscription_invoice            een nieuwe factuur is klaar
    subscription_invoice_due_soon   hij wordt over een paar dagen afgeschreven
    subscription_past_due           hij staat open

"Alleen subs" klopt dus al: een walletopwaardering of een
ad-accounttopup stuurt geen mail, en dat verandert niet.

**Wat stuk is.** Er zijn TWEE wegen naar een abonnementsfactuur:

| | melding |
|---|---|
| `subscription_billing_run` — de nachtelijke incasso van 03:00 | schrijft hem |
| `create_invoice_for_subscription` — een trigger op `subscriptions`, alle andere gevallen | **geen enkele** |

Gemeten op 30-09: **20 abonnementsfacturen, 7 meldingen, de laatste van
20-09.** Acht facturen sindsdien zonder mail:

    145  30-09  EUR  75,00  PSM0020  paid
    142  30-09  EUR 200,00  PSM0018  paid
    138  24-09  EUR 200,00  PSM0013  ONBETAALD
    136  24-09  EUR 200,00  PSM0012  ONBETAALD
    135  23-09  EUR 150,00  PSM0011  paid
    131  22-09  EUR  10,00  PSM0010  paid
    130  22-09  EUR  10,00  PSM0007  paid
    125  21-09  EUR 200,00  PSM0006  ONBETAALD

Plak 173 zet dezelfde melding in de tweede weg. **Geen terugwerkende
kracht** — de drie onbetaalde horen een persoonlijk bericht, geen
automatische mail die doet alsof hij op tijd was.

### PSM app guide — **staat er al half**

`components/admin/admin-manual.tsx` en `components/admin/manual-content.ts`
bestaan en worden gerenderd. Wat er is: de beheerkant, per scherm, met
per rol wat wel en niet mag.

Wat ontbreekt: dezelfde handleiding voor **adverteerder**, **affiliate**
en **super-admin**. De vorm hoeft niet bedacht te worden — die staat er
al; het is de inhoud schrijven en drie ingangen toevoegen.

### PSM partner directory — **nieuw, op zichzelf staand**

Tegels of kaarten met partners, met links naar de eigen site. Raakt geen
geld, geen RLS, geen bestaande stroom. Daarom laag in de volgorde: hij
kan op elk moment, en hij houdt niets tegen.

Te beslissen vóór het bouwen: staat de lijst in de database (zodat jij
hem beheert) of in een bestand (zodat er niets te beheren valt)? Bij
minder dan tien partners die zelden wijzigen is een bestand eerlijker.

### Multi-user voor advertisers en affiliates — **de grootste**

Staat al beschreven sinds 17-09 en is niet gebouwd. De reden dat hij
groot is: elke tabel die vandaag "van één gebruiker" is moet "van een
team" worden, en dat is RLS op twaalf tabellen plus een rollenmodel
binnen een klant (wie mag opwaarderen, wie mag alleen kijken).

Niet beginnen voor de eerste klanten binnen zijn: dit is de soort
wijziging waarbij een fout betekent dat klant A de gegevens van klant B
ziet.

---

## De drie backup-onderdelen

Deze zijn **niet even groot**, en dat verschil is de kern van het advies
hierboven.

### Backup testen via PITR + een scenario — *een middag, hoogste waarde*

> "wat als er 1u of 8u werk verloren gaat, hoe gaan we te werk en
> herstellen"

Supabase heeft point-in-time recovery. De vraag is niet of het bestaat
maar of wij het kunnen: hoe lang duurt het, wat is er intussen down, wat
doe je met betalingen die tussen het verlies en het herstel binnenkwamen,
en wie beslist. Dat is een draaiboek en één repetitie.

Doe dit vóór de eerste klant. Daarna is het geen oefening meer.

### Dagelijkse zip naar Drive + e-mail — *een build*

Let op waar dit tegen beschermt, want dat is iets anders dan PITR:
Supabase' eigen backups beschermen tegen een fout IN de database. Een
kopie bij jou beschermt tegen het verliezen van de Supabase-account
zelf — een factuur die niet betaald wordt, een account dat gesloten
wordt. Dat is een echt risico en een andere maatregel.

### Betaalde facturen naar Drive, per maandmap — *een build*

Met één ding om te weten: de facturen bestaan niet als bestand. Ze
worden op aanvraag gemaakt door `lib/invoice-pdf.ts`. Dit is dus
"genereren en wegschrijven", niet "kopiëren" — en daarmee groter dan het
klinkt, maar ook beter, want een gegenereerde PDF is altijd de huidige
opmaak en het huidige logo.
