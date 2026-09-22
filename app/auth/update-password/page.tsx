import Link from "next/link";
import { UpdatePasswordForm } from "@/components/update-password-form";
import { createClient } from "@/lib/supabase/server";
import { ClockIcon, StatusBadge } from "@/components/auth/auth-bits";

/**
 * ── THIS SCREEN HAD NO GUARD AT ALL ──────────────────────────────────
 *
 * It rendered unconditionally and the form called updateUser({password})
 * with no session check and no re-authentication. Two consequences:
 *
 *   * With no session -- an expired recovery link, or the link opened on
 *     a different device from the one that asked for it, where the PKCE
 *     verifier cookie does not exist -- Supabase threw "Auth session
 *     missing!" into a red line with no route forward. A dead end on the
 *     screen somebody reaches when they cannot get in.
 *
 *   * WITH a session -- an unlocked laptop, a shared machine -- anyone
 *     could change the password with no re-authentication at all. On a
 *     financial dashboard that is the whole account: the password is
 *     what "sign out of all devices" is supposed to protect.
 *
 * So: no session, say so and point at the way to get one. A session that
 * was NOT minted by a recovery link has to prove the current password
 * (the form asks; see requireCurrent).
 */
export default async function Page() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  if (!data?.user) {
    return (
      <section className="card login-card signup-card status-card">
        <StatusBadge tone="warn">
          <ClockIcon />
        </StatusBadge>
        <h2>That link has expired</h2>
        <p className="lede" style={{ display: "block" }}>
          Password links work for a short while, and only once. Ask for a
          fresh one and open it straight away.
        </p>
        <Link className="btn" href="/auth/forgot-password">
          Send me a new link
        </Link>
        <p className="meta">
          Remembered it?{" "}
          <Link className="lnk" href="/auth/login">
            Log in
          </Link>
        </p>
      </section>
    );
  }

  // A recovery session carries amr entry "recovery"; a normal sign-in
  // does not. When we cannot tell, ask for the current password -- the
  // safe direction, because a genuine recovery user is the one case
  // that CANNOT supply it, and they arrive with the marker.
  //
  // ── THE MARKER IS ON THE SESSION, NOT ON THE USER ─────────────────
  // This read `data.user.amr`, and a User object has no amr: it was
  // always empty, so EVERY visitor was asked for their current password
  // -- including the one person who came here because they forgot it.
  // Password reset was a dead end. The authentication methods of the
  // session come from getAuthenticatorAssuranceLevel, and a recovery
  // only counts for half an hour: an old recovery session on an unlocked
  // laptop is not a licence to change the password without it.
  let cameFromRecovery = false;
  try {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    const nowS = Date.now() / 1000;
    cameFromRecovery = (aal?.currentAuthenticationMethods ?? []).some(
      (m) => m.method === "recovery" && nowS - Number(m.timestamp) < 30 * 60,
    );
  } catch {
    cameFromRecovery = false;
  }

  return (
    <UpdatePasswordForm
      requireCurrent={!cameFromRecovery}
      email={data.user.email ?? ""}
    />
  );
}
