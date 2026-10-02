import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { createAdminClient } from "@/lib/supabase/server";
import { parseViewAsCode } from "@/lib/pure-view-as";
import { safeErrorMessage } from "@/lib/pure-error";
import ViewAsApp from "@/components/view-as/view-as-app";
import type { UserProfile } from "@/lib/types/user";
import type { User } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// ── VIEW AS CUSTOMER ──────────────────────────────────────────────
//
// De eigenaar, 02-10: "hoe kan ik de acc viewen als een advertiser ...
// zonder hun wachtwoord". An OWNER, in their own session, sees exactly
// the screens customer PSM00xx sees -- read-only.
//
//   * owners only: requireSuperAdmin (both owners, tenant_owners);
//   * the customer must be in the owner's own tenant;
//   * every open is a row in audit_events (table_name 'view_as'), and if
//     that row cannot be written the page is NOT shown -- "every view is
//     logged" is a promise, not a best effort;
//   * nothing can be written: lib/pure-view-as.ts in the browser and
//     middleware.ts on the server.
//
// Outside the (app) group on purpose: that layout wraps an owner in the
// ADMIN shell, and this page has to look like the customer's app.

const PROFILE_SELECT =
  "*, tenant:tenants(*), advertiser:advertisers(id, user_id, tenant_id, profile_id, tenant_client_code, startup_fee, fee_status, airtable, created_at, updated_at)";

export default async function ViewAsPage({ params }: { params: Promise<{ code: string }> }) {
  const { user: owner, profile: ownerProfile } = await requireSuperAdmin("/dashboard?denied=owner");
  const { code: raw } = await params;
  const code = parseViewAsCode(raw);
  if (!code) return <Refused text="That is not a client code (PSM followed by digits)." />;

  const admin = await createAdminClient();
  const tenantId = (ownerProfile as { tenant_id?: string | null }).tenant_id ?? null;

  const { data: advRows, error: advError } = await admin
    .from("advertisers")
    .select("id, profile_id, tenant_id, tenant_client_code")
    .eq("tenant_id", tenantId as string)
    .eq("tenant_client_code", code)
    .order("created_at", { ascending: true })
    .limit(1);
  if (advError) {
    console.error("[view-as] advertiser lookup:", safeErrorMessage(advError));
    return <Refused text="Could not look that customer up. Try again." />;
  }
  const adv = (advRows ?? [])[0];
  if (!adv?.profile_id) return <Refused text={`No customer ${code} in your organisation.`} />;

  const { data: target, error: profileError } = await admin
    .from("user_profiles")
    .select(PROFILE_SELECT)
    .eq("id", adv.profile_id)
    .maybeSingle();
  if (profileError || !target) {
    if (profileError) console.error("[view-as] profile lookup:", safeErrorMessage(profileError));
    return <Refused text={`Could not open ${code}.`} />;
  }

  // The log row FIRST. No row, no view.
  const { error: auditError } = await admin.from("audit_events").insert({
    actor_user_id: owner.id,
    actor_profile_id: (ownerProfile as { id?: string }).id ?? null,
    tenant_id: tenantId,
    table_name: "view_as",
    action: "INSERT",
    row_id: adv.id,
    after_data: { event: "open", code, view: "home" },
  });
  if (auditError) {
    console.error("[view-as] audit write:", safeErrorMessage(auditError));
    return <Refused text="Could not log this view, so it is not shown. Try again." />;
  }

  const t = target as unknown as UserProfile & { user_id?: string | null; email?: string | null; full_name?: string | null };
  // The customer app reads `user` for its id and email. It gets the
  // CUSTOMER's, never the owner's: their screens must show their address,
  // and nothing the owner presses may be keyed on the owner by accident.
  const asUser = { id: t.user_id ?? "", email: t.email ?? "" } as unknown as User;

  return <ViewAsApp profile={t} user={asUser} code={code} name={t.full_name ?? ""} />;
}

function Refused({ text }: { text: string }) {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <div style={{ maxWidth: 420, textAlign: "center" }}>
        <p style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>View as customer</p>
        <p style={{ color: "#555", marginBottom: 20 }}>{text}</p>
        <a href="/users" style={{ fontWeight: 700, color: "#3a6fff" }}>Back to advertisers</a>
      </div>
    </main>
  );
}
