import Link from "next/link";

/**
 * There was no not-found page at all.
 *
 * So every stale bookmark, mistyped path and broken internal link landed
 * on Next.js's own unstyled 404: no shell, no navigation, not even a link
 * back to /auth/login. A customer who got there was, as far as the screen
 * was concerned, finished.
 *
 * It is reachable today by a route this app links to itself — the
 * expired-invite card pointed at /organization/<id>, and there is no
 * [id] segment under app/organization — and by anything anyone has ever
 * bookmarked.
 *
 * Deliberately plain and dependency-free: a 404 renders outside the app
 * shell, so it must not assume a session, a tenant, a profile or any
 * provider. Colours come from the same CSS variables globals.css defines
 * for both themes, so it is readable in light and dark without a
 * provider mounted.
 */
export default function NotFound() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: "24px 16px",
        background: "var(--background, #ffffff)",
        color: "var(--foreground, #0b0d14)",
      }}
    >
      <div style={{ maxWidth: 420, width: "100%", textAlign: "center" }}>
        <p
          style={{
            fontSize: ".78rem",
            letterSpacing: ".14em",
            textTransform: "uppercase",
            opacity: 0.55,
            margin: "0 0 10px",
          }}
        >
          Prime Scale Media
        </p>
        <h1 style={{ fontSize: "1.45rem", margin: "0 0 10px", fontWeight: 650 }}>
          That page isn&apos;t here
        </h1>
        <p style={{ margin: "0 0 22px", opacity: 0.7, lineHeight: 1.5 }}>
          The link may be old, or the page may have moved. Nothing has gone
          wrong with your account.
        </p>
        <div
          style={{
            display: "flex",
            gap: 10,
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          {/* Both, because a 404 does not know whether there is a session:
              somebody signed in wants the dashboard, somebody signed out
              needs the door. Guessing wrong strands the other one. */}
          <Link
            href="/dashboard"
            style={{
              padding: "10px 18px",
              borderRadius: 10,
              background: "var(--foreground, #0b0d14)",
              color: "var(--background, #ffffff)",
              textDecoration: "none",
              fontWeight: 600,
              fontSize: ".92rem",
            }}
          >
            Go to your dashboard
          </Link>
          <Link
            href="/auth/login"
            style={{
              padding: "10px 18px",
              borderRadius: 10,
              border: "1px solid var(--border, rgba(0,0,0,.14))",
              textDecoration: "none",
              fontWeight: 600,
              fontSize: ".92rem",
              color: "inherit",
            }}
          >
            Sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
