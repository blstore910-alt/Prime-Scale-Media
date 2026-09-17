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
  opts: { customer?: boolean } = {},
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
  return {
    label: customer ? "Due" : "Unpaid",
    tone: customer ? "due" : "pend",
    settled: false,
  };
}
