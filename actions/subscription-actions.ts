"use server";

import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import dayjs from "dayjs";

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

const ALLOWED_SUB_STATUS = [
  "active",
  "inactive",
  "cancelled",
  "past_due",
  "paused",
] as const;
type SubscriptionStatus = (typeof ALLOWED_SUB_STATUS)[number];

// ─────────────────────────────────────────
// createSubscriptionAsAdmin
// ─────────────────────────────────────────
type CreateSubInput = {
  advertiser_id: string;
  currency: "EUR" | "USD";
  amount: number;
  start_date: string;
};

export async function createSubscriptionAsAdmin(
  input: CreateSubInput,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireAdminCtx();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const { supabase, profile } = ctx;

  if (
    typeof input.advertiser_id !== "string" ||
    input.advertiser_id.length === 0
  ) {
    return { ok: false, error: "advertiser_id required" };
  }
  if (input.currency !== "EUR" && input.currency !== "USD") {
    return { ok: false, error: "Invalid currency" };
  }
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Amount must be positive" };
  }
  const startDate = dayjs(input.start_date);
  if (!startDate.isValid()) {
    return { ok: false, error: "Invalid start_date" };
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

  const { data: existing } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("advertiser_id", input.advertiser_id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (existing) {
    return { ok: false, error: "Advertiser already has an active subscription" };
  }

  const { data: inserted, error: insertError } = await supabase
    .from("subscriptions")
    .insert({
      advertiser_id: input.advertiser_id,
      tenant_id: profile.tenant_id,
      currency: input.currency,
      amount,
      start_date: startDate.toISOString(),
      status: "inactive",
      next_payment_date: startDate.add(1, "month").toISOString(),
    })
    .select("id")
    .single();
  if (insertError) return { ok: false, error: insertError.message };

  return { ok: true, data: { id: inserted.id } };
}

// ─────────────────────────────────────────
// setSubscriptionStatus
// ─────────────────────────────────────────
export async function setSubscriptionStatus(
  subscriptionId: string,
  status: SubscriptionStatus,
): Promise<ActionResult> {
  if (
    typeof subscriptionId !== "string" ||
    subscriptionId.length === 0
  ) {
    return { ok: false, error: "Invalid input" };
  }
  if (!ALLOWED_SUB_STATUS.includes(status)) {
    return { ok: false, error: "Invalid status" };
  }

  const ctx = await requireAdminCtx();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const { supabase, profile } = ctx;

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("id, tenant_id")
    .eq("id", subscriptionId)
    .maybeSingle();
  if (!sub) return { ok: false, error: "Subscription not found" };
  if (sub.tenant_id !== profile.tenant_id) {
    return { ok: false, error: "Forbidden" };
  }

  const { error } = await supabase
    .from("subscriptions")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", subscriptionId)
    .eq("tenant_id", profile.tenant_id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: null };
}
