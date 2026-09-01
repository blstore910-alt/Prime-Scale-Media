// Supplier 1 adapter.
//
// Supplier 1 is our ad-account supplier. They approve/assign ad accounts,
// hold the source-of-truth balance for each one, and process
// topup/withdraw requests we push to them. Their API contract is
// still in flight — this file ships two implementations:
//
//   - mockSupplier1Adapter (default when SUPPLIER1_MODE is unset or "mock"):
//     returns a small canned dataset. Every write returns success
//     without touching anything remote. Safe to use in tests, staging,
//     and prod-preview.
//
//   - realSupplier1Adapter (when SUPPLIER1_MODE=live): calls the real HTTP
//     endpoints. NOT WIRED YET — throws a clear error until the API
//     contract is finalised. Swap the fetch bodies in when Supplier 1
//     hands us their spec.
//
// Callers always go through getSupplier1Adapter(); they never import a
// specific implementation. That way we can flip the env var per
// tenant without redeploying the app.

import type {
  IntegrationResult,
  Supplier1AdAccount,
  Supplier1Adapter,
  Supplier1TopupPushInput,
  Supplier1TopupPushResult,
  Supplier1WithdrawPushInput,
  Supplier1WithdrawPushResult,
} from "./types";

const NOT_IMPLEMENTED =
  "Supplier 1 live mode requested but the real adapter is not implemented yet.";

const mockSupplier1Adapter: Supplier1Adapter = {
  async listAdAccounts() {
    return {
      ok: true,
      data: [
        {
          external_id: "supplier1-mock-001",
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
          external_id: "supplier1-mock-002",
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

  async pushTopup(input: Supplier1TopupPushInput) {
    if (!input.idempotency_key) {
      return { ok: false, error: "idempotency_key required" };
    }
    return {
      ok: true,
      data: {
        external_topup_id: `mock-topup-${input.idempotency_key}`,
        status: "completed",
        balance_after_cents: 12500_00 + input.amount_cents,
      } satisfies Supplier1TopupPushResult,
    };
  },

  async pushWithdraw(input: Supplier1WithdrawPushInput) {
    if (!input.idempotency_key) {
      return { ok: false, error: "idempotency_key required" };
    }
    return {
      ok: true,
      data: {
        external_withdraw_id: `mock-withdraw-${input.idempotency_key}`,
        status: "queued",
        balance_after_cents: null,
      } satisfies Supplier1WithdrawPushResult,
    };
  },
};

const realSupplier1Adapter: Supplier1Adapter = {
  async listAdAccounts(): Promise<IntegrationResult<Supplier1AdAccount[]>> {
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

export function getSupplier1Adapter(): Supplier1Adapter {
  const mode = (process.env.SUPPLIER1_MODE ?? "mock").toLowerCase();
  return mode === "live" ? realSupplier1Adapter : mockSupplier1Adapter;
}

// Exported for direct use in tests that want the deterministic
// dataset without env-var juggling.
export { mockSupplier1Adapter };
