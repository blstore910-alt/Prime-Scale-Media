import { NextResponse } from "next/server";
import { apiRequireOwner } from "@/lib/auth/api-require-admin";
import { createAdminClient } from "@/lib/supabase/server";
import { isMaintenanceMode } from "@/actions/_shared";
import { createDueSoonReminders } from "@/lib/billing-reminders";
import { safeErrorMessage } from "@/lib/pure-error";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/run-billing
 *
 * The 03:00 billing run, NOW. Owners only.
 *
 * De eigenaar, 03-10: "zijn we ready voor klanten onboarden dat we niet
 * 1 maand moeten wachten als test". The monthly cycle -- a renewal
 * invoice, then the automatic debit after the grace week -- can be tested
 * in minutes by moving the dates of a TEST account to today and running
 * this, instead of waiting for the calendar.
 *
 * It is the same RPC the cron calls, so it does exactly what the night
 * would do -- including for real customers whose invoice is genuinely
 * due. Nothing more, nothing earlier than its due date. Logged with who
 * pressed it.
 */
export async function POST() {
  const { user, profile, error: authError } = await apiRequireOwner();
  if (authError) return authError;
  if (isMaintenanceMode()) {
    return NextResponse.json({ ok: false, error: "Maintenance mode: billing is frozen." }, { status: 423 });
  }

  const db = await createAdminClient();
  const { data, error } = await db.rpc("subscription_billing_run");
  if (error) return NextResponse.json({ ok: false, error: safeErrorMessage(error) }, { status: 500 });

  let reminders: unknown = null;
  try {
    reminders = await createDueSoonReminders(db);
  } catch (e) {
    reminders = { error: e instanceof Error ? e.message : "unknown" };
  }

  try {
    await db.from("audit_events").insert({
      actor_user_id: user!.id,
      actor_profile_id: profile!.id,
      tenant_id: profile!.tenant_id,
      table_name: "cron_run",
      action: "INSERT",
      row_id: "subscription-billing (manual)",
      after_data: { summary: data, reminders },
    });
  } catch {
    // the run itself is what matters
  }
  return NextResponse.json({ ok: true, summary: data, reminders }, { headers: { "Cache-Control": "no-store" } });
}
