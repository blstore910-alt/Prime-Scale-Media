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

  // ── de paginakoppen ─────────────────────────────────────────────
  // De koppen zelf hergebruiken de tab.-sleutels: een pagina en haar
  // menu-item horen hetzelfde woord te hebben, in elke taal.
  "label.affiliateProgram": "Affiliate program",
  "page.affiliate.sub": "Earn from the people you bring in.",
  "page.wallet.sub": "Your money, ready when you are.",
  "page.accounts.sub": "Where your budget does its work.",
  "page.report.sub": "Every top-up, funding, fee, invoice and return in one place — filter it, total it, export it.",
  "page.requests.sub": "Everything you've asked us for.",
  "page.billing.sub": "Your plan, and what's coming up.",
  "page.partners.sub": "Companies we work with.",

  // ── bedrijfsgegevens die nog ontbreken ──────────────────────────
  // lib/pure-company-complete.ts geeft deze sleutels terug, en de
  // Engelse waarden zijn EXACT de zinnen die hij vroeger zelf gaf -- zo
  // verandert er niets voor wie Engels leest.
  "field.companyName": "company name",
  "field.companyEmail": "company email",
  "field.phone": "phone number",
  "field.companyAddress": "company address",
  "field.country": "country",
  "field.state": "state or region",
  "field.postcode": "postcode",
  "field.vat": "VAT number (or tick that you are not VAT registered)",
  "field.billingAddress": "billing address",
  "common.and": "and",

  // ── het dashboard: de bedrijfsmelding en het saldo ──────────────
  "dash.companyStillNeeded": "Still needed before you can top up or request an account: {fields}",
  "dash.companyAdd": "Add your company details to top up or request an account",
  "btn.add": "Add",
  "dash.walletReadFailed": "We couldn't read your wallet just now — reload and try again.",
  "dash.walletSettingUp": "Your wallet is still being set up. Reload in a moment.",
  "dash.stillNeededFirst": "Still needed first: {fields}",
  "dash.companyFirst": "Add your company details first — including the billing address",

  // ── de wallet ───────────────────────────────────────────────────
  "wallet.readFailed": "We couldn't read your wallet just now — reload and try again",
  "wallet.loading": "Just a moment — loading your wallet",
  "wallet.none": "No wallet on this account yet",
  "wallet.checkedByHand": "We check the bank and credit it by hand, usually the same working day.",
  "wallet.partialLoad": "Part of your activity didn't load, so this list is incomplete and may not add up to your balance. Give it a reload — if it keeps happening, tell us.",
  "label.date": "Date",
  "label.reference": "Reference",
  "label.description": "Description",
  "label.amount": "Amount",
  "label.status": "Status",
  "wallet.takenFromWallet": "Taken from your wallet.",
  "wallet.settledOutside": "Settled outside your wallet — your balance did not change for this.",
  "wallet.paidNotFromWallet": "Paid · not from wallet",
  "wallet.requestRefunded": "Ad-account request refunded",
  "wallet.requestFee": "Ad-account request fee",
  "wallet.returnRequested": "Return requested from an ad account",
  "wallet.returnRefused": "Return refused",
  "wallet.returnedFromAccount": "Returned from an ad account",
  "wallet.heldUntil": "Held until we look at it — message us in your {group} group if this was a mistake",
  "wallet.paidBackToBank": "Paid back to your bank",
  "wallet.correctionInFavour": "Correction in your favour",
  "wallet.correction": "Correction",
  "wallet.topupDefault": "Wallet top-up",
  "wallet.activityLoadFailed": "We couldn't load all of your wallet activity — this isn't an empty list. Give it a reload.",
  "wallet.activityLoading": "Looking up your wallet activity…",
  "wallet.activityEmpty": "Nothing has moved yet — top-ups, exchanges, ad-account funding and anything paid from your wallet show up here.",
  "wallet.recentOnly": "Showing your most recent activity. Older entries are not listed here — the financial report has the full period.",
  // Statusbadges. Met label.-voorvoegsel, want een badge is net zo krap
  // als een knop en de lengtewachter moet er ook op letten.
  "label.stOnAccount": "On the account",
  "label.stRefused": "Refused",
  "label.stOnItsWay": "On its way",
  "label.stReturned": "Returned",
  "label.stCharged": "Charged",
  "label.stCredited": "Credited",
  "label.stRejected": "Rejected",
  "label.stFailed": "Failed",
  "label.stPending": "Pending",
  "label.stRequested": "Requested",
  "label.stPaidOut": "Paid out",
  "label.stApplied": "Applied",

  // ── het avatarmenu en het team ──────────────────────────────────
  "menu.profile": "Profile",
  "menu.signOut": "Sign out",
  "tab.team": "Team",
  "page.team.sub": "Who can see this account.",
  "team.ownerIntro": "Let a colleague see this account — balances, ad accounts and invoices. They cannot move money.",
  "team.memberIntro": "You are on {account}'s account as a {role}. You can see balances, ad accounts and invoices; only the account owner can move money or change the team.",
  "btn.invite": "Invite",
  "btn.sending": "Sending…",
  "btn.remove": "Remove",
  "label.members": "Members",
  "label.waitingToAccept": "Waiting to accept",
  "label.invitationLink": "Invitation link",
  "label.roleOwner": "owner",
  "label.roleViewer": "viewer",
  "label.roleManager": "manager",
  "team.you": "(you)",
  "team.until": "until {date}",
  "team.notEmpty": "This is not an empty team.",
  "team.sent": "Invitation sent — the link is below too.",
  "team.sentNoMail": "Invitation created, but the email didn't go. Copy the link below.",
  "team.removed": "Removed from the team",
  "team.cancelled": "Invitation cancelled",
  "viewer.banner": "Viewing {account}'s account — read only.",
  "viewer.title": "Read only",
  "viewer.body": "You're viewing this account. Only the account owner can do this.",

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
