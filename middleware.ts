import { updateSession } from "@/lib/supabase/update-session";
import { NextResponse, type NextRequest } from "next/server";

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
