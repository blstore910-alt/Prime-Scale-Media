// Shared types for external-API adapters (Supplier 1, Wise, …).
//
// Each adapter file (supplier1.ts, wise.ts) exports an object matching one
// of the *Adapter interfaces below. The active implementation is
// selected via env at runtime — see `getSupplier1Adapter()` /
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
// Supplier 1 — ad-account supplier
// ─────────────────────────────────────────
export type Supplier1Platform = "meta-ads" | "tiktok-ads" | "google-ads";

export interface Supplier1AdAccount {
  external_id: string;         // Supplier 1 side of the ad account
  bm_id: string | null;
  platform: Supplier1Platform;
  currency: string;
  // null = the supplier did not report one (the list endpoint never does).
  balance_cents: number | null;
  status: "active" | "paused" | "suspended";
  assigned_to: string | null;  // Supplier 1-side advertiser identifier
  timezone: string | null;
  updated_at: string;
  // Supplier-side display name and their fee %, carried through so the
  // ad-account pool can show a usable row before we allocate it.
  name: string | null;
  fee_percentage: number | null;
}

export interface Supplier1TopupPushInput {
  external_ad_account_id: string;
  amount_cents: number;
  currency: string;
  idempotency_key: string; // caller-controlled, dedup at Supplier 1 side
}

export interface Supplier1TopupPushResult {
  external_topup_id: string;
  status: "queued" | "completed" | "failed";
  balance_after_cents: number | null;
}

export interface Supplier1WithdrawPushInput {
  external_ad_account_id: string;
  amount_cents: number;
  currency: string;
  idempotency_key: string;
}

export interface Supplier1WithdrawPushResult {
  external_withdraw_id: string;
  status: "queued" | "completed" | "failed";
  balance_after_cents: number | null;
}

export interface Supplier1Adapter {
  listAdAccounts(): Promise<IntegrationResult<Supplier1AdAccount[]>>;
  // Account-level wallet balance held on the supplier side (USD + EUR).
  // Used as a lightweight connectivity check (it doesn't depend on the
  // ad-accounts listing).
  getWalletBalance(): Promise<
    IntegrationResult<{
      usd_balance: number;
      eur_balance: number;
      // Spendable after the DST tax reserve (falls back to gross).
      available_usd: number;
      available_eur: number;
    }>
  >;
  getBalance(
    externalAdAccountId: string,
  ): Promise<IntegrationResult<{ balance_cents: number; currency: string }>>;
  pushTopup(
    input: Supplier1TopupPushInput,
  ): Promise<IntegrationResult<Supplier1TopupPushResult>>;
  pushWithdraw(
    input: Supplier1WithdrawPushInput,
  ): Promise<IntegrationResult<Supplier1WithdrawPushResult>>;
  // One ad account's top-up history AS THE SUPPLIER RECORDS IT. Used to
  // reconcile the fee we believe we pay against the fee actually charged —
  // the supplier computes its own fee server-side, so our recorded figure is
  // a belief until it is compared with theirs.
  listAccountTopups(
    externalAdAccountId: string,
  ): Promise<IntegrationResult<Supplier1SuppliedTopup[]>>;
}

// A top-up as the SUPPLIER reports it. `fee` and `net` are null when the
// listing doesn't carry them (the documented list shape omits both; the
// per-top-up endpoint adds them), so a caller can tell "no fee" from
// "not reported".
export interface Supplier1SuppliedTopup {
  external_id: string;
  external_ad_account_id: string | null;
  currency: string | null;
  /** What was taken from our wallet, in cents. */
  gross_cents: number | null;
  /** What landed on the ad account, in cents. */
  net_cents: number | null;
  /** What the supplier charged us, in cents. */
  fee_cents: number | null;
  status: string | null;
  created_at: string | null;
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
