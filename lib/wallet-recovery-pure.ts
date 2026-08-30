/**
 * Pure balance-replay from a stream of wallet_topups audit_events.
 *
 * Kept as a stand-alone module (no Supabase, no fetch) so the
 * arithmetic can be unit-tested without any infrastructure — which
 * is exactly the piece you want frozen under tests, because if it
 * ever miscomputes it becomes a real-money incident.
 */

export type WalletTopupAuditEvent = {
  action: "INSERT" | "UPDATE" | "DELETE";
  before_data: {
    wallet_id?: string | null;
    status?: string | null;
    amount?: number | string | null;
    currency?: string | null;
  } | null;
  after_data: {
    wallet_id?: string | null;
    status?: string | null;
    amount?: number | string | null;
    currency?: string | null;
  } | null;
};

export type ReplayResult = {
  usd: number;
  eur: number;
  eventCount: number;
};

/**
 * Walk events in chronological order and re-apply the balance
 * deltas that the wallet_topups status trigger would produce:
 *   - pending  → completed  = +amount (of after)
 *   - completed → non-completed = -amount (of before)
 *   - everything else = no-op (matches the trigger stub)
 */
export function replayBalance(
  events: WalletTopupAuditEvent[],
  walletId: string,
): ReplayResult {
  let usd = 0;
  let eur = 0;
  let count = 0;

  for (const ev of events) {
    const before = ev.before_data;
    const after = ev.after_data;
    const walletMatch =
      (after?.wallet_id ?? before?.wallet_id) === walletId;
    if (!walletMatch) continue;
    count += 1;

    const wasCompleted = before?.status === "completed";
    const isCompleted = after?.status === "completed";
    if (!wasCompleted && isCompleted) {
      const amt = Number(after?.amount ?? 0);
      const cur = String(after?.currency ?? "");
      if (cur === "USD") usd += amt;
      else if (cur === "EUR") eur += amt;
    } else if (wasCompleted && !isCompleted) {
      const amt = Number(before?.amount ?? 0);
      const cur = String(before?.currency ?? "");
      if (cur === "USD") usd -= amt;
      else if (cur === "EUR") eur -= amt;
    }
  }

  return { usd, eur, eventCount: count };
}
