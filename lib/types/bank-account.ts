export type BankAccountCurrency = "EUR" | "USD" | "HKD";

export const BANK_ACCOUNT_CURRENCIES: BankAccountCurrency[] = [
  "EUR",
  "USD",
  "HKD",
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
