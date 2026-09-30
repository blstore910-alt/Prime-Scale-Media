// ── DE BRON: ENGELS ─────────────────────────────────────────────────
//
// Elke klantzin die vertaald wordt, staat hier. `nl.ts` is getypt op de
// SLEUTELS van dit bestand, dus een zin die hier bestaat en daar niet,
// is een typefout -- en dan faalt de build en gaat er niets live. Dat
// is wat "foutloos" hier betekent. Zie docs/NL_EN.md.
//
// ── DE VOORVOEGSELS ZIJN NIET VRIJBLIJVEND ────────────────────────
//
//   btn.     een knop       -- NL mag niet langer zijn dan EN + 2
//   label.   een label/kop  -- idem
//   tab.     een menu-item  -- idem
//   (rest)   lopende tekst  -- mag langer, want die wrapt
//
// tests/lib/i18n.test.ts leest de voorvoegsels en toetst de lengte. Een
// knop die in het Nederlands niet past, faalt daar -- niet pas op een
// telefoon van een klant.
//
// ── VARIABELEN ─────────────────────────────────────────────────────
//
// {naam} tussen accolades. Dezelfde namen moeten in de vertaling staan;
// ook dat toetst de test, want een {amount} die in het Nederlands
// ontbreekt, laat een bedrag van het scherm vallen.

export const en = {
  // ── de schakelaar zelf ──────────────────────────────────────────
  "label.language": "Language",
  "lang.en": "English",
  "lang.nl": "Nederlands",
  "language.saved": "Language saved",
  "language.hint": "Emails and invoices follow this too.",

  // ── het menu ────────────────────────────────────────────────────
  "tab.dashboard": "Dashboard",
  "tab.wallet": "Wallet",
  "tab.accounts": "Ad accounts",
  "tab.requests": "Requests",
  "tab.billing": "Billing",
  "tab.report": "Financial report",
  // De onderbalk heeft minder ruimte en zegt "Accounts" in plaats van
  // "Ad accounts". Een eigen sleutel, zodat het Engels exact blijft wat
  // het vandaag is.
  "tab.accountsShort": "Accounts",
  "tab.notifications": "Notifications",
  "tab.settings": "Settings",
  "tab.partners": "Partners",
  "tab.help": "Get help",
  "tab.home": "Home",

  // ── het dashboard ───────────────────────────────────────────────
  "dash.welcome": "Welcome",
  "dash.welcomeBack": "Welcome back",
  "label.eurWallet": "EUR wallet",
  "label.usdWallet": "USD wallet",
  "btn.topUp": "Top up",
  "btn.exchange": "Exchange",
  "btn.viewAll": "View all",
  "btn.view": "View",
  "label.adAccounts": "Ad accounts",
  "label.plan": "Plan",
  "dash.nextPayment": "Next payment {amount} · on {date}",
  "dash.activeCount": "{count} active",

  // ── algemeen ────────────────────────────────────────────────────
  "btn.cancel": "Cancel",
  "btn.save": "Save",
  "btn.back": "Back",
  "btn.close": "Close",
  "btn.confirm": "Confirm",
  "common.loading": "Loading…",
  "common.couldNotLoad": "Couldn't load this. It is not the same as there being nothing — try again.",
} as const;

export type Key = keyof typeof en;
