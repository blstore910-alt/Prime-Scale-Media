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

  // ── algemeen ────────────────────────────────────────────────────
  "btn.cancel": "Annuleer",
  "btn.save": "Bewaar",
  "btn.back": "Terug",
  "btn.close": "Sluit",
  "btn.confirm": "Bevestig",
  "common.loading": "Laden…",
  "common.couldNotLoad": "Dit kon niet geladen worden. Dat is niet hetzelfde als niets — probeer het opnieuw.",
};
