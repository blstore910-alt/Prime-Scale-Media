import { NextResponse } from "next/server";
import { reconstructWalletBalanceFromAudit } from "@/actions/wallet-recovery-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/wallet-recovery?wallet=<uuid>
 *
 * Super-admin recovery tool. Reconstructs a wallet's completed
 * top-up amounts from audit_events and reports the delta vs the
 * live wallets.usd_balance / eur_balance.
 *
 * READ-ONLY. Never writes to the wallets row. Operator decides
 * whether to reconcile via a manual RPC (wallet_admin_adjust).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const walletId = url.searchParams.get("wallet");
  if (!walletId) {
    return NextResponse.json(
      { error: "wallet query param required" },
      { status: 400 },
    );
  }

  const result = await reconstructWalletBalanceFromAudit(walletId);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.error.includes("Forbidden") ? 403 : 400 },
    );
  }
  return NextResponse.json(result.data, {
    headers: { "Cache-Control": "no-store" },
  });
}
