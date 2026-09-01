"use server";

import {
  type BankLedgerEntry,
  type DestinationBalance,
  type LedgerCurrency,
  type LedgerDestination,
  type LedgerDirection,
  type ReconciliationRow,
} from "@/lib/types/bank-ledger";
import { type ActionResult, resolveAdminContext } from "./_shared";

const DESTS: LedgerDestination[] = ["our_bank", "supplier"];
const CURRENCIES: LedgerCurrency[] = ["USD", "EUR"];
const DIRECTIONS: LedgerDirection[] = ["deposit", "withdrawal"];

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

// ─────────────────────────────────────────
// listLedgerEntries — recent manual bank/supplier entries, admin-only.
// ─────────────────────────────────────────
export async function listLedgerEntries(
  limit = 100,
): Promise<ActionResult<BankLedgerEntry[]>> {
  const auth = await resolveAdminContext();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, profile } = auth.ctx;

  const { data, error } = await supabase
    .from("bank_ledger_entries")
    .select(
      "id, tenant_id, destination, currency, direction, amount, occurred_on, note, recorded_by, created_at, updated_at",
    )
    .eq("tenant_id", profile.tenant_id)
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 500));
  if (error) return { ok: false, error: error.message };

  return { ok: true, data: (data ?? []) as BankLedgerEntry[] };
}

// ─────────────────────────────────────────
// addLedgerEntry — record a real deposit/withdrawal from a statement.
// Column-allowlisted; tenant + recorder forced from the session.
// ─────────────────────────────────────────
export async function addLedgerEntry(input: {
  destination: string;
  currency: string;
  direction: string;
  amount: number;
  occurred_on?: string;
  note?: string;
}): Promise<ActionResult<{ id: string }>> {
  const auth = await resolveAdminContext();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, profile } = auth.ctx;

  const destination = String(input?.destination ?? "") as LedgerDestination;
  const currency = String(input?.currency ?? "").toUpperCase() as LedgerCurrency;
  const direction = String(input?.direction ?? "") as LedgerDirection;
  const amount = n(input?.amount);

  if (!DESTS.includes(destination)) {
    return { ok: false, error: "Pick a destination (our bank or supplier)." };
  }
  if (!CURRENCIES.includes(currency)) {
    return { ok: false, error: "Unsupported currency." };
  }
  if (!DIRECTIONS.includes(direction)) {
    return { ok: false, error: "Pick deposit or withdrawal." };
  }
  if (!(amount > 0)) {
    return { ok: false, error: "Enter a positive amount." };
  }

  const row: Record<string, unknown> = {
    tenant_id: profile.tenant_id,
    destination,
    currency,
    direction,
    amount,
    recorded_by: profile.user_id,
  };
  // occurred_on optional — DB defaults to current_date. Only pass a
  // valid ISO date if given.
  if (input.occurred_on && /^\d{4}-\d{2}-\d{2}$/.test(input.occurred_on)) {
    row.occurred_on = input.occurred_on;
  }
  if (typeof input.note === "string" && input.note.trim()) {
    row.note = input.note.trim().slice(0, 500);
  }

  const { data, error } = await supabase
    .from("bank_ledger_entries")
    .insert(row)
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { id: data.id } };
}

// ─────────────────────────────────────────
// getReconciliation — the integrity check. Compares total credited to
// wallets (completed topups) against total actually received (ledger
// deposits − withdrawals), per currency; plus per-destination balances.
// ─────────────────────────────────────────
export async function getReconciliation(): Promise<
  ActionResult<{ rows: ReconciliationRow[]; balances: DestinationBalance[] }>
> {
  const auth = await resolveAdminContext();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, profile } = auth.ctx;

  const [topupsRes, ledgerRes] = await Promise.all([
    supabase
      .from("wallet_topups")
      .select("amount, currency")
      .eq("tenant_id", profile.tenant_id)
      .eq("status", "completed"),
    supabase
      .from("bank_ledger_entries")
      .select("destination, currency, direction, amount")
      .eq("tenant_id", profile.tenant_id),
  ]);
  if (topupsRes.error) return { ok: false, error: topupsRes.error.message };
  if (ledgerRes.error) return { ok: false, error: ledgerRes.error.message };

  const credited: Record<string, number> = { USD: 0, EUR: 0 };
  for (const t of topupsRes.data ?? []) {
    const c = String(t.currency ?? "").toUpperCase();
    if (c === "USD" || c === "EUR") credited[c] += n(t.amount);
  }

  const received: Record<string, number> = { USD: 0, EUR: 0 };
  const balMap = new Map<string, number>();
  for (const e of ledgerRes.data ?? []) {
    const c = String(e.currency ?? "").toUpperCase();
    const dest = String(e.destination ?? "");
    const signed = e.direction === "withdrawal" ? -n(e.amount) : n(e.amount);
    if (c === "USD" || c === "EUR") received[c] += signed;
    const key = `${dest}|${c}`;
    balMap.set(key, (balMap.get(key) ?? 0) + signed);
  }

  const rows: ReconciliationRow[] = CURRENCIES.map((currency) => ({
    currency,
    credited: Number(credited[currency].toFixed(2)),
    received: Number(received[currency].toFixed(2)),
    gap: Number((credited[currency] - received[currency]).toFixed(2)),
  }));

  const balances: DestinationBalance[] = [];
  for (const destination of DESTS) {
    for (const currency of CURRENCIES) {
      balances.push({
        destination,
        currency,
        balance: Number((balMap.get(`${destination}|${currency}`) ?? 0).toFixed(2)),
      });
    }
  }

  return { ok: true, data: { rows, balances } };
}
