import Link from "next/link";
import { AlertIcon, StatusBadge } from "@/components/auth/auth-bits";
import { whatsappUrl } from "@/lib/whatsapp";

/**
 * Landing page for auth-flow failures. The `error` query param is
 * user-supplied (via redirects from /auth/confirm and friends), so
 * we sanitise before rendering — never trust it as raw HTML.
 */

// Allowed error slugs from our own redirects. Anything outside this
// list gets a generic "unspecified" message.
const KNOWN_ERRORS: Record<string, string> = {
  "Tenant slug mismatch":
    "The signup link points to a different organisation than the one your account was registered with.",
  "Referral code mismatch":
    "The signup link's referral code doesn't match what was recorded at signup.",
  "Missing tenant slug":
    "The signup link is missing organisation information. Ask for a fresh invite.",
  "Malformed request":
    "The signup link looks damaged. Ask for a fresh invite.",
  "Invalid session data":
    "Your session couldn't be verified. Try signing in again.",
  "No confirmation token provided":
    "The confirmation link is incomplete. Ask for a fresh invite or password-reset email.",
};

function safeMessage(raw: string | undefined): string {
  if (!raw) return "An unspecified error occurred.";
  // Strip characters that could carry markup or terminal escapes.
  const trimmed = raw.slice(0, 200).replace(/[<>&"'`\u0000-\u001f]/g, "");
  // THE ALLOWLIST THE HEADER PROMISES. This ended `?? trimmed`, so an
  // unknown string was echoed — and auth/confirm feeds this raw
  // PostgREST messages, on a page in publicRoutes. An anonymous signup
  // that trips a constraint rendered the constraint and column names.
  // No injection (the sanitiser strips markup), but schema disclosure,
  // and the file's own comment said this did not happen.
  const known = KNOWN_ERRORS[trimmed];
  if (known) return known;
  // Supabase's own words for a link that is used up, too old, or opened
  // in a different browser from the one that asked for it (PKCE). These
  // are the ones a real person hits; they get a sentence, not "unspecified".
  if (/expired|invalid or has expired|otp_expired/i.test(trimmed)) {
    return "This link has expired or was already used. Ask for a new one below.";
  }
  if (/code verifier|flow state|auth code/i.test(trimmed)) {
    return "This link was opened in a different browser from the one you signed up in. Open it there, or simply log in — your email is confirmed.";
  }
  return "An unspecified error occurred.";
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const message = safeMessage(params?.error);

  return (
    <section className="card login-card signup-card status-card">
      <StatusBadge tone="warn">
        <AlertIcon />
      </StatusBadge>
      <h2>That did not work</h2>
      <p className="lede" style={{ display: "block" }}>
        {message}
      </p>
      <Link className="btn" href="/auth/login">
        Back to sign in
      </Link>
      <Link className="btn ghost" href="/auth/forgot-password">
        Reset my password
      </Link>
      <p className="meta">
        Keeps happening?{" "}
        <a
          className="lnk"
          href={whatsappUrl("Hi PSM, I get an error when I try to sign in.")}
          target="_blank"
          rel="noopener noreferrer"
        >
          Message us on WhatsApp
        </a>
      </p>
    </section>
  );
}
