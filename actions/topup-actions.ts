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
    .select("id, role, tenant_id, user_id, full_name, email")
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
// top_ups: admin create (with allow-listed status + column allowlist)
// The caller's tenant is enforced server-side; status is either
// 'pending' or 'completed' (mark-paid switch).
// ─────────────────────────────────────────
const TOPUP_INSERT_ALLOWED = [
  "type",
  "currency",
  "amount_received",
  "amount_usd",
  "topup_amount",
  "fee",
  "fee_amount",
  "eur_value",
  "eur_topup",
  "account_id",
  "advertiser_id",
  "payment_slip",
  "note",
  "source",
] as const;

type TopupInsertInput = Partial<
  Record<(typeof TOPUP_INSERT_ALLOWED)[number], unknown>
> & {
  status?: "pending" | "completed";
  mark_paid?: boolean;
};

export async function createTopupAsAdmin(
  input: TopupInsertInput,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireAdminCtx();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const { supabase, profile } = ctx;

  if (!input.advertiser_id || typeof input.advertiser_id !== "string") {
    return { ok: false, error: "advertiser_id required" };
  }

  // Verify the target advertiser belongs to this tenant.
  const { data: adv, error: advError } = await supabase
    .from("advertisers")
    .select("id, tenant_id")
    .eq("id", input.advertiser_id)
    .maybeSingle();
  if (advError || !adv) return { ok: false, error: "Advertiser not found" };
  if (adv.tenant_id !== profile.tenant_id) {
    return { ok: false, error: "Forbidden" };
  }

  const cleaned: Record<string, unknown> = {};
  for (const col of TOPUP_INSERT_ALLOWED) {
    if (col in input) cleaned[col] = input[col];
  }

  // Status: only pending or completed. mark_paid boolean is the UI switch.
  const requested = input.status ?? (input.mark_paid ? "completed" : "pending");
  if (requested !== "pending" && requested !== "completed") {
    return { ok: false, error: "Invalid status" };
  }
  cleaned.status = requested;
  cleaned.tenant_id = profile.tenant_id;
  cleaned.author = {
    id: profile.id,
    name: profile.full_name,
    email: profile.email,
  };

  const { data: inserted, error: insertError } = await supabase
    .from("top_ups")
    .insert(cleaned)
    .select("id")
    .single();
  if (insertError) return { ok: false, error: insertError.message };

  return { ok: true, data: { id: inserted.id } };
}

// ─────────────────────────────────────────
// top_ups: bulk admin insert (used by bulk-ad-accounts-topup-dialog)
// ─────────────────────────────────────────
export async function bulkCreateTopupsAsAdmin(
  rows: TopupInsertInput[],
): Promise<ActionResult<{ inserted: number }>> {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, error: "No rows" };
  }
  if (rows.length > 200) {
    return { ok: false, error: "Too many rows (max 200)" };
  }
  const ctx = await requireAdminCtx();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const { supabase, profile } = ctx;

  // Verify every referenced advertiser belongs to caller's tenant, in one round-trip.
  const advertiserIds = Array.from(
    new Set(
      rows
        .map((r) => r.advertiser_id)
        .filter((v): v is string => typeof v === "string" && v.length > 0),
    ),
  );
  if (advertiserIds.length === 0) {
    return { ok: false, error: "advertiser_id required on every row" };
  }
  const { data: advs, error: advsError } = await supabase
    .from("advertisers")
    .select("id, tenant_id")
    .in("id", advertiserIds);
  if (advsError) return { ok: false, error: advsError.message };
  const validIds = new Set(
    (advs ?? [])
      .filter((a) => a.tenant_id === profile.tenant_id)
      .map((a) => a.id),
  );
  if (validIds.size !== advertiserIds.length) {
    return { ok: false, error: "Forbidden advertiser id in batch" };
  }

  const author = {
    id: profile.id,
    name: profile.full_name,
    email: profile.email,
  };
  const payload = rows.map((row) => {
    const cleaned: Record<string, unknown> = {};
    for (const col of TOPUP_INSERT_ALLOWED) {
      if (col in row) cleaned[col] = row[col];
    }
    const requested =
      row.status ?? (row.mark_paid ? "completed" : "pending");
    if (requested !== "pending" && requested !== "completed") {
      throw new Error("Invalid status in bulk payload");
    }
    cleaned.status = requested;
    cleaned.tenant_id = profile.tenant_id;
    cleaned.author = author;
    return cleaned;
  });

  const { error: insertError } = await supabase.from("top_ups").insert(payload);
  if (insertError) return { ok: false, error: insertError.message };
  return { ok: true, data: { inserted: payload.length } };
}

// ─────────────────────────────────────────
// top_ups: admin partial update
// ─────────────────────────────────────────
const TOPUP_UPDATE_ALLOWED = [
  "type",
  "currency",
  "amount_received",
  "amount_usd",
  "topup_amount",
  "fee",
  "fee_amount",
  "note",
  "status",
  "is_deleted",
] as const;

type TopupUpdateInput = Partial<
  Record<(typeof TOPUP_UPDATE_ALLOWED)[number], unknown>
>;

export async function updateTopupAsAdmin(
  topupId: string,
  payload: TopupUpdateInput,
): Promise<ActionResult> {
  if (typeof topupId !== "string" || topupId.length === 0) {
    return { ok: false, error: "Invalid input" };
  }
  const ctx = await requireAdminCtx();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const { supabase, profile } = ctx;

  // Verify target is in caller's tenant
  const { data: existing } = await supabase
    .from("top_ups")
    .select("id, tenant_id")
    .eq("id", topupId)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Top-up not found" };
  if (existing.tenant_id !== profile.tenant_id) {
    return { ok: false, error: "Forbidden" };
  }

  const cleaned: Record<string, unknown> = {};
  for (const col of TOPUP_UPDATE_ALLOWED) {
    if (col in payload) cleaned[col] = payload[col];
  }
  if (cleaned.status !== undefined) {
    const s = cleaned.status;
    if (s !== "pending" && s !== "completed" && s !== "rejected") {
      return { ok: false, error: "Invalid status" };
    }
  }
  if (Object.keys(cleaned).length === 0) {
    return { ok: false, error: "No updatable fields" };
  }
  cleaned.updated_at = new Date().toISOString();
  cleaned.author = {
    id: profile.id,
    name: profile.full_name,
    email: profile.email,
  };

  const { error: updateError } = await supabase
    .from("top_ups")
    .update(cleaned)
    .eq("id", topupId)
    .eq("tenant_id", profile.tenant_id);
  if (updateError) return { ok: false, error: updateError.message };

  return { ok: true, data: null };
}
