// ── THE SUBSCRIPTION EMAILS ─────────────────────────────────────────────
//
// The owner, 22-09: "maak ook een email voor subscription, dat ze in de app
// moeten checken voor payment -- ik wil voor subscription ook een email
// reminder". Three moments, the same three the app already tells them in
// the bell and on the phone:
//
//   subscription_invoice           a new invoice is ready
//   subscription_invoice_due_soon  it is taken from the wallet in a few days
//   subscription_past_due          taking it failed -- top up
//
// Pure (no imports but the layout), so the wording and the figures are
// tested, not eyeballed. The sender is lib/billing-emails.ts.

import { emailLayout, emailPanel, escapeHtml } from "./pure-email-layout";

export type BillingEmailType =
  | "subscription_invoice"
  | "subscription_invoice_due_soon"
  | "subscription_past_due";

export const BILLING_EMAIL_TYPES: ReadonlySet<string> = new Set<BillingEmailType>([
  "subscription_invoice",
  "subscription_invoice_due_soon",
  "subscription_past_due",
]);

export type BillingInvoice = {
  number?: string | number | null;
  total?: number | string | null;
  currency?: string | null;
  due_date?: string | null;
};

const APP = "https://app.primescalemedia.com";

/** "€200.00" / "$1,250.50" -- to the cent, never rounded. */
export function billingMoney(total: unknown, currency: unknown): string {
  const n = Number(total);
  const cur = String(currency ?? "EUR").toUpperCase();
  const sym = cur === "USD" ? "$" : cur === "EUR" ? "€" : `${cur} `;
  if (!Number.isFinite(n)) return "—";
  return (
    sym +
    n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}

/** "24 Sep 2026". A date-only value is read as that calendar day, never shifted a day by a time zone. */
export function billingDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return null;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = months[Number(m[2]) - 1];
  if (!month) return null;
  return `${Number(m[3])} ${month} ${m[1]}`;
}

export function billingEmail(
  type: string,
  inv: BillingInvoice,
): { subject: string; html: string; text: string } | null {
  const amount = billingMoney(inv.total, inv.currency);
  const cur = String(inv.currency ?? "EUR").toUpperCase();
  const due = billingDate(inv.due_date);
  const num = inv.number != null && String(inv.number).trim() ? escapeHtml(String(inv.number)) : null;
  const panel = emailPanel(
    num ? `Invoice ${num}` : "Your invoice",
    `${amount}${due ? ` &middot; due ${due}` : ""}`,
  );
  const billing = `${APP}/dashboard?view=billing`;
  const wallet = `${APP}/dashboard?view=wallet`;

  if (type === "subscription_invoice") {
    const lead = due
      ? `${amount} for your Prime Scale Media plan. Pay it from your wallet in the app — or keep enough in your ${cur} wallet and we take it on ${due}.`
      : `${amount} for your Prime Scale Media plan. Pay it from your wallet in the app.`;
    return {
      subject: `Your invoice is ready — ${amount}${due ? `, due ${due}` : ""}`,
      html: emailLayout({
        preheader: `Your Prime Scale Media invoice of ${amount} is ready.`,
        eyebrow: "New invoice",
        title: "Your invoice is ready",
        lead,
        cta: { label: "Open billing", href: billing },
        bodyHtml: panel,
        footnoteHtml: "You can see every invoice, and pay it in one tap, under Billing in the app.",
      }),
      text: [
        "Your invoice is ready.",
        `${num ? `Invoice ${inv.number}: ` : ""}${amount}${due ? `, due ${due}` : ""}.`,
        due ? `Pay it in the app, or keep enough in your ${cur} wallet and we take it on ${due}.` : "Pay it in the app.",
        `Open billing: ${billing}`,
      ].join("\n"),
    };
  }

  if (type === "subscription_invoice_due_soon") {
    const lead = due
      ? `On ${due} we take ${amount} from your ${cur} wallet for your plan. Make sure it holds enough — or pay it now in the app.`
      : `We take ${amount} from your ${cur} wallet for your plan soon. Make sure it holds enough — or pay it now in the app.`;
    return {
      subject: `Reminder: ${amount} is due${due ? ` on ${due}` : " soon"}`,
      html: emailLayout({
        preheader: `Reminder: your invoice of ${amount} is due${due ? ` on ${due}` : " soon"}.`,
        eyebrow: "Reminder",
        title: "Your invoice is due soon",
        lead,
        cta: { label: "Pay now in the app", href: billing },
        bodyHtml: panel,
        footnoteHtml: "Already paid, or your wallet holds enough? Then there is nothing to do.",
      }),
      text: [
        "Your invoice is due soon.",
        `${num ? `Invoice ${inv.number}: ` : ""}${amount}${due ? `, due ${due}` : ""}.`,
        `Make sure your ${cur} wallet holds enough, or pay it now: ${billing}`,
      ].join("\n"),
    };
  }

  if (type === "subscription_past_due") {
    return {
      subject: `We couldn't collect ${amount} — please top up`,
      html: emailLayout({
        preheader: `Your wallet did not hold enough for ${amount}.`,
        eyebrow: "Action needed",
        title: "Your payment didn't go through",
        lead: `Your ${cur} wallet didn't hold enough for ${amount}. Top it up and we collect it automatically — nothing else to do.`,
        cta: { label: "Top up my wallet", href: wallet },
        bodyHtml: panel,
        footnoteHtml: "Questions about this invoice? Message us on WhatsApp — we answer quickly.",
      }),
      text: [
        "Your payment didn't go through.",
        `${num ? `Invoice ${inv.number}: ` : ""}${amount}.`,
        `Top up your ${cur} wallet and we collect it automatically: ${wallet}`,
      ].join("\n"),
    };
  }

  return null;
}
