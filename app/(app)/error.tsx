"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RefreshCw, LogIn, AlertTriangle } from "lucide-react";

// The error screen is part of the product — for some people it is the only
// screen they will remember. The previous one printed Next.js's own text
// straight at the user ("A digest property is included on this error
// instance…"), which is developer plumbing, and offered no way back.
//
// The overwhelmingly common cause here is an expired session: the server
// layout cannot load the profile and throws, and the customer sees a crash
// instead of being asked to sign in again. So signing in is offered first.
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("AppLayout error:", error);
  }, [error]);

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: "24px 20px",
        background: "#f4f6fc",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div
        style={{
          width: "min(420px, 100%)",
          background: "#fff",
          border: "1px solid #e6e9f2",
          borderRadius: 20,
          boxShadow:
            "0 1px 2px rgba(20,30,80,.04), 0 24px 54px -28px rgba(20,30,80,.4)",
          padding: 28,
          textAlign: "center",
        }}
      >
        <span
          style={{
            width: 52,
            height: 52,
            borderRadius: 15,
            display: "grid",
            placeItems: "center",
            margin: "0 auto 16px",
            background: "#fdeecb",
            color: "#8a5a00",
          }}
        >
          <AlertTriangle style={{ width: 24, height: 24 }} />
        </span>

        <h1
          style={{
            fontSize: "1.25rem",
            fontWeight: 800,
            letterSpacing: "-.02em",
            color: "#12162a",
            margin: 0,
          }}
        >
          We couldn&apos;t load this page
        </h1>
        <p
          style={{
            color: "#5c6577",
            fontSize: ".93rem",
            lineHeight: 1.55,
            margin: "8px 0 20px",
          }}
        >
          This usually means your session expired while the page was open.
          Signing in again fixes it. Nothing you submitted has been lost.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          <Link
            href="/auth/login"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              padding: "12px 16px",
              borderRadius: 12,
              background: "linear-gradient(135deg,#5B8DFF,#8B5CF6)",
              color: "#fff",
              fontWeight: 700,
              textDecoration: "none",
              boxShadow: "0 12px 26px -12px rgba(91,141,255,.8)",
            }}
          >
            <LogIn style={{ width: 17, height: 17 }} /> Sign in again
          </Link>
          <button
            onClick={() => reset()}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              padding: "11px 16px",
              borderRadius: 12,
              border: "1px solid #d8ddec",
              background: "#fff",
              color: "#12162a",
              fontWeight: 700,
              fontSize: ".92rem",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            <RefreshCw style={{ width: 16, height: 16 }} /> Try again
          </button>
        </div>

        {/* Kept, but as a support reference rather than an explanation — the
            digest is what lets us find this exact failure in the logs. */}
        {error.digest && (
          <p
            style={{
              marginTop: 18,
              fontSize: ".72rem",
              color: "#8b93a6",
              fontFamily: "ui-monospace, Menlo, monospace",
            }}
          >
            Reference {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
