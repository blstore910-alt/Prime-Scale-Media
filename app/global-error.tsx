"use client";

import { useEffect } from "react";

// The last-resort boundary: this one replaces the whole document, so it must
// carry its own <html>/<body> and cannot rely on any app CSS, fonts or
// components. Deliberately plain and self-contained — the one screen that has
// to render when everything else has failed.
//
// It no longer prints error.message at the user. In production that string is
// Next.js's own plumbing ("A digest property is included on this error
// instance…"), which tells a customer nothing and reads as broken software.
export default function GlobalError({
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
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          padding: "24px 20px",
          background: "#f4f6fc",
          fontFamily: "system-ui, -apple-system, sans-serif",
          color: "#12162a",
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
          <h1
            style={{
              fontSize: "1.25rem",
              fontWeight: 800,
              letterSpacing: "-.02em",
              margin: 0,
            }}
          >
            Prime Scale Media is temporarily unavailable
          </h1>
          <p
            style={{
              color: "#5c6577",
              fontSize: ".93rem",
              lineHeight: 1.55,
              margin: "8px 0 20px",
            }}
          >
            Something failed while loading the app. Your data and balances are
            unaffected. Try again, and if it keeps happening send us the
            reference below.
          </p>

          <button
            onClick={() => reset()}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              width: "100%",
              padding: "12px 16px",
              borderRadius: 12,
              border: 0,
              background: "linear-gradient(135deg,#5B8DFF,#8B5CF6)",
              color: "#fff",
              fontWeight: 700,
              fontSize: ".95rem",
              cursor: "pointer",
              fontFamily: "inherit",
              boxShadow: "0 12px 26px -12px rgba(91,141,255,.8)",
            }}
          >
            Try again
          </button>

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
      </body>
    </html>
  );
}
