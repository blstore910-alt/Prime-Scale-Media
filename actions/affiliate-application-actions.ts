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
 * payload, and a migration for one column would sit unapplied for days
 * while this stayed broken — CLAUDE.md is explicit that code reaches
 * production in minutes and migrations do not.
 */
const APPLY_TYPE = "affiliate_application";

/** How long one application holds before they can send another. */
const COOLDOWN_DAYS = 7;

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
  const uid = userData.user.id;

  // The caller's own profile, chosen the same way every other action
  // chooses it — a person can hold more than one.
  const cookieStore = await cookies();
  const chosen = cookieStore.get("profile_id")?.value;
  const { data: profiles } = await supabase
    .from("user_profiles")
    .select("id, role, tenant_id, user_id, full_name, email, is_active, status")
    .eq("user_id", uid);
  if (!profiles?.length) {
    return { ok: false, error: "We couldn't find your account." };
  }
  const profile =
    (chosen ? profiles.find((p) => p.id === chosen) : undefined) ?? profiles[0];

  if (!profile.tenant_id) {
    return { ok: false, error: "We couldn't find your account." };
  }
  if (
    profile.is_active === false ||
    (profile.status ?? "active") === "inactive"
  ) {
    return { ok: false, error: "This account is inactive." };
  }

  const { data: advertiser } = await supabase
    .from("advertisers")
    .select("id, tenant_client_code")
    .eq("user_id", uid)
    .eq("tenant_id", profile.tenant_id)
    .limit(1)
    .maybeSingle();

  // Already one of ours. Saying so is better than filing a request that
  // an admin then has to work out is redundant.
  if (advertiser?.id) {
    const { data: link } = await supabase
      .from("referral_links")
      .select("id")
      .eq("affiliate_advertiser_id", advertiser.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (link?.id) {
      return {
        ok: false,
        error: "You're already on the affiliate program.",
      };
    }
  }

  // One application per COOLDOWN_DAYS. Not a rate limit against abuse —
  // a guard against the customer pressing twice because the first press
  // gave them nothing, which is the exact habit the old button taught.
  const since = new Date(
    Date.now() - COOLDOWN_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { data: recent } = await supabase
    .from("notifications")
    .select("id")
    .eq("tenant_id", profile.tenant_id)
    .eq("type", APPLY_TYPE)
    .contains("payload", { applicant_profile_id: profile.id })
    .gte("created_at", since)
    .limit(1);
  if (recent?.length) {
    return { ok: true, data: { alreadySent: true } };
  }

  // ── THE OWNER, NOT EVERY ADMIN ──────────────────────────────────────
  //
  // Commission terms are the owner's decision: the dialog that sets them
  // is super-admin-only and the server gates it the same way. Sending
  // this to every admin would put a request in front of people who
  // cannot answer it, and the one person who can would see it as one
  // notification among theirs rather than as something addressed to
  // them.
  //
  // The super-admin IS the tenant-owning admin — see lib/permissions.ts
  // and the owner_id check inside change_subscription_amount.
  const { data: tenant } = await supabase
    .from("tenants")
    .select("owner_id")
    .eq("id", profile.tenant_id)
    .maybeSingle();

  let recipients: string[] = [];
  if (tenant?.owner_id) {
    const { data: owner } = await supabase
      .from("user_profiles")
      .select("user_id, is_active, status")
      .eq("tenant_id", profile.tenant_id)
      .eq("user_id", tenant.owner_id)
      .limit(1)
      .maybeSingle();
    if (
      owner?.user_id &&
      owner.is_active !== false &&
      (owner.status ?? "active") !== "inactive"
    ) {
      recipients = [owner.user_id as string];
    }
  }

  // Fall back to the active admins if the owner cannot be resolved or has
  // been switched off. A request nobody receives is the failure this
  // whole change exists to stop, so it must not depend on one row being
  // right.
  if (recipients.length === 0) {
    const { data: admins } = await supabase
      .from("user_profiles")
      .select("user_id, is_active, status")
      .eq("tenant_id", profile.tenant_id)
      .eq("role", "admin");
    recipients = (admins ?? [])
      .filter(
        (a) =>
          a.is_active !== false &&
          (a.status ?? "active") !== "inactive" &&
          a.user_id,
      )
      .map((a) => a.user_id as string);
  }

  if (recipients.length === 0) {
    return {
      ok: false,
      error:
        "There's nobody available to review applications right now. Please contact us directly.",
    };
  }

  const payload = {
    applicant_profile_id: profile.id,
    applicant_name: profile.full_name ?? profile.email ?? "An advertiser",
    applicant_email: profile.email ?? null,
    advertiser_id: advertiser?.id ?? null,
    client_code: advertiser?.tenant_client_code ?? null,
  };

  const { error: insertError } = await supabase.from("notifications").insert(
    recipients.map((rid) => ({
      recipient_user_id: rid,
      tenant_id: profile.tenant_id,
      type: APPLY_TYPE,
      payload,
      is_read: false,
    })),
  );
  if (insertError) {
    return {
      ok: false,
      error: "We couldn't send your application just now. Try again shortly.",
    };
  }

  return { ok: true, data: { alreadySent: false } };
}
