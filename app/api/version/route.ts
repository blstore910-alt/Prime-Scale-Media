import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-static";

/**
 * GET /api/version
 *
 * Returns the deploy identifier of THIS server instance. Static — the
 * value is baked into the build (from VERCEL_GIT_COMMIT_SHA / GIT_SHA
 * / package.json version).
 *
 * A client-side watcher polls this every minute; when the returned
 * `version` no longer matches what the client booted with, it shows a
 * subtle "app updated — refresh when done" prompt. Combined with the
 * IndexedDB form drafts, this prevents the "typing for 5 minutes then
 * getting a runtime error after a mid-session deploy" failure mode.
 */
export async function GET() {
  const version =
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.GIT_SHA ||
    process.env.NEXT_PUBLIC_APP_VERSION ||
    "dev";
  return NextResponse.json(
    {
      version: version.slice(0, 12),
      builtAt: process.env.VERCEL_GIT_COMMIT_AUTHOR_DATE || null,
    },
    { headers: { "Cache-Control": "public, max-age=60" } },
  );
}
