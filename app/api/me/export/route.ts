import { NextResponse } from "next/server";
import { exportOwnData } from "@/actions/gdpr-actions";
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
  const ip = callerIp(req);
  const allowed = await rateLimitCheck(LIMITS.gdprExport, `ip:${ip}`);
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
