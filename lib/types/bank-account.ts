// ── GBP WAS OFFERED AND COULD NEVER BE CORRECTED ────────────────────
//
// The top-up dialog lets a customer transfer in GBP (TURLIT holds a
// Wise UK account; walked on production 28-09, it shows sort code
// 60-84-64 and IBAN GB69TRWI...). This list is what the Banks screen
// can create a row for -- and it had no GBP. So `bankOverrideFor(rows,
// "turlit", "GBP")` could never match anything the owner is able to
// save, and that one combination was pinned to the deploy-time details
// for ever, underneath a screen promising in bold that what you save
// there replaces them.
//
// Adding it costs nothing: a currency with no row still falls back to
// the built-in, which is exactly what happens today.
export type BankAccountCurrency = "EUR" | "USD" | "HKD" | "GBP";

export const BANK_ACCOUNT_CURRENCIES: BankAccountCurrency[] = [
  "EUR",
  "USD",
  "HKD",
  "GBP",
];

// A beneficiary bank destination for one ad-account type + currency.
// Advertisers transfer here when funding that type; HKD is a
// destination-only currency (wallets/topups stay EUR/USD).
export interface BankAccount {
  id: string;
  tenant_id: string;
  ad_account_type_id: string;
  currency: BankAccountCurrency;
  label: string;
  beneficiary: string | null;
  account_no: string | null;
  swift_bic: string | null;
  bank_name: string | null;
  bank_address: string | null;
  routing_no: string | null;
  notes: string | null;
  is_active: boolean;
  sort_order: number;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}
