// ── EEN ALARM IS OOK EEN MAIL ───────────────────────────────────────
//
// De eigenaar, 01-10: "als de backup niet lukt of drive vol of vercel of
// supabase of iets, moeten we dus altijd direct een email krijgen en
// een melding in superadmin en admin, + als er een bug in het systeem
// is."
//
// De melding in de app en de push bestonden al (raise_integration_failure
// -> notifications -> deze webhook). Wat ontbrak: de inbox. Dit stuurt
// dezelfde melding als mail, aan dezelfde ontvanger, hooguit EEN keer per
// melding (de claim in notification_emails, plak 47 -- zelfde als de
// factuurmails). raise_integration_failure houdt zelf al herhalingen
// tegen: per bron een melding per uur zolang de vorige ongelezen is.
//
// Wat dit NIET kan: melden dat Supabase of Vercel zelf plat ligt -- dan
// draait deze code ook niet. Daarvoor is een monitor van buitenaf nodig
// (docs/RUNBOOK.md, "Monitor van buitenaf").

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email-sender";
import { safeErrorMessage } from "@/lib/pure-error";
import { emailLayout, emailPanel, escapeHtml } from "@/lib/pure-email-layout";
import { getNotificationCopy } from "@/components/notifications/notification-utils";
import type { Notification } from "@/lib/types/notification";

/** De soorten die de beheerkant per mail wil weten. */
export const ALERT_EMAIL_TYPES = new Set([
  "integration_failure",
  "billing_run_failed",
  "supplier_low_balance",
  "referral_commission_failed",
  "referral_commission_on_hold",
]);

type Row = {
  id: string;
  recipient_user_id: string | null;
  tenant_id?: string | null;
  type: string | null;
  payload?: unknown;
  created_at?: string | null;
};

export async function sendAlertEmail(admin: SupabaseClient, row: Row): Promise<string> {
  if (!row.type || !ALERT_EMAIL_TYPES.has(row.type) || !row.recipient_user_id) return "skipped:not an alert";

  const { data: seats } = await admin.from("user_profiles").select("email, role").eq("user_id", row.recipient_user_id);
  const seat = ((seats ?? []) as { email: string | null; role: string | null }[]).find(
    (s) => (s.email ?? "").includes("@") && s.role === "admin",
  );
  const to = (seat?.email ?? "").trim();
  if (!to) return "skipped:no admin address";
  if (/\.(test|local|example|invalid)$/i.test(to)) return "skipped:test address";

  const { error: claimError } = await admin.from("notification_emails").insert({ notification_id: row.id });
  if (claimError) {
    const code = (claimError as { code?: string }).code;
    if (code === "23505") return "skipped:already sent";
    return "skipped:claim failed";
  }

  const copy = getNotificationCopy(row as unknown as Notification);
  const payload = (typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload ?? {}) as {
    source?: string;
    detail?: string;
  };
  const bron = payload.source ? String(payload.source) : null;
  const html = emailLayout({
    preheader: copy.description.slice(0, 140),
    eyebrow: "Alarm",
    title: copy.title,
    lead: escapeHtml(copy.description),
    cta: { label: "Open de app", href: "https://app.primescalemedia.com/dashboard" },
    bodyHtml:
      (bron ? emailPanel("Bron", escapeHtml(bron)) : "") +
      (payload.detail ? emailPanel("Wat er gebeurde", escapeHtml(String(payload.detail))) : ""),
    footnoteHtml: "Deze melding staat ook bij de meldingen in de app. Je krijgt hem hooguit één keer per uur per bron.",
  });
  const text = [copy.title, "", copy.description, bron ? `Bron: ${bron}` : "", payload.detail ? `Detail: ${payload.detail}` : ""]
    .filter(Boolean)
    .join("\n");

  try {
    await sendEmail({ to, subject: `⚠️ PSM alarm: ${copy.title}`, html, text });
    return "sent";
  } catch (e) {
    return `failed:${safeErrorMessage(e)}`;
  }
}
