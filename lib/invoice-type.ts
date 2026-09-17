/**
 * What an invoice is FOR, in the words a customer uses.
 *
 * The admin list title-cases the slug ("Subscription Adjustment"), which is
 * fine for a desk that knows the model and useless on a customer's billing
 * page: two invoices a day apart, both €-something, both "Due", and nothing
 * on the row saying which one is the monthly plan. So the label is written
 * out, and written once — both sides read the same map.
 *
 * An unknown slug falls back to title case rather than to "Other": a new
 * invoice type added in SQL should read as itself on the page until someone
 * gives it a proper name here, not disappear into a bucket.
 */
const LABELS: Record<string, string> = {
  subscription: "Monthly plan",
  subscription_adjustment: "Plan change",
  manual_invoice: "One-off charge",
  wallet_topup: "Wallet top-up",
  topup: "Wallet top-up",
  ad_account_topup: "Ad-account top-up",
  ad_account_request: "Ad-account request",
  fee: "Fee",
  refund: "Refund",
};

export function invoiceTypeLabel(type: string | null | undefined): string {
  const key = (type ?? "").trim().toLowerCase();
  if (!key) return "Invoice";
  if (LABELS[key]) return LABELS[key];
  return key
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}
