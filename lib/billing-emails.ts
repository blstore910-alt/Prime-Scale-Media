import type { SupabaseClient } from "@supabase/supabase-js";

import { sendEmail } from "@/lib/email-sender";
import { safeErrorMessage } from "@/lib/pure-error";
import { BILLING_EMAIL_TYPES, billingEmail, type BillingInvoice } from "@/lib/pure-billing-email";

// ── A BILLING NOTIFICATION ALSO GOES OUT AS AN EMAIL ────────────────────
//
// Called from the notification webhook (app/api/push/notify), which already
// re-reads the row and checks the recipient is live. The bell, the phone
// and the inbox therefore always say the same thing, from one event.
//
// AT MOST ONCE PER NOTIFICATION. The webhook retries on a 5xx, and a
// customer must not get "your invoice is ready" three times: a row in
// notification_emails (plak 47) is claimed BEFORE sending. No such table
// yet means no email -- the feature stays dark until the plak lands, rather
// than sending duplicates.
//
// Service key: server only.

type NotificationRow = {
  id: string;
  recipient_user_id: string | null;
  tenant_id?: string | null;
  type: string | null;
  payload?: unknown;
};

function payloadOf(row: NotificationRow): Record<string, unknown> {
  const p = row.payload;
  if (typeof p === "string") {
    try {
      return JSON.parse(p) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return (p ?? {}) as Record<string, unknown>;
}

export async function sendBillingEmail(
  admin: SupabaseClient,
  row: NotificationRow,
): Promise<string> {
  if (!row.type || !BILLING_EMAIL_TYPES.has(row.type) || !row.recipient_user_id) {
    return "skipped:not a billing notification";
  }
  const payload = payloadOf(row);

  // The invoice as it is NOW: a reminder for an invoice paid since is not sent.
  let invoice: (BillingInvoice & { status?: string | null }) | null = null;
  const invoiceId = typeof payload.invoice_id === "string" ? payload.invoice_id : null;
  if (invoiceId) {
    const { data } = await admin
      .from("invoices")
      .select("number, total, currency, due_date, status")
      .eq("id", invoiceId)
      .maybeSingle();
    invoice = (data ?? null) as typeof invoice;
  }
  if (!invoice) {
    invoice = {
      number: (payload.number as string | number | null) ?? null,
      total: (payload.amount as number | string | null) ?? null,
      currency: (payload.currency as string | null) ?? null,
      due_date: (payload.due_date as string | null) ?? null,
    };
  }
  const status = String(invoice.status ?? "").toLowerCase();
  if (row.type !== "subscription_invoice" && ["paid", "void", "voided", "cancelled"].includes(status)) {
    return "skipped:invoice already settled";
  }

  const content = billingEmail(row.type, invoice);
  if (!content) return "skipped:no content";

  const { data: seats } = await admin
    .from("user_profiles")
    .select("email")
    .eq("user_id", row.recipient_user_id);
  const to = ((seats ?? []) as Array<{ email: string | null }>)
    .map((s) => (s.email ?? "").trim())
    .find((e) => e.includes("@"));
  if (!to) return "skipped:no address";

  // Claim it, then send. A claim that already exists is a retry.
  const { error: claimError } = await admin
    .from("notification_emails")
    .insert({ notification_id: row.id });
  if (claimError) {
    const code = (claimError as { code?: string }).code;
    if (code === "23505") return "skipped:already sent";
    if (code === "42P01" || /does not exist|schema cache/i.test(claimError.message)) {
      return "skipped:notification_emails not switched on (plak 47)";
    }
    console.warn("[billing-email] could not claim", row.id, safeErrorMessage(claimError));
    return "skipped:claim failed";
  }

  try {
    await sendEmail({ to, subject: content.subject, html: content.html, text: content.text });
    return "sent";
  } catch (e) {
    // Give the claim back so a retry can try again.
    await admin.from("notification_emails").delete().eq("notification_id", row.id);
    console.warn("[billing-email] send failed", row.id, safeErrorMessage(e));
    return "skipped:send failed";
  }
}
