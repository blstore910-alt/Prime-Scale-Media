# DE LAATSTE RONDE — A tot Z, elk accounttype, elk scherm

> Draaiboek voor de slotcontrole vóór livegang. Geschreven 2026-09-26.
> Volg dit van boven naar beneden. Elk blok is af of niet af; er is geen
> "grotendeels".

---

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

- [ ] `git status` schoon, laatste commit staat live (`/api/version`)
- [ ] De ondergrens van PSM0005 staat nog op **EUR 15** van de F3-loop.
      Terugzetten op de staande 200 vóór we beginnen, anders lopen we
      straks een testwaarde als echte instelling voorbij.
- [ ] Vastleggen wat er nú staat, zodat elk verschil daarna van ons is:

```sql
select (select count(*) from advertisers)            as adverteerders,
       (select count(*) from user_profiles where role='admin') as admins,
       (select count(*) from referral_links)          as links,
       (select count(*) from referral_commissions)    as commissies,
       (select count(*) from invoices)                as facturen,
       (select count(*) from wallet_topups)           as wallet_topups,
       (select count(*) from top_ups)                 as account_topups;
```

**Klaar als:** het nulpunt staat in dit document en de grens is terug op 200.

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

## Wat "af" betekent voor deze ronde

- Elk scherm is door **jou** gezien, op telefoon én desktop.
- Elk cijfer is door **mij** tegen de database gehouden.
- Elke knop is ingedrukt, ook die van de takken die we niet kozen.
- Elke bevinding is **gefixt en live**, niet genoteerd.
- Wat niet te verifiëren was, staat hieronder met de reden.

## Wat ik niet kan, en waar ik jou voor nodig heb

- **Wachtwoorden en accounts aanmaken.** Drie keer in deze ronde,
  gemarkeerd met [JIJ].
- **Een bestandsupload** (de slip bij een wallet-storting). Het paneel
  kan geen bestand kiezen; die ene stap doe jij.
- **De beforeunload-waarschuwing** ("weet je zeker dat je weg wilt") —
  het paneel onderdrukt die dialoog.

---

## Logboek

| blok | gelopen | gefixt | open |
|---|---|---|---|
| 0 | | | |
| 1 | | | |
| 2 | | | |
| 3 | | | |
| 4 | | | |
| 5 | | | |
| 6 | | | |
| 7 | | | |
| 8 | | | |
| 9 | | | |
| 10 | | | |
| 11 | | | |
| 12 | | | |
