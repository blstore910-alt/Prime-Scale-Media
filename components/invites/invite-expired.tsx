import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { switchToProfile } from "@/actions/profile-switch-actions";
import { ClockIcon, StatusBadge } from "@/components/auth/auth-bits";
import { whatsappUrl } from "@/lib/whatsapp";

// ── AN INVITATION THAT CANNOT BE USED, IN THE SHELL'S STYLE ─────────────
//
// It was a column of shadcn buttons on a blank page (the owner, 22-09:
// fix every screen like this). Same doors as before, minus two wrong
// ones: "Create New Organization" -- an invitee does not create a
// tenant, and for an anonymous one it 307'd to a login they have no
// account for -- and a mailto: that does nothing on most phones. Asking
// for a new link is WhatsApp, like every "message us" in the app.
export default async function InviteExpired({
  reason,
}: {
  /** What actually went wrong, when it is not expiry. */
  reason?: string;
} = {}) {
  const supabase = await createClient();
  const { data: profiles } = await supabase
    .from("user_profiles")
    .select("id, tenants(name, id)");
  // Only the ones we can actually offer. `tenants` is a left join, so a
  // profile whose tenant row is gone came back with null.
  type Row = { id: string; tenants: { name: string | null; id: string } | { name: string | null; id: string }[] | null };
  const organisations = ((profiles ?? []) as unknown as Row[])
    .map((p) => ({ id: p.id, tenant: Array.isArray(p.tenants) ? p.tenants[0] : p.tenants }))
    .filter((p) => !!p.tenant);

  return (
    <section className="card login-card signup-card status-card">
      <StatusBadge tone="warn">
        <ClockIcon />
      </StatusBadge>
      <h2>{reason ? "We couldn't open this invitation" : "This invitation can't be used"}</h2>
      <p className="lede" style={{ display: "block" }}>
        {reason ??
          "It may have expired, or it may already have been accepted. If you signed up before, log in — your account is already there."}
      </p>

      {organisations.length ? (
        <>
          {/* A profile SWITCH: the active profile is the profile_id
              cookie. The action re-checks the id against the session, so
              it can only ever select a profile they hold. */}
          <div className="orgs">
            {organisations.map((o) => (
              <form key={o.id} action={switchToProfile}>
                <input type="hidden" name="profile_id" value={o.id} />
                <button type="submit" className="orgbtn">
                  <span className="av">{(o.tenant?.name?.[0] ?? "O").toUpperCase()}</span>
                  <span className="nm">
                    <b>{o.tenant?.name ?? "Your organisation"}</b>
                    <small>Open your account here</small>
                  </span>
                  <span className="go">Open →</span>
                </button>
              </form>
            ))}
          </div>
        </>
      ) : (
        <Link className="btn" href="/auth/login">
          Log in
        </Link>
      )}

      <a
        className="btn ghost"
        href={whatsappUrl("Hi PSM, my invitation link does not work any more. Can you send me a new one?")}
        target="_blank"
        rel="noopener noreferrer"
      >
        Ask us for a new link on WhatsApp
      </a>
    </section>
  );
}
