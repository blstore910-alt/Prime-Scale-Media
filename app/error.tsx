"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * The boundary that was missing.
 *
 * app/(app)/error.tsx exists and says in its own comment that it is
 * there for the case where "the server layout cannot load the profile
 * and throws". It cannot catch that. In the App Router an error.tsx
 * never catches its SIBLING layout — so app/(app)/layout.tsx's throw
 * went straight past it to app/global-error.tsx, which replaces the
 * whole document with "Prime Scale Media is temporarily unavailable"
 * and offers a Try again that re-runs the same failing render. No
 * sign-in link, no shell, nothing.
 *
 * Everything outside the (app) group had the same problem for a
 * different reason: it has no boundary of its own at all. /invite/accept
 * throws when the token is missing, and that is a PUBLIC url — anybody
 * typing it got the white-out. /auth/sign-up throws on a bad token.
 * Those two are the first screens a new customer ever sees.
 *
 * This sits at the root segment, so it catches both: the (app) layout's
 * throw and every page outside it.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The digest is what ties this to the server log. The message is
    // not printed: a thrown PostgrestError carries details, hint and
    // sometimes a whole row, and this screen is reachable signed out.
    console.error("Unhandled error", error.digest ?? "");
  }, [error]);

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: "24px",
        background: "#f6f7fb",
        color: "#10142c",
        fontFamily:
          "var(--font-jakarta), system-ui, -apple-system, sans-serif",
      }}
    >
      <div
        style={{
          width: "min(26rem, 100%)",
          background: "#fff",
          border: "1px solid rgba(20,30,80,.10)",
          borderRadius: 18,
          padding: "26px 24px",
          boxShadow:
            "0 1px 2px -1px rgba(20,30,80,.2), 0 24px 48px -28px rgba(20,30,80,.5)",
        }}
      >
        <h1 style={{ margin: "0 0 8px", fontSize: "1.2rem", fontWeight: 800 }}>
          Something went wrong on our side
        </h1>
        <p
          style={{
            margin: "0 0 18px",
            fontSize: ".9rem",
            lineHeight: 1.55,
            color: "#5a6183",
          }}
        >
          Nothing you were doing has been lost. Try again, and if it keeps
          happening, sign in again — that fixes most of them.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            onClick={reset}
            style={{
              flex: "1 1 8rem",
              padding: "11px 16px",
              borderRadius: 11,
              border: 0,
              cursor: "pointer",
              fontWeight: 700,
              fontSize: ".88rem",
              color: "#fff",
              background: "linear-gradient(135deg,#3a6fff,#7c5cff)",
            }}
          >
            Try again
          </button>
          {/* The link global-error never offered. A failed profile read
              and an expired session look identical from here, and
              signing in again is what actually clears it. */}
          <Link
            href="/auth/login"
            style={{
              flex: "1 1 8rem",
              padding: "11px 16px",
              borderRadius: 11,
              textAlign: "center",
              textDecoration: "none",
              fontWeight: 700,
              fontSize: ".88rem",
              color: "#10142c",
              background: "#eef1f8",
            }}
          >
            Sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
