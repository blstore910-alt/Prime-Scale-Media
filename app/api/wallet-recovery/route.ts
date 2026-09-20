import { NextResponse } from "next/server";
import { reconstructWalletBalanceFromAudit } from "@/actions/wallet-recovery-actions";

// A refusal is not a bad request. Both of these mapped everything that
// was not the literal word "Forbidden" onto 400, and the guards in front
// of them return "Unauthorized" and "Account is inactive" as well -- so a
// deactivated admin's refusal arrived as "bad request" on the compliance
// export and on the wallet-drift tool, which is the one place somebody
// would look to find out WHY it refused.
function refusalStatus(message: string): number {
  const m = String(message ?? "").toLowerCase();
  if (m.includes("unauthorized") || m.includes("not signed in")) return 401;
  if (
    m.includes("forbidden") ||
    m.includes("inactive") ||
    m.includes("only the account owner")
  ) {
    return 403;
  }
  return 400;
}


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
      { status: refusalStatus(result.error) },
    );
  }
  return NextResponse.json(result.data, {
    headers: { "Cache-Control": "no-store" },
  });
}
