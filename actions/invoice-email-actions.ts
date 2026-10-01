"use server";

// ── EEN FACTUUR (OPNIEUW) MAILEN, MET DE PDF ────────────────────────
//
// De eigenaar, 01-10: "klanten moeten voor elke subscription invoice een
// email krijgen -- stuur een testmail met pdf". Een nieuwe factuur gaat
// al vanzelf (notificatie -> lib/billing-emails.ts). Dit is de knop
// "Email" op het factuurscherm: dezelfde mail, met de pdf, naar het adres
// van de klant -- om te testen, of als een klant zegt dat hij niets kreeg.
//
// Admin, tenant uit de sessie, nooit een geannuleerde factuur.

import { resolveAdminContext } from "./_shared";
import { createAdminClient } from "@/lib/supabase/server";
import { safeErrorMessage } from "@/lib/pure-error";
import { sendEmail } from "@/lib/email-sender";
import { invoicePdfFor } from "@/lib/invoice-pdf-for";
import { billingEmail, billingMoney } from "@/lib/pure-billing-email";
import { emailLayout, emailPanel, escapeHtml } from "@/lib/pure-email-layout";

export async function emailInvoice(invoiceId: string): Promise<{ ok: true; data: { to: string } } | { ok: false; error: string }> {
  const res0 = await resolveAdminContext();
  if (!res0.ok) return { ok: false, error: res0.error };
  const tenantId = res0.ctx.profile.tenant_id as string;
  const db = await createAdminClient();

  const { data: inv, error } = await db
    .from("invoices")
    .select("id, tenant_id, number, total, currency, due_date, status, advertiser_id, paid_at")
    .eq("id", String(invoiceId ?? ""))
    .maybeSingle();
  if (error) return { ok: false, error: safeErrorMessage(error) };
  if (!inv || inv.tenant_id !== tenantId) return { ok: false, error: "Invoice not found." };
  const status = String(inv.status ?? "").toLowerCase();
  if (["void", "voided", "cancelled"].includes(status)) return { ok: false, error: "A cancelled invoice is not sent." };
  if (!inv.advertiser_id) return { ok: false, error: "This invoice has no customer to send it to." };

  const { data: adv } = await db.from("advertisers").select("profile_id, user_id").eq("id", inv.advertiser_id).maybeSingle();
  let to = "";
  if (adv?.profile_id) {
    const { data: p } = await db.from("user_profiles").select("email").eq("id", adv.profile_id).maybeSingle();
    to = String(p?.email ?? "").trim();
  }
  if (!to.includes("@")) return { ok: false, error: "This customer has no email address." };

  let content: { subject: string; html: string; text: string } | null;
  if (status === "paid") {
    const amount = billingMoney(inv.total, inv.currency);
    const nr = inv.number != null ? `Invoice ${inv.number}` : "Your invoice";
    content = {
      subject: `${nr} — ${amount}, paid`,
      html: emailLayout({
        preheader: `${nr} of ${amount} is paid. The PDF is attached.`,
        eyebrow: "Paid",
        title: "Your invoice",
        lead: `${escapeHtml(nr)} of ${escapeHtml(amount)} is paid — thank you. The PDF is attached for your records.`,
        cta: { label: "Open billing", href: "https://app.primescalemedia.com/dashboard?view=billing" },
        bodyHtml: emailPanel("Status", "Paid"),
        footnoteHtml: "You can see every invoice under Billing in the app.",
      }),
      text: [`${nr} of ${amount} is paid — thank you.`, "The PDF is attached.", "Billing: https://app.primescalemedia.com/dashboard?view=billing"].join("\n"),
    };
  } else {
    content = billingEmail("subscription_invoice", inv);
  }
  if (!content) return { ok: false, error: "Could not write the email." };

  let pdf: { filename: string; content: Buffer };
  try {
    pdf = await invoicePdfFor(db, inv.id);
  } catch (e) {
    return { ok: false, error: `The PDF could not be made: ${safeErrorMessage(e)}` };
  }
  try {
    await sendEmail({
      to,
      subject: content.subject,
      html: content.html,
      text: content.text,
      attachments: [{ filename: `Invoice ${pdf.filename}`, content: pdf.content, contentType: "application/pdf" }],
    });
  } catch (e) {
    return { ok: false, error: `The email could not be sent: ${safeErrorMessage(e)}` };
  }
  return { ok: true, data: { to } };
}
