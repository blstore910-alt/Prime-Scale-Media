"use server";

import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";

type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string };

async function requireSuperAdminCtx() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false as const, error: "Unauthorized" };

  const cookieStore = await cookies();
  const existingProfile = cookieStore.get("profile_id")?.value;
  const { data: profiles } = await supabase
    .from("user_profiles")
    .select("id, role, tenant_id, user_id")
    .eq("user_id", userData.user.id);
  if (!profiles?.length) return { ok: false as const, error: "Forbidden" };
  const profile = existingProfile
    ? profiles.find((p) => p.id === existingProfile) ?? profiles[0]
    : profiles[0];
  if (profile.role !== "admin" || !profile.tenant_id) {
    return { ok: false as const, error: "Forbidden" };
  }
  const { data: tenant } = await supabase
    .from("tenants")
    .select("owner_id")
    .eq("id", profile.tenant_id)
    .maybeSingle();
  if (!tenant || tenant.owner_id !== profile.user_id) {
    return { ok: false as const, error: "Forbidden (super-admin only)" };
  }
  return { ok: true as const, supabase, profile };
}

/**
 * reconstructWalletBalanceFromAudit
 *
 * Super-admin recovery tool. Reads every wallet_topups audit event
 * for the given wallet and sums the completed amounts by currency
 * — the value the balance SHOULD be if no external drift happened.
 *
 * Does NOT write anything. This is a "here's what the numbers say"
 * report the operator uses to decide whether to manually reconcile.
 *
 * See docs/BACKUP_AND_RECOVERY.md incident playbook.
 */
export async function reconstructWalletBalanceFromAudit(
  walletId: string,
): Promise<
  ActionResult<{
    walletId: string;
    fromAudit: { USD: number; EUR: number };
    currentBalance: { usd: number; eur: number };
    diff: { usd: number; eur: number };
    eventCount: number;
  }>
> {
  if (typeof walletId !== "string" || walletId.length === 0) {
    return { ok: false, error: "Invalid input" };
  }
  const ctx = await requireSuperAdminCtx();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const { supabase, profile } = ctx;

  // Verify the wallet is in caller's tenant
  const { data: wallet, error: walletError } = await supabase
    .from("wallets")
    .select("id, tenant_id, usd_balance, eur_balance")
    .eq("id", walletId)
    .maybeSingle();
  if (walletError || !wallet) {
    return { ok: false, error: "Wallet not found" };
  }
  if (wallet.tenant_id !== profile.tenant_id) {
    return { ok: false, error: "Forbidden" };
  }

  // Pull every wallet_topups event for topups whose wallet_id
  // matches. We look at the after_data JSON for the completed
  // amount + currency at the moment of the transition.
  const { data: events, error: eventsError } = await supabase
    .from("audit_events")
    .select("action, before_data, after_data")
    .eq("table_name", "wallet_topups")
    .eq("tenant_id", wallet.tenant_id)
    .order("occurred_at", { ascending: true })
    .limit(50_000);

  if (eventsError) return { ok: false, error: eventsError.message };

  let usd = 0;
  let eur = 0;
  let count = 0;
  for (const ev of events ?? []) {
    const before = ev.before_data as Record<string, unknown> | null;
    const after = ev.after_data as Record<string, unknown> | null;
    if (!after && !before) continue;
    const walletMatch =
      (after?.wallet_id ?? before?.wallet_id) === walletId;
    if (!walletMatch) continue;
    count += 1;

    const wasCompleted = before?.status === "completed";
    const isCompleted = after?.status === "completed";
    // pending → completed  = +amount (with amount from after)
    // completed → pending  = -amount (with amount from before)
    // completed → rejected = -amount (undo/reject)
    if (!wasCompleted && isCompleted) {
      const amt = Number(after?.amount ?? 0);
      const cur = String(after?.currency ?? "");
      if (cur === "USD") usd += amt;
      else if (cur === "EUR") eur += amt;
    } else if (wasCompleted && !isCompleted) {
      const amt = Number(before?.amount ?? 0);
      const cur = String(before?.currency ?? "");
      if (cur === "USD") usd -= amt;
      else if (cur === "EUR") eur -= amt;
    }
  }

  const currentUsd = Number(wallet.usd_balance ?? 0);
  const currentEur = Number(wallet.eur_balance ?? 0);

  return {
    ok: true,
    data: {
      walletId,
      fromAudit: { USD: usd, EUR: eur },
      currentBalance: { usd: currentUsd, eur: currentEur },
      diff: { usd: currentUsd - usd, eur: currentEur - eur },
      eventCount: count,
    },
  };
}
