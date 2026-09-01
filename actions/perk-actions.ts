"use server";

import { createClient } from "@/lib/supabase/server";
import { safeErrorMessage } from "@/lib/pure-error";
import { maintenanceGuard, type ActionResult } from "./_shared";
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
  const mm = maintenanceGuard();
  if (!mm.ok) return { ok: false, error: mm.error };

  if (typeof input.advertiser_id !== "string" || !input.advertiser_id) {
    return { ok: false, error: "advertiser_id required", code: "invalid" };
  }
  if (!VALID_KINDS.includes(input.kind)) {
    return { ok: false, error: "Unknown perk kind", code: "invalid" };
  }

  const supabase = await createClient();
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
  const mm = maintenanceGuard();
  if (!mm.ok) return { ok: false, error: mm.error };
  if (typeof perkId !== "string" || !perkId) {
    return { ok: false, error: "Invalid input", code: "invalid" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_advertiser_perk", {
    p_perk_id: perkId,
  });
  if (error) {
    console.error("revokePerk failed:", safeErrorMessage(error));
    return { ok: false, error: error.message };
  }
  return { ok: true, data: null };
}
