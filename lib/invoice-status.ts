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
