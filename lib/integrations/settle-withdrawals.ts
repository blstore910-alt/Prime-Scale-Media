import type { SupabaseClient } from "@supabase/supabase-js";
import type { Supplier1Adapter } from "./types";
import { safeErrorMessage } from "@/lib/pure-error";

// ── READING BACK WHAT THE SUPPLIER DID WITH A WITHDRAWAL ─────────────
//
// The owner, 27-09: "B doen voor API-accounts en A houden voor
// handmatige -- bij handwerk is de bevestiging de medewerker zelf, met
// de screenshot erbij."
//
// So on a supplier-managed account the money now leaves our books in
// two steps: approving SENDS it (status `at_supplier`, nothing credited
// yet), and this is the half that hears back. Only when the supplier
// says the withdrawal is done does the customer's wallet go up.
//
// WHY THIS EXISTS AND THE WORKER DOES NOT DO IT
//
// `pushWithdraw` answers "queued" -- accepted, not done -- and the
// worker was recording that as success and marking the job finished.
// Nothing ever asked again. With the wallet credited up front that is
// the same money in two places: enqueue.ts describes exactly this, and
// the release guard then hands the account to the next customer with
// the balance still on it.
//
// A poll is a READ: idempotent, safe to repeat, and pointless to retry
// with backoff since the next minute's cron is the retry. It does not
// need the job queue's machinery, so it does not use it. What it needs
// is to be impossible to double-credit with, and that is settled in the
// RPC (FOR UPDATE plus a status test that returns quietly), not here.
//
// The adapter is injected so this is testable without a supplier.

/** How long before a withdrawal sitting at the supplier is worth saying out loud. */
const STALE_AFTER_HOURS = 36;

/** Never hold the cron open on a long list; the next minute picks up the rest. */
const MAX_PER_RUN = 25;

export type SettleSummary = {
  checked: number;
  settled: number;
  failed: number;
  stillWaiting: number;
  /** Rows the supplier has not answered on for a day and a half. */
  stale: string[];
  errors: string[];
  /**
   * Marked as sent, but carrying no supplier id -- so the status moved
   * and the push never queued. Nothing else in the system would notice.
   */
  stuck: string[];
};

type Row = {
  id: string;
  external_withdraw_id: string | null;
  sent_to_supplier_at: string | null;
  reference: string | null;
};

// The real client, narrowed to what this uses. Writing the builder
// shape out by hand made the parameter incompatible with the client the
// cron actually holds -- a type that only the test could satisfy is a
// test that proves nothing about production.
export type SettleDb = Pick<SupabaseClient, "from" | "rpc">;

export async function settleWithdrawalsAtSupplier(
  supabase: SettleDb,
  supplier1: Pick<Supplier1Adapter, "getWithdraw">,
  now: Date = new Date(),
): Promise<SettleSummary> {
  const out: SettleSummary = {
    checked: 0,
    settled: 0,
    failed: 0,
    stillWaiting: 0,
    stale: [],
    errors: [],
    stuck: [],
  };

  const { data, error } = await supabase
    .from("ad_account_withdrawals")
    .select("id, external_withdraw_id, sent_to_supplier_at, reference")
    .eq("status", "at_supplier")
    // Deliberately NOT filtered on external_withdraw_id. A row marked
    // sent with no id from the supplier is the one state that goes
    // quiet on its own: the status moved, the push never queued, and
    // nothing would ever look at it again. Filtering it out of this
    // query is how it would stay lost, so it is read and reported.
    .order("sent_to_supplier_at", { ascending: true })
    .limit(MAX_PER_RUN);

  if (error) {
    out.errors.push(`read failed: ${safeErrorMessage(error)}`);
    return out;
  }

  const rows = (data ?? []) as Row[];

  for (const row of rows) {
    const externalId = String(row.external_withdraw_id ?? "").trim();
    if (!externalId) {
      // Sent on our side, never sent on theirs. Asking with an empty id
      // would read some other withdrawal or none, so there is nothing
      // to poll -- but it is named, every run, until somebody deals
      // with it. The customer's wallet is still waiting on this.
      out.stuck.push(row.reference || row.id);
      continue;
    }
    out.checked += 1;

    // Worth naming before we ask, so a supplier who has gone quiet shows
    // up in the cron's own output rather than only in a customer's
    // complaint.
    const sent = row.sent_to_supplier_at
      ? new Date(row.sent_to_supplier_at)
      : null;
    if (
      sent &&
      !Number.isNaN(sent.getTime()) &&
      now.getTime() - sent.getTime() > STALE_AFTER_HOURS * 3600_000
    ) {
      out.stale.push(row.reference || row.id);
    }

    const res = await supplier1.getWithdraw(externalId);
    if (!res.ok) {
      // A failed READ is not a failed withdrawal. The row stays where it
      // is and we ask again next minute; turning a network blip into
      // "the supplier refused" would push a real withdrawal back to the
      // desk for no reason.
      out.errors.push(`${row.reference || row.id}: ${res.error}`);
      continue;
    }

    const status = res.data?.status;

    if (status === "completed") {
      const { error: rpcErr } = await supabase.rpc(
        "ad_account_withdrawal_settle",
        { p_withdrawal_id: row.id, p_external_id: externalId },
      );
      if (rpcErr) {
        out.errors.push(
          `${row.reference || row.id}: settle failed: ${safeErrorMessage(rpcErr)}`,
        );
        continue;
      }
      out.settled += 1;
      continue;
    }

    if (status === "failed") {
      const { error: rpcErr } = await supabase.rpc(
        "ad_account_withdrawal_supplier_failed",
        {
          p_withdrawal_id: row.id,
          p_reason: `De leverancier meldt "failed" op ${externalId}.`,
        },
      );
      if (rpcErr) {
        out.errors.push(
          `${row.reference || row.id}: marking failed failed: ${safeErrorMessage(rpcErr)}`,
        );
        continue;
      }
      out.failed += 1;
      continue;
    }

    // "queued", or a word we do not know. Either way: not settled, ask
    // again. Guessing is how a withdrawal gets credited twice.
    out.stillWaiting += 1;
  }

  return out;
}
