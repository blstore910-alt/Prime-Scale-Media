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

const STALE_RELOAD_KEY = "psm-login-stale-reload";

export function LoginForm() {
  // Set just before the one automatic reload below, read once here.
  const [email, setEmail] = useState(() => {
    if (typeof window === "undefined") return "";
    try {
      return sessionStorage.getItem(STALE_RELOAD_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [wasReloaded] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      if (sessionStorage.getItem(STALE_RELOAD_KEY) !== null) return true;
    } catch {
      // blocked storage — the window.name marker still answers
    }
    return window.name === STALE_RELOAD_KEY;
  });
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  // "Email not confirmed" is a state with a way out, not just an error:
  // the confirmation mail can be sent again from right here.
  const [resend, setResend] = useState<"idle" | "sending" | "sent">("idle");
  const notConfirmed = !!error && /email not confirmed/i.test(error);
  const resendConfirmation = async () => {
    if (!email.trim()) return;
    setResend("sending");
    try {
      const supabase = createClient();
      const { error: resendError } = await supabase.auth.resend({
        type: "signup",
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
      });
      if (resendError) throw resendError;
      setResend("sent");
    } catch (e) {
      setResend("idle");
      setError(
        e instanceof Error && /seconds|rate/i.test(e.message)
          ? "Just sent one — wait a minute before asking again."
          : "We couldn't send it again just now. Try again in a minute.",
      );
    }
  };
  const [isPending, startTransition] = useTransition();
  const searchParams = useSearchParams();
  const reason = searchParams?.get("reason");
  // Captured once, on first render. The ?reason= is then stripped from the
  // URL below, so the notice survives this visit but NOT a refresh — it
  // explains why you landed here, and after you have read it once the page
  // should just be the login page again. Leaving it in the URL meant it
  // reappeared on every reload, and stayed in any bookmark or shared link.
  const [reasonMessage] = useState<string | null>(() =>
    reason ? REDIRECT_REASONS[reason] ?? null : null,
  );

  useEffect(() => {
    if (!reason) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("reason");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }, [reason]);

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

    // Fire the rocket-launch animation on the auth shell. It plays while
    // the sign-in request is in flight and up to the redirect; on failure
    // we reset it so the rocket returns and the error shows.
    const shell =
      typeof document !== "undefined"
        ? document.querySelector(".psmauth")
        : null;
    shell?.setAttribute("data-launching", "1");

    const formData = new FormData();
    formData.append("email", email);
    formData.append("password", password);

    startTransition(async () => {
      try {
        const result = await loginUser(formData);
        if (result?.error) {
          shell?.removeAttribute("data-launching");
          setError(result.error);
          return;
        }
        if (result?.redirectTo) {
          // Let the launch animation play out, then HARD-navigate. A full-page
          // load re-runs the auth middleware with the freshly-set cookie
          // guaranteed present, so the protected /dashboard request is
          // authenticated. A soft router.push could render a prefetched,
          // still-unauthenticated redirect and bounce the user back to
          // /auth/login — the magic-link path below uses the same hard nav.
          // Signed in: the stale-build marker has done its job. Left
          // behind, the next genuine failure in this tab would skip its
          // one reload.
          try {
            sessionStorage.removeItem(STALE_RELOAD_KEY);
          } catch {
            // Nothing to clean up in a window that has no storage.
          }
          if (window.name === STALE_RELOAD_KEY) window.name = "";
          const dest = result.redirectTo;
          // The launch animation used to be WAITED for — a flat 1000ms added
          // to every sign-in before the browser was even asked for the next
          // page. It does not need to be: location.assign() leaves the
          // current document on screen, still animating, until the new one
          // paints, so the rocket plays THROUGH the load instead of before
          // it. The short delay that remains only lets the data-launching
          // attribute take effect so the transition actually starts.
          setTimeout(() => window.location.assign(dest), 120);
          return;
        }
        // Neither error nor redirect (shouldn't happen) — recover the UI so the
        // rocket-launch fade never strands the user on a blank screen.
        shell?.removeAttribute("data-launching");
        setError("Something went wrong. Please try again.");
      } catch {
        // Network drop / 500 / action-transport failure: always restore the
        // form (the launch CSS fades it to opacity:0) and show a retryable
        // error instead of a dead, faded screen.
        shell?.removeAttribute("data-launching");

        // ── ALMOST ALWAYS A STALE BUILD, NOT A NETWORK PROBLEM ─────────
        //
        // loginUser is a server action, and a server action's id changes
        // with every deployment. A tab that has been sitting on the login
        // screen — which is exactly what the 30-minute idle sign-out
        // leaves behind — still holds the id from the build it loaded
        // with. Post it to a newer deployment and it is simply not there,
        // the action transport throws, and we land here.
        //
        // "Please try again" is the one thing that cannot work: pressing
        // the same dead button harder. The cure is a reload, which the
        // customer has to guess at. So do it for them, once, and keep
        // their email so only the password has to be typed again.
        // ── ONCE. THIS USED TO MEAN NEVER-ENDING ──────────────────────
        //
        // The mount initialiser above REMOVED this key on every render,
        // so the read here was always null and the reload fired on every
        // failure: Supabase down, a 500, no network — press Sign in, the
        // page reloads, nothing is said, press again, reload again. The
        // setError line below was unreachable, which is why the owner
        // saw a login that only worked "pas na refresh" and never an
        // explanation.
        //
        // The key now survives the reload and is cleared only on a
        // successful sign-in, so the second failure says what happened.
        // And the READ is inside the try: blocked storage threw here,
        // inside a catch block, so neither the reload nor the error ran.
        // ── THE MARKER HAS TO SURVIVE THE RELOAD ─────────────────────
        //
        // A React ref cannot: window.location.reload() destroys the
        // document, so the ref is false again on the next mount and the
        // "one attempt" it was supposed to enforce is one attempt per
        // press, for ever. Where sessionStorage throws — Safari private
        // mode, blocked site data, a privacy extension — that was the
        // ONLY guard, so the loop came straight back and setError below
        // stayed unreachable.
        //
        // window.name does survive a same-document reload, needs no
        // permission, and is cleared on a successful sign-in with the
        // storage key. Belt and braces: either one being set is enough
        // to stop the second reload.
        const marked = () => {
          try {
            if (sessionStorage.getItem(STALE_RELOAD_KEY) !== null) return true;
          } catch {
            // fall through to the window.name marker
          }
          return window.name === STALE_RELOAD_KEY;
        };

        if (typeof window !== "undefined" && !marked()) {
          try {
            sessionStorage.setItem(STALE_RELOAD_KEY, email);
          } catch {
            // Private window, storage blocked. The marker below is what
            // actually stops the loop; the email is a convenience.
          }
          window.name = STALE_RELOAD_KEY;
          window.location.reload();
          return;
        }
        setError(
          "We couldn't sign you in. Check your connection and try again — if this keeps happening, the service may be down.",
        );
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
      {wasReloaded && !reasonMessage && (
        <div className="note">
          We updated the page to the latest version. Your email is still
          there — enter your password and sign in.
        </div>
      )}

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

        {error && (
          <p className="err">
            {notConfirmed
              ? "Your email is not confirmed yet. Open the link in the email we sent you — or get a fresh one:"
              : error}
          </p>
        )}
        {notConfirmed ? (
          <button
            type="button"
            className="btn ghost"
            onClick={resendConfirmation}
            disabled={resend !== "idle"}
            style={{ marginBottom: 8 }}
          >
            {resend === "sending"
              ? "Sending…"
              : resend === "sent"
                ? "Sent — check your inbox (and spam)"
                : "Send the confirmation email again"}
          </button>
        ) : null}

        <button className="btn" type="submit" disabled={isPending}>
          {isPending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </section>
  );
}
