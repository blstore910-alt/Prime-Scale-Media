// ── NEDERLANDS ──────────────────────────────────────────────────────
//
// Getypt op de sleutels van `en.ts`: een sleutel die daar bestaat en
// hier ontbreekt, is een typefout. Dan faalt de build en gaat er niets
// half vertaald live. Zie docs/NL_EN.md.
//
// ── DE REGELS VAN DE EIGENAAR, 30-09 ──────────────────────────────
//
// 1. Vaktermen blijven Engels: wallet, top-up, exchange, ad account,
//    plan, invoice, withdrawal, referral, affiliate, dashboard, fee.
//    "Een Nederlandse klant zegt wallet", en een vertaling maakt de app
//    vreemder, niet vertrouwder.
// 2. Kort. Een knop is niet langer dan zijn Engelse versie plus twee
//    tekens -- en dat toetst tests/lib/i18n.test.ts.
// 3. Het ontwerp wint. Past het niet, dan wordt de ZIN korter; de knop
//    wordt niet breder. "Anders hebben die mensen in NL even pech qua
//    design."
//
// Twee knoppen waar dat al meteen beet:
//   "Opslaan" (7) is langer dan "Save" (4)+2   -> "Bewaar"
//   "Instellingen" (12) langer dan "Settings"  -> "Opties"

import type { Key } from "./en";

export const nl: Record<Key, string> = {
  // ── de schakelaar zelf ──────────────────────────────────────────
  "label.language": "Taal",
  // Elke taal in haar eigen naam, in beide talen. Wie de app per
  // ongeluk in een taal zet die hij niet leest, moet de weg terug nog
  // kunnen herkennen.
  "lang.en": "English",
  "lang.nl": "Nederlands",
  "language.saved": "Taal opgeslagen",
  "language.hint": "E-mails en facturen volgen dit ook.",

  // ── het menu ────────────────────────────────────────────────────
  "tab.dashboard": "Dashboard",
  "tab.wallet": "Wallet",
  "tab.accounts": "Ad accounts",
  "tab.requests": "Aanvragen",
  "tab.billing": "Facturen",
  "tab.report": "Rapport",
  "tab.accountsShort": "Accounts",
  "tab.notifications": "Meldingen",
  "tab.settings": "Opties",
  "tab.partners": "Partners",
  "tab.help": "Hulp",
  "tab.home": "Home",

  // ── het dashboard ───────────────────────────────────────────────
  "dash.welcome": "Welkom",
  "dash.welcomeBack": "Welkom terug",
  "label.eurWallet": "EUR wallet",
  "label.usdWallet": "USD wallet",
  "btn.topUp": "Top up",
  "btn.exchange": "Exchange",
  "btn.viewAll": "Alles",
  "btn.view": "Bekijk",
  "label.adAccounts": "Ad accounts",
  "label.plan": "Plan",
  "dash.nextPayment": "Volgende betaling {amount} · op {date}",
  "dash.activeCount": "{count} actief",

  // ── de paginakoppen ─────────────────────────────────────────────
  // "je" en niet "u": dezelfde toon als "Welkom terug", en de toon die
  // een Nederlandse app vandaag heeft.
  "label.affiliateProgram": "Affiliateprogramma",
  "page.affiliate.sub": "Verdien aan wie je binnenbrengt.",
  "page.wallet.sub": "Je geld, klaar wanneer jij dat bent.",
  "page.accounts.sub": "Waar je budget zijn werk doet.",
  // "funding" en "fee" blijven: vaktermen, zie docs/NL_EN.md.
  "page.report.sub": "Elke top-up, funding, fee, factuur en terugboeking op een plek — filter, tel op, exporteer.",
  "page.requests.sub": "Alles wat je ons gevraagd hebt.",
  "page.billing.sub": "Je plan, en wat eraan komt.",
  "page.partners.sub": "Bedrijven waarmee we werken.",

  // ── bedrijfsgegevens die nog ontbreken ──────────────────────────
  "field.companyName": "bedrijfsnaam",
  "field.companyEmail": "bedrijfs-e-mail",
  "field.phone": "telefoonnummer",
  "field.companyAddress": "bedrijfsadres",
  "field.country": "land",
  "field.state": "provincie of regio",
  "field.postcode": "postcode",
  "field.vat": "btw-nummer (of vink aan dat je niet btw-plichtig bent)",
  "field.billingAddress": "factuuradres",
  "common.and": "en",

  // ── het dashboard: de bedrijfsmelding en het saldo ──────────────
  "dash.companyStillNeeded": "Nog nodig voor een top-up of accountaanvraag: {fields}",
  "dash.companyAdd": "Vul je bedrijfsgegevens in voor een top-up of accountaanvraag",
  // "Vul in" (6) past niet in de ruimte van "Add" (3)+2. Het ontwerp
  // wint: de zin ernaast zegt al WAT er ingevuld moet worden, dus de
  // knop hoeft alleen te openen.
  "btn.add": "Open",
  "dash.walletReadFailed": "We konden je wallet net niet lezen — herlaad en probeer opnieuw.",
  "dash.walletSettingUp": "Je wallet wordt nog klaargezet. Herlaad zo meteen.",
  "dash.stillNeededFirst": "Eerst nog nodig: {fields}",
  "dash.companyFirst": "Vul eerst je bedrijfsgegevens in — ook het factuuradres",

  // ── de wallet ───────────────────────────────────────────────────
  "wallet.readFailed": "We konden je wallet net niet lezen — herlaad en probeer opnieuw",
  "wallet.loading": "Een moment — je wallet laadt",
  "wallet.none": "Nog geen wallet op dit account",
  "wallet.checkedByHand": "We controleren de bank en schrijven het met de hand bij, meestal dezelfde werkdag.",
  "wallet.partialLoad": "Een deel van je activiteit laadde niet, dus deze lijst is onvolledig en telt misschien niet op tot je saldo. Herlaad even — gebeurt het vaker, laat het ons weten.",
  "label.date": "Datum",
  "label.reference": "Kenmerk",
  "label.description": "Omschrijving",
  "label.amount": "Bedrag",
  "label.status": "Status",
  "wallet.takenFromWallet": "Van je wallet afgeschreven.",
  "wallet.settledOutside": "Buiten je wallet betaald — je saldo veranderde hierdoor niet.",
  "wallet.paidNotFromWallet": "Betaald · niet uit wallet",
  "wallet.requestRefunded": "Ad-accountaanvraag terugbetaald",
  "wallet.requestFee": "Fee voor ad-accountaanvraag",
  "wallet.returnRequested": "Terugboeking aangevraagd van een ad account",
  "wallet.returnRefused": "Terugboeking geweigerd",
  "wallet.returnedFromAccount": "Teruggeboekt van een ad account",
  "wallet.heldUntil": "Wacht tot wij kijken — stuur een bericht in je {group}-groep als dit een vergissing was",
  "wallet.paidBackToBank": "Teruggestort naar je bank",
  "wallet.correctionInFavour": "Correctie in je voordeel",
  "wallet.correction": "Correctie",
  "wallet.topupDefault": "Wallet top-up",
  "wallet.activityLoadFailed": "We konden niet al je wallet-activiteit laden — dit is geen lege lijst. Herlaad even.",
  "wallet.activityLoading": "Je wallet-activiteit wordt opgezocht…",
  "wallet.activityEmpty": "Er is nog niets gebeurd — top-ups, exchanges, funding van ad accounts en alles wat je uit je wallet betaalt, verschijnt hier.",
  "wallet.recentOnly": "Je ziet je recentste activiteit. Oudere regels staan hier niet — het financiële rapport heeft de hele periode.",
  // Statusbadges: net zo krap als een knop. "In behandeling" (14) past
  // niet in de ruimte van "Pending" (7)+2, "Bijgeschreven" (13) niet in
  // die van "Credited", "Terugbetaald" niet in die van "Returned". Het
  // ontwerp wint, dus het woord wordt korter.
  "label.stOnAccount": "Op het account",
  "label.stRefused": "Geweigerd",
  "label.stOnItsWay": "Onderweg",
  "label.stReturned": "Retour",
  "label.stCharged": "Geboekt",
  "label.stCredited": "Ontvangen",
  "label.stRejected": "Geweigerd",
  "label.stFailed": "Mislukt",
  "label.stPending": "Wacht",
  "label.stRequested": "Aangevraagd",
  "label.stPaidOut": "Uitbetaald",
  "label.stApplied": "Verwerkt",

  // ── algemeen ────────────────────────────────────────────────────
  "btn.cancel": "Annuleer",
  "btn.save": "Bewaar",
  "btn.back": "Terug",
  "btn.close": "Sluit",
  "btn.confirm": "Bevestig",
  "common.loading": "Laden…",
  "common.couldNotLoad": "Dit kon niet geladen worden. Dat is niet hetzelfde als niets — probeer het opnieuw.",
};
