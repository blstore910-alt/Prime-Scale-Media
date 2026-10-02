import { NextResponse } from "next/server";
import { apiRequireOwner } from "@/lib/auth/api-require-admin";
import { createAdminClient } from "@/lib/supabase/server";
import { parseViewAsCode } from "@/lib/pure-view-as";
import { safeErrorMessage } from "@/lib/pure-error";

export const dynamic = "force-dynamic";

/**
 * POST /api/view-as/log  { code, view }
 *
 * One audit_events row per screen an owner opens while viewing a
 * customer (components/view-as/view-as-app.tsx). The page logs the
 * first screen itself; this logs every switch after it. Owners only,
 * and only for a customer in the owner's own tenant.
 */
export async function POST(req: Request) {
  const { profile, user, error: authError } = await apiRequireOwner();
  if (authError) return authError;

  const body = (await req.json().catch(() => null)) as { code?: unknown; view?: unknown } | null;
  const code = parseViewAsCode(typeof body?.code === "string" ? body.code : null);
  const view = typeof body?.view === "string" ? body.view.replace(/[^a-z0-9-]/gi, "").slice(0, 32) : "";
  if (!code || !view) return NextResponse.json({ error: "code and view required" }, { status: 400 });

  const admin = await createAdminClient();
  const { data: advRows } = await admin
    .from("advertisers")
    .select("id")
    .eq("tenant_id", profile!.tenant_id as string)
    .eq("tenant_client_code", code)
    .order("created_at", { ascending: true })
    .limit(1);
  const adv = (advRows ?? [])[0];
  if (!adv) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { error } = await admin.from("audit_events").insert({
    actor_user_id: user!.id,
    actor_profile_id: profile!.id,
    tenant_id: profile!.tenant_id,
    table_name: "view_as",
    action: "INSERT",
    row_id: adv.id,
    after_data: { event: "view", code, view },
  });
  if (error) {
    console.error("[view-as/log]", safeErrorMessage(error));
    return NextResponse.json({ error: "not logged" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
