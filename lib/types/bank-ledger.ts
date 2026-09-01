export type LedgerDestination = "our_bank" | "supplier";
export type LedgerCurrency = "USD" | "EUR";
export type LedgerDirection = "deposit" | "withdrawal";

export interface BankLedgerEntry {
  id: string;
  tenant_id: string;
  destination: LedgerDestination;
  currency: LedgerCurrency;
  direction: LedgerDirection;
  amount: number;
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

// One row of the reconciliation summary, per currency.
export interface ReconciliationRow {
  currency: LedgerCurrency;
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
