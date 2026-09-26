# UITROLPLAN — van nul naar 120 klanten

> Vastgesteld 26-09-2026. Hoort bij `docs/LAATSTE_RONDE_A_TOT_Z.md`: dat
> document zegt wát we controleren, dit zegt wanneer we welke deur
> opendoen.

---

## De correctie die dit plan sneller maakte

Ik adviseerde eerst om een **hele maandcyclus af te wachten** voordat
fase 1 naar fase 2 mocht. De eigenaar vroeg terecht of dat niet sneller
kon: onboarden op 28 augustus, en dan op 28 september kijken wat er
gebeurt.

Dat is beter dan wachten, en beter dan wat ik voorstelde. Door een
**echte** datum te kiezen draait de cron uit zichzelf om 03:00, dus je
test de planning mee en niet alleen de functie. Het scheelt een maand
per fase en levert hetzelfde bewijs.

## Wat je moet weten voordat je backdatet

`subscription_billing_run` slaat een abonnement over zolang er een
onbetaalde abonnementsfactuur op staat — met opzet, zodat er geen stapel
ontstaat. En `next_payment_date` schuift alleen op **bij betaling**.

```sql
-- de twee takken die het gedrag bepalen, uit de live functie
where s.status in ('active', 'past_due')
  and s.next_payment_date <= now()
...
if exists (select 1 from invoices i
   where i.subscription_id = r.id
     and coalesce(i.status,'') not in ('void','cancelled')
     and (i.period_start = v_period
          or (i.type = 'subscription' and i.status = 'unpaid')))
then continue; end if;
```

Daarom moet fase 0B **twee keer** gelopen worden: één keer betalend en
één keer niet. De tweede is de interessantere, want dat is de aanmaning,
de respijtperiode en de automatische incasso — en die hebben nog nooit
gedraaid.

---

## HET PLAN

```
PSM UITROLPLAN - 26 sep

FASE 0  AFMAKEN            nu -> ~8 okt
- draaiboek blok 1 t/m 12 (alle schermen, alle rollen)
- blok 13: grootboek (elke geldbeweging als regel)
- blok 14: 2 eigenaren + rechten per admin
- blok 15: testaccounts eraf

FASE 0B  MAANDCYCLUS FORCEREN      28 sep
- testklant onboarden op 28 aug (backdate)
- eerste factuur betalen
- 28 sep 03:00 draait de cron vanzelf
- checken: maand 2 gefactureerd? melding? bedrag goed?
- daarna nog een keer NIET betalen -> aanmaning,
  respijt, automatische incasso
Kost 2 dagen, geen maand.

FASE 1  3 KLANTEN          9 okt -> 23 okt
Mag pas beginnen als:
- grootboekcontrole geeft 0 afwijkingen
- fase 0b is gelopen
Regels:
- mensen die je kunt bellen
- max storting een paar honderd euro
- elke ochtend: grootboekcontrole + wachtrijen leeg

FASE 2  30 KLANTEN         23 okt -> 6 nov
Mag pas beginnen als:
- 2 weken fase 1 zonder handmatige correctie
- geen enkele klant heeft hoeven bellen over een bedrag
Nieuw in deze fase:
- gelijktijdigheid (2 admins, dubbelklikken)
- volumegrenzen (lijsten stoppen nu bij 50)
- plafond omhoog

FASE 3  DE REST (120)      vanaf 6 nov
Mag pas beginnen als:
- 2 weken fase 2 schoon
- een echte maandovergang met betalende klanten
  is voorbij (die valt op 1 nov, dus die zit erin)
- plafond eraf

DAGELIJKS, ELKE FASE
1. grootboekcontrole -> moet 0 rijen geven
2. alle wachtrijen leeg
3. auditlog: geen regel zonder naam

STOPSIGNAAL - terug een fase
- een saldo dat niet klopt
- een factuur met een verkeerd bedrag
- een klant die belt over geld
```

---

## Waarom de poorten zijn zoals ze zijn

**Fase 1 mag niet vóór het grootboek.** Met drie klanten kun je een fout
nog met de hand uitzoeken. Dat is het enige moment waarop dat kan, en
juist dan wil je het gereedschap al hebben — niet bouwen terwijl er iets
misgaat.

**3 → 30 is de sprong waar gelijktijdigheid begint.** Drie mensen botsen
niet. Twee admins op dezelfde rij, een klant die twee keer op verzenden
drukt: dat komt pas bij aantallen. Het grootboek voorkomt dat niet, maar
maakt het zichtbaar en herstelbaar.

**30 → 120 wacht wél op een echte maandovergang**, en niet om de code.
Dertig klanten is nog te overzien als er iets misgaat; honderdtwintig
niet. Die overgang valt op 1 november en zit dus vanzelf in fase 2.

**Het plafond op de storting** is er niet omdat je die mensen niet
vertrouwt. Het is er zodat de eerste fout een fout van 200 euro is en
geen van 5.000.

## Wat dit plan niet oplost

- **Gelijktijdigheid** wordt zichtbaar, niet voorkomen. Van de
  mutatie-acties draagt een deel `ifUpdatedAt`; de rest niet.
- **Migraties lopen niet mee met de code.** Ze worden met de hand
  geplakt, dus code en schema zijn nooit in de pas. Elke sessie vindt
  nog een lezer die omvalt op een kolom die er nog niet is.
- **Externe partijen.** De Wise-feed en de leverancier-API: wat doet de
  app als die iets onverwachts teruggeven?

Die drie horen op de lijst voor na de uitrol, niet ervoor. Ze zijn geen
reden om te wachten — wel om te weten waar je moet kijken als het
misgaat.
