// Generates the Supabase AUTH email templates from the house layout
// (lib/pure-email-layout.ts), so the sign-up confirmation, the password
// reset and the rest look like every other mail we send.
//
// Supabase keeps these templates in its dashboard, not in this repo, so
// they are written to supabase/email-templates/ and pasted by hand:
// Authentication -> Emails -> (template) -> Subject + Message body.
//
//   node --import ./tests/ts-resolve.mjs --experimental-strip-types scripts/email-templates.ts
//
// The {{ .TokenHash }}-style placeholders are Supabase's own; it fills
// them in when it sends.

import { mkdirSync, writeFileSync } from "node:fs";
import { emailLayout, emailPanel } from "../lib/pure-email-layout";

type Template = { file: string; name: string; subject: string; html: string };

// ── LINKS THAT WORK IN ANY BROWSER ───────────────────────────────────
// {{ .ConfirmationURL }} sends Supabase's PKCE code back, and exchanging
// that code needs a cookie that only exists in the browser that filled in
// the form. Sign up on a laptop, open the mail on a phone: an error, and
// no profile, no wallet, no referral. A token_hash link is verified by
// OUR /auth/confirm with verifyOtp, which needs no such cookie -- and that
// route is also where the profile, wallet and referral are made.
const CONFIRM = "https://app.primescalemedia.com/auth/confirm";
const link = (type: string, next?: string) =>
  `${CONFIRM}?token_hash={{ .TokenHash }}&type=${type}${next ? `&next=${encodeURIComponent(next)}` : ""}`;

const WHITE_B = (html: string) => `<b style="color:#ffffff;">${html}</b>`;

const templates: Template[] = [
  {
    file: "confirm-signup.html",
    name: "Confirm signup",
    subject: "Confirm your email — Prime Scale Media",
    html: emailLayout({
      preheader: "One click and your Prime Scale Media account is ready.",
      eyebrow: "One step left",
      title: "Confirm your email",
      lead: `Welcome to Prime Scale Media. Press the button to confirm ${WHITE_B("{{ .Email }}")} and your account is ready.`,
      cta: { label: "Confirm my email", href: link("email") },
      steps: ["Confirm your email", "Add your company", "Top up &amp; launch"],
      footnoteHtml: "Did not sign up? Ignore this email — no account is created without this click.",
    }),
  },
  {
    file: "invite-user.html",
    name: "Invite user",
    subject: "You're invited to Prime Scale Media",
    html: emailLayout({
      preheader: "Accept the invitation to set up your Prime Scale Media account.",
      eyebrow: "You're invited",
      title: "Join Prime Scale Media",
      lead: `Accept the invitation to set up your account for ${WHITE_B("{{ .Email }}")}.`,
      cta: { label: "Accept invitation", href: link("invite") },
      steps: ["Accept", "Set your password", "Open your dashboard"],
      footnoteHtml: "Did not expect this invitation? Ignore this email — nothing happens until you accept it.",
    }),
  },
  {
    file: "magic-link.html",
    name: "Magic link",
    subject: "Your sign-in link — Prime Scale Media",
    html: emailLayout({
      preheader: "Your one-time link to sign in to Prime Scale Media.",
      eyebrow: "Sign in",
      title: "Your sign-in link",
      lead: `Press the button to sign in as ${WHITE_B("{{ .Email }}")}. The link works once.`,
      cta: { label: "Sign me in", href: link("email") },
      footnoteHtml: "Did not ask for this? Ignore this email — nobody can sign in without the link.",
    }),
  },
  {
    file: "change-email.html",
    name: "Change email address",
    subject: "Confirm your new email address — Prime Scale Media",
    html: emailLayout({
      preheader: "Confirm the new email address for your Prime Scale Media account.",
      eyebrow: "Security",
      title: "Confirm your new address",
      lead: "You asked to change the email address of your account.",
      cta: { label: "Confirm new address", href: link("email_change") },
      bodyHtml: emailPanel("From → to", "{{ .Email }} &rarr; {{ .NewEmail }}"),
      footnoteHtml: "Did not ask for this? Ignore this email — your address stays as it is — and message us on WhatsApp.",
    }),
  },
  {
    file: "reset-password.html",
    name: "Reset password",
    subject: "Reset your password — Prime Scale Media",
    html: emailLayout({
      preheader: "Choose a new password for your Prime Scale Media account.",
      eyebrow: "Security",
      title: "Reset your password",
      lead: `Press the button to choose a new password for ${WHITE_B("{{ .Email }}")}.`,
      cta: { label: "Choose a new password", href: link("recovery", "/auth/update-password") },
      footnoteHtml: "Did not ask for this? Ignore this email — your password stays the same.",
    }),
  },
  {
    file: "reauthentication.html",
    name: "Reauthentication",
    subject: "Your verification code — Prime Scale Media",
    html: emailLayout({
      preheader: "Your Prime Scale Media verification code.",
      eyebrow: "Security",
      title: "Your verification code",
      lead: "Enter this code in the app to confirm it is you.",
      bodyHtml: emailPanel(
        "Code",
        '<span style="font-size:30px;letter-spacing:.32em;font-weight:800;">{{ .Token }}</span>',
      ),
      footnoteHtml: "Did not ask for this? Ignore this email and message us on WhatsApp.",
    }),
  },
];

const dir = "supabase/email-templates";
mkdirSync(dir, { recursive: true });
for (const t of templates) {
  writeFileSync(`${dir}/${t.file}`, t.html + "\n", "utf8");
}

const readme = [
  "# Supabase auth emails — paste these",
  "",
  "Generated by `scripts/email-templates.ts` from `lib/pure-email-layout.ts`,",
  "the same layout the app's own mails use. Do not edit the HTML here; change",
  "the script and run it again:",
  "",
  "```",
  "node --import ./tests/ts-resolve.mjs --experimental-strip-types scripts/email-templates.ts",
  "```",
  "",
  "## In Supabase",
  "",
  "1. **Authentication → Emails (Templates)**: for each template below, paste",
  "   the subject, and the file's whole content into *Message body* (Source).",
  "2. **Authentication → Emails → SMTP settings**: set **Sender name** to",
  "   `Prime Scale Media` (it says `PSM Dashboard` today).",
  "",
  "The links are `https://app.primescalemedia.com/auth/confirm?token_hash=...`,",
  "not `{{ .ConfirmationURL }}`: that one only works in the browser that filled",
  "in the form (PKCE), so a mail opened on a phone failed and left the new",
  "customer without a profile, a wallet or their referral.",
  "",
  "| template in Supabase | subject | file |",
  "|---|---|---|",
  ...templates.map((t) => `| ${t.name} | ${t.subject} | \`${t.file}\` |`),
  "",
].join("\n");
writeFileSync(`${dir}/README.md`, readme, "utf8");

console.log(`wrote ${templates.length} templates to ${dir}`);
