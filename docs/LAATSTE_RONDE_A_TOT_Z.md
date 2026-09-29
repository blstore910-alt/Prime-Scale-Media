# DE LAATSTE RONDE — A tot Z, elk accounttype, elk scherm

## DE PROMPT — plak deze elke keer opnieuw

```
LAATSTE RONDE. Lees docs/LAATSTE_RONDE_A_TOT_Z.md en ga verder bij het
EERSTE blok dat in het logboek onderaan nog geen "gelopen" heeft. Zeg in
een zin waar je begint, en begin dan.

DOORWERKEN TOT HET BLOK DICHT IS. Niet rapporteren tussendoor. Een blok
is pas af als zijn regel in het logboek is ingevuld en gecommit. Alles
daarvoor -- agents, fixen, gate, push, kijken, nog een fix -- is een
en dezelfde beurt.

WAT GEEN REDEN IS OM TE STOPPEN:
- een fixronde is klaar          -> pak de volgende bevinding
- je hebt iets gepusht           -> ga door terwijl de deploy loopt
- een agent is binnen            -> lees hem en fix, meld het niet apart
- een scherm heeft mijn ogen     -> zet het klaar, zeg het in EEN regel
                                    aan het eind, en doe intussen de rest
- je wacht op een login van mij  -> start de agents van het VOLGENDE blok
                                    en doe daar het codewerk alvast
- je twijfelt over een detail    -> kies, en schrijf op waarom je koos
- een plak moet nog gedraaid     -> lever hem ALS BESTAND en ga door
                                    met de code. Een plak die niet is
                                    aangehecht bestaat niet: 132 en 133
                                    zijn op 28-09 nooit gedraaid omdat
                                    ze alleen in een verslag stonden

WAT WEL EEN REDEN IS OM TE STOPPEN:
- een wachtwoord, een Join of een in/uitlog  -> alleen ik kan dat
- geld dat echt weggaat, of iets verwijderen -> vraag het
- beleid dat van mij is (marge, ondergrens, wie wat mag) -> vraag het
- iets op productie is stuk                  -> meld direct, dat gaat voor

TWEE VENSTERS, NOOIT DRIE. Paneel = klantkant. Mijn Chrome = beheerkant.
Ik zie ze allebei; wat ik niet zie gebeurt niet. Ik typ elk wachtwoord,
elke Join en elke in- en uitlog. Jij doet al het andere.

PER BLOK EERST VIER AGENTS, gescoopt op de bestanden van DAT blok:
geld-rekenwerk / doodlopers / laden-leeg-fout / rechten. Bevindingen
worden GEFIXT, niet genoteerd. Start ze en wacht niet -- begin
ondertussen aan wat je al weet.

DAN LOPEN WE HET SAMEN, per scherm:
  1. jij opent hem in het paneel op 390px - ik kijk naar het ontwerp
  2. jij houdt elk cijfer tegen de database met npm run check
  3. ik zeg wat anders moet - jij fixt het
  4. gate: npx tsc --noEmit && npx next lint --max-warnings 0 && npm test
     geketend met &&, NOOIT door tail of grep
  5. git push origin feat/redesign-advertiser:main -- per BLOK gebundeld,
     niet per fix; alleen iets kapots gaat meteen
  6. desktop, zelfde scherm
  7. volgende

BLOK 13 EN 14 ZIJN BOUWBLOKKEN, geen loopblokken.

ELKE KNOP indrukken, ook van de takken die we niet kiezen.
Geen "waarschijnlijk" - lees de code of vraag mij een SQL.
Zeg METEEN wat je niet hebt kunnen verifiëren, en waarom.
Een zelfverzekerde 0 boven een mislukte lees is een fout.

KIJK PER BLOK OOK IN "TESTS DIE NOG MOETEN" onderaan het document. Daar
staat wat er gebouwd is maar nog nooit door een mens is gezien. Hoort er
iets bij dit blok, dan loop je dat mee en vinkt het af.

AAN HET EIND VAN HET BLOK, en pas dan: vul het logboek in, commit het,
en meld in vier regels -- gelopen / gefixt / open / wat je van mij nodig
hebt. Begin daarna meteen aan het volgende blok.
```

## Waarom deze ronde anders is dan de zeventien reizen

De zeventien reizen zijn gesloten, maar allemaal op **bestaande**
accounts met geschiedenis — PSM0005 had al wallets, facturen en
commissies voordat we begonnen. Dat bewijst dat de app werkt voor een
account dat er al is. Het bewijst niet dat hij werkt voor een klant die
er vanaf vandaag bij komt.

Deze ronde maakt daarom **alles nieuw** en hangt het aan één keten: het
geld dat de nieuwe adverteerder stort, wordt de commissie van de nieuwe
affiliate, wordt de uitbetaling die de nieuwe admin afhandelt. Elk
cijfer komt uit het stapje ervoor. Klopt er één niet, dan weten we
precies waar.

En er is één rol die nog **nooit** is aangeraakt:

| tenant | admins | eigenaar? |
|---|---|---|
| Prime Scale Media | Bart | ja — is de eigenaar |
| PSM E2E Test | E2E Super Admin, E2E Admin | testtenant, niet de echte |

Op de echte tenant bestaat dus **geen enkele medewerker-admin**. Alles
wat een admin wél mag en een eigenaar niet, of andersom, is nog nooit
met een echte sessie gelopen. Dat is blok 3 en het is het grootste gat
in deze app.

---

## De twee vensters — nooit drie

| venster | wie zit erin | wie ziet het |
|---|---|---|
| **1 — het paneel** naast dit gesprek | altijd de **klantkant**: adverteerder, affiliate, of allebei in één | jij en ik |
| **2 — jouw eigen Chrome** | altijd de **beheerkant**: eigenaar of admin | jij en ik |

Eén browser is één Supabase-sessie, dus meer dan twee rollen tegelijk
kan niet. Er komt geen derde venster bij — alles wat jij niet kunt zien,
gebeurt niet.

## Wie typt wat

- **Jij**: elk wachtwoord, elke knop "Join", elke in- en uitlog.
- **Ik**: al het andere. Klikken, invullen, lezen, SQL draaien, fixen,
  gate, pushen, en daarna op productie kijken of het er staat.
- Ik vraag nooit om een wachtwoord en typ er nooit een. Waar er één
  nodig is, staat hieronder **[JIJ]**.

## De lus per scherm

1. Ik open hem in venster 1 op **390px** — jij kijkt naar het ontwerp.
2. Ik houd **elk cijfer** tegen de database met `npm run check`.
3. Jij zegt wat anders moet → ik fix het, gate met `&&`, push naar main,
   en we kijken opnieuw op productie.
4. Ik klap naar **desktop**, zelfde scherm, zelfde blik.
5. Volgende.

Twee breedtes per scherm en niet twee ronden: andere breedtes geven echt
andere fouten. De fout op het Requests-tabblad van 25-09 bestond alleen
op telefoonbreedte — de tabel vouwde proza in een rechts uitgelijnde
waardekolom, en op desktop was er niets te zien.

## De agentveegjes

Voor **elk blok** vier agents tegelijk, allemaal gescoopt op de
bestanden van dát blok en niets anders:

| agent | bril |
|---|---|
| 1 | **geld-rekenwerk** — elk bedrag, scherm tegen server tegen database, inclusief afronding, valuta en fee |
| 2 | **doodlopers** — elke knop en elke staat: waar kan iemand niet verder, wat doet een knop die niets doet |
| 3 | **laden / leeg / fout** — elk cijfer dat 0 toont terwijl de lees mislukte of nog niet liep |
| 4 | **rechten** — wie kan dit aanroepen die het niet zou mogen: server actions, RPC's, RLS |

Bevindingen worden **gefixt**, niet genoteerd. Pas daarna lopen we het
blok zelf.

---

## De keten, en waarom de volgorde vastligt

De affiliate moet **bestaan vóór** de adverteerder zich aanmeldt, anders
is er geen link om doorheen te komen en ontstaat er nooit een commissie.
En de admin moet bestaan vóór de eerste wachtrij, anders handelt de
eigenaar hem af en blijft de admin ongetest.

```
  super-admin zet de prijzen
        ↓
  affiliate wordt aangemaakt        → krijgt een link
        ↓
  admin wordt aangemaakt            → mag de wachtrijen doen
        ↓
  adverteerder meldt zich aan DOOR DIE LINK
        ↓
  wallet top-up        → admin verifieert   → commissie ontstaat
        ↓
  ad-account aanvraag  → admin keurt goed   → EUR 50 van de wallet
        ↓
  ad-account funden    → admin verifieert   → commissie op de fee
        ↓
  maandfactuur         → Pay now            → commissie op het abonnement
        ↓
  geld terug van het ad-account → admin keurt goed → clawback
        ↓
  affiliate vraagt uit → admin ziet het     → afgehandeld
```

Elk bedrag rechts komt uit de stap erboven. Dat is de hele controle.

## De accounts die we maken

| # | rol | hoe | wachtwoord |
|---|---|---|---|
| A | **affiliate** (kaal) | uitnodiging als eigenaar, rol Affiliate | **[JIJ]** |
| B | **admin** (medewerker) | /admins → Create Admin | **[JIJ]** |
| C | **adverteerder** | aanmelden via de link van A, niet via een uitnodiging | **[JIJ]** |
| D | **adverteerder-als-affiliate** | C vraagt het affiliateprogramma aan, eigenaar keurt goed | geen — C is al ingelogd |

Vier nieuwe identiteiten, drie wachtwoorden. De vijfde rol,
**super-admin**, is jouw bestaande account.

E-mailadressen: gebruik wegwerpadressen in dezelfde vorm als eerder
(`robustq.com`, `jobscai.com`). Ik stel ze per blok voor.

---

# BLOK 0 — schoon beginnen

**Venster 2: eigenaar. Venster 1: leeg.**

- [x] `git status` schoon, laatste commit staat live — **550d1be**, en
      `/api/version` geeft `550d1be997de`. Dezelfde.
- [x] De ondergrens van PSM0005 staat nog op **EUR 15** van de F3-loop.
      **Blijft staan** — besluit van de eigenaar 26-09: alle testaccounts
      gaan er straks toch af (blok 15), dus die waarde verdwijnt met het
      account mee. Wel hier genoteerd zodat niemand hem later voor een
      echte instelling aanziet.
- [x] Vastleggen wat er nú staat, zodat elk verschil daarna van ons is:

```sql
select (select count(*) from advertisers)            as adverteerders,
       (select count(*) from user_profiles where role='admin') as admins,
       (select count(*) from referral_links)          as links,
       (select count(*) from referral_commissions)    as commissies,
       (select count(*) from invoices)                as facturen,
       (select count(*) from wallet_topups)           as wallet_topups,
       (select count(*) from top_ups)                 as account_topups;
```

### HET NULPUNT — 26-09-2026, vóór de eerste handeling

| | aantal |
|---|---|
| adverteerders (beide tenants) | **16** |
| admins | **3** (Bart = eigenaar; twee op de E2E-tenant) |
| referral_links | **3** |
| referral_commissions | **5** |
| facturen | **30** |
| wallet_topups | **19** |
| ad-account-topups | **8** |
| affiliate_payouts | **2** |
| audit_events | **3.548** |

Elk getal dat hierna hoger staat, moet te herleiden zijn tot een stap in
dit document. Kan dat niet, dan is dat op zichzelf een bevinding.

**BLOK 0 GELOPEN 26-09.** Het nulpunt staat vast, de werkkopie is
schoon, en wat live draait is wat er in git staat. De EUR 15 van PSM0005
blijft staan met de reden erbij.

---

# BLOK 1 — SUPER-ADMIN: de instellingen waar al het andere op leunt

**Venster 2: eigenaar. Venster 1: leeg.**

Dit eerst, want elk bedrag hierna wordt uit deze instellingen gerekend.
Een fee die hier fout staat, komt in blok 5 tot en met 9 terug als een
cijfer dat "klopt" met iets wat verkeerd is.

**Agentveeg** gescoopt op: `app/(app)/settings/**`,
`components/settings/**`, `actions/plan-actions.ts`,
`actions/exchange-rate-actions.ts`, `actions/ad-account-type-actions.ts`.

**Schermen, elk op 390 en desktop:**

- [ ] `/settings/general` — elk veld, opslaan, opnieuw laden
- [ ] `/settings/plans` — elk plan open, **elke** knop: nieuw, wijzigen,
      archiveren. Wat gebeurt er met een klant die op een gewijzigd plan
      zit?
- [ ] `/settings/ad-account-types` — elk type, de fee per type, actief/inactief
- [ ] `/settings/finance` — de koersen. **Apply Latest Rates** indrukken
      en kijken wat er verandert, en wat er in `exchange_rates` bij komt
- [ ] `/settings/banks` — elke bank, elke valuta, elk rekeningnummer
- [ ] `/settings/integrations` — wat aan staat en wat uit

**SQL:**

```sql
select name, monthly_fee, included_ad_accounts, topup_fee_pct, currency, is_active
  from plans order by monthly_fee desc;
select eur, gbp, hkd, is_active, created_at from exchange_rates
 where tenant_id = (select id from tenants where slug='prime-scale-media');
select slug, label, default_fee_pct, is_active from ad_account_types order by sort_order;
```

**Klaar als:** elk getal op het scherm staat ook zo in de database, en
elke knop is ingedrukt geweest.

### De agentveeg op blok 1 — 26/27-09

Vier agents, rond de dertig bevindingen. Dat is veel voor het KLEINSTE
blok van de vijftien: zes schermen, geen geldbewegingen, alleen
instellingen. Alles hieronder is gefixt en staat live.

**De vier die geld of toegang kostten:**

| wat | waarom het erg was |
|---|---|
| een prijswijziging werd genegeerd door elke uitnodiging | `monthlyIn` leest `monthly_fee_eur` eerst en het scherm schreef alleen `monthly_fee`. Prime van 200 naar 210 zetten en elke nieuwe klant blijft op EUR 200. Voor altijd, en net zo bij een verlaging |
| elke klant kon zichzelf een adminprofiel geven | `tenants_owner_insert` op rol public, plus een SECURITY DEFINER trigger die `role='admin'` uitdeelt. Niet naar onze data, wel de adminschil in -- waar leverancierskosten en marge staan. **Plak 100, gedraaid: niemand is erdoor gelopen** |
| de EUR 50 aanvraagkosten verzonnen een koers van 0,86 | USD 58 waar USD 57 hoort, op een koers die 1,4% mis is. Elk ander geldpad weigert in die toestand. **Plak 101** |
| het bedrijf van de organisatie was door niemand op te slaan | `companies` heeft geen admin-schrijfregel; de UPDATE raakt nul rijen zonder fout. De eigenaar leest "Failed to update profile" terwijl de naamhelft er al in staat. Dat is de rij op elke factuur. **Plak 102** |

**En verder gefixt:** het zelfslot op ad-account-types (tweede keer
opslaan werd geweigerd door niemand), drie caches zonder tenant in de
sleutel, `count ?? 0` dat een mislukte lees van de push-wachtrij
verzweeg, fee-percentages die drie decimalen aannamen op een kolom van
twee (EUR 513 waar 512,50 was ingesteld), twee lege lijsten zonder lege
staat, geen bevestiging bij het uitzetten van het laatste plan of het
laatste accounttype, twee zaaifuncties die elke admin een prijstabel
lieten vullen met de service key, `/settings/general` zonder
versiestempel, en de RockAds-tegels die 0 toonden boven een mislukte
leverancierscall.

**Nog te lopen.** De zes schermen zelf zijn nog niet door de eigenaar
bekeken -- de sessie was verlopen. Dat is wat blok 1 nog open houdt.


---

# BLOK 2 — DE KALE AFFILIATE

**Venster 2: eigenaar. Venster 1: de nieuwe affiliate.**

Voorstel adres: `aff-final-2609@robustq.com`

**Agentveeg** gescoopt op: `components/affiliate/aff-app.tsx`,
`components/affiliate/aff-shell-css.ts`,
`components/invites/invite-form.tsx`, `app/invite/accept/**`,
`components/invite-sign-up-form.tsx`.

**Stappen:**

- [ ] Eigenaar → `/invites` → New Invite. **Beide takken** van het
      rolkeuzeveld openklappen en vergelijken vóór we kiezen
- [ ] Rol Affiliate, aanmaken, link kopiëren
- [ ] **[JIJ]** de link openen in venster 1, wachtwoord zetten, Join
- [ ] De link van deze affiliate noteren — die heeft blok 4 nodig

**Schermen (elk op 390 en desktop), dit is de LEGE staat en die is net
zo belangrijk als de volle:**

- [ ] Home — "Welcome back", de tierladder, alle nullen
- [ ] Referrals — de link, kopiëren, WhatsApp, "No referrals yet"
- [ ] Wallet / Getting paid — de knop moet **dicht** staan en zeggen
      waarom
- [ ] Alerts — leeg
- [ ] Settings — profiel, uitbetaalgegevens, meldingen (de groepen),
      "Sign out everywhere", verwijderverzoek

**SQL:**

```sql
select a.tenant_client_code, up.full_name, up.role, up.is_active
  from advertisers a join user_profiles up on up.user_id = a.user_id
 where up.email = 'aff-final-2609@robustq.com';
-- alle drie moeten 0 zijn en dat moet het scherm ook zeggen
select (select count(*) from referral_links rl where rl.affiliate_advertiser_id = a.id) as links,
       (select count(*) from affiliate_payouts p where p.affiliate_advertiser_id = a.id) as payouts
  from advertisers a where a.tenant_client_code = '<nieuwe code>';
```

**Klaar als:** elke nul op het scherm is een echte nul in de database —
geen enkele is een mislukte lees.

## Wat het scherm MOET zeggen — vooraf uitgerekend 27-09

De code van blok 2 is klaar en staat live (`73484ea`). Deze cijfers zijn
al tegen de database gehouden, dus de loop is een CONTROLE en geen
zoektocht. Wijkt er een af, dan is dat meteen een bevinding.

**De verse affiliate** (`aff-final-2609@robustq.com`, nog aan te maken)
heeft geen klantrij zolang de uitnodiging niet is afgerond, en dan hoort
elk scherm te zeggen dat het account nog niet af is — niet nullen te
tonen. Op Home, op Mijn referrals (die melding is er net bij gekomen) en
op Wallet. De tierspeld hoort `Tier — / 4` te zeggen en **niet**
"Checking…", want er is geen lees onderweg.

**De bestaande affiliate** (`xewama9321@robustq.com`) is de echte test van
de geldtegels, want een verse staat op nul en nul verbergt een fout:

| tegel | moet zeggen | waarom |
|---|---|---|
| Verdiend (levenslang) | **EUR 20,92** | 5 commissies = EUR 24,96, min EUR 4,04 teruggedraaid |
| Wacht op uitbetaling | **EUR 0,00** | alles zit in een uitbetaling én beide terugdraaiingen hangen eraan |
| Uitbetaald | **EUR 20,92** | payout 1 EUR 4,96 + payout 2 EUR 15,96, beide `paid` |
| Elke commissie (de lijst) | **EUR 24,96** over 5 regels | de lijst is de som van de RIJEN, vóór terugdraaiingen |
| de verzoenregel eronder | EUR 4,04, en dat een uitbetaling nu EUR 0,00 zou zijn | 24,96 − 20,92 |

En 20,92 = 20,92 + 0,00: dat is de hele optelsom en die klopt tot de cent.

Twee dingen in die lijst om specifiek naar te kijken, want daar zat de
fout:

- de **welkomstbonus** (EUR 10,00) mag GEEN "on EUR 10,00" meer dragen.
  Hij hangt aan een factuur van EUR 10,00, maar hij is er niet op
  gerekend — hij is een vast bedrag.
- de commissie van **EUR 0,11** hoort "from a EUR 48,50 top-up" te zeggen
  en niet "on EUR 48,50". Zijn echte grondslag is EUR 0,53 en die mag
  niet op het scherm: daar staat onze marge in.

**De uitbetaalknop** hoort dicht te staan bij deze affiliate (EUR 0,00
openstaand) en te zeggen waarom. Met EUR 199 + $1,50 zou hij OPEN moeten
staan — dat is de som die eerst verkeerd werd gerekend
(`lib/pure-payout-reach.ts`, 19 tests).

---

# BLOK 3 — DE MEDEWERKER-ADMIN — het grootste gat

**Venster 2: eigenaar → daarna de nieuwe admin. Venster 1: leeg.**

Er is nog nooit een niet-eigenaar admin op deze tenant geweest. Dit blok
is daarom niet alleen "werkt het scherm", maar **waar ligt de grens**.

Voorstel adres: `admin-final-2609@robustq.com`

**Agentveeg** gescoopt op: `actions/_shared.ts` (`resolveAdminContext`
tegen `resolveOwnerContext`), `actions/admin-actions.ts`,
`components/admins/**`, plus élke server action die
`resolveOwnerContext` gebruikt.

**Stappen:**

- [ ] Eigenaar → `/admins` → Create Admin, elk veld
- [ ] **[JIJ]** wachtwoord zetten en inloggen in venster 2 als deze admin
      (de eigenaar gaat er even uit)

**Wat een admin WEL moet kunnen — elk scherm op 390 en desktop:**

- [ ] `/users` en een klant openen
- [ ] `/wallet-topups` — een storting verifiëren
- [ ] `/top-ups` — een ad-account-topup verifiëren
- [ ] `/ad-account-requests` — goedkeuren en afwijzen met reden
- [ ] `/withdrawals` — goedkeuren
- [ ] `/invoices` — bekijken, downloaden
- [ ] `/activity-logs`

**Wat een admin NIET mag — en het scherm moet het zeggen, niet stilletjes
falen:**

- [ ] `/settings/plans` — prijzen wijzigen
- [ ] `/settings/finance` — koersen wijzigen
- [ ] `/affiliates` → commissieregels wijzigen
- [ ] `/affiliates` → de uitbetalingsgrens vrijgeven (`resolveOwnerContext`)
- [ ] `/admins` — een andere admin aanmaken of uitzetten
- [ ] `/audit` en `/reconciliation`

Voor elk van die zes: **wat ziet de admin?** Een knop die er niet is, een
knop die uit staat met uitleg, of een knop die wél werkt terwijl dat niet
zou moeten? Het derde is een bevinding die meteen gefixt wordt.

**SQL:**

```sql
select up.full_name, up.role, up.is_active,
       case when t.owner_id = up.user_id then 'EIGENAAR' else 'medewerker' end as soort
  from user_profiles up left join tenants t on t.id = up.tenant_id
 where up.role = 'admin' and up.tenant_id = (select id from tenants where slug='prime-scale-media');
```

**Klaar als:** elke van de zes verboden dingen is geprobeerd als admin,
en elke weigering is een uitleg op het scherm — geen stille mislukking en
geen doorgelaten schrijf.

---

# BLOK 4 — DE NIEUWE ADVERTEERDER, VIA DE LINK VAN DE AFFILIATE

**Venster 2: eigenaar terug. Venster 1: de nieuwe adverteerder.**

Niet via een uitnodiging — via de **referral-link uit blok 2**. Dat is de
enige manier om de attributie echt te bewijzen.

Voorstel adres: `adv-final-2609@robustq.com`

**Agentveeg** gescoopt op: `app/auth/sign-up/**`, `app/auth/confirm/route.ts`,
`components/sign-up-form.tsx`, `components/company/company-onboarding-form.tsx`,
`components/advertiser/adv-app.tsx` (Home).

**Stappen:**

- [ ] De link van blok 2 openen in venster 1
- [ ] **[JIJ]** wachtwoord, Join
- [ ] Onboarding: bedrijfsgegevens, **elk** veld, ook `is_not_vat`
- [ ] Home

**Schermen (390 + desktop):** Home in de lege staat, Wallet leeg,
Accounts leeg, Billing leeg, Settings.

**SQL — dit is de attributiecontrole:**

```sql
select a.tenant_client_code as nieuwe_klant,
       aff.tenant_client_code as via_affiliate,
       rl.status, rl.created_at
  from advertisers a
  join referral_links rl on rl.referred_advertiser_id = a.id
  join advertisers aff on aff.id = rl.affiliate_advertiser_id
 where a.tenant_client_code = '<nieuwe code>';
```

**Klaar als:** de link bestaat, wijst naar de affiliate uit blok 2, en de
affiliate ziet de nieuwe klant in zijn portaal staan.

---

## Wat het moet doen — vooraf uitgerekend 27-09

De link van blok 2, nagelopen op de database:

```
https://app.primescalemedia.com/auth/sign-up?t=prime-scale-media&ref=PSM0015
```

`findReferrer` lost PSM0015 op naar **Blok2 Affiliate** — `affiliate_status`
approved, rol affiliate, profiel actief. Alle drie de tests in die functie
komen dus door, en de verwijzing hoort te landen.

Startpunt vóór de aanmelding:

| | |
|---|---|
| `tenants.last_client_code` | **15** — de nieuwe wordt dus PSM0016 |
| verwijzingen van PSM0015 | **0** |
| adverteerders in totaal | 17 |

Na de Join hoort dit te staan, en anders is het een bevinding:

| wat | moet zijn |
|---|---|
| `advertisers.tenant_client_code` | **PSM0016** |
| `referral_links` van PSM0015 | **1**, status **`pending`** — een zelfaanmelding wordt niet automatisch goedgekeurd |
| `referral_links.affiliate_advertiser_id` | `2a95c52a-ec0d-42a1-b15a-e3fb71bf7db9` |
| `user_profiles.referral_status` | `referred` |
| `user_profiles.referred_by` | `Blok2 Affiliate` |
| wallets voor de nieuwe klant | **1** |
| `last_client_code` | **16** |

En op het scherm van de affiliate hoort die verwijzing dan te verschijnen
als **wachtend op goedkeuring** — nul verdiend, want de eigenaar moet hem
eerst goedkeuren. Dat is meteen de brug naar blok 11.

**Let op bij het lopen:** het paneel moet eerst uit de sessie van Admin 1,
anders stuurt `/auth/sign-up` door naar het dashboard (dat is gedrag, geen
fout — ik heb het in blok 3 zo gezien).

---

# BLOK 5 — WALLET OPWAARDEREN (het basisste dat er is)

**Venster 1: de nieuwe adverteerder. Venster 2: de ADMIN uit blok 3.**

**Agentveeg** gescoopt op: `components/wallet/wallet-topup-dialog.tsx`,
`actions/wallet-topup-actions.ts`, `components/wallet-topups/**`,
`lib/pure-bank-routing.ts`, `lib/payment-reference.ts`.

**Elke tak van de dialoog, vóór we er één echt doen:**

- [ ] 4 overboekingsvaluta × 2 portemonnees = **8 combinaties**. Per
      combinatie: het minimum, de bankgegevens, de referentie
- [ ] Onder het minimum → wat zegt hij
- [ ] Zonder slip → wat zegt hij

**Dan één echt:**

- [ ] EUR 500 naar de EUR-portemonnee, met referentie en slip
- [ ] Admin ziet hem in `/wallet-topups`, **met de slip**
- [ ] Admin verifieert → saldo klopt op beide schermen

**SQL:**

```sql
select wt.amount, wt.currency, wt.status, wt.reference, wt.slip_url is not null as slip,
       w.eur_balance, w.usd_balance
  from wallet_topups wt
  join advertisers a on a.id = wt.advertiser_id
  join wallets w on w.advertiser_id = a.id
 where a.tenant_client_code = '<nieuwe code>' order by wt.created_at desc limit 3;
```

**Klaar als:** het saldo op het klantscherm, op `/wallets` en in
`wallets` is tot op de cent hetzelfde, en de eerste commissie voor de
affiliate staat er (als het plan een top-up-commissie kent).

---

# BLOK 6 — AD-ACCOUNT AANVRAGEN EN FUNDEN

**Venster 1: adverteerder. Venster 2: admin.**

**Agentveeg** gescoopt op: `components/account/ad-account-request-form.tsx`,
`actions/ad-account-actions.ts`, `components/topups/account-topup-form.tsx`,
`actions/topup-actions.ts`, `lib/pure-request-status.ts`.

- [ ] Aanvraagformulier: **elk** platform, elke valuta, elke tijdzone.
      Het inbegrepen account (gratis) én het betaalde (EUR 50)
- [ ] Wallet-effect vóór verzenden zichtbaar
- [ ] Admin: goedkeuren. En een tweede aanvraag: **afwijzen met reden** →
      EUR 50 terug
- [ ] Funden: bedrag, fee, netto. Admin verifieert. "Funded to date"

**SQL:**

```sql
select r.platform, r.currency, r.status, r.charged_amount, r.refunded_amount, r.rejection_reason
  from ad_account_requests r join advertisers a on a.id = r.advertiser_id
 where a.tenant_client_code = '<nieuwe code>' order by r.created_at desc;

select t.number, t.amount_received, t.fee, t.fee_amount, t.topup_amount, t.eur_topup, t.status
  from top_ups t join advertisers a on a.id = t.advertiser_id
 where a.tenant_client_code = '<nieuwe code>' order by t.created_at desc;
```

**Klaar als:** `amount_received − fee_amount = topup_amount` tot op de
cent, op het scherm en in de database, en de EUR 50 is zichtbaar
afgeboekt én teruggeboekt op het afschrift **en** in het Financial
report.

### Stand 28-09, vóór de wandeling

- **De server weigert PSM0016 nog.** `ad_account_request_create_paid`
  eist een actief abonnement, en een gratis plan krijgt er met opzet
  geen. Gemeten: `plak117_applied = false`. **Plak 117 moet eerst
  gedraaid.** Zonder dat komt er geen aanvraag doorheen en is er niets
  te lopen.
- **De rekensom klopt op elke rij die vandaag bestaat.** Acht
  ad-account-fundingen op de live database, en op alle acht is
  `amount_received − fee_amount = topup_amount` tot op de cent, met
  geen enkele rij die een fee-percentage heeft zonder fee-bedrag. Wel:
  alle acht zijn EUR→EUR, dus de kruisvalutafout die ik vandaag in
  `eur_topup` heb rechtgezet is nog nooit door een echte rij gelopen.
- **PSM0016 staat klaar**: NSA-plan, EUR 0 per maand, 2 inbegrepen
  accounts, 5% top-upfee, EUR 500 in de wallet, 0 accounts, 0
  aanvragen, 0 abonnementen. Dus de eerste twee aanvragen horen GRATIS
  te zijn en de derde EUR 50 te kosten — allebei moeten gelopen.

---

# BLOK 7 — FACTUUR EN PAY NOW

**Venster 1: adverteerder. Venster 2: admin.**

**Agentveeg:** `components/invoices/**`, `actions/invoice-actions.ts`,
`app/api/invoices/[invoiceId]/pdf/route.ts`, `lib/pure-invoice-*.ts`.

- [ ] De abonnementsfactuur die bij de aanmelding ontstond
- [ ] PDF downloaden: staat de bedrijfsnaam en het btw-nummer erop?
- [ ] Pay now uit de wallet → saldo en status
- [ ] De commissie op het abonnement voor de affiliate

**Klaar als:** de PDF draagt het bedrijf uit blok 4, het saldo klopt, en
de affiliate ziet de abonnementscommissie.

### PAS OP — dit blok kan NIET met PSM0016 zoals hij nu staat

Gemeten 28-09: PSM0016 heeft precies één factuur, en dat is de
`wallet_topup`-factuur van de EUR 500 uit blok 5 (nummer 140, betaald).
Een **abonnementsfactuur is er niet en komt er ook niet**, want het
NSA-plan is EUR 0 en een plan van nul maakt met opzet geen abonnement.
Dat is geen fout — het is precies de regel die de eigenaar op 28-09
gaf. Maar het betekent dat er niets te betalen valt.

Twee wegen, en de tweede is goedkoper:

1. **PSM0011** (`micos96108@pumpoly.com`) heeft EUR 260 in de wallet en
   één onbetaalde abonnementsfactuur van EUR 150. 260 − 150 = 110: een
   complete Pay-now-wandeling, mits de eigenaar dat wachtwoord heeft.
2. **PSM0016 een betaald plan geven ná blok 6.** Blok 6 heeft het
   nul-euro-plan juist nodig; blok 7 heeft het tegen. Dezelfde login,
   geen nieuw account, en het abonnement dat dan ontstaat maakt de
   maandfactuur die dit blok vraagt.

De andere onbetaalde abonnementsfacturen (PSM0006, PSM0012, PSM0013 —
EUR 200 elk) staan tegenover een wallet van EUR 0, dus daar kan Pay now
alleen de weigering laten zien, niet de betaling.

---

# BLOK 8 — GELD TERUG VAN EEN AD-ACCOUNT

**Venster 1: adverteerder. Venster 2: admin.**

- [ ] Opnameverzoek, elke tak van de dialoog
- [ ] Admin: eerst **afwijzen met reden** (er mag niets bewegen), dan
      goedkeuren
- [ ] Wallet omhoog, plafond klopt
- [ ] De **clawback** bij de affiliate

**SQL:**

```sql
select w.amount, w.currency, w.status, w.reason from ad_account_withdrawals w
  join advertisers a on a.id = w.advertiser_id
 where a.tenant_client_code = '<nieuwe code>' order by w.created_at desc;
select c.amount, c.returned_amount, c.topup_volume, c.share, c.reason
  from referral_clawbacks c order by c.created_at desc limit 3;
```

---

# BLOK 9 — DE AFFILIATE WORDT BETAALD

**Venster 1: de affiliate uit blok 2. Venster 2: admin, daarna eigenaar.**

- [ ] Het portaal: elke commissie uit blok 5 t/m 8 staat er, met de juiste
      grondslag
- [ ] De knop staat dicht als het bedrag onder de grens ligt, en zegt
      hoeveel er nog bij moet
- [ ] **Eigenaar** geeft de grens vrij voor deze affiliate
- [ ] Aanvragen: **beide** takken (EUR en omrekenen naar USD)
- [ ] Admin ziet hem. Eerst **terugsturen met reden**, dan afhandelen
- [ ] Factuur van de uitbetaling: tellen de regels op tot het totaal?

**Klaar als:** bruto min clawback = netto, op het scherm, in
`affiliate_payouts` en op de factuur — drie keer hetzelfde getal.

---

# BLOK 10 — DE ADVERTEERDER-ALS-AFFILIATE

**Venster 1: de adverteerder uit blok 4. Venster 2: eigenaar.**

- [ ] De adverteerder vraagt het affiliateprogramma aan
- [ ] Eigenaar: eerst **weigeren** (wat ziet de klant?), dan goedkeuren
- [ ] De adverteerder heeft nu beide kanten in één shell: wallet én
      referrals. Wisselen ze elkaar niet in de weg?
- [ ] De tien affiliate-schakelaars bij meldingen: horen ze er nu wél te
      staan?

---

# BLOK 11 — DE WACHTRIJEN VAN DE ADMIN, ALS GEHEEL

**Venster 2: admin. Venster 1: adverteerder.**

Niet per stuk zoals hierboven, maar als dagelijkse gang: alle wachtrijen
langs, alles afhandelen, en kijken of de klant van **elk** besluit
bericht krijgt.

- [ ] `/wallet-topups`, `/top-ups`, `/ad-account-requests`,
      `/withdrawals` — leeg achterlaten
- [ ] Per afhandeling: krijgt de klant een melding, en staat het in
      `audit_events` **met een actor**?

```sql
select occurred_at, table_name, action,
       coalesce(up.full_name, 'GEEN ACTOR') as wie
  from audit_events ae left join user_profiles up on up.user_id = ae.actor_user_id
 order by occurred_at desc limit 30;
```

**Klaar als:** geen enkele regel zegt "GEEN ACTOR" voor iets wat een mens
deed.

---

# BLOK 12 — HET GELDOVERZICHT VAN DE SUPER-ADMIN

**Venster 2: eigenaar. Venster 1: leeg.**

- [ ] `/invoices` — alles van vandaag, elk met een bedrijf
- [ ] `/reconciliation` — telt alles op wat we vandaag hebben gedaan?
- [ ] `/audit` — de hele dag terug te lezen
- [ ] `/dst`, `/promotions`, `/commissions`, `/affiliates`

**De slotsom:** tel de hele dag na tegen het nulpunt uit blok 0. Elke rij
die erbij is gekomen moet van ons zijn, en elk bedrag moet te herleiden
zijn tot een stap in dit document.

---

# BLOK 13 — HET GROOTBOEK, VÓÓR DE EERSTE ECHTE EURO

**Dit is geen loopblok maar een bouwblok.** Geen schermen, geen twee
vensters — code, een plak, en een controle.

## Waarom dit vóór de livegang moet

`wallets` draagt twee kolommen: `usd_balance` en `eur_balance`. Dat is
een **stand**, geen grootboek. De bewegingen liggen verspreid over acht
tabellen — `wallet_topups`, `wallet_adjustments`, `wallet_exchanges`,
`wallet_precharges`, `wallet_refunds`, `top_ups`,
`ad_account_withdrawals`, `invoices` — elk met een eigen vorm, en het
saldo wordt ter plekke opgehoogd of verlaagd.

Gevolg: gaat er ooit één saldo fout, dan kunnen we niet **bewijzen** wat
het had moeten zijn. Alleen reconstrueren uit `audit_events`, en dat is
precies waarom `actions/wallet-recovery-actions.ts` bestaat. Dat is een
reddingsboei, geen boekhouding.

Dit blok verandert elke toekomstige geldfout van "onoplosbaar" in "we
zien precies waar het misging". Het lost de andere risico's niet op —
gelijktijdigheid, combinaties, tijd — maar het maakt ze **overleefbaar**.

## Wat er komt

**Eén append-only tabel.** Per beweging één regel:

```
wallet_ledger
  id, occurred_at, tenant_id, advertiser_id, wallet_id, currency,
  delta, balance_before, balance_after,
  source, source_id, reason, actor_user_id
```

**Geschreven door een TRIGGER op `wallets`, niet door de twaalf RPC's.**
Dat is de kern van het ontwerp. Een trigger op de saldokolommen ziet
élke beweging, ook die van een functie die iemand volgend jaar toevoegt
en vergeet aan te sluiten. Volledigheid eerst.

**De reden komt er als hint bij.** Elke money-RPC zet vóór zijn schrijf
een sessievariabele (`set local psm.ledger_source = 'topup_verify'` met
het id erbij); de trigger leest hem en zet hem in `source`. Staat hij er
niet, dan landt de regel alsnog met `source = 'unknown'`. Dus: een
ontbrekende hint kost ons het *waarom*, nooit het *dat*.

Zo hoeven we niet twaalf live-only functies in één keer open te leggen.
Die sluiten we daarna één voor één aan, en `source = 'unknown'` is de
werklijst die zichzelf bijhoudt.

**Echt append-only.** Geen UPDATE- en DELETE-recht voor wie dan ook, en
een trigger die het alsnog weigert. Plus `revoke` van `anon` in hetzelfde
blok als de `create`, zoals altijd.

## De controle die er de hele tijd bij hoort

Eén query die zegt of de som van de regels gelijk is aan het saldo:

```sql
select w.advertiser_id, w.eur_balance, w.usd_balance,
       coalesce(sum(l.delta) filter (where l.currency='EUR'), 0) as eur_uit_regels,
       coalesce(sum(l.delta) filter (where l.currency='USD'), 0) as usd_uit_regels
  from wallets w
  left join wallet_ledger l on l.wallet_id = w.id
 group by w.id, w.advertiser_id, w.eur_balance, w.usd_balance
having w.eur_balance is distinct from coalesce(sum(l.delta) filter (where l.currency='EUR'), 0)
    or w.usd_balance is distinct from coalesce(sum(l.delta) filter (where l.currency='USD'), 0);
```

**Nul rijen is goed.** Elke rij is een portemonnee waar de boeken niet
kloppen, en die query is vanaf dag één de eerste die 's ochtends draait.

## De historie

De regels van vóór vandaag zijn er niet, en die kunnen we niet uit het
niets maken. Wat wel kan: een **beste-poging-backfill** uit
`audit_events`, met `source = 'backfill'` en een `balance_before` die
uit de audit komt in plaats van uit de werkelijkheid.

Die backfill is **geen bewijs** en moet zo genoemd worden, in de kolom
en in het scherm dat hem toont. Het grootboek is gezaghebbend vanaf de
dag dat de trigger aan gaat, en geen dag eerder.

## Stappen

- [ ] Plak: de tabel, de trigger op `wallets`, het append-only-slot,
      de rechten, en één rapporttabel eronder
- [ ] De acht bestaande bewegingstabellen doorlopen: welke `source`
      hoort bij welke, zodat de hint-namen vastliggen vóór de eerste
      RPC hem zet
- [ ] De vier meest gebruikte RPC's de hint laten zetten
      (wallet-topup verifiëren, ad-account funden, ad-account
      terugboeken, factuur betalen uit de wallet)
- [ ] De controlequery in `npm run check` en in de dagelijkse gang
- [ ] Backfill uit `audit_events`, gemerkt als backfill
- [ ] Een beweging maken en terugzien: één regel, juiste delta, juiste
      before/after, juiste source, juiste actor

**Klaar als:** de controlequery nul rijen geeft, een verse beweging
binnen een seconde als regel terugkomt, en niemand — ook de service key
niet — een regel kan wijzigen of verwijderen.

---

# BLOK 14 — TWEE EIGENAREN EN BEVOEGDHEDEN PER ADMIN

**Bouwblok, geen loopblok.** Draai hem na blok 3, want blok 3 levert de
kaart: welke actie is vandaag eigenaar-alleen en welke niet. Zonder die
kaart bouw je bevoegdheden op een aanname.

## Wat er mis is

`tenants.owner_id` is **één uuid**. Elke eigenaar-actie vergelijkt
daartegen via `resolveOwnerContext` in `actions/_shared.ts`. Er kan er
dus precies één zijn.

De eigenaar, 26-09: "we zijn 2 compagnons dus moeten beide erop kunnen
inloggen". Twee mensen kunnen technisch al tegelijk op één account —
Supabase geeft per aanmelding een eigen sessie, en "Sign out of all
devices" bestaat juist daarvoor. **Het probleem is niet dat het niet
kan; het is dat ze dan niet uit elkaar te houden zijn.** Elke
goedkeuring, elke koerswijziging en elke vrijgave staat dan op één naam,
en het auditlog — het enige dat na een geldfout nog vertelt wat er
gebeurd is — wordt waardeloos.

Dus: ieder een eigen login, allebei met eigenaarsrechten.

En daarbovenop, de eigenaar: "mooiste zou zijn als ik per admin wat
bevoegdheden kan instellen."

## Het ontwerp

**Drie lagen, en de onderste is instelbaar.**

```
eigenaar   — alles, inclusief bevoegdheden uitdelen. Meerdere mogelijk.
admin      — de basis, plus wat hem per stuk is toegekend
staff      — bestaat al als ongebruikte waarde in de Role-enum
```

**Eigenaarschap wordt een verzameling.** `tenant_owners (tenant_id,
user_id, granted_by, granted_at)` in plaats van één kolom. `owner_id`
blijft staan en blijft gevuld, zodat niets omvalt dat er nog naar kijkt.

**`resolveOwnerContext` wordt één keer omgeschreven** naar "staat deze
gebruiker in `tenant_owners` van deze tenant". Elke bestaande aanroep
blijft ongewijzigd werken — dat is precies de opbrengst van het feit dat
ze allemaal door dat ene hulpje lopen.

**Bevoegdheden per admin** als rijen, niet als een jsonb-kolom:
`admin_capabilities (tenant_id, user_id, capability, granted_by,
granted_at)`. Een rij per toekenning, dus wie wat wanneer gaf staat
vanzelf in het auditlog.

Een nieuw hulpje `resolveCapability('naam')` zegt ja als de gebruiker
eigenaar is, óf als de toekenning bestaat.

**Twee regels die niet mogen buigen:**

1. **Standaard nee.** Een bevoegdheid die niemand heeft, kan niemand —
   behalve een eigenaar. Een nieuwe capability die per ongeluk nergens
   wordt gecontroleerd moet dicht staan, niet open.
2. **Bevoegdheden uitdelen is altijd eigenaar-alleen.** Een admin die
   zichzelf rechten kan geven heeft alle rechten.

**De namen komen uit blok 3.** Die agent levert de tabel van wat vandaag
`resolveOwnerContext` draagt; elk van die dingen wordt een capability
met een naam die een mens begrijpt — prijzen wijzigen, koersen
wijzigen, commissieregels zetten, een uitbetalingsgrens vrijgeven,
admins beheren.

## De actor-fix hoort hierbij

Gemeten over 14 dagen, zonder de bankfeed meegerekend: **213
auditregels zonder actor tegen 996 met**. Die 213 zijn schrijfacties via
de service key — hetzelfde lek dat plak 99 voor één actie dichtte.

Dat is niet alleen rapportage. Een geldwijziging zonder naam is nu al
een gat, en met twee eigenaren en instelbare admins wordt het groter:
dan is "wie deed dit" de eerste vraag bij elk geschil.

```sql
-- de werklijst, en hij houdt zichzelf bij
select table_name, count(*) as zonder_actor
  from audit_events
 where actor_user_id is null
   and table_name <> 'wise_incoming_transfers'
   and occurred_at > now() - interval '30 days'
 group by table_name order by 2 desc;
```

## Stappen

- [ ] Wacht op de rechtenkaart uit blok 3
- [ ] Plak: `tenant_owners`, `admin_capabilities`, de rechten erop, en
      één rapporttabel
- [ ] `resolveOwnerContext` omschrijven; `resolveCapability` erbij
- [ ] De tweede compagnon als eigenaar toevoegen, met een eigen login
- [ ] Scherm op `/admins`: per admin de schakelaars, alleen zichtbaar
      voor een eigenaar
- [ ] De actorloze schrijfacties uit de query hierboven omleggen naar
      een SECURITY DEFINER RPC, zoals plak 99 deed
- [ ] Lopen: als compagnon 2 inloggen en een eigenaar-actie doen; als
      admin met één toegekende bevoegdheid die wél en de rest niet

**Klaar als:** beide compagnons kunnen elk met hun eigen login alles wat
de eigenaar kan, hun handelingen staan met hun eigen naam in
`audit_events`, een admin kan precies wat hem is toegekend en niets
meer, en de query hierboven geeft alleen nog rijen die echt van een
machine komen.

---

# BLOK 15 — DE TESTACCOUNTS ERAF, NA TEST 3

> **29-09, vastgelegd: dit blok draait NA test 3, niet ervoor.** De
> eigenaar: "waarom is 1 blok verwijderen? dan kan toch na test 3?"
> Precies. Test 3 loopt alle 39 schermen per rol langs en heeft die
> accounts nodig -- PSM0016 met EUR 340 is de klant waarmee blok 4 t/m
> 8 gelopen zijn, PSM0008 is de affiliate. Weg is weg.
>
> Dit blok telt dus niet mee als "open werk" in de tussenstand: het is
> INGEPLAND, achter test 3, en plak 157 staat klaar. De blokken 0 t/m
> 14 zijn wat "16 blokken af" betekent.

**Als allerlaatste, na blok 13 en 14.** De eigenaar, 26-09: "we gaan toch
straks alle accounts verwijderen en fresh beginnen."

Dit blok staat expres achteraan en expres apart, want het is het enige
in dit document dat **niet terug te draaien is**. Alles hierboven voegt
toe; dit haalt weg.

## Eerst de lijst, dan pas iets verwijderen

Dit staat er vandaag op de echte tenant:

| code | naam | rol | stortingen | betaald |
|---|---|---|---|---|
| PSM0001 | Advertiser1 Advertiser1 Surname | advertiser | 0 | — |
| PSM0002 | john doe | advertiser | 0 | — |
| PSM0003 | Henk AD | advertiser | 0 | — |
| PSM0004 | Jonny Refferking | advertiser | 0 | — |
| PSM0005 | Test Advertiser | advertiser | 2 | **EUR 615,70** |
| PSM0006 | John Doe | advertiser | 0 | — |
| PSM0007 | F2 Walkthrough | advertiser | 1 | **EUR 207,00** |
| PSM0008 | the affiliateking | affiliate | 0 | — |
| PSM0009 | Parel AF | affiliate | 0 | — |
| PSM0010 | Piet Hendrik | advertiser | 0 | **EUR 10,00** |
| PSM0011 | Gers padoel | advertiser | 2 | **EUR 260,00** |
| PSM0012 | D2 Walkthrough | advertiser | 0 | — |
| PSM0013 | A1 Walkthrough | advertiser | 0 | — |
| PSM0014 | F1 Walkthrough Affiliate | affiliate | 0 | — |

Plus de vier die deze ronde zelf aanmaakt.

**Vier daarvan dragen betaalde facturen.** De namen van PSM0010 en
PSM0011 lezen niet als een walkthrough — "Piet Hendrik" en "Gers padoel"
zijn geen testnamen zoals "A1 Walkthrough" dat is. Ik weet niet of
daar een echt mens achter zit, en dat is precies het soort ding dat je
niet mag gokken. **De eigenaar wijst aan welke weg mogen, met naam en
code.** Ik verwijder er geen één op eigen initiatief.

## De volgorde, als de lijst er is

- [ ] **Back-up eerst.** Een Supabase-back-up van vandaag, en los
      daarvan een export van `advertisers`, `wallets`, `wallet_topups`,
      `top_ups`, `invoices`, `referral_commissions` en `audit_events`.
      Opslagbestanden (de slips) zitten **niet** in een databaseback-up.
- [ ] **Deactiveren vóór verwijderen.** Zet ze eerst op inactief en kijk
      een dag of er niets omvalt. Een account dat nergens meer aan hangt
      kan daarna weg; een account dat ergens aan hangt merk je zo.
- [ ] **Wat er aan hangt, hangt er ook na afloop.** `audit_events` is
      append-only en hoort te blijven staan, ook als de rij waar hij
      over ging verdwijnt. Facturen met een nummer horen in de
      boekhouding te blijven. Verwijderen is dus niet "rij weg" maar
      "welke rijen mogen weg en welke moeten blijven" — dat is een plak
      die ik schrijf als de lijst er is, met één rapporttabel eronder.
- [ ] **Daarna opnieuw tellen** tegen het nulpunt uit blok 0.

**Klaar als:** alleen de accounts staan er nog die de eigenaar bij naam
heeft aangewezen, de back-up is gemaakt vóór de eerste verwijdering, en
`audit_events` is niet aangeraakt.

---

## Wat "af" betekent voor deze ronde

- Elk scherm is door **jou** gezien, op telefoon én desktop.
- Elk cijfer is door **mij** tegen de database gehouden.
- Elke knop is ingedrukt, ook die van de takken die we niet kozen.
- Elke bevinding is **gefixt en live**, niet genoteerd.
- Wat niet te verifiëren was, staat hieronder met de reden.

## Geen fout: de EERSTE funding van een klant geeft 0% commissie

28-09 leek er iets stuk: PSM0016's referral-link werd goedgekeurd, de
dialoog belooft "everything the customer already did since they signed
up is booked straight away", en er kwam GEEN commissie op zijn EUR 200
funding -- terwijl bij PSM0011 de abonnementscommissie van EUR 75 wel
meteen verscheen.

Ik heb er drie verklaringen voor bedacht en alle drie gemeten en
verworpen:

1. *Twee bronnen voor het leverancierspercentage?* Nee.
   `_supplier_fee_pct_for` leest `ad_account_type_suppliers` -- dezelfde
   tabel als het verifieerscherm. (`ad_account_costs` is leeg voor elk
   account op deze tenant, maar die tabel wordt hier niet gebruikt.)
2. *Een `(elk)`-regel met NULL-pct die de type-regel overschrijft?* Nee.
   `_commission_rule_at` probeert own-type, own-all, default-type,
   default-all in die volgorde en slaat een niveau over waarvan zowel
   pct als amount leeg is.
3. *Op hold gezet?* Nee. Een hold SCHRIJFT een rij met bedrag 0 en een
   notitie plus een melding aan de eigenaar; er is geen rij.

Wat het WEL is: `_topup_commission_calc` berekent `is_first` -- de
eerste voltooide funding van deze klant -- en daarop geldt met opzet
0% ("de eerste fee is van ons"). PSM0016's EUR 200 was zijn eerste en
enige. Dus 0, en de functie keert stil terug.

**Gevolg voor blok 8:** er is op PSM0016 geen top-upcommissie om terug
te vorderen. Voor de clawback is een TWEEDE funding nodig. Met EUR 100
wordt het: fee 5% = EUR 5,00, erop EUR 95,00, leverancier 2% van 95 =
EUR 1,90, winst EUR 3,10, commissie 20% = **EUR 0,62**. Dan opnemen en
kijken of die 0,62 terugkomt.

## Geen fout: TURLIT LLC heeft geen btw- of KvK-nummer

Ik meldde 28-09 dat de afzenderrij een leeg `vat_no` en een leeg
`registration_no` heeft, en dat dat op een belastingdocument een gat
is. De eigenaar: "ja, is US LLC, heeft dat niet."

Klopt, en daarmee is het geen invulding maar de werkelijkheid. De PDF
laat die regels weg als ze leeg zijn, wat precies goed is. **Niet
opnieuw als bevinding opschrijven.**

## Wat ik niet kan, en waar ik jou voor nodig heb

- **Wachtwoorden en accounts aanmaken.** Drie keer in deze ronde,
  gemarkeerd met [JIJ].
- **Een bestandsupload** (de slip bij een wallet-storting). Het paneel
  kan geen bestand kiezen; die ene stap doe jij.
- **De beforeunload-waarschuwing** ("weet je zeker dat je weg wilt") —
  het paneel onderdrukt die dialoog.

---

## TESTS DIE NOG MOETEN

> Alles hieronder is GEBOUWD en staat live, maar is nog nooit door een
> mens op het scherm gezien. Een fix die niemand heeft zien werken is
> een aanname. Per blok afvinken.

| # | wat | bij welk blok | waarom het nog niet kon |
|---|---|---|---|
| T1 | **Twee bankfamilies bij het opwaarderen.** Een klant met accounts bij TURLIT én ZANEL moet de keuzeknoppen zien met beide begunstigden, en de gekozen bank moet op stap 2 verschijnen. | 5 | geen enkele klant heeft vandaag accounts in twee families. Tijdens blok 5 een tweede accounttype toevoegen aan de testklant, dan is de situatie er |
| T2 | **De bankgegevens uit Settings bereiken de klant.** Een IBAN wijzigen op /settings/banks en hem terugzien op het opwaardeerscherm van de klant. En de terugval: de rij weghalen en zien dat de ingebouwde lijst weer verschijnt. | 5 | vergt een ingelogde klant naast de eigenaar |
| T3 ✅ | **GELOPEN 27-09.** "Not deleted - 6 customers are on Prime. Switch it off instead." Alle vier de plannen staan er nog. Oorspronkelijk: Een plan waar een klant op zit proberen te verwijderen; er hoort "2 customers are on Prime" te komen en er mag niets weg. | 1 of 4 | de vier bestaande plannen hebben klanten; een leeg testplan aanmaken en dat verwijderen bewijst alleen de makkelijke helft |
| T4 ✅ | **GELOPEN 27-09 — en mijn eerste conclusie was FOUT.** Ik meldde dat de cron na 08:00 stopte, op grond van `exchange_rates.updated_at`. Maar `_touch_updated_at` is `if new is distinct from old`, dus dezelfde koers wegschrijven bumpt de stempel niet — en EUR/USD bewoog vandaag niet (provider gaf om 14:20 exact 0.87786534, hetzelfde als om 08:00). De cron liep dus waarschijnlijk gewoon; de kolom zei wanneer het GETAL veranderde, niet wanneer we keken. Bewezen door de route met een ingelogde sessie aan te roepen: `updated: 2`, en `updated_at` bewoog niet. Vercel bevestigd: **Pro**, crons Enabled, `0 * * * *` staat er gewoon. **Gefixt** (`0620e8d`): `refresh-exchange-rates` schrijft `updated_at` nu expliciet, zodat de kolom ‘wanneer laatst bevestigd’ betekent — dat was ook de oorzaak van een lus in mijn eigen verversing. | 1 | — |
| T5 ✅ | **GELOPEN 27-09** op ad-account-types: het venster verschijnt met het gevolg erin, niet bevestigd, 5 van 8 nog actief. Oorspronkelijk: Het venster moet verschijnen met de gevolgen erin. Alleen het VENSTER testen -- niet bevestigen, want dan staat de facturatie stil. | 1 | — |
| T6 | **De beforeunload-waarschuwing op het bedrijfsformulier.** | 4 of 7 | het paneel onderdrukt die dialoog; dit kan alleen in een echte browser |
| T7 | **De afwijzing van een aanvraag die per FACTUUR betaald was.** Het geld hoort terug te komen als goedgekeurde wallet-correctie. | 6 | vergt een aanvraag via "Create Invoice" in plaats van de wallet; geen enkele bestaande rij loopt zo |
| T8 ✅ | **GELOPEN 27-09.** "Profile updated successfully", database op United States. Meteen een tikfout gecorrigeerd die op elke factuur stond. Oorspronkelijk: Werkt pas sinds plak 102; daarvoor kon niemand het bedrijf van de organisatie bewaren. | 1 | plak 102 is net gedraaid |

## DE LOOP VAN 29-09, 17:30 — als de TWEEDE eigenaar

Gelopen in Chrome, ingelogd als `contact@primescalemedia.com` (Lasse).
Dit is de stap die in blok 11, 13 en 14 openstond als "structureel
geverifieerd, niet waargenomen". Nu waargenomen.

**Wat bewezen is**

- **De tweede eigenaar kan echt handelen.** Het dashboard laadt
  volledig, inclusief *Profit & activity* en *System* — allebei
  eigenaar-alleen. Dat is `/api/stats`, dat hem tot een uur eerder nog
  403 gaf.
- **Een bevoegdheid toekennen werkt**, en het auditlog ziet het. Ik
  heb "Ask customers a question" bij Admin 1 aangezet en meteen weer
  uit; `admin_capabilities` staat weer op 0 rijen, en in
  `audit_events` staan **twee regels — INSERT 17:33:55 en DELETE
  17:34:08, allebei op naam van contact@primescalemedia.com**. Dat is
  meteen het bewijs voor de actor-fix van plak 132, die tot vandaag
  alleen machineregels had gezien.
- **/ledger** leest zoals gevraagd: elke regel met de klant erbij
  (F2 Walkthrough BV, Padoel Media BV, Blok4 Test BV), "Opening
  balance" in woorden, en 41 bewegingen van vóór het grootboek. *Came
  in* houdt EUR en USD apart (EUR 44.645 aangekomen / 5,00 gematcht /
  44.640 wachtend / 1.165 gecrediteerd). *We keep* komt uit op
  **EUR 122,34**, exact het cijfer dat `lib/pure-margin.ts` vastpint,
  met de doorstroomregels grijs en doorgestreept.
- **/finance-check** classificeert de 92 stortingen zoals bedoeld,
  inclusief codes die in tekst verstopt zitten: `PSM1737 Tribe`,
  `PSM2129 (topup)`, `Top-up Patrick Benschop - PSM2149/PSM2149`,
  `Top up : psm 2073`.
- **/admins → Permissions** staat er compleet: zeventien schakelaars
  in vier groepen, read-only bovenaan met de uitleg dat hij andersom
  werkt, "PAGE ONLY" op de finance-check, en "Owners only" op de twee
  die niet gegeven kunnen worden.

**Wat de loop VOND, en wat lopen dus oplevert**

Drie fouten, alle drie van vandaag, alle drie binnen vier minuten
gevonden door de pagina te openen — en geen van drieën door een test
of een agent:

1. **`/commissions` zei "No commissions yet" boven zes echte rijen.**
   Ik verving `select("*")` door een kolomlijst om de inkoopprijs
   tegen te houden, en zette er `idx` in omdat het type dat noemt. Die
   kolom bestaat niet op de view en heeft nooit bestaan — `*` vroeg er
   nooit om, dus het type loog al die tijd in stilte. Een kolomlijst
   maakt van die leugen een 400, en het scherm viel terug op zijn lege
   staat (`4ee3145`).
2. **/finance-check telde euro's en dollars bij elkaar op**:
   "Money involved $85,940.06", een reduce over alles met de valuta van
   de eerste regel (`f3ae61e`).
3. **Het grootboek gaf een oordeel boven een lees die nog liep**: de
   kop zei "Checking the books…" en de regel eronder tegelijk "Every
   wallet balance equals the sum of its own movements (0 wallets)"
   (`7931541`).

Alle drie zijn de fout waar dit project al een test voor heeft — een
zelfverzekerd cijfer boven iets wat niet klopt — en alle drie had ik ze
zelf die ochtend gemaakt. Het verschil is dat ze nu binnen een minuut
gevonden werden, omdat iemand de pagina opende.

**En daarna nog eens gelopen, om de reparaties te zien**

- `/commissions` toont de zes commissies weer: 75,00 + 10,00 + 5,00 +
  5,00 + 0,11 + 4,85 = **EUR 99,96**, precies het bedrag dat het
  *We keep*-paneel eraf trekt. Twee schermen, hetzelfde getal.
- `/finance-check` zegt nu **"€44.640,00 · $41.300,06"** in plaats van
  één opgeteld dollarbedrag — en diezelfde twee cijfers staan
  onafhankelijk op `/ledger` onder *Came in* bij "Arrived, not yet
  attributed". Tot op de cent gelijk.
- `/dst`: op de chip "Invoiced" drukken zet *Lines in view* op 0 en
  laat *Reserved, not yet invoiced* op **EUR 20,00** staan. Vóór
  vanochtend las dat EUR 0,00.
- `/reconciliation` draagt de band over de lege bankkant met de 92
  wachtende stortingen erin, en USD staat op "Nothing to compare" in
  plaats van een groen vinkje boven nul tegen nul.

**Wat de loop NIET kon**

De mobiele ronde op 390px. Dat venster is de Chrome van de eigenaar en
die ga ik niet verkleinen; het paneel is de klantkant en daar ben ik
niet ingelogd. En `/settings/general` als tweede eigenaar is niet
geprobeerd: die schrijf is geblokkeerd tot plak 156 draait, en het
enige wat "proberen" zou opleveren is een mislukking die ik al gemeten
heb.

---

## DE DONKERE RONDE VAN 29-09 — gemeten in plaats van gegrepd

De eigenaar stuurde twee screenshots: een lichtgrijze knop in een
donkere kaart, en een lelijke naad boven de onderbalk.

**Hoe het gevonden is.** Niet door de stylesheets af te zoeken op
lichte hexwaarden -- dat vond er wel dertig en de meeste waren tekst
op een gekleurde knop, dus prima. In plaats daarvan de PAGINA laten
opsommen welk element een lichte achtergrond heeft terwijl
`documentElement` de klasse `dark` draagt. Dat geeft precies de
vlakken die iemand ziet, en niets anders.

Zo kwam eruit:

- `button.fbtn` (Sort & filter) met
  `linear-gradient(180deg,#fff,var(--panel-2))` uit refine-css.ts.
  Dezelfde gradient zit op `.seg2`. `.btn.ghost` had hem ook en was al
  gedekt, omdat die override de shorthand `background` gebruikt en die
  wist de image -- deze twee waren nergens overschreven.
- De onderbalk is `var(--panel)` op een ondergrond van `var(--ground)`:
  in donkere modus dus LICHTER dan de pagina, met daarbovenop nog een
  rand. Twee lichte banden op elkaar lezen als een naad.
- De wachtrijkaart MET werk erin:
  `linear-gradient(180deg,#fff,var(--primary-tint))` -- een witte
  kaart met witte tekst, uitgerekend degene die het meest moet
  opvallen.
- `.ci.i` en `.ci.r`, de twee icoonvarianten van de vijf die nergens
  een donkere versie hadden.
- En mijn eigen "test data"-label van diezelfde ochtend.

**Stand na afloop**, gemeten op /wallets en /dashboard in donkere
modus: **nul lichte vlakken**, op een tekstgradient na
(`background-clip:text`, dus dat IS de tekst).

**En een test erbij.** Bij het repareren maakte ik precies de fout
waar dit project al vier keer op is omgevallen: een backtick in een
CSS-commentaar, die de template literal beeindigt. De bestaande test
kijkt niet naar `shell-dark-css.ts` en kan dat niet, want dat bestand
gebruikt met opzet geneste literals. De FOUT is smaller dan die regel
en geldt wel overal: een backtick in een CSS-commentaar is nooit iets
anders dan deze bug.

---

## Logboek

| blok | gelopen | gefixt | open |
|---|---|---|---|
| 0 | **26-09** | — (niets te fixen) | — |
| 1 | **27-09** | ~30 bevindingen + 4 ontwerppunten van de eigenaar | leverancier staat in mock mode; T4 draaide een keer en stopte |
| 2 | **27-09 op 390, compleet** — verse affiliate PSM0015 aangemaakt via uitnodiging, Home/Referrals/Wallet/Alerts/Settings gelopen, elke nul tegen de database gehouden (klantcode, wallet, 0 links, teller op 15) | 16 bevindingen: `73484ea`, `9f56ea2`, `fba50ca`, `d345490`, `069c349`, `802663e` | alleen de **desktopronde** van dezelfde vijf schermen; vergt één keer opnieuw inloggen als de affiliate |
| 3 | **27-09.** Admin 1 aangemaakt (eerste niet-eigenaar admin ooit op deze tenant) en ingelogd. Alle zes verboden schermen geprobeerd — allemaal correct dicht. Wachtrijbadges tegen de database gehouden: 0/0/0 kloppen (de 8 stortingen en 6 aanvragen zijn van `psm-e2e`), 59 stortingen klopt (277 van de 336 zijn gearchiveerd). /invoices gelezen + PDF opgehaald (200). | 10 bevindingen: `cf90fee`, `54aa2ee`, `e9f9138`, plus de afwijsreden. Plak 103 gedraaid, **plak 105 klaar** | één storting verifiëren / één aanvraag goedkeuren kan hier niet — niets staat op deze tenant in de wachtrij; loopt mee in blok 5 en 6 |
| 4 | **27-09.** Aangemeld via de referral-link van PSM0015 (`?t=prime-scale-media&ref=PSM0015`) op 390px. **Attributie klopt op alle zeven punten**: PSM0016, 1 referral_link met status `pending`, affiliate = Blok2 Affiliate (`2a95c52a-…`), `referral_status` = referred, `referred_by` = Blok2 Affiliate, 1 wallet, `last_client_code` 15 → 16. Eerste adres was er een dat ik zelf verzon en waar de eigenaar geen postvak voor had; opnieuw gedaan met `pevidan425@art2mart.com`. | 12 bevindingen uit vier agents: `390c8e3`, `c4bde19`. Twee doodlopers (referral-link zonder `?t=` → inlogscherm zonder aanmeldknop; factuuradres eenmalig schrijfbaar), drie geldfouten in findReferrer (stille leesfout kostte de affiliate elke toekomstige commissie; `is_active` niet getest; verwijzing uit door-de-gebruiker-schrijfbare metadata op /onboard én bij inloggen), het niet-eindigende skelet naast een harde 0 op Home, typen kwijt via de telefoon-onChange bij monteren, en een ongefilterde user_profiles-lees op een publieke URL. | **Onboarding en de lege Home zijn nog niet door de eigenaar bekeken** — het account bestaat, de bedrijfsgegevens zijn nog niet ingevuld. Desktopronde ook nog niet. |
| 5 | **28-09.** Elke tak van de dialoog geopend op 390px met PSM0016: vier overboekvaluta, GBP gaf Wise UK (sort 60-84-64, IBAN GB69TRWI...), HKD gaf DBS Hong Kong (016) branch 478 — allebei kloppend met `bank_accounts` tot op het cijfer. Referentie `0016-4389325412` klopt met de wallet. Eerste top-up heeft terecht geen minimum. **Echte top-up gelopen**: EUR 500 met zelfgemaakte slip, eigenaar geverifieerd → `completed`, verifier gestempeld, `eur_balance` 0 → 500,00, USD onaangeroerd, één factuur automatisch aangemaakt. | 8 bevindingen uit drie agents (`1203039`) plus de live-wallet (`cc3839d`) en GBP bij de banken (`29f0313` + plak 114). Zwaarste: pure-bank-override matchte anders dan de routering, dus een gecorrigeerde IBAN werd genegeerd; een mislukte accountlees zei "je hebt nog geen ad-account" boven de verkeerde bank; "Change" hield de slip bij een valutawissel; het minimum stond in de overboekvaluta terwijl het vakje de walletvaluta vraagt. | **T1 (twee bankfamilies)** kan niet: PSM0016 heeft nul ad-accounts — loopt mee in blok 6. **T2** (IBAN in Settings wijzigen en bij de klant terugzien) nog niet gelopen. Desktopronde nog niet. |
| 6 | **28-09, GELOPEN EN DICHT.** Aanvraag als PSM0016 op 390px, elke platformtak open. Gratis (2 van 2 inbegrepen): fee 0, wallet onaangeroerd. Goedgekeurd -> `AA-PSM0016-EU-01`, BM 1122334455667788, fee **5%** (het hoogste van plan 5 en type 4), active. Gefund: EUR 200 eruit, 5% = EUR 10, EUR 190 erop, wallet 500 -> 300; eigenaar geverifieerd -> `completed`, verified_at gestempeld, "Funded to date EUR 190,00". Derde aanvraag koste **EUR 50** (scherm: 300 -> 250; database: charged 50, wallet 250). Afgewezen met reden -> **refunded 50, wallet terug op 300**, en de klant leest de reden plus "The EUR 50.00 fee is back in your wallet." Een GRATIS aanvraag afgewezen: niets belast, niets terug, wallet onveranderd. Elk cijfer tegen de database, tot op de cent. | **Twee dingen op productie waren stuk.** (1) Goedkeuren kon niet -- de databasepoort weigert `completed` vanaf een sessie en de server-action schreef met de sessie-client (`cde53a3`). (2) Na een deploy deed elke knop in een open tabblad niets meer, zonder fout: verouderde chunks (`7045ff2`). Verder: de verzendknop was AFGEKNIPT op de telefoon (vaste max-h in een overflow-hidden dialoog, `0f46589`); het scherm nodigde uit tot een 409 omdat de klantwaarschuwing in minuten sprak en de database in 90 seconden; platformkiezer op defaultValue dus vinkje en formulier liepen uiteen en EUR verdween; website als relatieve link op vijf schermen; afwijzen van een gratis aanvraag hedgede over geld dat niet bestond (`cfbd11f`). Plakken 117 en 118 gedraaid. | Niets blokkeert dit blok meer. Open voor later: de **desktopronde** van dezelfde schermen, en **T1** (twee bankfamilies) kan nu wel -- PSM0016 heeft sinds vandaag een ad-account. |
| 7 | **28-09, GELOPEN.** Met PSM0011 (`micos96108@pumpoly.com`) -- PSM0016 blijft NSA op verzoek van de eigenaar. Billing: factuur 0011-135, Monthly plan EUR 150,00, **Past due** (vervaldatum 26-09). Pay now: bevestiging zei EUR 150,00 en wallet **260,00 -> 110,00**, database na afloop `paid`, `paid_from = wallet`, wallet 110,00. Affiliate: er werd EERST niets geboekt, en dat was terecht -- `_book_invoice_commission` eist `rl.status = 'active'` en de link stond op `pending` (dat zijn de "2 affiliates waiting for you"). Na goedkeuren boekte hij met terugwerkende kracht: **EUR 75,00, basis 150,00, 50%** aan PSM0008, en de link staat op `active`. | Twee meldingen van de eigenaar, allebei raak en allebei gefixt: **te late facturen stonden nergens op het adminhomescherm** (nieuwe tegel, afgeleid, met het filter in de link) en **de factuurrij toonde geen vervaldatum** (kolom Due erbij). En PSM0011 las "No plan yet" pal boven "an invoice of EUR 150.00 is still open" -- een gestopt abonnement kwam terug als null, net als nooit-een-plan-gehad. Nu splitst dezelfde query billable van gestopt; kop, pill, kleine letters en de kaart eronder zeggen welke van de twee het is. | **29-09: de PDF is nu WEL gelezen.** Chrome comprimeert de tekststromen, dus ik heb hem in de browser opgehaald met de sessie, elke FlateDecode-stroom uitgepakt met DecompressionStream en de hex-strings gedecodeerd via de ToUnicode-tabellen van de vijf subset-fonts. Wat er staat: `INVOICE #0016-141 / Ad Account Topup / Paid / TURLIT LLC, 30 N Gould St STE R, Sheridan WY 82801 / Bill To Blok4 Test BV, Keizersgracht 123, Amsterdam 1015CJ / VAT NL861234567B01 / Invoice Date 2026-09-28 / Ad Account Funding 1.00 x 200.00 / Sub Total EUR 200,00 / Total EUR 200,00 / Amount Paid EUR 200,00`. Klopt met de database, en GEEN leveranciersnaam in het document |
| 8 | **28-09, GELOPEN EN DICHT.** Met PSM0016 op een account met EUR 190,00 erop. Plafond klopt met de database en de dialoog zegt zelf wat dat plafond IS. Te veel vragen wordt nu geweigerd met het maximum in de zin (EUR 500 op 190). Aangevraagd EUR 50 -> `pending`, **wallet onaangeroerd op 300**. Afgewezen met reden -> `rejected`, reden opgeslagen, **wallet nog steeds 300, nul clawbacks** -- er beweegt niets, precies de eis. Het plafond kwam daarna terug op EUR 190, dus een afgewezen aanvraag geeft zijn ruimte netjes terug. Tweede aanvraag EUR 40 -> goedgekeurd -> **wallet 300 -> 340,00**, en de klant leest 'Returned from an ad account' op zijn afschrift. | **Drie dingen die echt stuk waren** (`eb0133a`): 500 tegen een plafond van 190 werd gewoon bevestigd; **bewijs vastleggen kon nooit werken** (`authenticated` heeft geen UPDATE op die tabel -- alle vijf live rijen hebben proof_path leeg, vier goedgekeurd); en `getWithdrawalProofUrl` had geen rolcontrole, dus elke klant kon een getekende URL naar een leveranciersschermafdruk opvragen. Plus twaalf kleinere. Plakken **119** (settle toetst zichzelf, stille clawback meldt zich, twee policies missen `status`, anon-resten) en **120** (een ad-accountopname rekent alleen over funding-commissie -- beslissing van de eigenaar) zijn gedraaid en gemeten. | **29-09: de vier-ogen-regel BESTAAT al** in `ad_account_withdrawal_approve` (regels 27-42) -- deze kolom was achterhaald. Maar toen gemeten hoe breed hij staat: **eenentwintig functies nemen een geldbesluit en precies EEN toetst het.** Zes tabellen hebben de twee kolommen ervoor, vier staan open. En het gebeurt al: 2 van de 2 `wallet_adjustments` en 2 van de 2 `wallet_refunds` zijn door dezelfde persoon aangevraagd en goedgekeurd -- testdata van de doorloop, maar op een rechtstreekse bijschrijving op een wallet. **Plak 159** sluit het met een trigger (geen tekstchirurgie op levende functies, dus niet de fout van plak 124), eigenaar uitgezonderd. En de **clawback is niet gezien**: PSM0016's enige funding was zijn eerste en die geeft met opzet 0% commissie, dus er valt niets terug te vorderen -- daarvoor is een TWEEDE funding nodig (EUR 100 -> EUR 0,62). Desktopronde nog niet. | Niets. De twee beleidsvragen zijn beantwoord: B, en abonnementscommissie alleen terug bij een abo-refund -- die refund zelf staat uitgeschreven in NEXT_SESSION_FIRST. |
| 9 | **28-09, GELOPEN — één stap open.** Met PSM0008 (de affiliate uit blok 7) op 390px. De ondergrens stond al vrijgegeven door de eigenaar (`payout_min_override` = 0,00). **Beide takken van de dialoog geopend**: "Pay me in EUR" gaf €75,00 → je ontvangt €75,00; "All in USD" gaf €75,00 → $85,44 − 0,6% ($0,51) → **$84,93**, met "Live rate: 1 USD = 0,8778 EUR". Dat klopt tot op de cent met de RPC (`exchange_rates.eur` = 0,87780652 → numeric(12,6) → 75 / 0,877807 = 85,44; 0,6% = 0,51). EUR voor het echie gedaan → **uitbetaling #4**, database: EUR 75,00 netto, clawback 0,00, 1 commissie, `requested`, BIC en btw-nummer doorgeschreven, de commissie gestempeld met `payout_id`. "Still owed to you" ging naar €0,00. Terugsturen met reden was al gelopen (#3, reden staat bij de affiliate op het scherm). **De factuur telt op**: één regel "Referral commission — 1 commission in EUR €75,00", Total EUR €75,00, met de leverancier (Affiliateking Test BV, btw, IBAN, BIC, Partner PSM0008) en TURLIT LLC als klant. Scherm, database en factuur: drie keer €75,00. | **Een geweigerde uitbetaling gaf nog steeds een factuur** (`4fc471d`) — #3 was diezelfde minuut afgewezen en de knop stond er gewoon onder, met "Awaiting transfer" erop: een self-billed factuur, door ons opgemaakt, op naam van de affiliate, voor geld dat wij geweigerd hebben. Knop weg én route weigert (409), aan beide kanten, plus de beheerderslijst waar hij bovendien voor ELKE admin stond terwijl alleen de eigenaar hem mag lezen (`bdbbbc8`). Verder: **het rode vierkantje** was `i-x` die niet in het sprite stond, en de test die dat moet vangen las alleen het schilbestand — nu volgt hij de imports een niveau diep (`fbf1575`); **de tegels lijnden niet uit** en mijn eerste poging deed letterlijk niets omdat refine-css later wordt ingespoten (`f05c836`, gemeten: 635 tegen 606, nu allebei 606); de factuurregels zijn uit de route gehaald naar `lib/pure-payout-invoice.ts` met **14 tests**, want de clawback- en omrekentak zijn op deze tenant niet te maken; "Waiting for us" → "Waiting for payout" en "Not paid" → "Sent back" op verzoek van de eigenaar (`4fc471d`), en het nieuwe woord brak in zijn eigen pil (`88b2cde`); "Go back" op stap 2 sloot de hele dialoog → "Cancel"; het uitbetaalnummer is tenant-breed en niet per affiliate, dus er staat nu bij dat het onze referentie is en geen telling. | **De eigenaar moet "Mark as paid" drukken op uitbetaling #4** — de classifier blokkeerde die klik in Chrome. Daarna is het laatste stuk te meten: `status` = paid, `paid_at`, de commissie op `paid`, en de factuur die dan "Paid" moet zeggen in plaats van "Awaiting transfer". **Plak 122 moet nog** (gemeten: geen van de zeven payout-functies draagt de marker). **De clawbacktak is niet op het scherm gezien**: PSM0008 heeft één commissie en die is een abonnementscommissie, en sinds plak 120 raakt een ad-accountopname die met opzet niet. In de database klopt hij wel — uitbetaling #2: 20,00 bruto − 4,04 = 15,96 netto — en op de factuur is hij nu getest. **TURLIT LLC heeft nog steeds geen btw- en KvK-nummer**, dus die staan ook niet op deze factuur. Desktopronde nog niet. |
| 10 | **28-09, GELOPEN EN DICHT.** Met PSM0011 op 390px, die adverteerder was en nog geen affiliate. Aangevraagd -> "Application received" met de drie stappen, database `applied` + stempel + melding bij de eigenaar. **Eerst geweigerd met reden**: de klant leest "Not this time", de reden woordelijk, en twee uitwegen (Apply again / Ask us) -- geen doodloop. Opnieuw aangevraagd: status terug op `applied` met een nieuwe datum, en **de afwijzing van de eigenaar blijft bewaard** (`decided_at` 20:34:10 + de reden), terwijl de klant hem niet meer ziet omdat de kaart op `affiliate_status` splitst. Goedgekeurd op de standaardregels: `approved`, rol blijft `advertiser`. Beide takken van het goedkeurvenster open -- een tarief invullen maakt er "Approve with these rules" van, leegmaken zet hem terug op "Approve on the default rules" (default 20%). **Beide rollen in één shell**: alle vijf tabs (Wallet/Accounts/Home/Billing/Settings) werken naast het affiliateprogramma, met de eigen link `?ref=PSM0011`, vier tegels op 0,00 en de uitbetaalkaart met de grens van EUR 200 erin. **De tien affiliate-schakelaars staan er nu wél** -- alle tien bij naam -- en de "Become an affiliate"-kaart is weg nu hij is goedgekeurd. | **De Join-knop was stuk op productie, door mijn eigen plak 124** (`7f13286` + plak 127): daar stonden per ongeluk twee `regexp_replace` achter elkaar, waarvan de eerste naar een niet-bestaande variabele `v_adv_keep` verwees. Elke adverteerder kreeg "We couldn't send your application just now." Gevonden door hem in te drukken. Verder de vier agentveegjes (`68c78b5`): **het boek van de eigenaar zei "Paid EUR 24,96" waar EUR 20,92 de bank uit ging** -- `paid` telde bruto zonder de verrekende clawbacks, en de affiliate las op zijn eigen scherm wél 20,92; de kolom "Owed" per klant telde andere rijen dan de tegel erboven (vanavond stond "Still owed EUR 0,00" naast "Owed EUR 75,00" op één scherm); `use-is-affiliate` ontzegde een recht op een mislukte lees (`count ?? 0`); een mislukte statuslees sloot élke weg naar het programma tegelijk; "Yes, refuse" was grijs zonder te zeggen waarom; beide weigerdialogen sloten vóór de schrijf klaar was; en een geslaagde regelopslag met mislukte goedkeuring zei "The rules were not saved" boven "The rules are saved, but…". Plus plak 124 (views, policies, tien triggerfuncties voor anon) en de stale migratie `20260920130000` die de hele reis stil zou slopen. | **29-09 UITGEZOCHT, EN HET IS GROTER DAN EEN FACTUUR.** De EUR 150 van PSM0011 was met de hand aangemaakt als `inactive` (auditlog: INSERT door een mens, 23-09 20:25) -- een eenmalig geval. Maar de meting eromheen legde iets structureels bloot: **de nachtrun factureert alleen `status = 'active'` en de aanmaanlus pakt `active` en `past_due`. Een abonnement dat op `inactive` komt zit dus in GEEN van beide** -- het wordt nooit meer gefactureerd en nooit meer aangemaand. En de aanmaanketen eindigt juist daar: actief -> past_due -> inactive. Vannacht om 03:00 zijn PSM0006, PSM0012 en PSM0013 zo omgezet, elk met een openstaande factuur van EUR 200. **EUR 600 waar niemand meer achteraan gaat, en er ging geen melding uit.** Elf facturen van in totaal EUR 3.650 staan op een niet-actief abonnement; twee daarvan zijn betaald (EUR 650). Geen van de elf is NA het stoppen aangemaakt, dus er wordt niet doorgefactureerd op een opgezegd plan -- dat deel is goed. | **De actor-fix is nog niet door een mensenhandeling heen.** Sinds de deploy staan er alleen drie rijen in `audit_events`, alle drie van de nachtelijke abonnementsrun om 03:00 -- machine, terecht zonder actor. De eerste echte afhandeling bewijst het; tot dan is hij structureel geverifieerd (trigger leest de header, client stuurt hem) en niet waargenomen. **En dat is meteen de rest van de sluitingseis**: "leeg achterlaten" kon ik niet DOEN, want er stond niets op onze tenant om af te handelen -- ik heb vastgesteld dat ze leeg ZIJN, niet dat ik ze leeg heb gemaakt. **`top_ups_view` levert `wallet_debited` niet**, dus de afwijsdialoog noemt nu alleen een bedrag als hij zeker weet dat het beweegt; die kolom aan de view toevoegen is werk voor een plak. Desktopronde en de agent-lijst met kleinere doodlopers (pagerlimieten zonder pager, `disabledHint` op vier dialogen, de tekst "the customer reads it" bij refund/adjustment-afwijzingen) staan in NEXT_SESSION_FIRST. |
| 12 | **29-09, GELOPEN EN DICHT.** Drie agents op het geldoverzicht, daarna de nulpuntsafstemming zelf uitgeteld: elke rij die er sinds 26-09 bij is gekomen is terug te voeren op een stap die in dit logboek staat (PSM0015/PSM0016, Admin 1, een referral-link, EUR 500 top-up, EUR 200 accountvulling, EUR 75 commissie, uitbetalingen #3 en #4, facturen 140 en 141). /reconciliation zegt EUR 1.165,00 gecrediteerd en dat klopt op de cent met de database. | **Het scherm dat 'is er geld weg?' beantwoordt, telde 2 van de 16 geldpotten** (`7648d8c`). Gemeten: `bank_ledger_entries` heeft **0 rijen**, voor elke tenant, terwijl er 357 echte stortingen in de Wise-feed staan (EUR 404.383,45 + USD 196.860,06 + HKD 11.850). `received` is dus per definitie nul, elk gat is het hele gecrediteerde bedrag, en het amberkleurige '1 to investigate' betekende niet dat er geld weg was maar dat er nog nooit een bankafschrift is ingevoerd. Een alarm dat nooit uit kan is geen alarm, en op dit scherm is dat het gevaarlijkst: als het altijd aanstaat, is een echt gat onzichtbaar. **En de andere kant op**: USD stond op een groen vinkje "Balanced" -- nul gecrediteerd, nul ontvangen, dus gat nul -- terwijl diezelfde tenant USD 168,37 in de wallets heeft. Nul tegen nul is geen controle die slaagde. Nu: een gestippelde grijze rij "Nothing to compare", een band die zegt dat de bankkant leeg is met het aantal wachtende stortingen erbij, en een doorverwijzing naar /ledger dat de wallets wél bewijst. De Wise-feed wordt expres niet opgeteld: die referenties zijn van het oude systeem, optellen maakt van een vals gat een vals overschot. **/dst**: "Reserved, not yet invoiced" werd uit de *gefilterde* rijen berekend, dus de chip "Invoiced" liet EUR 0,00 zien terwijl er EUR 20,00 gereserveerd stond -- een geldbedrag dat verandert door een kijkknop. Eigen lees nu, en "we weten het niet" als die mislukt. En een mislukte lees van wie achterloopt liet de hele achterstandsband weg, wat als een schoon bureau leest. **/invoices**: factuur 131 is BETAALD, EUR 10,00, en heeft geen bedrijf -- `select id into v_company ... limit 1` geeft NULL en de insert gaat door. Als "--" was dat niet van een smalle kolom te onderscheiden; er staat nu "No company". Plus de telfixes uit de agents: `use-commissions` gaf `total ?? 0` terug (pager weg, ?page=3 teruggeklemd naar 1), vier tabellen gaven de pager een verzonnen totaal, en **`user-affiliates` las `select("*")` op een view die `supplier_cost` en `supplier_fee_pct` draagt** -- de inkoopprijs lag op /users bij de twee staf-admins. | **Plak 137 ligt klaar en is nog niet gedraaid**: de facturatie maakt geen factuur meer voor een klant zonder bedrijf, zet de teller niet door (dus geen gratis maand) en meldt het één keer per week per klant. PSM0010 heeft een lopend abonnement en geen bedrijf, dus dit komt volgende maand terug. **De bankkant zelf blijft leeg tot iemand hem vult** -- dat zijn 357 stortingen toewijzen en dat is handwerk van de eigenaar, geen code. Zolang dat niet is gebeurd is /reconciliation een eerlijk "nog niet gecontroleerd" in plaats van een onjuist "er is geld weg". Desktopronde niet gelopen. |
| 13 grootboek | **29-09, GEBOUWD EN DICHT.** Drie agents op het grootboek, daarna de eigenaar ernaar laten kijken -- en dat was de nuttigste stap: "hier wordt ik niks wijzer van, een grootboek moet toch super detailed zijn." Hij had gelijk. Wat er stond waren zes regels "opening +EUR 20,00" zonder naam, zonder oorzaak, zonder doorklik. Nu: **elke regel draagt de klant** (bedrijfsnaam, klantcode als onderscheid), wat het was in woorden, wie het deed, en de reden -- en een klik opent de post, met het RECORD erachter opgehaald uit de juiste tabel op basis van de bron. Ontbreekt een feit, dan staat er WELK feit en waarom. **Drie panelen**, want geld lekt op drie plekken weg en elke plek heeft eigen rekenkunde: *Every movement* (de wallets), *What came in* (per valuta: aangekomen op de bank, gematcht, wachtend op iemand, gecrediteerd) en *What we keep* (fee, abonnementen, DST minus commissie). Plus de historie van vóór het grootboek, teruggerekend uit `audit_events` -- expres NIET als grootboekregels weggeschreven, want elke wallet heeft al een openingsregel gelijk aan zijn HUIDIGE saldo en 50 gereconstrueerde regels erbovenop zetten de dagelijkse controle permanent op rood. | **De controle was te omzeilen door precies de handeling die hij moet betrappen** (`376f31c`). Hij loopt van `wallets` NAAR de regels, dus een regel waarvan de portemonnee weg is komt er nooit langs -- en er stond geen foreign key (gemeten: 0). Nagerekend op echte data: laat de portemonnee met EUR 340,00 aan regels weg en hij zegt "de boeken kloppen". **NaN komt overal doorheen**: `'NaN'::numeric <> 0` is true, `round('NaN'+10,2) = round('NaN',2)` is true, en `round('NaN',2) is distinct from round('NaN',2)` is FALSE -- elke waakhond zegt tegelijk dat het klopt. **Een groen oordeel over nul portemonnees**, want `off` wordt gebouwd door over de wallets te lopen die terugkwamen, en RLS weigert met nul rijen en error null. **En een fout in mijn eigen margepaneel**, gevangen door hem na te rekenen op echte data: hij telde elke betaalde factuur op en kwam op EUR 1.885,04 waar het EUR 122,34 is -- vijftien keer te hoog, op het scherm dat antwoord geeft op "verdienen we iets". Een `wallet_topup`-factuur is de klant die zijn eigen wallet vult (EUR 1.165,00), een `ad_account_topup`-factuur is bruto advertentiegeld op weg naar de leverancier (EUR 597,70). `lib/pure-margin.ts` + 11 tests houdt het vast. Plus plak 140 (drie gaten in de trigger: een derde decimaal brak de hele betaling en daarna elke volgende; de naam van de veroorzaker viel weg bij een schema-prefix, wat ALLE regels tegelijk op 'unknown' zet; geen INSERT-arm), plak 139 (34 rechten: 6 schrijfrechten zonder policy en 28 leegmaakrechten -- RLS geldt daar NIET voor), plak 141 (**mijn eigen fout**: plak 137's standaard grant-regel zette de incassomotor open voor iedere ingelogde gebruiker; gevonden door `npm run ochtend` binnen het uur) en plak 142 (de financiële controleur). | **NIEUW: `npm run ochtend`** -- elf controles, één tabel, één oordeel per regel. Staat nu volledig op 0 behalve regel 9 (grootboekbewegingen 0, waar 0 juist slecht is) en regel 11 (factuur 131 zonder bedrijf, historisch). **NIEUW: `/finance-check`** -- elke geldbeslissing die een machine niet zelf afhandelde, met per regel een uitgeschreven lijst van wat je moet nakijken, en GEEN ENKELE knop die geld verplaatst. Eigenaar plus één aangewezen admin. Daar staat nu precies één ding op: **80 bankstortingen zonder naam, EUR 38.410,00 + USD 41.186,06.** **Wat er nog moet**: plak 138 draaien -- die bewijst de trigger in een transactie die zichzelf terugdraait, en zolang hij niet gelopen heeft is "de boeken kloppen" een lege bewering (het grootboek heeft nog nooit een echte beweging gezien). En die 80 stortingen toewijzen of terugsturen is handwerk van de eigenaar, geen code. Desktopronde niet gelopen. |
| 14 eigenaren+rechten | **29-09, GEBOUWD EN DICHT.** Twee agents (rechtenkaart / actorloze schrijfacties), daarna gebouwd. `contact@primescalemedia.com` is nu eigenaar naast jou, met een eigen login, en staat zo in `tenant_owners` -- gegeven door jou, niet door zichzelf. Op /admins staat per admin een knop **Permissions**: zestien schakelaars in vier groepen, elk met de zin die zegt wat hij toestaat EN wat het risico is, want een regel met `rates.write` en een knopje ernaast wordt omgezet door iemand die gokt. De twee die niet gegeven kunnen worden -- rechten uitdelen, iemand eigenaar maken -- staan er grijs bij met de reden, want een schakelaar die er simpelweg niet is ziet eruit als een vergeten geval. De vocabulaire is afgeleid en niet verzonnen: `resolveOwnerContext` heeft callers in twaalf actionbestanden en elk bestand is al een samenhangend stuk van de zaak. | **Twee guards aanpassen leek het werk. Het waren er dertig.** De eigenaarstoets stond met de hand uitgeschreven in vijf verschillende schrijfwijzen door de hele code, en in VIJF databasefuncties waar 26 policies, 17 triggers en zo'n twintig RPC's aan hangen. Elke plek die was blijven staan is een deur waar de tweede eigenaar tegenaan loopt -- en dat is de ergste vorm die deze fout kan aannemen: geen weigering bij de voordeur, wat duidelijk is, maar een menu vol knoppen die stuk voor stuk "Forbidden" zeggen. Nu een functie (`lib/auth/is-tenant-owner.ts`) plus plak 145 voor de databasekant, en een test die de eenentwintigste kopie tegenhoudt. **Het uitnodigingsformulier** rekende het opnieuw uit uit `owner_id`, dus de tweede eigenaar zou het referrer-veld niet zien, zonder uitleg. **Plak 144 zette de nieuwe eigenaar neer als zijn eigen gever** -- bij onenigheid tussen twee eigenaren is "wie heeft jou eigenaar gemaakt" de eerste vraag, en het antwoord zou "hijzelf" zijn geweest. **/api/exchange-rates/refresh** haalde de ingelogde gebruiker op en gooide hem weg met `void userId` voordat hij een kale service-client bouwde: iemand veranderde de koers waar elke klant op wordt afgerekend en de auditregel was niet van de nachtelijke cron te onderscheiden. **Plak 146**: `_wallet_ledger_record` las nog kaal `auth.uid()` terwijl plak 132 alleen het auditlog had gerepareerd -- zodra een walletschrijf via `createAdminClient()` gaat noemt `audit_events` de naam en zegt `wallet_ledger` niemand, over dezelfde handeling. **En de schakelaar die niets deed**: "See the finance check" las nog de losse kolom uit plak 142, van voordat er een rechtenmodel was. Plus `usePendingCounts` dat `isLoading: isPending` teruggaf -- goede waarde, naam die het tegenovergestelde belooft, op vier schermen gelezen. | **In de SQL-editor is `auth.uid()` LEEG en de headerfallback ook** -- gemeten. Alles wat met de hand geplakt wordt komt dus naamloos in `audit_events`, en in een project waar migraties per definitie met de hand gaan is dat het grootste attributiegat dat er nog is. Vanaf plak 144 staat er een regel bovenaan die de naam meestuurt; die hoort boven ELKE plak die geld of rechten aanraakt, en dat doe ik voortaan. **Nog niet nagelopen**: de finance-check-vlag hangt op de PAGINA, niet op de data -- een agent mat dat elke admin dezelfde cijfers via PostgREST kan ophalen, dus `finance.check`, `audit.view` en `ledger.read` horen in de RLS-policy en niet alleen in de guard. En `lib/permissions.ts` is een dode rechtenmatrix waarvan de inhoud inmiddels ONJUIST is (hij zet koersen en top-up-fee onder admin). Beide in NEXT_SESSION_FIRST. Desktopronde niet gelopen. |
| 15 opruimen | **29-09, GEMETEN EN KLAARGEZET — wacht nog steeds op de lijst van de eigenaar.** Vier agents op de opruimsurface. Daarna de afhankelijkheidskaart zelf uitgemeten op de live database in plaats van uit de migraties gelezen (die staan er niet: de basistabellen zijn met de hand aangemaakt). **DE VAL: `advertisers -> wallets` is SET NULL en `wallets -> wallet_ledger` is RESTRICT.** Een adverteerder weghalen blokkeert dus NIET — de wallet blijft staan met `advertiser_id = null` en het geld erin, en kan daarna niet meer weg omdat zijn grootboekregels hem tegenhouden. Over de 18 testaccounts: **EUR 1.118,50 en USD 1.668,37** in zeven wallets, tien grootboekregels. Tweede helft van de val: `auth.users -> user_profiles -> advertisers` is twee keer CASCADE, dus één rij weghalen in het Auth-scherm neemt abonnementen, DST, affiliate, commissieregels en links mee terwijl wallet, facturen en topups als wees achterblijven. `audit_events` heeft NUL foreign keys en overleeft alles — gemeten, niet aangenomen. | **Plak 157** (verwijderen in de volgorde die geen geld laat liggen; lege codelijst + droge stand, doet standaard niets) en **plak 158** (`affiliate_payouts` CASCADEt vandaag: 3 uitbetalingen op 'paid', EUR 95,92, zouden verdwijnen — plak 152 deed dit voor commissies maar niet voor uitbetalingen). In code: read-only werd omzeild op `updateUserProfile` (`2ea1077`), zes zelfverzekerde nullen (`3d95356`), het affiliate-boek gooide geredde commissies weg (`4c8327b`). | de LIJST: welke accounts mogen weg. Niets gaat eerder. |
