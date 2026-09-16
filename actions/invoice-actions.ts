"use server";

import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { maintenanceGuard, type ActionResult, wroteSomething } from "./_shared";

async function requireAdminCtx() {
  const mm = maintenanceGuard();
  if (!mm.ok) return { ok: false as const, error: mm.error };
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { ok: false as const, error: "Unauthorized" };
  }

  const cookieStore = await cookies();
  const existingProfile = cookieStore.get("profile_id")?.value;
  const { data: profiles } = await supabase
    .from("user_profiles")
    .select("id, role, tenant_id, user_id, is_active, status")
    .eq("user_id", userData.user.id);

  if (!profiles?.length) return { ok: false as const, error: "Forbidden" };

  const profile = existingProfile
    ? profiles.find((p) => p.id === existingProfile) ?? profiles[0]
    : profiles[0];

  if (profile.role !== "admin" || !profile.tenant_id) {
    return { ok: false as const, error: "Forbidden" };
  }
  // Deactivated admin keeps role but loses access.
  if (profile.is_active === false || (profile.status ?? "active") === "inactive") {
    return { ok: false as const, error: "Account is inactive" };
  }

  return { ok: true as const, supabase, profile };
}

// ─────────────────────────────────────────
// invoice: admin create
// ─────────────────────────────────────────
const INVOICE_INSERT_ALLOWED = [
  "type",
  "currency",
  "total",
  "items",
  "advertiser_id",
  "company_id",
  "number",
  "notes",
] as const;

type InvoiceInsertInput = Partial<
  Record<(typeof INVOICE_INSERT_ALLOWED)[number], unknown>
>;

export async function createInvoiceAsAdmin(
  input: InvoiceInsertInput,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireAdminCtx();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const { supabase, profile } = ctx;

  if (!input.advertiser_id || typeof input.advertiser_id !== "string") {
    return { ok: false, error: "advertiser_id required" };
  }

  const { data: adv } = await supabase
    .from("advertisers")
    .select("id, tenant_id")
    .eq("id", input.advertiser_id)
    .maybeSingle();
  if (!adv) return { ok: false, error: "Advertiser not found" };
  if (adv.tenant_id !== profile.tenant_id) {
    return { ok: false, error: "Forbidden" };
  }

  // Verify the company (when given) belongs to this tenant and advertiser —
  // don't let an admin attach an invoice to an unrelated company_id.
  if (typeof input.company_id === "string" && input.company_id.length > 0) {
    const { data: company } = await supabase
      .from("companies")
      .select("id, tenant_id, advertiser_id")
      .eq("id", input.company_id)
      .maybeSingle();
    if (!company || company.tenant_id !== profile.tenant_id) {
      return { ok: false, error: "Company not found" };
    }
    if (company.advertiser_id !== input.advertiser_id) {
      return {
        ok: false,
        error: "Company does not belong to this advertiser",
      };
    }
  }

  const cleaned: Record<string, unknown> = {};
  for (const col of INVOICE_INSERT_ALLOWED) {
    if (col in input) cleaned[col] = input[col];
  }
  cleaned.tenant_id = profile.tenant_id;
  cleaned.status = "unpaid";

  const { data: inserted, error: insertError } = await supabase
    .from("invoices")
    .insert(cleaned)
    .select("id")
    .single();
  if (insertError) return { ok: false, error: insertError.message };

  return { ok: true, data: { id: inserted.id } };
}

// ─────────────────────────────────────────
// invoice: admin mark paid / unpaid
// ─────────────────────────────────────────
export async function setInvoicePaidStatus(
  invoiceId: string,
  status: "paid" | "unpaid",
  ifUpdatedAt?: string,
): Promise<ActionResult> {
  if (typeof invoiceId !== "string" || invoiceId.length === 0) {
    return { ok: false, error: "Invalid input", code: "invalid" };
  }
  if (status !== "paid" && status !== "unpaid") {
    return { ok: false, error: "Invalid status", code: "invalid" };
  }

  const ctx = await requireAdminCtx();
  if (!ctx.ok) return { ok: false, error: ctx.error, code: "forbidden" };
  const { supabase, profile } = ctx;

  // NOTE: public.invoices has no updated_at column, so there's no
  // optimistic-concurrency version to check here — the ifUpdatedAt param
  // is accepted for call-site compatibility but not used. Selecting it
  // (or version-guarding on it) previously 400'd and made this action
  // always report "Invoice not found".
  void ifUpdatedAt;
  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, tenant_id, status, type, subscription_id")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!invoice) return { ok: false, error: "Invoice not found", code: "not_found" };
  if (invoice.tenant_id !== profile.tenant_id) {
    return { ok: false, error: "Forbidden", code: "forbidden" };
  }
  // Marking a PAID subscription invoice back to unpaid does NOT re-credit the
  // wallet (it may have been collected via invoice_pay_from_wallet), and the
  // daily billing cron re-collects any unpaid subscription invoice past its
  // due date — so the advertiser would be charged twice for one period.
  // Block that transition; a genuine reversal must go through a refund.
  //
  // The test is now "was it paid", full stop — not the type, and not
  // subscription_id.
  //
  // It started as `type === "subscription"`, which missed
  // subscription_adjustment. Narrowing to subscription_id caught that, and
  // still missed every invoice that has no subscription at all: an
  // ad_account_fee raised from the request review, or anything created from
  // the /invoices dialog, since createInvoiceAsAdmin cannot set
  // subscription_id — it is not in INVOICE_INSERT_ALLOWED. Those are paid
  // with invoice_pay_from_wallet too, so reopening one let the advertiser
  // press "Pay now" again and be debited twice.
  //
  // Nothing in the schema records HOW an invoice was paid, so "paid from the
  // wallet" cannot be told apart from "an admin ticked it by mistake". Given
  // that, refusing every paid→unpaid is the only answer that cannot cost a
  // customer money.
  //
  // It does cost something, and the cost is worth stating: correcting an
  // invoice that was marked paid in error now needs a credit note rather
  // than a toggle. Making that toggle safe means recording the payment
  // method on the invoice and allowing a reopen only for manually-marked
  // ones — a deliberate change, not a gap to leave standing.
  if (invoice.status === "paid" && status === "unpaid") {
    return {
      ok: false,
      error:
        "A paid invoice can't be marked unpaid — the wallet is never re-credited, so it could be collected a second time. Issue a refund or a credit note instead.",
      code: "invalid",
    };
  }

  // Count the rows. An UPDATE that matches nothing returns no error and no
  // rows in PostgREST, so marking an invoice paid could report success while
  // the invoice stayed open — and an invoice that looks settled but is not
  // is the difference between chasing a customer and not chasing them.
  const { data: updated, error: updateError } = await supabase
    .from("invoices")
    .update({
      status,
      paid_at: status === "paid" ? new Date().toISOString() : null,
    })
    .eq("id", invoiceId)
    .eq("tenant_id", profile.tenant_id)
    .select("id");
  if (updateError) return { ok: false, error: updateError.message };
  const wrote = wroteSomething(updated);
  if (!wrote.ok) return wrote;

  return { ok: true, data: null };
}
