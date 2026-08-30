// Shared types for external-API adapters (SeamX, Wise, …).
//
// Each adapter file (seamx.ts, wise.ts) exports an object matching one
// of the *Adapter interfaces below. The active implementation is
// selected via env at runtime — see `getSeamxAdapter()` /
// `getWiseAdapter()` in the respective files.
//
// A `mock-*` implementation ships alongside every real adapter so
// tests, staging, and unpaid-plan setups never accidentally hit a
// live external system.

export type IntegrationResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: string;
      // Set when the failure came from the remote system reporting a
      // specific reason. Absent for transport/parse/timeout errors —
      // the caller decides whether to retry those on its own.
      remoteCode?: string;
      // Set when we know the request never reached the remote system
      // (network, DNS, timeout) — safe to retry without dedup key.
      retryable?: boolean;
    };

// ─────────────────────────────────────────
// SeamX — ad-account supplier
// ─────────────────────────────────────────
export type SeamxPlatform = "meta-ads" | "tiktok-ads" | "google-ads";

export interface SeamxAdAccount {
  external_id: string;         // SeamX side of the ad account
  bm_id: string | null;
  platform: SeamxPlatform;
  currency: string;
  balance_cents: number;
  status: "active" | "paused" | "suspended";
  assigned_to: string | null;  // SeamX-side advertiser identifier
  timezone: string | null;
  updated_at: string;
}

export interface SeamxTopupPushInput {
  external_ad_account_id: string;
  amount_cents: number;
  currency: string;
  idempotency_key: string; // caller-controlled, dedup at SeamX side
}

export interface SeamxTopupPushResult {
  external_topup_id: string;
  status: "queued" | "completed" | "failed";
  balance_after_cents: number | null;
}

export interface SeamxWithdrawPushInput {
  external_ad_account_id: string;
  amount_cents: number;
  currency: string;
  idempotency_key: string;
}

export interface SeamxWithdrawPushResult {
  external_withdraw_id: string;
  status: "queued" | "completed" | "failed";
  balance_after_cents: number | null;
}

export interface SeamxAdapter {
  listAdAccounts(): Promise<IntegrationResult<SeamxAdAccount[]>>;
  getBalance(
    externalAdAccountId: string,
  ): Promise<IntegrationResult<{ balance_cents: number; currency: string }>>;
  pushTopup(
    input: SeamxTopupPushInput,
  ): Promise<IntegrationResult<SeamxTopupPushResult>>;
  pushWithdraw(
    input: SeamxWithdrawPushInput,
  ): Promise<IntegrationResult<SeamxWithdrawPushResult>>;
}

// ─────────────────────────────────────────
// Wise — bank-transfer verification
// ─────────────────────────────────────────

export interface WiseTransfer {
  external_id: string;
  amount_cents: number;
  currency: string;
  reference: string | null;    // free-text sender reference
  sender_name: string | null;
  received_at: string;         // ISO
  status: "incoming" | "completed" | "cancelled";
}

export interface WiseAdapter {
  // Returns transfers received into the connected Wise account since
  // `sinceIso`. Used by the wallet-topup matcher: incoming → compare
  // reference/amount against pending wallet_topups → auto-verify.
  listIncomingSince(
    sinceIso: string,
  ): Promise<IntegrationResult<WiseTransfer[]>>;
}
