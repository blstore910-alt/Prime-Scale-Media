"use client";

import { createClient } from "@/lib/supabase/client";

/**
 * The one way to sign out.
 *
 * supabase.auth.signOut() alone is not a sign-out on this app: the
 * `profile_id` cookie is httpOnly, so the browser cannot clear it and it
 * survived into the next person's session on a shared machine. This clears
 * both, in that order — the cookie is worthless once the session is gone, so
 * losing the network call to /api/auth/sign-out can never leave someone
 * signed IN.
 *
 * Never throws: a sign-out that fails loudly and leaves you on the page is
 * worse than one that quietly got you most of the way there, and the caller
 * navigates away immediately after.
 */
export async function signOutCompletely() {
  // ── THE PUSH SUBSCRIPTION GOES FIRST ────────────────────────────────
  //
  // It has to happen while the session is still valid, because the
  // delete is scoped to the caller's own user_id.
  //
  // Without it the row survived sign-out and the next person on that
  // browser kept receiving the previous user's notifications — "Your
  // topup has been completed", and for an admin "Supplier balance is
  // low". It compounded too: the manager reads
  // pushManager.getSubscription(), saw the previous user's live
  // subscription, took the "already subscribed" branch and never offered
  // the prompt, so the new person was never registered either.
  //
  // Best-effort in every direction. A browser that refuses to unsubscribe
  // must not leave somebody stuck signed in.
  try {
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      // `ready` NEVER SETTLES when no worker is registered for this
      // scope — it does not reject either, so the catch below is no
      // help. /sw.js is registered by the push manager, which only
      // mounts inside the three app shells. On /complete-profile, which
      // is outside them, a newly invited advertiser pressing Log out got
      // a spinner that never stopped and stayed signed in. The idle
      // auto-logout hangs the same way if registration ever fails.
      //
      // Unsubscribing from push is best-effort; staying signed in is not.
      const registration = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
      ]);
      if (!registration) throw new Error("no service worker");
      const sub = await registration.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => {});
        await sub.unsubscribe().catch(() => {});
      }
    }
  } catch {
    // No service worker, no permission, offline. Carry on signing out.
  }
  try {
    // Per-browser, not per-user, and never cleared — so the next person
    // never saw the opt-in either.
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("push-notification-dismissed");
    }
  } catch {
    /* private mode, blocked storage */
  }
  // ── AND THE FORM DRAFTS ────────────────────────────────────────────
  //
  // hooks/use-form-draft writes to an IndexedDB database so a long form
  // survives a reload. Four forms use it, and one of them is company
  // onboarding — VAT number, company address, phone, official email. On
  // a shared machine that database outlived the session entirely:
  // nothing ever deleted it, and a draft is keyed by form, not by user.
  //
  // Deleting the whole database is right rather than clever: a draft is
  // a convenience, and the cost of losing one on sign-out is a form
  // retyped, against somebody else reading a company's tax details.
  try {
    if (typeof indexedDB !== "undefined") {
      indexedDB.deleteDatabase("psm-form-drafts");
    }
  } catch {
    /* blocked or unsupported; nothing else depends on it */
  }

  try {
    const supabase = createClient();
    await supabase.auth.signOut();
  } catch {
    // Already signed out, or offline. Still clear the cookie below.
  }
  try {
    await fetch("/api/auth/sign-out", { method: "POST", cache: "no-store" });
  } catch {
    // Offline. The session is already gone, which is the part that matters.
  }
}
