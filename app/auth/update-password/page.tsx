import Link from "next/link";
import { UpdatePasswordForm } from "@/components/update-password-form";
import { createClient } from "@/lib/supabase/server";

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
      <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
        <div className="w-full max-w-sm space-y-4 text-center">
          <h1 className="text-2xl font-semibold">That link has expired</h1>
          <p className="text-sm text-muted-foreground">
            Password links are good for a short while, and they only work
            in the browser that asked for one. Ask for a fresh link and
            open it on this device.
          </p>
          <Link className="underline underline-offset-4" href="/auth/forgot-password">
            Send me a new link
          </Link>
        </div>
      </div>
    );
  }

  // A recovery session carries amr entry "recovery"; a normal sign-in
  // does not. When we cannot tell, ask for the current password -- the
  // safe direction, because a genuine recovery user is the one case
  // that CANNOT supply it, and they arrive with the marker.
  const amr = (data.user as { amr?: { method?: string }[] }).amr ?? [];
  const cameFromRecovery = amr.some((m) => m?.method === "recovery");

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <UpdatePasswordForm
          requireCurrent={!cameFromRecovery}
          email={data.user.email ?? ""}
        />
      </div>
    </div>
  );
}
