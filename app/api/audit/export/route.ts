import { NextResponse } from "next/server";
import { exportAuditEventsCsv } from "@/actions/audit-actions";

// A refusal is not a bad request. Both of these mapped everything that
// was not the literal word "Forbidden" onto 400, and the guards in front
// of them return "Unauthorized" and "Account is inactive" as well -- so a
// deactivated admin's refusal arrived as "bad request" on the compliance
// export and on the wallet-drift tool, which is the one place somebody
// would look to find out WHY it refused.
function refusalStatus(message: string): number {
  const m = String(message ?? "").toLowerCase();
  if (m.includes("unauthorized") || m.includes("not signed in")) return 401;
  if (
    m.includes("forbidden") ||
    m.includes("inactive") ||
    m.includes("only the account owner")
  ) {
    return 403;
  }
  return 400;
}


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
  const rowId = url.searchParams.get("row") ?? undefined;

  const result = await exportAuditEventsCsv({
    fromIso: from,
    toIso: to,
    table,
    action,
    rowId,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: refusalStatus(result.error) },
    );
  }

  const stamp = new Date().toISOString().slice(0, 10);
  // ── SAY IT IF THE FILE IS SHORT ────────────────────────────────────
  //
  // The action computes a row count and a truncation flag and this route
  // dropped both on the floor. A compliance export that stops at a page
  // ceiling looks exactly like a complete one — same headers, same
  // shape, fewer rows — and the person who opens it has no way to tell.
  // Two response headers cost nothing, and the filename says it too, so
  // it survives being forwarded as an attachment.
  const truncated = result.data.truncated === true;
  // The byte-order mark, same as every client-side export. This is the
  // compliance file -- the one most likely to be opened in Excel on a
  // European Windows box and least likely to be opened again to check.
  const csvBody = result.data.csv.startsWith("﻿")
    ? result.data.csv
    : "﻿" + result.data.csv;
  return new NextResponse(csvBody, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="audit-${stamp}${
        truncated ? "-PARTIAL" : ""
      }.csv"`,
      "X-Export-Rows": String(result.data.count),
      "X-Export-Truncated": truncated ? "true" : "false",
      "Cache-Control": "no-store",
    },
  });
}
