// SeamX adapter.
//
// SeamX is our ad-account supplier. They approve/assign ad accounts,
// hold the source-of-truth balance for each one, and process
// topup/withdraw requests we push to them. Their API contract is
// still in flight — this file ships two implementations:
//
//   - mockSeamxAdapter (default when SEAMX_MODE is unset or "mock"):
//     returns a small canned dataset. Every write returns success
//     without touching anything remote. Safe to use in tests, staging,
//     and prod-preview.
//
//   - realSeamxAdapter (when SEAMX_MODE=live): calls the real HTTP
//     endpoints. NOT WIRED YET — throws a clear error until the API
//     contract is finalised. Swap the fetch bodies in when SeamX
//     hands us their spec.
//
// Callers always go through getSeamxAdapter(); they never import a
// specific implementation. That way we can flip the env var per
// tenant without redeploying the app.

import type {
  IntegrationResult,
  SeamxAdAccount,
  SeamxAdapter,
  SeamxTopupPushInput,
  SeamxTopupPushResult,
  SeamxWithdrawPushInput,
  SeamxWithdrawPushResult,
} from "./types";

const NOT_IMPLEMENTED =
  "SeamX live mode requested but the real adapter is not implemented yet.";

const mockSeamxAdapter: SeamxAdapter = {
  async listAdAccounts() {
    return {
      ok: true,
      data: [
        {
          external_id: "seamx-mock-001",
          bm_id: "8888888888",
          platform: "meta-ads",
          currency: "USD",
          balance_cents: 12500_00,
          status: "active",
          assigned_to: null,
          timezone: "Europe/Amsterdam",
          updated_at: "2026-08-30T09:00:00.000Z",
        },
        {
          external_id: "seamx-mock-002",
          bm_id: null,
          platform: "tiktok-ads",
          currency: "USD",
          balance_cents: 400_00,
          status: "paused",
          assigned_to: null,
          timezone: "Europe/Amsterdam",
          updated_at: "2026-08-30T09:00:00.000Z",
        },
      ],
    };
  },

  async getBalance(externalAdAccountId) {
    if (!externalAdAccountId) {
      return { ok: false, error: "external_id required" };
    }
    return { ok: true, data: { balance_cents: 12500_00, currency: "USD" } };
  },

  async pushTopup(input: SeamxTopupPushInput) {
    if (!input.idempotency_key) {
      return { ok: false, error: "idempotency_key required" };
    }
    return {
      ok: true,
      data: {
        external_topup_id: `mock-topup-${input.idempotency_key}`,
        status: "completed",
        balance_after_cents: 12500_00 + input.amount_cents,
      } satisfies SeamxTopupPushResult,
    };
  },

  async pushWithdraw(input: SeamxWithdrawPushInput) {
    if (!input.idempotency_key) {
      return { ok: false, error: "idempotency_key required" };
    }
    return {
      ok: true,
      data: {
        external_withdraw_id: `mock-withdraw-${input.idempotency_key}`,
        status: "queued",
        balance_after_cents: null,
      } satisfies SeamxWithdrawPushResult,
    };
  },
};

const realSeamxAdapter: SeamxAdapter = {
  async listAdAccounts(): Promise<IntegrationResult<SeamxAdAccount[]>> {
    return { ok: false, error: NOT_IMPLEMENTED, retryable: false };
  },
  async getBalance() {
    return { ok: false, error: NOT_IMPLEMENTED, retryable: false };
  },
  async pushTopup() {
    return { ok: false, error: NOT_IMPLEMENTED, retryable: false };
  },
  async pushWithdraw() {
    return { ok: false, error: NOT_IMPLEMENTED, retryable: false };
  },
};

export function getSeamxAdapter(): SeamxAdapter {
  const mode = (process.env.SEAMX_MODE ?? "mock").toLowerCase();
  return mode === "live" ? realSeamxAdapter : mockSeamxAdapter;
}

// Exported for direct use in tests that want the deterministic
// dataset without env-var juggling.
export { mockSeamxAdapter };
