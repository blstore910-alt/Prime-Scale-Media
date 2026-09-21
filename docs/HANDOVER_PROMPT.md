# The prompt to paste into a fresh Claude Code session

Everything below the line is meant to be pasted as-is into a new
session, on any account, in this repo. It is the standing instruction
plus the exact state of play on 2026-09-21.

Nothing in it needs the old conversation. Everything that carries over
is in this repo and pushed to `main`.

---

DOORWERKEN — doel: live met echte klanten. Alles werkt voor iedereen,
elk cijfer klopt tot op de cent, en de advertiser- en affiliate-kant
zien eruit om trots op te zijn.

SWEEPEN PER REIS, NIET PER FOUTSOORT. "Zoek fouten van soort X in de
hele app" heeft geen eindpunt. "Alles wat mis is met reis A2" heeft dat
wél: het zijn de bestanden die die reis raakt en verder niets. Dus per
reis 4 agents tegelijk, elk met een andere bril, allemaal GESCOOPT op
die ene reis:

  agent 1  geld-rekenwerk: elk bedrag op die reis, scherm tegen server
           tegen database, inclusief afronding, valuta en fee
  agent 2  doodlopers: elke knop en elke staat op die reis
  agent 3  laden / leeg / fout: elk cijfer dat 0 toont terwijl de lees
           mislukte of nog niet liep
  agent 4  rechten: wie kan deze reis aanroepen die hem niet zou mogen
           lopen — server actions, RPC's, RLS

Geef die agents mee dat ze GEEN sub-agents mogen starten: een eerdere
ronde van vier stalde compleet omdat ze zelf gingen uitwaaieren.

Bevindingen worden GEFIXT, niet genoteerd. Daarna loop jij de reis zelf
en sluit hem af. Pas dan de volgende.

DE REIZEN, in deze volgorde. A1 t/m A7 zijn AF.

  ADVERTISER   A1 t/m A7 — AFGESLOTEN, niet opnieuw doen
  AFFILIATE
  F1  uitnodiging -> signup -> portaal met een werkende link
  F2  referral binnen -> commissie ontstaat -> klopt met de database
  F3  uitbetaling aanvragen -> admin ziet het -> afgehandeld
  F4  elke commissiesoort los: monthly + topups + eenmalig
  ADMIN
  D1  wachtrijen: verifiëren en afwijzen MET reden, klant krijgt bericht
  D2  klant beheren: aanmaken, plan, ad-account, deactiveren
  D3  aanvragen en opnames afhandelen
  SUPER-ADMIN
  S1  prijzen: plannen, tarieven, ad-account-types, koersen
  S2  affiliates, commissies, uitnodigingen, promoties
  S3  geld-overzicht: facturen, reconciliatie, audit

AFSLUITEN BETEKENT:
- Zelf gelopen in de browser op app.primescalemedia.com, met een
  ingelogde sessie voor ELKE rol die de reis nodig heeft. Niet uit de
  code afgeleid.
- Elk cijfer tegen de database gecontroleerd, tot op de cent. Kun je dat
  niet zelf, vraag de eigenaar één SQL.
- Elk scherm af: uitlijning, spacing, states, mobiel. Advertiser en
  affiliate mogen WOW zijn. Admin en super-admin: strak en snel.
- Afgesloten genoteerd in docs/NEXT_SESSION_FIRST.md.

TWEE BROWSERS, TWEE ROLLEN. Eén browser is één Supabase-sessie: als je
in hetzelfde venster als de eigenaar inlogt, ben je de klant kwijt.
Eigenaar in Chrome, klant in het ingebouwde browserpaneel.

PRODUCTIE: na elke fix gate — `npx tsc --noEmit && npx next lint
--max-warnings 0 && npm test`, met && geketend, NOOIT door tail of grep
pijpen want dat maskeert de exit code — dan
`git push origin feat/redesign-advertiser:main`, en daarna zelf op
app.primescalemedia.com kijken of het scherm er is en rendert MET DATA.
`curl -s https://app.primescalemedia.com/api/version` geeft de
uitgerolde korte SHA. Iets stuk op productie gaat vóór alles.

REGELS:
- Geen "waarschijnlijk". Lees de code of vraag één SQL.
- Zeg meteen wat je NIET hebt kunnen verifiëren.
- Een zelfverzekerde 0 boven een mislukte lees is een fout.
- Migraties kant-en-klaar met ÉÉN rapporttabel eronder en NAMED
  dollar-tags ($blk0$), want de editor toont alleen het laatste
  resultaat en kan een bestand met `$$` weigeren.
- Stop niet om te vragen of je door mag. Vraag alleen als het antwoord
  het werk verandert.

HET GETAL is reizen afgesloten van 16. Meer niet.

=== WAAR HET STAAT, 21-09-2026 ===

7 van 16 afgesloten: A1 t/m A7.

Lees EERST `docs/NEXT_SESSION_FIRST.md` en dan `CLAUDE.md`. Daarin staat
per reis wat gelopen is, wat gerepareerd is en wat nog open staat.

ER WACHT GEEN ENKELE SQL. Plak 2 t/m 31 zijn allemaal toegepast en hun
rapport is terug. De volgende plak schrijf je pas als een walk erom
vraagt.

TESTACCOUNTS (de eigenaar heeft de wachtwoorden; vraag ze één keer):
- eigenaar: het eigen account van de eigenaar, super-admin
- PSM0005 `xifape4500@jobscai.com` — adverteerder, EUR 45 / USD 56,98,
  1 ad-account AA-PSM0005-EU-01 (EUR), en AFFILIATE van PSM0007 op 10%
- PSM0006 `a1walk2609@robustq.com` — adverteerder, Prime EUR 200/mnd
- PSM0007 `f2walk2109@robustq.com` — adverteerder, EUR 100 in de wallet,
  ad-account AA-PSM0007-EU-01 (EUR, fee 3%), GEEN abonnement,
  doorverwezen door PSM0005

DE EERSTVOLGENDE STAP, exact:
F2 staat één handeling van zijn antwoord af. PSM0007 moet EUR 50 vanuit
zijn EUR-wallet op AA-PSM0007-EU-01 zetten. Verwacht: fee 3% = EUR 1,50,
er landt EUR 48,50, en de trigger op `top_ups` boekt 10% van wat landde
= EUR 4,85 commissie voor PSM0005, in EUR, status unpaid. Controleer dat
bedrag op /commissions, op /affiliates (earnings EUR) en in de database.
Klopt het niet tot op de cent, dan is dat de eerste fout die je oplost.

WAT DE EIGENAAR NOG MOET BESLISSEN (dit verandert het werk):
1. Wat betekent "een affiliate goedkeuren"? Een link heeft een
   doorverwezen klant nodig, dus een aanvrager zonder referrals kan er
   geen hebben. Vandaag ontstaat een link alleen als bijproduct van een
   invite met een referrer erop — de aanvraagknop en de melding die
   "approve or refuse it" zegt wijzen naar iets wat niet bestaat.
2. Is een uitbetaling een RECORD of een e-mail? Nu is het een mailto
   zonder spoor, met een groene melding die altijd verschijnt, en er is
   geen payouts-tabel.
3. Waar moet een clawback evenredig aan zijn? De live functie
   vermenigvuldigt een EUR-commissiepot met een USD-verhouding en kan
   tot 100% terugpakken waar het antwoord 4,6% is. Er staan 0
   commissies, dus er is niets kapot — maar dit moet beslist zijn vóór
   de eerste affiliate iets verdient.

WAT DE EIGENAAR HEEFT GEVRAAGD EN NOG GEBOUWD MOET WORDEN:
- GH-ROUTERING. Iedereen betaalt naar TURLIT. Behalve een adverteerder
  die als GH is aangevinkt: die gaat naar ZANEL, BEHALVE voor
  subscriptions. Dat is een vlag op de ADVERTEERDER, terwijl de code nu
  op ad-accounttype routeert. Vraagt een kolom, een vinkje op het
  klantscherm, en de routering eraan hangen.
- AFFILIATE UITSCHAKELBAAR per gebruiker of community: geen menu-item,
  geen Get started-stap, geen kaart in instellingen. Vraagt een kolom
  (lees hem SOFT — een ontbrekende kolom mag het scherm niet breken) en
  een schakelaar voor de admin.
- DE AFFILIATE-LIJST GROEPEREN. /affiliates is één rij per LINK, dus een
  affiliate met twintig referrals staat er twintig keer in en je ziet
  nergens zijn totaal, zijn aantal of wat er openstaat. Groeperen per
  affiliate met een kopregel die telt.
- SUPPLIER FEE op de accountlijst (admin-only, nooit op een klantscherm).
- DST als wekelijkse doorbelasting van een leverancierskost.

VALKUILEN DIE DEZE SESSIE GELD HEBBEN GEKOST:
- `top_ups.topup_amount` heeft TWEE betekenissen: op de klantroute het
  netto in de BETAALvaluta, op de adminroutes dollars. `topup_usd` is de
  discriminator en `lib/pure-topup-landed.ts` is de enige plek die dat
  weet. Deze aanname ("het is altijd USD") is in deze app al VIER keer
  fout gebleken: in een databasetrigger, op de details-sheet, in het
  opnameplafond en op de accountlijst. Vertrouw hem nooit.
- Live en repo lopen uiteen. Veel RPC's zijn met de hand op live
  geschreven en staan in geen enkele migratie. Lees de body met
  `pg_get_functiondef` voordat je erover redeneert, en vervang een live
  body NOOIT door de repo-versie.
- Een trigger zonder SECURITY DEFINER draait als de beller. Als je een
  tabelrecht intrekt, controleer welke triggers erop schrijven.
- Formulieren bouwen hun payload met de HAND op. Een nieuw veld aan een
  formulier toevoegen doet niets als je het niet ook in die lijst zet:
  de dropdown beweegt, de melding zegt "updated successfully" en de
  kolom verandert niet.
- Een mislukte zod-validatie in een scrollbare dialoog ziet eruit als
  een dode knop. Geef `handleSubmit` altijd zijn tweede argument.
