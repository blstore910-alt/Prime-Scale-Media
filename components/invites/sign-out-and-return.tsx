"use client";

import { useState } from "react";
import { signOutCompletely } from "@/lib/auth/sign-out";

/**
 * "Sign out" on the wrong-address invite card, doing the two things the
 * card promises.
 *
 * ──────────────────────────────────────────────────────────────────────
 * WHAT IT REPLACED, AND WHY THAT WAS A TRAP
 *
 * A plain `<form action="/api/auth/sign-out" method="post">`. Two faults,
 * and the second is the one that mattered:
 *
 *  1. A form POST NAVIGATES to the route and renders its answer, so the
 *     person pressing the button the card told them to press landed on a
 *     blank page reading `{"ok":true}`. Same fault as the invoice View
 *     button opening a JSON error in a new tab.
 *
 *  2. That route only clears the httpOnly `profile_id` cookie. It does
 *     NOT touch the Supabase session — `lib/auth/sign-out.ts` exists
 *     precisely because both halves are needed. So the button did not
 *     sign anybody out. Open the invite link again and the same card
 *     comes back, for ever.
 *
 * This is the first screen a new customer sees when they open their
 * invite on a machine where somebody else is signed in — a shared
 * computer, an agency, a colleague's laptop. There was no way out of it
 * except knowing to clear cookies by hand.
 *
 * Afterwards it returns to the invite link rather than to the login
 * page, because continuing is the whole point: signed out, the same URL
 * renders the signup form.
 *
 * `window.location.assign`, not a router push: the session just changed
 * underneath the router, and a full load is the only thing that
 * guarantees the server sees the new (absent) cookies.
 * ──────────────────────────────────────────────────────────────────────
 */
export default function SignOutAndReturn({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      // The auth shell's own button (it only renders inside that shell).
      className="btn"
      onClick={async () => {
        if (busy) return;
        setBusy(true);
        // signOutCompletely never throws — it is best-effort in every
        // direction on purpose, so there is nothing to catch here.
        await signOutCompletely();
        window.location.assign(
          `/invite/accept?token=${encodeURIComponent(token)}`,
        );
      }}
    >
      {busy ? "Signing out…" : "Sign out and continue"}
    </button>
  );
}
