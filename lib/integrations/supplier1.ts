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
  Supplier1SuppliedTopup,
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

// One place that adds the base URL + auth header and normalises the result
// into an IntegrationResult. 4xx (except 429) is terminal; 5xx / network is
// retryable so the job worker backs off and tries again.
//
// SeamX is case-INconsistent about the auth header: most endpoints read
// `authToken`, but the ad-accounts LIST endpoint only accepts lowercase
// `authtoken` (camelCase there 500s server-side). Callers pass `authHeader`
// with the exact casing that endpoint wants; default is `authToken`.
async function seamxFetch<T>(
  path: string,
  init?: RequestInit & { body?: string; authHeader?: string },
): Promise<IntegrationResult<T>> {
  const base = process.env.SUPPLIER1_BASE_URL?.replace(/\/+$/, "");
  const token = process.env.SUPPLIER1_AUTH_TOKEN;
  if (!base || !token) {
    return { ok: false, error: NOT_CONFIGURED, retryable: false };
  }
  const { authHeader = "authToken", ...reqInit } = init ?? {};
  try {
    // Only send Content-Type when we actually carry a body — some backends
    // 500 on an unexpected Content-Type for a bodyless GET.
    const hasBody = reqInit.body != null;
    const res = await fetch(`${base}${path}`, {
      ...reqInit,
      headers: {
        [authHeader]: token,
        Accept: "application/json",
        ...(hasBody ? { "Content-Type": "application/json" } : {}),
        ...(reqInit.headers ?? {}),
      },
      // Bound the request. Without this a hung SeamX connection blocks until
      // the serverless function is killed mid-flight, which is exactly how a
      // job row gets stranded in 'processing' with nothing to reclaim it.
      // An abort lands in the catch below and is treated as retryable.
      signal: reqInit.signal ?? AbortSignal.timeout(20_000),
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
  meta_account_id?: string | null;
  meta_bm_id?: string | null;
  // Real API returns a per-account balance (absent from the Postman sample);
  // may be "" for a not-yet-provisioned account.
  current_balance?: number | string | null;
  balance_currency?: string | null;
  billing_mode?: string | null;
  created_at: string;
};

type SeamxList<T> = {
  data: T[];
  pagination?: { page: number; total_pages: number };
};

// current_balance comes back as a number, "", or null. Normalise to cents.
// Returns null for "not reported", NOT 0. The list endpoint (/v1/adaccounts)
// carries no balance field at all — balance lives on the per-account endpoint
// and on the wallet — so coercing an absent value to 0 made every synced pool
// row claim an empty account. "We never fetched this" and "this account is
// empty" are different facts and must render differently.
function balanceToCents(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

// Amounts cross the boundary in cents on our side; SeamX speaks major units.
const toMajor = (cents: number) => Math.round(cents) / 100;

// SeamX returns money as a number OR a formatted string ("4,849.50").
// Number("4,849.50") is NaN, and every comparison against NaN is false — so a
// formatted balance silently disabled the low-balance alarm (NaN < threshold
// === false) while the cron reported healthy. Parse defensively.
function num(v: unknown, fallback = 0): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : fallback;
  if (typeof v === "string") {
    const n = Number(v.replace(/[,\s]/g, ""));
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

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
          name: "Mock Meta Account 001",
          fee_percentage: 2,
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
          name: "Mock TikTok Account 002",
          fee_percentage: 3,
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

  async listAccountTopups(externalAdAccountId) {
    if (!externalAdAccountId) {
      return { ok: false, error: "external_id required" };
    }
    // Deliberately mixed: one with a fee, one charged at 0%, and one the
    // listing didn't report a fee for — so the reconciliation UI can be
    // checked against all three cases before going anywhere near live data.
    return {
      ok: true,
      data: [
        {
          external_id: "TOP-MOCK-1",
          external_ad_account_id: externalAdAccountId,
          currency: "EUR",
          gross_cents: 305_76,
          net_cents: 299_76,
          fee_cents: 6_00,
          status: "approved",
          created_at: "2026-06-22T08:09:32.000Z",
        },
        {
          external_id: "TOP-MOCK-2",
          external_ad_account_id: externalAdAccountId,
          currency: "EUR",
          gross_cents: 1000_00,
          net_cents: 1000_00,
          fee_cents: 0,
          status: "approved",
          created_at: "2026-07-02T10:00:00.000Z",
        },
        {
          external_id: "TOP-MOCK-3",
          external_ad_account_id: externalAdAccountId,
          currency: "EUR",
          gross_cents: 500_00,
          net_cents: null,
          fee_cents: null,
          status: "approved",
          created_at: "2026-08-11T12:00:00.000Z",
        },
      ],
    };
  },

  async getWalletBalance() {
    return {
      ok: true,
      data: {
        usd_balance: 5000,
        eur_balance: 2000,
        available_usd: 4849.5,
        available_eur: 1939.75,
      },
    };
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
    // Bounded loop — never trust total_pages to terminate on its own. ~569
    // accounts at 100/page ≈ 6 requests; the cap is a safety net.
    for (let guard = 0; guard < 200; guard++) {
      const res = await seamxFetch<SeamxList<SeamxAdAccount>>(
        `/v1/adaccounts?page=${page}&per_page=100`,
        // The list endpoint only accepts the lowercase header name.
        { authHeader: "authtoken" },
      );
      if (!res.ok) return res;
      for (const a of res.data?.data ?? []) {
        out.push({
          external_id: String(a.ad_account_id),
          bm_id: a.meta_bm_id ?? null,
          platform: mapPlatform(a.account_platform),
          currency: a.balance_currency || a.currency,
          balance_cents: balanceToCents(a.current_balance),
          status: mapAccountStatus(a.account_status),
          assigned_to: null,
          timezone: a.time_zone ?? null,
          updated_at: a.created_at,
          name: a.account_name ?? null,
          fee_percentage:
            a.fee_percentage == null || a.fee_percentage === ""
              ? null
              : Number(a.fee_percentage),
        });
      }
      const pg = res.data?.pagination;
      if (!pg || page >= pg.total_pages) break;
      page += 1;
    }
    return { ok: true, data: out };
  },

  async getBalance(externalAdAccountId: string) {
    if (!externalAdAccountId) {
      return { ok: false, error: "external_id required", retryable: false };
    }
    // Single-account endpoint uses the camelCase header (unlike the list).
    const res = await seamxFetch<{ data?: SeamxAdAccount }>(
      `/v1/adaccounts/${encodeURIComponent(externalAdAccountId)}`,
    );
    if (!res.ok) return res;
    const a = res.data?.data;
    const cents = balanceToCents(a?.current_balance);
    // This endpoint exists to answer exactly one question. If it comes back
    // without a balance, say so — returning 0 here would put a fabricated
    // "empty account" in front of whoever asked.
    if (cents === null) {
      return {
        ok: false,
        error: `Supplier returned no balance for ad account ${externalAdAccountId}`,
        retryable: true,
      };
    }
    return {
      ok: true,
      data: {
        balance_cents: cents,
        currency: a?.balance_currency || a?.currency || "USD",
      },
    };
  },

  async getWalletBalance() {
    const res = await seamxFetch<{
      data?: {
        usd_balance?: number | string;
        eur_balance?: number | string;
        available_balance?: { usd?: number | string; eur?: number | string };
        tax_reserve?: { usd?: number | string; eur?: number | string };
      };
    }>("/v1/wallets/balance");
    if (!res.ok) return res;
    const d = res.data?.data;
    const usd = num(d?.usd_balance);
    const eur = num(d?.eur_balance);
    // Spendable = what they report as available; else gross minus the DST tax
    // reserve when they report one; else gross. Previously a missing
    // available_balance made a reserved balance look fully spendable.
    const availUsd =
      d?.available_balance?.usd != null
        ? num(d.available_balance.usd)
        : usd - num(d?.tax_reserve?.usd);
    const availEur =
      d?.available_balance?.eur != null
        ? num(d.available_balance.eur)
        : eur - num(d?.tax_reserve?.eur);
    return {
      ok: true,
      data: {
        usd_balance: usd,
        eur_balance: eur,
        available_usd: availUsd,
        available_eur: availEur,
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
      // The key was validated above and then never sent, while transport
      // failures are retried — so a timeout on a request that actually landed
      // could double-fund the ad account. Send it both ways; harmless if the
      // supplier ignores it, and the only protection we have until they
      // confirm server-side dedup (see docs/SEAMX_API.md).
      headers: { "Idempotency-Key": input.idempotency_key },
      body: JSON.stringify({
        ad_account_id: input.external_ad_account_id,
        amount: toMajor(input.amount_cents),
        currency: input.currency,
        idempotency_key: input.idempotency_key,
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
      headers: { "Idempotency-Key": input.idempotency_key },
      body: JSON.stringify({
        ad_account_id: input.external_ad_account_id,
        amount: toMajor(input.amount_cents),
        // currency was accepted on the input and then silently dropped, so a
        // EUR and a USD withdrawal of the same number were byte-identical.
        currency: input.currency,
        destination: "wallet",
        idempotency_key: input.idempotency_key,
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

  async listAccountTopups(externalAdAccountId) {
    if (!externalAdAccountId) {
      return { ok: false, error: "external_id required", retryable: false };
    }

    type SeamxTopup = {
      id?: string | number;
      amount?: number | string;
      total_amount?: number | string;
      topup_amount?: number | string;
      topup_fee?: number | string;
      currency?: string;
      status?: string;
      created_at?: string;
      metadata?: { ad_account_id?: string | number };
    };

    const res = await seamxFetch<{ data?: SeamxTopup[] }>(
      `/v1/adaccounts/${encodeURIComponent(externalAdAccountId)}/topups`,
    );
    if (!res.ok) return res;

    const rows = res.data?.data ?? [];
    const out: Supplier1SuppliedTopup[] = [];

    for (const t of rows) {
      const id = String(t.id ?? "");
      // The documented LIST shape carries no fee — only the per-top-up
      // endpoint adds total_amount/topup_amount/topup_fee. So when the list
      // omits them we fetch the detail rather than reporting a fee of zero,
      // which would read as "they charged us nothing".
      let gross = t.total_amount ?? t.amount;
      let net = t.topup_amount;
      let fee = t.topup_fee;

      if (id && (net === undefined || fee === undefined)) {
        const one = await seamxFetch<{ data?: SeamxTopup }>(
          `/v1/topups/${encodeURIComponent(id)}`,
        );
        if (one.ok && one.data?.data) {
          const d = one.data.data;
          gross = d.total_amount ?? d.amount ?? gross;
          net = d.topup_amount ?? net;
          fee = d.topup_fee ?? fee;
        }
        // A failed detail fetch leaves the fields null — "not reported",
        // which the caller renders differently from a real zero.
      }

      out.push({
        external_id: id,
        external_ad_account_id:
          t.metadata?.ad_account_id != null
            ? String(t.metadata.ad_account_id)
            : externalAdAccountId,
        currency: t.currency ?? null,
        gross_cents: balanceToCents(gross),
        net_cents: balanceToCents(net),
        fee_cents: fee === undefined || fee === null ? null : balanceToCents(fee) ?? 0,
        status: t.status ?? null,
        created_at: t.created_at ?? null,
      });
    }

    return { ok: true, data: out };
  },
};

export function getSupplier1Adapter(): Supplier1Adapter {
  const mode = (process.env.SUPPLIER1_MODE ?? "mock").toLowerCase();
  return mode === "live" ? realSupplier1Adapter : mockSupplier1Adapter;
}

// Exported for direct use in tests that want the deterministic
// dataset without env-var juggling.
export { mockSupplier1Adapter };
