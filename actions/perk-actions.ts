"use server";

import { safeErrorMessage } from "@/lib/pure-error";
import { type ActionResult, resolveAdminContext } from "./_shared";
import type { PerkKind } from "@/lib/types/perk";

const VALID_KINDS: PerkKind[] = [
  "free_ad_account_requests",
  "subscription_waiver",
  "subscription_discount",
  "topup_fee_waiver",
  "topup_discount",
];

export type GrantPerkInput = {
  advertiser_id: string;
  kind: PerkKind;
  amount?: number | null;
  remaining?: number | null;
  expires_at?: string | null;
  note?: string | null;
};

// Grant a perk. Admin authority + tenant scope are enforced inside the
// grant_advertiser_perk RPC; this action adds the maintenance guard.
export async function grantPerk(
  input: GrantPerkInput,
): Promise<ActionResult<{ id: string }>> {
  // resolveAdminContext, not maintenanceGuard alone. These actions used to
  // go straight to the RPC and lean on its own `role = 'admin'` check — and
  // NO money RPC in the schema tests is_active or status alongside the role.
  // So a deactivated admin kept every power they had, which is precisely the
  // thing deactivating them is meant to remove.
  const auth = await resolveAdminContext();
  if (!auth.ok) return { ok: false, error: auth.error };

  if (typeof input.advertiser_id !== "string" || !input.advertiser_id) {
    return { ok: false, error: "advertiser_id required", code: "invalid" };
  }
  if (!VALID_KINDS.includes(input.kind)) {
    return { ok: false, error: "Unknown perk kind", code: "invalid" };
  }

  // The dialog already refuses a blank or out-of-range discount, but the
  // dialog is not the boundary — this action is, and the RPC under it takes
  // p_amount as a bare numeric with no check at all. A NULL amount inserts a
  // perk that reads as a live discount and is worth nothing; a 500 inserts
  // one that subtracts 500 percentage points from a 2% fee. Both report
  // "Perk granted."
  const isDiscount =
    input.kind === "subscription_discount" || input.kind === "topup_discount";
  if (isDiscount) {
    const amount = Number(input.amount);
    if (input.amount == null || !Number.isFinite(amount) || amount <= 0) {
      return {
        ok: false,
        error: "A discount needs a percentage above 0.",
        code: "invalid",
      };
    }
    if (amount > 100) {
      return {
        ok: false,
        error: "A discount cannot exceed 100%.",
        code: "invalid",
      };
    }
  }

  const { supabase } = auth.ctx;
  const { data, error } = await supabase.rpc("grant_advertiser_perk", {
    p_advertiser_id: input.advertiser_id,
    p_kind: input.kind,
    p_amount: input.amount ?? null,
    p_remaining: input.remaining ?? null,
    p_expires_at: input.expires_at ?? null,
    p_note: input.note ?? null,
  });
  if (error) {
    console.error("grantPerk failed:", safeErrorMessage(error));
    return { ok: false, error: error.message };
  }
  return { ok: true, data: { id: (data as { id: string }).id } };
}

export async function revokePerk(perkId: string): Promise<ActionResult> {
  // resolveAdminContext, not maintenanceGuard alone. These actions used to
  // go straight to the RPC and lean on its own `role = 'admin'` check — and
  // NO money RPC in the schema tests is_active or status alongside the role.
  // So a deactivated admin kept every power they had, which is precisely the
  // thing deactivating them is meant to remove.
  const auth = await resolveAdminContext();
  if (!auth.ok) return { ok: false, error: auth.error };
  if (typeof perkId !== "string" || !perkId) {
    return { ok: false, error: "Invalid input", code: "invalid" };
  }

  const { supabase } = auth.ctx;
  const { error } = await supabase.rpc("revoke_advertiser_perk", {
    p_perk_id: perkId,
  });
  if (error) {
    console.error("revokePerk failed:", safeErrorMessage(error));
    return { ok: false, error: error.message };
  }
  return { ok: true, data: null };
}
