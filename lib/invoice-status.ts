/**
 * What an invoice's status IS — not whether it happens to be paid.
 *
 * Both invoice lists drew the badge from a boolean: `paid ? "Paid" :
 * "Unpaid"` on the admin side, `paid ? "Paid" : "Due"` on the customer's.
 * Every other status therefore rendered as a debt. The moment a superseded
 * invoice was voided — which is exactly what should make it stop looking
 * like money owed — it kept its red pill, kept its "Mark Paid" button on
 * the admin side, and kept telling the customer they owed €200.
 *
 * The customer and the desk get different words on purpose. "Void" is what
 * it is called in the books; nobody outside the books says it. A customer
 * reads "Cancelled", which is true and is a sentence they can act on.
 */

export type InvoiceStatusTone = "ok" | "pend" | "due" | "muted";

export type InvoiceStatusView = {
  label: string;
  tone: InvoiceStatusTone;
  /** Nothing is owed on this invoice and nothing can be collected. */
  settled: boolean;
};

export function invoiceStatusView(
  status: string | null | undefined,
  opts: { customer?: boolean; dueDate?: string | null; now?: number } = {},
): InvoiceStatusView {
  const s = (status ?? "").trim().toLowerCase();
  const customer = opts.customer === true;

  if (s === "paid") return { label: "Paid", tone: "ok", settled: true };
  if (s === "void" || s === "voided" || s === "cancelled") {
    return {
      label: customer ? "Cancelled" : "Void",
      tone: "muted",
      settled: true,
    };
  }
  if (s === "overdue") return { label: "Overdue", tone: "due", settled: false };
  if (s === "refunded")
    return { label: "Refunded", tone: "muted", settled: true };
  if (s === "draft") return { label: "Draft", tone: "muted", settled: true };

  // unpaid, or anything nobody has named yet: it is owed until told
  // otherwise, and a status we do not recognise must not quietly read as
  // settled.
  // ── AND LATE IS NOT THE SAME AS OWED ──────────────────────────────
  //
  // Nothing ever writes status='overdue' -- the only statuses anything
  // writes are unpaid, paid and void -- so the Overdue badge above was
  // unreachable and an invoice sixty days late was drawn identically to
  // one raised this morning. The list is where somebody decides who to
  // chase, and it had no way to tell them apart.
  //
  // The due date is the fact; the caller passes it when it has it.
  if (opts.dueDate) {
    const due = new Date(opts.dueDate).getTime();
    if (Number.isFinite(due) && due < (opts.now ?? Date.now())) {
      return {
        label: customer ? "Past due" : "Overdue",
        tone: "due",
        settled: false,
      };
    }
  }

  return {
    label: customer ? "Due" : "Unpaid",
    tone: customer ? "due" : "pend",
    settled: false,
  };
}

// ── AND THE SAME THING WHEN ASKING THE DATABASE FOR THEM ─────────────
//
// "Overdue" and "Cancelled" are words on the picker; they are not values
// in `invoices.status`. Measured 28-09: every one of the 31 live rows is
// paid, unpaid or void, and nothing in the app ever writes anything
// else. So `.eq("status", "overdue")` matches nothing, for ever.
//
// components/invoices/use-invoices.ts worked this out and derives it
// properly. app/api/invoices/export/route.ts did not, and its picker
// offers Overdue: the customer sets their dates, picks Overdue, presses
// Download, and reads "No invoices in that period." — stated as a fact
// about their account while six past-due invoices sit in the database.
//
// One function now, used by both, so the two cannot drift apart again.

/** The minimum of a Supabase filter builder this needs. Both callers satisfy it. */
export type InvoiceStatusQuery<T> = {
  eq(column: string, value: unknown): T;
  not(column: string, operator: string, value: unknown): T;
  lt(column: string, value: unknown): T;
};

/**
 * Narrows a query on `invoices` to one picker value.
 *
 * "all", empty and null mean no filter. "overdue" is derived (unpaid,
 * with a due date that has gone by) and "cancelled" is the customer's
 * word for `void`.
 */
export function applyInvoiceStatusFilter<T extends InvoiceStatusQuery<T>>(
  query: T,
  status: string | null | undefined,
  now: Date = new Date(),
): T {
  const s = (status ?? "").trim().toLowerCase();
  if (!s || s === "all") return query;
  if (s === "overdue" || s === "past_due" || s === "past due") {
    return query
      .eq("status", "unpaid")
      .not("due_date", "is", null)
      .lt("due_date", now.toISOString());
  }
  // "Cancelled" is what the customer is shown for a voided invoice --
  // see invoiceStatusView. Asking for it must find the same rows.
  if (s === "cancelled" || s === "canceled") return query.eq("status", "void");
  return query.eq("status", s);
}
