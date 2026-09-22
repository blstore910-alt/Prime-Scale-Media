import type { SupabaseClient } from "@supabase/supabase-js";

import { safeErrorMessage } from "@/lib/pure-error";

// ── "YOUR INVOICE IS DUE IN A FEW DAYS" ─────────────────────────────────
//
// The owner, 22-09: a reminder for the subscription, so nobody is
// surprised when the due-date run takes the money from their wallet.
// Run once a day from the billing cron: every open subscription invoice due
// within REMIND_DAYS gets ONE subscription_invoice_due_soon notification --
// which the notification webhook turns into a push and an email.
//
// One per invoice, ever: an invoice that already has one is skipped.

const REMIND_DAYS = 3;
const SETTLED = new Set(["paid", "void", "voided", "cancelled"]);

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function createDueSoonReminders(
  admin: SupabaseClient,
  now: Date = new Date(),
): Promise<{ created: number; checked: number; error?: string }> {
  const from = isoDate(now);
  const until = isoDate(new Date(now.getTime() + REMIND_DAYS * 24 * 3600_000));

  const { data: invoices, error } = await admin
    .from("invoices")
    .select("id, advertiser_id, tenant_id, number, total, currency, due_date, status, type")
    .gte("due_date", from)
    .lte("due_date", `${until}T23:59:59`)
    .in("type", ["subscription", "subscription_adjustment"]);
  if (error) return { created: 0, checked: 0, error: safeErrorMessage(error) };

  const open = ((invoices ?? []) as Array<{
    id: string;
    advertiser_id: string | null;
    tenant_id: string | null;
    number: string | number | null;
    total: number | string | null;
    currency: string | null;
    due_date: string | null;
    status: string | null;
  }>).filter((i) => !SETTLED.has(String(i.status ?? "").toLowerCase()) && i.advertiser_id);

  let created = 0;
  for (const inv of open) {
    const { data: adv } = await admin
      .from("advertisers")
      .select("user_id")
      .eq("id", inv.advertiser_id!)
      .maybeSingle();
    const userId = (adv as { user_id?: string | null } | null)?.user_id;
    if (!userId) continue;

    const { data: already } = await admin
      .from("notifications")
      .select("id")
      .eq("recipient_user_id", userId)
      .eq("type", "subscription_invoice_due_soon")
      .contains("payload", { invoice_id: inv.id })
      .limit(1);
    if ((already ?? []).length) continue;

    const { error: insertError } = await admin.from("notifications").insert({
      recipient_user_id: userId,
      tenant_id: inv.tenant_id,
      type: "subscription_invoice_due_soon",
      payload: {
        invoice_id: inv.id,
        number: inv.number,
        amount: inv.total,
        currency: inv.currency,
        due_date: inv.due_date,
      },
      is_read: false,
    });
    if (!insertError) created += 1;
  }
  return { created, checked: open.length };
}
