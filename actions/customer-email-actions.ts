"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { emailLayout, escapeHtml } from "@/lib/pure-email-layout";
import { safeErrorMessage } from "@/lib/pure-error";
import { sendEmail } from "@/lib/email-sender";
import { maintenanceGuard, resolveCapability } from "./_shared";

/**
 * OWNER, OR AN ADMIN THE OWNER TRUSTED WITH THIS ONE THING.
 *
 * Every call below used `resolveOwnerContext()`, which means "are you
 * THE owner". It now asks `resolveCapability("customers.email")`, which
 * means "are you an owner, or has an owner given you this".
 *
 * An owner still passes unconditionally -- `resolveCapability` calls
 * `resolveOwnerContext` first -- so nothing an owner could do
 * yesterday has changed. The only difference is that an admin can now
 * be handed this one area without being handed the rest.
 *
 * Default no: an admin with no grant is refused, exactly as before.
 * See lib/capabilities.ts.
 */

// ── CHANGING A CUSTOMER'S LOGIN ADDRESS ─────────────────────────────
//
// The owner, 27-09: "wat als klant toegang tot email verliest en ik wil
// hem helpen" — and then "email aanpassen moet mogelijk zijn voor super
// admin".
//
// Before this, nothing in the app could do it. The profile allowlist in
// admin-actions.ts is is_active / status / full_name, and there was no
// auth.admin.updateUserById anywhere in the repo. The only route was the
// Supabase dashboard, by hand, in two places, with no line in
// audit_events — and nobody but the owner has that login.
//
// WHY BOTH HALVES, ALWAYS TOGETHER
//
// `auth.users.email` is the login and the address "forgot password"
// sends to. `user_profiles.email` is what the app prints. Changing only
// the profile — which is what "make the email field editable" would have
// meant — moves the label and not the login: the customer still cannot
// get in, still gets their reset mail at an address they have lost, and
// the two records now disagree without anything saying so. So this
// writes auth FIRST and the profile second, and reports it plainly if
// the second half fails.
//
// email_confirm: true, deliberately. The whole reason this exists is a
// customer who cannot read mail at the old address; sending a
// confirmation link there would be the one thing that cannot work.
//
// WHAT THIS IS, SO IT IS GUARDED LIKE IT
//
// This is an account-takeover primitive. Whoever can set a login address
// can take any account by setting it to their own and pressing "forgot
// password". So:
//   - owner only (resolveOwnerContext), never an employee admin
//   - never another admin's account, the same line updateUserProfile draws
//   - tenant re-checked server-side against the re-fetched row
//   - MAINTENANCE_MODE freezes it like every other write
//   - the OLD address is told, best effort. If the change was not asked
//     for, the person who owned the account finds out from us.
// The profile write is caught by the _audit_row_change trigger on
// user_profiles, so the change is reconstructable.

type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// Deliberately plain. A full RFC check belongs nowhere near a login
// field: Supabase is the authority on what it will accept, and this only
// catches the typo that would otherwise lock somebody out.
function looksLikeEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
}

export async function changeCustomerEmail(
  profileId: string,
  newEmail: string,
): Promise<ActionResult<{ email: string; oldEmail: string | null }>> {
  const mm = maintenanceGuard();
  if (!mm.ok) return { ok: false, error: mm.error };

  if (typeof profileId !== "string" || profileId.length === 0) {
    return { ok: false, error: "Invalid input" };
  }
  const email = String(newEmail ?? "").trim().toLowerCase();
  if (!looksLikeEmail(email)) {
    return { ok: false, error: "That does not look like an email address." };
  }

  const caller = await resolveCapability("customers.email");
  if (!caller.ok) return { ok: false, error: caller.error };
  const { supabase, profile } = caller.ctx;

  // ---- THE TARGET, RE-FETCHED, NEVER TAKEN FROM THE CALLER --------
  const { data: target, error: fetchError } = await supabase
    .from("user_profiles")
    .select("id, user_id, tenant_id, role, email, full_name")
    .eq("id", profileId)
    .maybeSingle();
  if (fetchError) return { ok: false, error: safeErrorMessage(fetchError) };
  if (!target) return { ok: false, error: "User not found" };

  const row = target as {
    id: string;
    user_id: string | null;
    tenant_id: string | null;
    role: string | null;
    email: string | null;
    full_name: string | null;
  };

  if (row.tenant_id !== profile.tenant_id) {
    return { ok: false, error: "Forbidden" };
  }
  if (row.role === "admin") {
    return {
      ok: false,
      error:
        "An admin's own login is not changed from here — they change it themselves.",
    };
  }
  if (!row.user_id) {
    return {
      ok: false,
      error: "This profile has no login attached, so there is nothing to change.",
    };
  }
  if ((row.email ?? "").trim().toLowerCase() === email) {
    return { ok: false, error: "That is already their address." };
  }

  const admin = await createAdminClient();

  // ---- IS IT FREE? ------------------------------------------------
  //
  // Asked before the write, because Supabase's own refusal on a taken
  // address is a 422 whose message is not something to put on a screen.
  // This is a check, not a lock: two owners racing on the same address
  // is not a case worth a transaction, and the auth write refuses anyway.
  const { data: clash } = await admin
    .from("user_profiles")
    .select("id")
    .ilike("email", email)
    .neq("id", row.id)
    .limit(1);
  if ((clash ?? []).length > 0) {
    return {
      ok: false,
      error: "Another account here already uses that address.",
    };
  }

  // ---- THE LOGIN FIRST --------------------------------------------
  const { error: authError } = await admin.auth.admin.updateUserById(
    row.user_id,
    { email, email_confirm: true },
  );
  if (authError) {
    return { ok: false, error: safeErrorMessage(authError) };
  }

  // ---- THEN THE PROFILE -------------------------------------------
  //
  // If this half fails the login has already moved, so it must not be
  // reported as a failure — the customer CAN get in now. It is reported
  // as a half-done job with the one thing left to do, which is the
  // honest description of that state.
  const { error: profileError } = await admin
    .from("user_profiles")
    .update({ email })
    .eq("id", row.id);
  if (profileError) {
    return {
      ok: false,
      error:
        "The login was changed and they can sign in with the new address, but our own record still shows the old one. Tell us — it needs putting right by hand.",
    };
  }

  // ---- AND TELL THE OLD ADDRESS -----------------------------------
  //
  // Best effort, and never a reason to fail: the change has happened.
  // But an address swap that nobody asked for has to reach the person it
  // was taken from, and the old mailbox is the only place they might
  // still be reading.
  const oldEmail = (row.email ?? "").trim();
  if (oldEmail && looksLikeEmail(oldEmail)) {
    try {
      const who = escapeHtml(row.full_name || "there");
      const to = escapeHtml(email);
      await sendEmail({
        to: oldEmail,
        subject: "The email address on your account has changed",
        text: [
          `Hi ${row.full_name || "there"},`,
          ``,
          `The email address on your Prime Scale Media account has been changed to ${email}.`,
          ``,
          `If you asked us to do this, nothing else is needed — sign in with the new address from now on.`,
          ``,
          `If you did NOT ask for this, reply to this message immediately.`,
        ].join("\n"),
        html: emailLayout({
          preheader: "The email address on your account has changed.",
          eyebrow: "Your account",
          title: "Your email address has changed",
          lead: `Hi ${who}, the address on your account is now <strong>${to}</strong>. Sign in with that from now on.`,
          footnoteHtml:
            "If you did not ask for this, reply to this message immediately.",
        }),
      });
    } catch (e) {
      console.error("changeCustomerEmail: notice", safeErrorMessage(e));
    }
  }

  return { ok: true, data: { email, oldEmail: row.email ?? null } };
}
