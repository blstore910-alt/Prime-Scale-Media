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
  Supplier1Platform,
  Supplier1TopupPushInput,
  Supplier1TopupPushResult,
  Supplier1WithdrawPushInput,
  Supplier1WithdrawPushResult,
} from "./types";

const NOT_CONFIGURED =
  "Supplier 1 live mode is on but SUPPLIER1_BASE_URL / SUPPLIER1_AUTH_TOKEN are not set.";

// SeamX status vocab → our vocab.
function mapAccountStatus(s: string | null | undefined): Supplier1AdAccount["status"] {
  switch ((s ?? "").toLowerCase()) {
    case "accepted":
      return "active";
    case "pending":
      return "paused";
    default:
      return "suspended";
  }
}

function mapPlatform(p: string | null | undefined): Supplier1Platform {
  switch ((p ?? "").toLowerCase()) {
    case "tiktok":
      return "tiktok-ads";
    case "google":
      return "google-ads";
    case "meta":
    default:
      return "meta-ads";
  }
}

// SeamX topup/withdraw status → our queued/completed/failed.
function mapMovementStatus(
  s: string | null | undefined,
): "queued" | "completed" | "failed" {
  switch ((s ?? "").toLowerCase()) {
    case "approved":
    case "completed":
      return "completed";
    case "rejected":
    case "failed":
      return "failed";
    default:
      return "queued";
  }
}

// One place that adds the base URL + `authToken` header and normalises the
// result into an IntegrationResult. 4xx (except 429) is terminal; 5xx / network
// is retryable so the job worker backs off and tries again.
async function seamxFetch<T>(
  path: string,
  init?: RequestInit & { body?: string },
): Promise<IntegrationResult<T>> {
  const base = process.env.SUPPLIER1_BASE_URL?.replace(/\/+$/, "");
  const token = process.env.SUPPLIER1_AUTH_TOKEN;
  if (!base || !token) {
    return { ok: false, error: NOT_CONFIGURED, retryable: false };
  }
  try {
    // Only send Content-Type when we actually carry a body — some backends
    // 500 on an unexpected Content-Type for a bodyless GET.
    const hasBody = init?.body != null;
    const res = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        authToken: token,
        Accept: "application/json",
        ...(hasBody ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* non-JSON body — keep raw text for the error path */
    }
    if (!res.ok) {
      // Prefer a structured message; otherwise surface a snippet of the raw
      // body so a 500 says *why* instead of just the status code.
      const structured =
        (json as { error?: string; message?: string } | null)?.error ??
        (json as { message?: string } | null)?.message ??
        null;
      const snippet = text ? ` ${text.slice(0, 300)}` : "";
      const msg = structured ?? `SeamX ${res.status}:${snippet}`.trim();
      const retryable = res.status >= 500 || res.status === 429;
      return { ok: false, error: String(msg), retryable };
    }
    return { ok: true, data: json as T };
  } catch (err) {
    // Never reached the remote (DNS/timeout/network) — safe to retry.
    return {
      ok: false,
      error: err instanceof Error ? err.message : "SeamX request failed",
      retryable: true,
    };
  }
}

type SeamxAdAccount = {
  ad_account_id: string | number;
  account_platform: string;
  account_name: string | null;
  currency: string;
  time_zone: string | null;
  account_status: string;
  fee_percentage: string | number | null;
  meta_bm_id?: string | null;
  created_at: string;
};

type SeamxList<T> = {
  data: T[];
  pagination?: { page: number; total_pages: number };
};

// Amounts cross the boundary in cents on our side; SeamX speaks major units.
const toMajor = (cents: number) => Math.round(cents) / 100;

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

  async getWalletBalance() {
    return { ok: true, data: { usd_balance: 5000, eur_balance: 2000 } };
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

// Real SeamX adapter. Mapped to the endpoints SeamX documents today
// (see docs/SEAMX_API.md) — nothing beyond their current functions.
// Only runs when SUPPLIER1_MODE=live AND the base URL + token are set.
const realSupplier1Adapter: Supplier1Adapter = {
  async listAdAccounts(): Promise<IntegrationResult<Supplier1AdAccount[]>> {
    const out: Supplier1AdAccount[] = [];
    let page = 1;
    // Bounded loop — never trust total_pages to terminate on its own.
    for (let guard = 0; guard < 100; guard++) {
      const res = await seamxFetch<SeamxList<SeamxAdAccount>>(
        `/v1/adaccounts?page=${page}`,
      );
      if (!res.ok) return res;
      for (const a of res.data?.data ?? []) {
        out.push({
          external_id: String(a.ad_account_id),
          bm_id: a.meta_bm_id ?? null,
          platform: mapPlatform(a.account_platform),
          currency: a.currency,
          // SeamX does not expose a per-account balance; balance is
          // wallet-level only. Left at 0 — callers must not treat this
          // as authoritative (see docs/SEAMX_API.md).
          balance_cents: 0,
          status: mapAccountStatus(a.account_status),
          assigned_to: null,
          timezone: a.time_zone ?? null,
          updated_at: a.created_at,
        });
      }
      const pg = res.data?.pagination;
      if (!pg || page >= pg.total_pages) break;
      page += 1;
    }
    return { ok: true, data: out };
  },

  async getBalance() {
    // SeamX has no per-ad-account balance endpoint — only wallet-level
    // (GET /v1/wallets/balance). Report honestly rather than return a wrong
    // per-account figure. Not consumed by the job worker.
    return {
      ok: false,
      error: "SeamX exposes wallet-level balance only, not per-account.",
      retryable: false,
    };
  },

  async getWalletBalance() {
    const res = await seamxFetch<{
      data?: { usd_balance?: number | string; eur_balance?: number | string };
    }>("/v1/wallets/balance");
    if (!res.ok) return res;
    return {
      ok: true,
      data: {
        usd_balance: Number(res.data?.data?.usd_balance ?? 0),
        eur_balance: Number(res.data?.data?.eur_balance ?? 0),
      },
    };
  },

  async pushTopup(input: Supplier1TopupPushInput) {
    if (!input.idempotency_key) {
      return { ok: false, error: "idempotency_key required", retryable: false };
    }
    const res = await seamxFetch<{
      data?: { id?: string | number; status?: string };
    }>("/v1/topups", {
      method: "POST",
      body: JSON.stringify({
        ad_account_id: input.external_ad_account_id,
        amount: toMajor(input.amount_cents),
        currency: input.currency,
      }),
    });
    if (!res.ok) return res;
    return {
      ok: true,
      data: {
        external_topup_id: String(res.data?.data?.id ?? ""),
        status: mapMovementStatus(res.data?.data?.status),
        balance_after_cents: null,
      } satisfies Supplier1TopupPushResult,
    };
  },

  async pushWithdraw(input: Supplier1WithdrawPushInput) {
    if (!input.idempotency_key) {
      return { ok: false, error: "idempotency_key required", retryable: false };
    }
    const res = await seamxFetch<{
      data?: { id?: string | number; status?: string };
    }>("/v1/withdrawls", {
      method: "POST",
      body: JSON.stringify({
        ad_account_id: input.external_ad_account_id,
        amount: toMajor(input.amount_cents),
        destination: "wallet",
      }),
    });
    if (!res.ok) return res;
    return {
      ok: true,
      data: {
        external_withdraw_id: String(res.data?.data?.id ?? ""),
        status: mapMovementStatus(res.data?.data?.status),
        balance_after_cents: null,
      } satisfies Supplier1WithdrawPushResult,
    };
  },
};

export function getSupplier1Adapter(): Supplier1Adapter {
  const mode = (process.env.SUPPLIER1_MODE ?? "mock").toLowerCase();
  return mode === "live" ? realSupplier1Adapter : mockSupplier1Adapter;
}

// Exported for direct use in tests that want the deterministic
// dataset without env-var juggling.
export { mockSupplier1Adapter };
