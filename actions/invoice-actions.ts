"use server";

import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";

type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string };

async function requireAdminCtx() {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { ok: false as const, error: "Unauthorized" };
  }

  const cookieStore = await cookies();
  const existingProfile = cookieStore.get("profile_id")?.value;
  const { data: profiles } = await supabase
    .from("user_profiles")
    .select("id, role, tenant_id, user_id")
    .eq("user_id", userData.user.id);

  if (!profiles?.length) return { ok: false as const, error: "Forbidden" };

  const profile = existingProfile
    ? profiles.find((p) => p.id === existingProfile) ?? profiles[0]
    : profiles[0];

  if (profile.role !== "admin" || !profile.tenant_id) {
    return { ok: false as const, error: "Forbidden" };
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
  "note",
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
): Promise<ActionResult> {
  if (typeof invoiceId !== "string" || invoiceId.length === 0) {
    return { ok: false, error: "Invalid input" };
  }
  if (status !== "paid" && status !== "unpaid") {
    return { ok: false, error: "Invalid status" };
  }

  const ctx = await requireAdminCtx();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const { supabase, profile } = ctx;

  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, tenant_id")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!invoice) return { ok: false, error: "Invoice not found" };
  if (invoice.tenant_id !== profile.tenant_id) {
    return { ok: false, error: "Forbidden" };
  }

  const { error: updateError } = await supabase
    .from("invoices")
    .update({
      status,
      paid_at: status === "paid" ? new Date().toISOString() : null,
    })
    .eq("id", invoiceId)
    .eq("tenant_id", profile.tenant_id);
  if (updateError) return { ok: false, error: updateError.message };

  return { ok: true, data: null };
}
