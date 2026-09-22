"use server";

import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { maintenanceGuard } from "./_shared";

type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * An advertiser asking to join the affiliate program.
 *
 * WHY THIS EXISTS. The button used to do this:
 *
 *   window.location.href = `mailto:${SUPPORT_EMAIL}?subject=...`
 *
 * On a machine with no mail client registered — which is most machines,
 * and every phone where the customer uses webmail — assigning a mailto:
 * to location.href does NOTHING. No error, no tab, no dialog, no
 * console entry. The customer presses the one button on the card,
 * watches nothing happen, presses it again, and concludes the product is
 * broken. There is no way for them to tell that from a button that is
 * genuinely dead, because for them it IS a dead button.
 *
 * It is also the wrong shape even when it works: an application that
 * leaves as an email lands in an inbox with no record on the account,
 * nothing on the admin's queue, and nothing the customer can look at to
 * see they already asked.
 *
 * So it is a real request now. It notifies the tenant's owner — the
 * super-admin, who is the only person who can set the commission terms
 * this application is really about — in the queue they already watch,
 * and the answer comes back to the customer straight away.
 *
 * NO NEW TABLE. `notifications` already carries a type and a JSON
 * payload.
 *
 * ── AND IT STILL COULD NOT WRITE ────────────────────────────────────
 *
 * The first version of this did all of it from the customer's own
 * session, and RLS refused it twice over:
 *
 *   * `notifications` has RLS on with a select policy and an
 *     update-self policy and NO insert policy, so the insert came back
 *     42501; and
 *   * the recipient lookup reads `user_profiles`, whose select policy
 *     is self-or-tenant-admin. An advertiser matches neither, so it
 *     returned zero rows with NO error and the action answered "There's
 *     nobody available to review applications right now."
 *
 * Every advertiser, every time. A dead button replaced by a button that
 * always apologised.
 *
 * So the work is a SECURITY DEFINER function
 * (supabase/migrations/20260920130000_affiliate_application_rpc.sql),
 * which is the pattern the schema already uses for a fan-out
 * notification. It resolves the recipients and builds the payload
 * ITSELF, so this action cannot address a notification to anyone or put
 * anything of the caller's choosing in it.
 */
const APPLY_TYPE = "affiliate_application";

export async function applyForAffiliateProgram(): Promise<
  ActionResult<{ alreadySent: boolean }>
> {
  const mm = maintenanceGuard();
  if (!mm.ok) return { ok: false, error: mm.error };

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { ok: false, error: "Please sign in and try again." };
  }

  // Which of the caller's profiles they are acting as. The function
  // treats this as a CHOICE among the profiles that are already theirs —
  // it matches on auth.uid() regardless — so passing it cannot reach
  // somebody else's account.
  const cookieStore = await cookies();
  const chosen = cookieStore.get("profile_id")?.value ?? null;

  const { data, error } = await supabase.rpc("affiliate_application_submit", {
    p_profile_id: chosen,
  });

  if (error) {
    // A function the migration has not added yet answers PGRST202 /
    // "Could not find the function". Say that plainly instead of
    // "try again shortly", which sends the customer back to press a
    // button that cannot work yet.
    const message = String(error.message ?? "");
    if (/PGRST202|could not find the function|does not exist/i.test(message)) {
      return {
        ok: false,
        error:
          "Applications aren't switched on yet — message us and we'll set you up.",
      };
    }
    return {
      ok: false,
      error: "We couldn't send your application just now. Try again shortly.",
    };
  }

  const result = (Array.isArray(data) ? data[0] : data) as
    | { ok?: boolean; error?: string; already_sent?: boolean }
    | null;

  // A jsonb result and no error is still not a success. The function
  // answers {ok:false, error} for "you are already an affiliate" and for
  // "there is nobody to review this", and reporting those as sent is the
  // fake success this whole file exists to remove.
  if (!result || result.ok !== true) {
    return {
      ok: false,
      error:
        result?.error ??
        "We couldn't send your application just now. Try again shortly.",
    };
  }

  return { ok: true, data: { alreadySent: result.already_sent === true } };
}

/**
 * The owner's answer to an application (plak 42).
 *
 * The application used to be a notification and nothing else: the owner
 * had no button to answer it, and the applicant's own screen forgot they
 * had applied the moment they reloaded. It is a status on their
 * advertiser row now, and affiliate_application_decide is the only way
 * it moves -- owner-only in the database, not just here. Approving turns
 * on their link with the default rules; refusing needs a reason, which
 * they are told.
 */
export async function decideAffiliateApplication(
  advertiserId: string,
  approve: boolean,
  reason?: string | null,
): Promise<ActionResult> {
  const mm = maintenanceGuard();
  if (!mm.ok) return { ok: false, error: mm.error };
  if (typeof advertiserId !== "string" || advertiserId.length === 0) {
    return { ok: false, error: "Invalid input" };
  }
  const why = String(reason ?? "").trim();
  if (!approve && !why) {
    return { ok: false, error: "Say why, so they know." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("affiliate_application_decide", {
    p_advertiser_id: advertiserId,
    p_approve: approve,
    p_reason: approve ? null : why,
  });
  if (error) {
    if (/PGRST202|could not find the function/i.test(String(error.message ?? ""))) {
      return {
        ok: false,
        error: "Answering applications is not switched on in the database yet (plak 42).",
      };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true, data: null };
}
