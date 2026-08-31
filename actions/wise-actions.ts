"use server";

import { createClient } from "@/lib/supabase/server";
import { safeErrorMessage } from "@/lib/pure-error";
import { maintenanceGuard } from "./_shared";

type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// Admin confirms a Wise deposit the matcher suggested — completes the
// suggested topup. Used during the safe-start phase where nothing
// auto-completes.
export async function confirmWiseSuggestion(
  transferId: string,
): Promise<ActionResult> {
  const mm = maintenanceGuard();
  if (!mm.ok) return mm;
  if (typeof transferId !== "string" || !transferId) {
    return { ok: false, error: "Invalid input" };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("wise_confirm_suggestion", {
    p_transfer_id: transferId,
  });
  if (error) return { ok: false, error: safeErrorMessage(error) };
  return { ok: true, data: null };
}
