import { NextResponse } from "next/server";
import { exportOwnData } from "@/actions/gdpr-actions";

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
export async function GET() {
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
