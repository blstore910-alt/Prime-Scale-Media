import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

// Per-request deduplication of the two calls every authenticated page makes.
//
// Measured on the live app: a route change spent ~700ms in the server render,
// ~475ms of which was waiting on Supabase — because the work ran TWICE. The
// (app) layout calls auth.getUser() and fetches the profile, and then the page
// underneath calls requireAdmin() which does exactly the same two calls again.
// Four sequential round trips for one navigation, each ~100-120ms.
//
// React's cache() memoises per render pass, so the layout and the page that
// renders inside it share one result. Two round trips instead of four, with no
// change to behaviour: the same queries, the same freshness — a render pass is
// a single point in time, so there is nothing to go stale within it.
//
// Not a cross-request cache. Every new navigation still revalidates the
// session from Supabase; nothing here weakens the auth check.

export const getSessionUser = cache(async () => {
  const supabase = await createClient();
  return supabase.auth.getUser();
});

// One shape for both callers. The layout needs the joins for AppProvider;
// requireAdmin only needs id/role/is_active/status, and reading four fields
// off a row that has already been fetched is free — whereas asking for a
// narrower row separately costs another round trip, which is the whole
// problem this exists to solve.
export const getSessionProfiles = cache(async (userId: string) => {
  const supabase = await createClient();
  return supabase
    .from("user_profiles")
    .select("*, tenant:tenants(*), advertiser:advertisers(*)")
    .eq("user_id", userId);
});
