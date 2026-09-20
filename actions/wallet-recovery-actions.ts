"use server";

import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import {
  replayBalance,
  type WalletTopupAuditEvent,
} from "@/lib/wallet-recovery-pure";
import { pageAllRows } from "@/lib/page-all-rows";

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
    .select("id, role, tenant_id, user_id, is_active, status")
    .eq("user_id", userData.user.id);
  if (!profiles?.length) return { ok: false as const, error: "Forbidden" };
  const profile = existingProfile
    ? profiles.find((p) => p.id === existingProfile) ?? profiles[0]
    : profiles[0];
  if (profile.role !== "admin" || !profile.tenant_id) {
    return { ok: false as const, error: "Forbidden" };
  }
  // Deactivated admin keeps role but loses access.
  if (profile.is_active === false || (profile.status ?? "active") === "inactive") {
    return { ok: false as const, error: "Account is inactive" };
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
  // ── 50,000 IS NOT A PAGE SIZE ─────────────────────────────────────
  //
  // .limit(50_000) does not raise PostgREST's ceiling: the response
  // still stops at the configured max (1,000 by default) with no error
  // and no marker. This figure is the drift an owner reads before
  // deciding whether to correct a balance BY HAND, so computing it from
  // a truncated event stream is the worst possible place for a silent
  // cap. pageAllRows walks it properly and says when it ran out.
  //
  // The tiebreaker matters here too: Postgres gives no defined order
  // among rows sharing an occurred_at, and these arrive in batches, so
  // a row on a page boundary could be counted twice or skipped -- in a
  // replay, either one moves the answer.
  const paged = await pageAllRows<WalletTopupAuditEvent>(
    (from: number, to: number) =>
      supabase
        .from("audit_events")
        .select("action, before_data, after_data")
        .eq("table_name", "wallet_topups")
        .eq("tenant_id", wallet.tenant_id!)
        .order("occurred_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
  );
  if (paged.error) return { ok: false, error: paged.error };
  if (paged.truncated) {
    return {
      ok: false,
      error:
        "There is more history than we can replay in one pass, so this figure would be a floor rather than a total. Do not correct a balance from it.",
    };
  }

  const { usd, eur, eventCount } = replayBalance(paged.rows, walletId);

  const currentUsd = Number(wallet.usd_balance ?? 0);
  const currentEur = Number(wallet.eur_balance ?? 0);

  return {
    ok: true,
    data: {
      walletId,
      fromAudit: { USD: usd, EUR: eur },
      currentBalance: { usd: currentUsd, eur: currentEur },
      diff: { usd: currentUsd - usd, eur: currentEur - eur },
      eventCount,
    },
  };
}
