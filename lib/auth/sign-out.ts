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
