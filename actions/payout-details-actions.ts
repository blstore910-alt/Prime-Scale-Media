"use server";

import { createClient } from "@/lib/supabase/server";
import { safeErrorMessage } from "@/lib/pure-error";
import { maintenanceGuard, type ActionResult } from "./_shared";
import type { PayoutDetails } from "./payout-actions";

// ─────────────────────────────────────────────────────────────────────
// Where a payout actually goes, kept instead of retyped
// ─────────────────────────────────────────────────────────────────────
// The owner, 23-09: "haal die whatsapp button weg bij settings, hij moet
// gewoon hier kunnen opslaan als standaard voor new requests."
//
// The Settings card held six fields — an IBAN among them — in plain
// useState, and its only button opened WhatsApp with the typed text in
// it. Nothing was stored. A reload threw it all away, and the payout
// dialog under Wallet then asked for the same six again.
//
// So: one place it lives, `advertisers.payout_details`, and the dialog
// prefills from it. Self-service, so this is a server action with an
// OWNER check — the rule in CLAUDE.md for a customer editing their own
// row. The check is `user_id = auth.uid()` on the row itself, not a role
// test: an admin has no business writing somebody's bank details here.
//
// A trigger (plak 78) makes the same rule true in the database, so this
// is the door and not the lock.
// ─────────────────────────────────────────────────────────────────────

/** Only the fields the form asks for, trimmed, and nothing else the
 *  caller happens to send. */
function clean(input: PayoutDetails): PayoutDetails {
  const keys: (keyof PayoutDetails)[] = [
    "holder",
    "accountType",
    "taxId",
    "address",
    "iban",
    "bic",
    "bankName",
    "accountNumber",
    "routing",
    "note",
  ];
  const out: PayoutDetails = {};
  for (const k of keys) {
    const v = input?.[k];
    if (typeof v === "string" && v.trim()) out[k] = v.trim().slice(0, 300);
  }
  return out;
}

export async function saveMyPayoutDetails(
  input: PayoutDetails,
): Promise<ActionResult<{ saved: number }>> {
  const mm = maintenanceGuard();
  if (!mm.ok) return { ok: false, error: mm.error };

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return { ok: false, error: "Sign in first" };

  const details = clean(input ?? {});

  // The owner check IS the where-clause: only their own row can match.
  const { data, error } = await supabase
    .from("advertisers")
    .update({ payout_details: details })
    .eq("user_id", userData.user.id)
    .select("id");

  if (error) {
    // ── THE COLUMN MAY NOT BE THERE YET ──────────────────────────────
    //
    // Code reaches production in minutes and plak 78 is pasted by hand,
    // so the two are never in step. Say what is true rather than
    // throwing PostgREST's sentence at somebody's bank details.
    if (/payout_details/i.test(String(error.message))) {
      return {
        ok: false,
        error:
          "Saving your payout details isn't switched on yet — tell us and we'll finish it. Nothing you typed is lost; the payout dialog still asks for them.",
      };
    }
    return { ok: false, error: safeErrorMessage(error) };
  }

  // Zero rows is not success: it means no row matched, which for a
  // where-clause of "your own id" means the account is not finished.
  const saved = (data ?? []).length;
  if (saved === 0) {
    return {
      ok: false,
      error:
        "Your account isn't linked to a customer record yet, so there is nowhere to keep these. Ask us to finish it.",
    };
  }
  return { ok: true, data: { saved } };
}
