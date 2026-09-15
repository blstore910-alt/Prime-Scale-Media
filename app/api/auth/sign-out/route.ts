import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/sign-out
 *
 * Clears the httpOnly `profile_id` cookie.
 *
 * Every sign-out in the app called supabase.auth.signOut() from the browser.
 * That can drop the sb-* auth cookies, but `profile_id` is set httpOnly by
 * the invite-accept routes, so client JS cannot touch it — it survived the
 * sign-out and was still there when the NEXT person signed in on that
 * browser. The guards mostly tolerate a stale value (they fall back to the
 * caller's own first profile), but "mostly" is not a property you want on
 * the cookie that decides which profile someone is acting as.
 *
 * Takes no body and reads no input: it only ever deletes.
 */
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set("profile_id", "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return res;
}
