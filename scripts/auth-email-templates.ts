// ── DE MAILS DIE SUPABASE ZELF STUURT, IN ONZE OPMAAK ───────────────
//
// "Wachtwoord vergeten" en "Bevestig je adres" stuurt Supabase Auth, niet
// de app. Hun tekst staat in Supabase → Authentication → Email
// Templates. Dit script maakt ze in dezelfde opmaak als elke andere mail
// (lib/pure-email-layout.ts), met Supabase's eigen {{ .ConfirmationURL }}.
//
//   node --experimental-strip-types scripts/auth-email-templates.ts
//
// schrijft docs/email-templates/*.html. Plak de inhoud in het vak
// "Message body" van de bijbehorende template.

import { mkdirSync, writeFileSync } from "node:fs";
import { emailLayout, emailPanel } from "../lib/pure-email-layout.ts";

const URL = "{{ .ConfirmationURL }}";
const uit = "docs/email-templates";
mkdirSync(uit, { recursive: true });

const mails: Record<string, string> = {
  "reset-password": emailLayout({
    preheader: "Set a new password for Prime Scale Media.",
    eyebrow: "Password",
    title: "Set a new password",
    lead: "Somebody — hopefully you — asked to reset the password of this account. Press the button and choose a new one.",
    cta: { label: "Choose a new password", href: URL },
    bodyHtml: emailPanel("Did not ask for this?", "Ignore this email. Your password stays as it is."),
    footnoteHtml: "For your safety this link works once and expires after an hour.",
  }),
  "confirm-signup": emailLayout({
    preheader: "Confirm your email address for Prime Scale Media.",
    eyebrow: "One step left",
    title: "Confirm your email",
    lead: "Press the button to confirm this is your address. Then you can sign in.",
    cta: { label: "Confirm my email", href: URL },
    footnoteHtml: "Did not sign up? You can ignore this email.",
  }),
  "change-email": emailLayout({
    preheader: "Confirm your new email address for Prime Scale Media.",
    eyebrow: "Email address",
    title: "Confirm your new address",
    lead: "Press the button to use this address for Prime Scale Media from now on.",
    cta: { label: "Confirm the new address", href: URL },
    footnoteHtml: "Did not ask for this? Ignore this email and nothing changes.",
  }),
  "magic-link": emailLayout({
    preheader: "Your sign-in link for Prime Scale Media.",
    eyebrow: "Sign in",
    title: "Your sign-in link",
    lead: "Press the button to sign in. No password needed.",
    cta: { label: "Sign in", href: URL },
    footnoteHtml: "This link works once. Did not ask for it? Ignore this email.",
  }),
};

for (const [naam, html] of Object.entries(mails)) {
  writeFileSync(`${uit}/${naam}.html`, html);
  console.log(`${uit}/${naam}.html`);
}
