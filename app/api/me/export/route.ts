import { NextResponse } from "next/server";
import { exportOwnData } from "@/actions/gdpr-actions";
import { createClient } from "@/lib/supabase/server";
import { callerIp, LIMITS, rateLimitCheck } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/me/export
 *
 * GDPR "right to data portability". Returns every row the caller is
 * the data subject of, as a downloadable JSON attachment.
 *
 * Filename embeds the timestamp so multiple exports don't collide in
 * the user's downloads folder.
 */
export async function GET(req: Request) {
  // ── KEYED ON THE PERSON, NOT THE BUILDING ─────────────────────────
  //
  // This was `ip:${ip}` at 10 per hour. Two customers behind one office
  // NAT — or one company's whole staff — shared a single budget, and the
  // eleventh art. 20 request in an hour came back "Too many export
  // requests" to somebody who had made none. Every comparable financial
  // action keys on the user (`user:${uid}`, withdrawal-actions.ts).
  // The IP stays as the fallback for a caller with no session, so an
  // unauthenticated flood is still capped.
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id ?? null;
  const bucket = uid ? `user:${uid}` : `ip:${callerIp(req)}`;
  const allowed = await rateLimitCheck(LIMITS.gdprExport, bucket);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many export requests. Try again later." },
      { status: 429 },
    );
  }

  const result = await exportOwnData();
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.error === "Unauthorized" ? 401 : 500 },
    );
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return new NextResponse(JSON.stringify(result.data, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="psm-export-${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
