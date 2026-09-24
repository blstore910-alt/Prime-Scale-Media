export type LedgerDestination = "our_bank" | "supplier";
/** What a bank account can actually RECEIVE. The wallet top-up dialog
 *  offers four transfer currencies and TURLIT holds real accounts for
 *  each (Wise UK for GBP, Wise HK/DBS for HKD), so a ledger that knows
 *  only two cannot record half of what arrives. */
export type LedgerCurrency = "USD" | "EUR" | "GBP" | "HKD";
/** What a WALLET holds, and therefore what a deposit can be credited as.
 *  A GBP transfer funds a EUR wallet; only the owner knows the rate the
 *  bank gave, so they state it on the entry. */
export type WalletCurrency = "USD" | "EUR";
export type LedgerDirection = "deposit" | "withdrawal";

export interface BankLedgerEntry {
  id: string;
  tenant_id: string;
  destination: LedgerDestination;
  /** What the bank account received. */
  currency: LedgerCurrency;
  direction: LedgerDirection;
  amount: number;
  /** What this deposit was credited to wallets as, when that differs
   *  from what the bank received. Null on everything recorded before
   *  plak 89, and on same-currency entries where it adds nothing. */
  credited_currency?: WalletCurrency | null;
  credited_amount?: number | null;
  occurred_on: string;
  note: string | null;
  recorded_by: string | null;
  created_at: string;
  updated_at: string;
}

export const DESTINATION_LABELS: Record<LedgerDestination, string> = {
  our_bank: "Our bank (Meta-EU-PSM)",
  supplier: "Supplier bank (other accounts)",
};

// One row of the reconciliation summary, per WALLET currency -- the
// comparison is "what we credited" against "what paid for it", and we
// only ever credit EUR and USD.
export interface ReconciliationRow {
  currency: WalletCurrency;
  credited: number; // sum of completed wallet-topup amounts
  received: number; // ledger deposits − withdrawals (all destinations)
  gap: number; // credited − received (> 0 = credited more than received)
}

// Running balance per destination + currency.
export interface DestinationBalance {
  destination: LedgerDestination;
  currency: LedgerCurrency;
  balance: number;
}
