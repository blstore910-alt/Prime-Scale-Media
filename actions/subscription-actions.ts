"use server";

import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import dayjs from "dayjs";
import { checkVersion, maintenanceGuard, wroteSomething } from "./_shared";

type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string };

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
      // DUE ON THE START DATE, not a month after it.
      //
      // The billing run only selects a subscription whose
      // next_payment_date has arrived, so starting the clock a month
      // ahead meant an admin-created subscription raised no invoice for
      // thirty days: the customer's dashboard read "No subscription
      // invoice due" with Pay disabled, and the ad-account Request button
      // stayed disabled behind it because it waits on a PAID subscription
      // invoice. 20260918180000 closed exactly this for the invite path
      // and its backfill was a one-shot update, so every new
      // admin-created subscription kept landing in the same gap.
      next_payment_date: startDate.toISOString(),
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
  ifUpdatedAt?: string,
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
    .select("id, tenant_id, advertiser_id")
    .eq("id", subscriptionId)
    .maybeSingle();
  if (!sub) return { ok: false, error: "Subscription not found" };
  if (sub.tenant_id !== profile.tenant_id) {
    return { ok: false, error: "Forbidden" };
  }

  // ── One active subscription per advertiser, on ACTIVATION too ───────
  // createSubscriptionAsAdmin refuses a second while another is active —
  // but it inserts as 'inactive', and this function had no such check. So
  // New → New → Activate → Activate leaves TWO active rows, and
  // subscription_billing_run invoices both every month, while the
  // customer's own screen reads `order by start_date desc limit 1` and
  // shows only the newer plan. They are billed twice and can only see —
  // and only pay — one of them.
  if (status === "active" && sub.advertiser_id) {
    const { data: others } = await supabase
      .from("subscriptions")
      .select("id")
      .eq("advertiser_id", sub.advertiser_id)
      .eq("status", "active")
      .neq("id", subscriptionId)
      .limit(1);
    if ((others ?? []).length > 0) {
      return {
        ok: false,
        error:
          "This advertiser already has an active subscription. Stop that one first — two active plans bill them twice.",
      };
    }
  }

  if (!(await checkVersion(supabase, "subscriptions", subscriptionId, ifUpdatedAt))) {
    return {
      ok: false,
      error: "This subscription was changed by someone else. Reload and retry.",
    };
  }

  const { data: rows, error } = await supabase
    .from("subscriptions")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", subscriptionId)
    .eq("tenant_id", profile.tenant_id)
    .select("id");
  if (error) return { ok: false, error: error.message };
  const wrote = wroteSomething(rows);
  if (!wrote.ok) return wrote;
  return { ok: true, data: null };
}

// ─────────────────────────────────────────
// changeSubscriptionAmount — mid-term plan change
// ─────────────────────────────────────────
// Delegates to the change_subscription_amount RPC, which voids/reissues
// the current period's invoice (or reconciles a paid one) and updates
// the subscription. The RPC re-checks admin authority server-side; the
// tenant guard here is defense in depth.
export async function changeSubscriptionAmount(
  subscriptionId: string,
  newAmount: number,
  newCurrency?: "EUR" | "USD",
  ifUpdatedAt?: string,
  // Paying cash back on a downgrade is a DECISION, not a default. The RPC
  // defaults to false; this parameter is how an admin asks for it.
  refund?: boolean,
): Promise<ActionResult<{ action: string }>> {
  if (typeof subscriptionId !== "string" || subscriptionId.length === 0) {
    return { ok: false, error: "Invalid input" };
  }
  const amount = Number(newAmount);
  if (!Number.isFinite(amount) || amount < 0) {
    return { ok: false, error: "Amount must be zero or positive" };
  }
  // ZERO IS NOT A PLAN. Setting a subscription to 0 issued an unpaid
  // invoice for 0, and invoice_pay_from_wallet refuses it — "Invoice has
  // no payable amount". So the customer's Pay now produced a red toast
  // every single time, the nightly auto-debit hit the same refusal and
  // parked them in past_due with a dunning notice, and nothing could ever
  // clear it. Meanwhile their dashboard read "Nothing to pay right now."
  // directly above a €0.00 row badged Due.
  //
  // A customer who should not be billed has their subscription DISABLED,
  // which is a state the screen can act on. Free-by-plan is expressed at
  // the invite, where amount 0 correctly creates no subscription at all.
  if (amount === 0) {
    return {
      ok: false,
      error:
        "A subscription cannot be zero — an invoice for nothing cannot be paid, and it would park this customer as past due for ever. Disable the subscription instead.",
    };
  }
  if (newCurrency && newCurrency !== "EUR" && newCurrency !== "USD") {
    return { ok: false, error: "Invalid currency" };
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

  // SUPER-ADMIN ONLY, and this is the second of three gates.
  //
  // Repricing a plan is not an edit, it is a decision about what somebody
  // pays — and on a downgrade it can hand money back. The Amount button
  // was already hidden from a plain admin, but a hidden button is not a
  // boundary: the action is reachable by name, and both it and the RPC
  // tested only for role 'admin'. An employee could reprice any customer.
  //
  // Super-admin here means what it means everywhere in this app: the
  // owner of the tenant.
  const { data: tenantRow } = await supabase
    .from("tenants")
    .select("owner_id")
    .eq("id", sub.tenant_id)
    .maybeSingle();
  if (
    !tenantRow ||
    (tenantRow as { owner_id: string | null }).owner_id !== profile.user_id
  ) {
    return {
      ok: false,
      error:
        "Only the account owner can change what a customer pays. Ask them to make this change.",
    };
  }

  if (!(await checkVersion(supabase, "subscriptions", subscriptionId, ifUpdatedAt))) {
    return {
      ok: false,
      error: "This subscription was changed by someone else. Reload and retry.",
    };
  }

  const { data, error } = await supabase.rpc("change_subscription_amount", {
    p_refund: refund === true,
    p_subscription_id: subscriptionId,
    p_new_amount: amount,
    p_new_currency: newCurrency ?? null,
  });
  if (error) return { ok: false, error: error.message };

  const action =
    (data as { action?: string } | null)?.action ?? "updated";
  return { ok: true, data: { action } };
}
