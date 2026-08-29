#!/usr/bin/env node
/**
 * Pre-flight environment check.
 *
 * Verifies every env var the app needs at runtime is populated
 * before a build/deploy. Run it as part of your CI or a Vercel
 * "install" step:
 *
 *   node scripts/check-env.mjs
 *
 * Exits with code 1 on missing/empty vars and lists them all in one
 * pass (so you don't play whack-a-mole one var at a time).
 */

const REQUIRED = [
  {
    name: "NEXT_PUBLIC_SUPABASE_URL",
    hint: "https://<project>.supabase.co",
  },
  {
    name: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY",
    hint: "anon/publishable key from Supabase → Project Settings → API",
  },
  {
    name: "SUPABASE_SERVICE_ROLE_KEY",
    hint: "service role key from Supabase → Project Settings → API",
    server: true,
  },
  {
    name: "NEXT_PUBLIC_APP_URL",
    hint: "https://your-domain.com",
  },
  {
    name: "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
    hint: "web-push VAPID public key",
  },
  {
    name: "VAPID_PRIVATE_KEY",
    hint: "web-push VAPID private key",
    server: true,
  },
  {
    name: "VAPID_SUBJECT",
    hint: "mailto: address or https:// URL for VAPID subject",
    server: true,
  },
  {
    name: "PUSH_WEBHOOK_SECRET",
    hint: "shared secret between Supabase webhook and /api/push/notify",
    server: true,
  },
];

const OPTIONAL = [
  { name: "BREVO_SMTP_USER", hint: "if using Brevo for outbound mail" },
  { name: "BREVO_SMTP_PASS", hint: "" },
  { name: "FROM_EMAIL", hint: "outgoing mail sender" },
  { name: "RESEND_API_KEY", hint: "if using Resend for outbound mail" },
];

const missing = [];
const warnings = [];

for (const { name, hint, server } of REQUIRED) {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    missing.push({ name, hint, server });
  }
}

for (const { name, hint } of OPTIONAL) {
  if (!process.env[name]) warnings.push({ name, hint });
}

if (missing.length) {
  console.error("Missing required environment variables:\n");
  for (const { name, hint, server } of missing) {
    console.error(`  - ${name}${server ? " (server-only)" : ""}`);
    if (hint) console.error(`      ${hint}`);
  }
  console.error(
    "\nSet these in Vercel Project Settings → Environment Variables,\n" +
      "or in a local .env.local for development.\n",
  );
  process.exit(1);
}

if (warnings.length) {
  console.log("Optional vars not set (safe to skip if not used):");
  for (const { name, hint } of warnings) {
    console.log(`  - ${name}${hint ? ` — ${hint}` : ""}`);
  }
  console.log();
}

console.log("Environment check passed.");
