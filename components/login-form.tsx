"use client";

import { loginUser } from "@/actions/user-actions";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

const REDIRECT_REASONS: Record<string, string> = {
  idle: "You were signed out after 30 minutes of inactivity.",
  session: "Your session expired. Please sign in again.",
};

// Rocket mark from the approved mockup (onboarding-auth.html).
function Rocket() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
      <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
      <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
    </svg>
  );
}

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const searchParams = useSearchParams();
  const reason = searchParams?.get("reason");
  const reasonMessage = reason ? REDIRECT_REASONS[reason] : null;

  // Magic-link + email-confirm redirects land here with an
  // #access_token=… URL fragment. The @supabase/ssr browser client
  // detects and consumes that fragment when it's instantiated — but
  // only if the client is instantiated on the login page. This effect
  // handles it and hard-navigates once a session exists.
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !window.location.hash.includes("access_token")
    ) {
      return;
    }
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        window.history.replaceState(null, "", window.location.pathname);
        window.location.href = "/dashboard";
      }
    });
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.append("email", email);
    formData.append("password", password);

    startTransition(async () => {
      const result = await loginUser(formData);
      if (result?.error) {
        setError(result.error);
      }
    });
  };

  return (
    <section className="card login-card">
      <div className="lmk">
        <span className="mk">
          <Rocket />
        </span>
      </div>
      <h2>Sign in</h2>
      <p className="lede">Welcome back to Prime Scale Media.</p>

      {reasonMessage && <div className="note">{reasonMessage}</div>}

      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="email">Email</label>
          <div className="inp">
            <svg viewBox="0 0 24 24">
              <rect width="20" height="16" x="2" y="4" rx="2" />
              <path d="m22 7-10 5L2 7" />
            </svg>
            <input
              id="email"
              type="email"
              placeholder="you@company.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="password">Password</label>
          <div className="inp">
            <svg viewBox="0 0 24 24">
              <rect width="18" height="11" x="3" y="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <input
              id="password"
              type="password"
              placeholder="••••••••••••"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        </div>

        <div style={{ textAlign: "right", margin: "-2px 0 2px" }}>
          <Link className="lnk" href="/auth/forgot-password">
            Forgot password?
          </Link>
        </div>

        {error && <p className="err">{error}</p>}

        <button className="btn" type="submit" disabled={isPending}>
          {isPending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </section>
  );
}
