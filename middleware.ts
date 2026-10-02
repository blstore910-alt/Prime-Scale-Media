import { updateSession } from "@/lib/supabase/update-session";
import { NextResponse, type NextRequest } from "next/server";
import { isViewAsPath, VIEW_AS_REFUSAL } from "@/lib/pure-view-as";

/**
 * Generate a random-ish request id. Not cryptographic — just needs to
 * be unique per request so we can correlate an entry in the client
 * error log with the server-side request handler.
 */
function newRequestId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function middleware(request: NextRequest) {
  // Honour a caller-supplied X-Request-Id (uptime probes may pass one).
  // Cap length to avoid log-injection.
  const inbound = request.headers.get("x-request-id");
  const requestId =
    inbound && inbound.length > 0 && inbound.length <= 64
      ? inbound.replace(/[^A-Za-z0-9._-]/g, "")
      : newRequestId();

  // ── VIEW AS CUSTOMER IS READ-ONLY, HERE TOO ─────────────────────
  // A server action POSTs to the page it was called from, so every write
  // made from /view-as/* arrives here as a POST under that path. The
  // browser already refuses to send them (lib/pure-view-as.ts); this is
  // the half that does not depend on the browser. Nothing under this
  // path is ever a legitimate POST.
  if (request.method !== "GET" && request.method !== "HEAD" && isViewAsPath(request.nextUrl.pathname)) {
    return NextResponse.json({ error: VIEW_AS_REFUSAL }, { status: 403, headers: { "X-Request-Id": requestId } });
  }

  const response = await updateSession(request);
  if (response instanceof NextResponse) {
    response.headers.set("X-Request-Id", requestId);
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest\\.webmanifest|sw\\.js|robots\\.txt|sitemap\\.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
