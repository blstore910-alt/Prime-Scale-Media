"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { safeErrorMessage } from "@/lib/pure-error";
import { whatsappUrl } from "@/lib/whatsapp";

// ── "CHECK YOUR INBOX", AS A SCREEN WORTH LANDING ON ────────────────────
//
// The owner, 22-09: "dit scherm ook erg lelijk". It was a shadcn card: a
// white box in the dark /auth shell, pushed under a full screen of brand
// hero on a phone, saying the same sentence twice and offering nothing to
// do. This one says WHERE the mail went, what to do with it, opens the
// mailbox for the big two, and can send it again -- the one thing people
// need when it has not arrived.
//
// The address comes from sessionStorage, written by the sign-up form a
// moment ago: never from the URL, where it would end up in logs.

const EMAIL_KEY = "psm_signup_email";
const REDIRECT_KEY = "psm_signup_redirect";
const RESEND_WAIT_S = 60;

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-10 5L2 7" />
    </svg>
  );
}

function webmailFor(email: string | null): { label: string; href: string } | null {
  const domain = (email ?? "").split("@")[1]?.toLowerCase() ?? "";
  if (domain === "gmail.com" || domain === "googlemail.com") {
    return { label: "Open Gmail", href: "https://mail.google.com/mail/u/0/#inbox" };
  }
  if (/^(outlook|hotmail|live|msn)\./.test(domain)) {
    return { label: "Open Outlook", href: "https://outlook.live.com/mail/0/inbox" };
  }
  return null;
}

export default function CheckInbox() {
  const [email, setEmail] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    try {
      setEmail(sessionStorage.getItem(EMAIL_KEY));
    } catch {
      // Private mode: the screen still works, just without the address.
    }
  }, []);

  // Supabase refuses a second send within a minute; say so on the button
  // instead of letting the press fail.
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const webmail = webmailFor(email);

  const resend = async () => {
    if (!email) return;
    setSending(true);
    try {
      let redirect: string | null = null;
      try {
        redirect = sessionStorage.getItem(REDIRECT_KEY);
      } catch {
        redirect = null;
      }
      const supabase = createClient();
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: redirect ?? `${window.location.origin}/auth/confirm` },
      });
      if (error) throw error;
      setWait(RESEND_WAIT_S);
      toast.success("Sent again", { description: "Give it a minute, and check your spam folder too." });
    } catch (e) {
      toast.error("We couldn't send it again just now", { description: safeErrorMessage(e) });
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="card login-card signup-card inbox-card">
      <div className="inbox" aria-hidden="true">
        <MailIcon />
        <span className="ping" />
      </div>
      <h2>Check your inbox</h2>
      <p className="lede">One click in the email and your account is ready.</p>

      {email ? (
        <div className="whoami">
          <MailIcon />
          <span className="t">
            <small>We sent a confirmation link to</small>
            <b title={email}>{email}</b>
          </span>
        </div>
      ) : null}

      <ol className="steps3">
        <li>
          <span className="n">1</span> Open the email from Prime Scale Media
        </li>
        <li>
          <span className="n">2</span> Press the confirmation link in it
        </li>
        <li>
          <span className="n">3</span> You land straight in your account
        </li>
      </ol>

      {webmail ? (
        <a className="btn" href={webmail.href} target="_blank" rel="noopener noreferrer">
          <MailIcon /> {webmail.label}
        </a>
      ) : null}
      {email ? (
        <button
          type="button"
          className={webmail ? "btn ghost" : "btn"}
          onClick={resend}
          disabled={sending || wait > 0}
        >
          {sending ? "Sending…" : wait > 0 ? `Sent — you can resend in ${wait}s` : "Send the email again"}
        </button>
      ) : null}

      <p className="meta">
        Nothing after a few minutes? Check your spam folder, or{" "}
        <a
          className="lnk"
          href={whatsappUrl("Hi PSM, I signed up but did not get the confirmation email.")}
          target="_blank"
          rel="noopener noreferrer"
        >
          message us on WhatsApp
        </a>
        .
      </p>
      <p className="meta" style={{ marginTop: 4 }}>
        Already confirmed?{" "}
        <Link className="lnk" href="/auth/login">
          Log in
        </Link>
      </p>
    </section>
  );
}
