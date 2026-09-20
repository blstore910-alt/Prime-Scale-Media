"use server";

import { safeErrorMessage } from "@/lib/pure-error";
import { notifyAdvertiser } from "@/lib/notify-advertiser";
import { resolveAdminContext, type ActionResult } from "./_shared";

// ─────────────────────────────────────────────────────────────────────
// The money-in event that told the customer nothing
// ─────────────────────────────────────────────────────────────────────
// A customer wires money, an admin presses Approve, and the wallet is
// credited. The only feedback anywhere in the system was a toast on the
// ADMIN's screen. The customer's way of finding out that their transfer
// had landed was to open the app and compare a figure to what they
// remembered — and the same was true of a refusal, where they would
// also never learn the reason.
//
// The ad-account top-up has had `topup_completed` since it was written.
// The wallet, which is where the money actually arrives, had nothing.
//
// Best effort and deliberately AFTER the RPC, exactly like
// notifyTopupRejected: the money has already moved, and an action that
// reports failure after a successful verify is far worse than a
// customer who was not told. Both re-read the row first, so neither can
// announce something that did not happen.
// ─────────────────────────────────────────────────────────────────────

type Row = {
  id: string;
  tenant_id: string | null;
  advertiser_id: string | null;
  amount: number | string | null;
  currency: string | null;
  status: string | null;
};

async function readOwnRow(topupId: string) {
  const auth = await resolveAdminContext();
  if (!auth.ok) return { ok: false as const, error: auth.error };
  const { supabase, profile } = auth.ctx;

  const { data, error } = await supabase
    .from("wallet_topups")
    .select("id, tenant_id, advertiser_id, amount, currency, status")
    .eq("id", topupId)
    .maybeSingle();
  if (error) return { ok: false as const, error: safeErrorMessage(error) };
  if (!data) return { ok: false as const, error: "Top-up not found" };
  const row = data as Row;
  if (row.tenant_id !== profile.tenant_id) {
    return { ok: false as const, error: "Forbidden" };
  }
  return { ok: true as const, row, supabase, tenantId: profile.tenant_id };
}

export async function notifyWalletTopupVerified(
  topupId: string,
): Promise<ActionResult> {
  if (typeof topupId !== "string" || !topupId) {
    return { ok: false, error: "Invalid input" };
  }
  const found = await readOwnRow(topupId);
  if (!found.ok) return { ok: false, error: found.error };
  const { row, supabase, tenantId } = found;

  // The row is the proof. Anything other than completed and we say
  // nothing rather than telling a customer their money arrived.
  if (String(row.status ?? "").toLowerCase() !== "completed") {
    return { ok: true, data: null };
  }

  await notifyAdvertiser(supabase, {
    advertiserId: row.advertiser_id,
    tenantId,
    type: "wallet_topup_completed",
    payload: {
      wallet_topup_id: row.id,
      amount: row.amount ?? null,
      currency: row.currency ?? null,
    },
  });
  return { ok: true, data: null };
}

export async function notifyWalletTopupRejected(
  topupId: string,
  reason?: string,
): Promise<ActionResult> {
  if (typeof topupId !== "string" || !topupId) {
    return { ok: false, error: "Invalid input" };
  }
  const found = await readOwnRow(topupId);
  if (!found.ok) return { ok: false, error: found.error };
  const { row, supabase, tenantId } = found;

  const status = String(row.status ?? "").toLowerCase();
  if (status !== "rejected" && status !== "failed") {
    return { ok: true, data: null };
  }

  await notifyAdvertiser(supabase, {
    advertiserId: row.advertiser_id,
    tenantId,
    type: "wallet_topup_rejected",
    payload: {
      wallet_topup_id: row.id,
      amount: row.amount ?? null,
      currency: row.currency ?? null,
      reason:
        typeof reason === "string" && reason.trim()
          ? reason.trim().slice(0, 500)
          : null,
    },
  });
  return { ok: true, data: null };
}
