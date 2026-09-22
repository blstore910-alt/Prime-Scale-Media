"use client";

import Link from "next/link";
import { useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { whatsappUrl } from "@/lib/whatsapp";
import { MailIcon, RocketMark, StatusBadge } from "@/components/auth/auth-bits";

// ── FORGOT PASSWORD, IN THE SHELL'S OWN VOCABULARY ──────────────────────
//
// The owner, 22-09: the white-card auth screens are ugly, "fix them all".
// This was the shadcn set on the dark shell. Same behaviour, same words
// where they were right; the screen now looks like the sign-in it sits
// one click away from.

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    try {
      // Back through /auth/confirm, which verifies the link and then sends
      // the person to /auth/update-password with a session. Straight to
      // update-password, nothing exchanged the code and the page said the
      // link had expired. (This URL must be allowed in Supabase's redirect
      // list; the token_hash template in supabase/email-templates does not
      // depend on it at all.)
      const redirect = new URL("/auth/confirm", window.location.origin);
      redirect.searchParams.set("type", "recovery");
      redirect.searchParams.set("next", "/auth/update-password");
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: redirect.toString(),
      });
      if (error) throw error;
      setSuccess(true);
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Something went wrong. Try again.");
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <section className="card login-card signup-card status-card">
        <StatusBadge tone="mail">
          <MailIcon />
        </StatusBadge>
        <h2>Check your inbox</h2>
        <p className="lede" style={{ display: "block" }}>
          If an account exists for this address, a link to choose a new password is on its way.
        </p>
        <div className="whoami">
          <MailIcon />
          <span className="t">
            <small>Sent to</small>
            <b title={email}>{email}</b>
          </span>
        </div>
        <p className="meta">
          Nothing after a few minutes? Check your spam folder, or{" "}
          <a
            className="lnk"
            href={whatsappUrl("Hi PSM, I asked for a password reset but did not get the email.")}
            target="_blank"
            rel="noopener noreferrer"
          >
            message us on WhatsApp
          </a>
          .
        </p>
        <p className="meta" style={{ marginTop: 4 }}>
          Remembered it?{" "}
          <Link className="lnk" href="/auth/login">
            Log in
          </Link>
        </p>
      </section>
    );
  }

  return (
    <section className="card login-card">
      <RocketMark />
      <h2>Reset your password</h2>
      <p className="lede">Type your email and we send you a link to choose a new one.</p>
      <form onSubmit={handleForgotPassword} noValidate>
        <div className="field">
          <label htmlFor="email">Email</label>
          <div className="inp">
            <MailIcon />
            <input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@company.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        </div>
        {error && <p className="err">{error}</p>}
        <button className="btn" type="submit" disabled={isLoading || !email.trim()}>
          {isLoading ? "Sending…" : "Send me a reset link"}
        </button>
      </form>
      <p className="meta">
        Remembered it?{" "}
        <Link className="lnk" href="/auth/login">
          Log in
        </Link>
      </p>
    </section>
  );
}
