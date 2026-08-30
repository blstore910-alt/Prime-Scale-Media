import { NextResponse } from "next/server";
import { exportAuditEventsCsv } from "@/actions/audit-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/audit/export?from=YYYY-MM-DD&to=YYYY-MM-DD&table=&action=
 *
 * Super-admin download of audit_events as a CSV attachment. See the
 * server action for the full auth model (tenant owner_id must match
 * caller's user_id).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (!from || !to) {
    return NextResponse.json(
      { error: "from and to query params required (YYYY-MM-DD)" },
      { status: 400 },
    );
  }
  const table = url.searchParams.get("table") ?? undefined;
  const action = url.searchParams.get("action") ?? undefined;

  const result = await exportAuditEventsCsv({
    fromIso: from,
    toIso: to,
    table,
    action,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.error.includes("Forbidden") ? 403 : 400 },
    );
  }

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(result.data.csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="audit-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
