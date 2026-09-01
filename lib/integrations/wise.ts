// Wise adapter.
//
// Used to auto-verify incoming bank transfers against pending
// wallet_topups: on a schedule (or webhook, when Wise supports one
// on the target plan) we pull incoming transfers, match by reference
// + amount to pending wallet_topups, and auto-mark them completed —
// no more manual verify click per payment.
//
// Two implementations, same swap pattern as supplier1.ts:
//   - mockWiseAdapter (default): canned incoming payments useful for
//     E2E tests of the matcher.
//   - realWiseAdapter (WISE_MODE=live): NOT WIRED YET. Waiting on
//     Wise API credentials on the user's account.

import type {
  IntegrationResult,
  WiseAdapter,
  WiseTransfer,
} from "./types";

const NOT_IMPLEMENTED =
  "Wise live mode requested but the real adapter is not implemented yet.";

const mockWiseAdapter: WiseAdapter = {
  async listIncomingSince(sinceIso: string) {
    if (!sinceIso) {
      return { ok: false, error: "sinceIso required" };
    }
    return {
      ok: true,
      data: [
        {
          external_id: "wise-mock-tx-001",
          amount_cents: 500_00,
          currency: "EUR",
          reference: "PSM-TOPUP-000123",
          sender_name: "Test Advertiser BV",
          received_at: "2026-08-30T08:15:00.000Z",
          status: "completed",
        },
      ] satisfies WiseTransfer[],
    };
  },
};

const realWiseAdapter: WiseAdapter = {
  async listIncomingSince(): Promise<IntegrationResult<WiseTransfer[]>> {
    return { ok: false, error: NOT_IMPLEMENTED, retryable: false };
  },
};

export function getWiseAdapter(): WiseAdapter {
  const mode = (process.env.WISE_MODE ?? "mock").toLowerCase();
  return mode === "live" ? realWiseAdapter : mockWiseAdapter;
}

export { mockWiseAdapter };
