"use server";

import {
  type Plan,
  type PlanCurrency,
  type PlanKind,
  type PlanOption,
} from "@/lib/types/plan";
import {
  type ActionResult,
  resolveAdminContext,
  versionMatches,
} from "./_shared";

const KINDS: PlanKind[] = ["tier", "community"];
const CURRENCIES: PlanCurrency[] = ["EUR", "USD"];

const SELECT_COLS =
  "id, tenant_id, name, kind, monthly_fee, currency, included_ad_accounts, topup_fee_pct, is_active, sort_order, updated_by, created_at, updated_at";

// ─────────────────────────────────────────
// listPlans — admin, all presets for the settings screen.
// ─────────────────────────────────────────
export async function listPlans(): Promise<ActionResult<Plan[]>> {
  const auth = await resolveAdminContext();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, profile } = auth.ctx;

  const { data, error } = await supabase
    .from("plans")
    .select(SELECT_COLS)
    .eq("tenant_id", profile.tenant_id)
    .order("kind", { ascending: true })
    .order("sort_order", { ascending: true });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []) as Plan[] };
}

// ─────────────────────────────────────────
// listActivePlans — the minimal shape the invite form pre-fills from.
// ─────────────────────────────────────────
export async function listActivePlans(): Promise<ActionResult<PlanOption[]>> {
  const auth = await resolveAdminContext();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, profile } = auth.ctx;

  const { data, error } = await supabase
    .from("plans")
    .select(
      "id, name, kind, monthly_fee, currency, included_ad_accounts, topup_fee_pct",
    )
    .eq("tenant_id", profile.tenant_id)
    .eq("is_active", true)
    .order("kind", { ascending: true })
    .order("sort_order", { ascending: true });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []) as PlanOption[] };
}

function num(v: unknown, min: number, max: number): number | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

// ─────────────────────────────────────────
// upsertPlan — admin create (no id) or edit (id). Column-allowlisted,
// tenant forced, optimistic-concurrency guarded on edit.
// ─────────────────────────────────────────
export async function upsertPlan(input: {
  id?: string;
  name: string;
  kind: string;
  monthly_fee: number;
  currency: string;
  included_ad_accounts: number;
  topup_fee_pct: number;
  is_active?: boolean;
  sort_order?: number;
  ifUpdatedAt?: string;
}): Promise<ActionResult<{ id: string }>> {
  const auth = await resolveAdminContext();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, profile } = auth.ctx;

  const name = String(input?.name ?? "").trim();
  const kind = String(input?.kind ?? "") as PlanKind;
  const currency = String(input?.currency ?? "").toUpperCase() as PlanCurrency;
  const monthly = num(input?.monthly_fee, 0, 1_000_000);
  const included = num(input?.included_ad_accounts, 0, 1000);
  const pct = num(input?.topup_fee_pct, 0, 100);

  if (!name) return { ok: false, error: "Enter a plan name." };
  if (name.length > 60) return { ok: false, error: "Name too long (max 60)." };
  if (!KINDS.includes(kind)) return { ok: false, error: "Pick tier or community." };
  if (!CURRENCIES.includes(currency)) return { ok: false, error: "Unsupported currency." };
  if (monthly == null) return { ok: false, error: "Monthly fee must be ≥ 0." };
  if (included == null) return { ok: false, error: "Included accounts must be ≥ 0." };
  if (pct == null) return { ok: false, error: "Topup fee must be 0–100%." };

  const patch: Record<string, unknown> = {
    name,
    kind,
    monthly_fee: monthly,
    currency,
    included_ad_accounts: Math.round(included),
    topup_fee_pct: pct,
    updated_by: profile.user_id,
  };
  if (typeof input.is_active === "boolean") patch.is_active = input.is_active;
  if (typeof input.sort_order === "number") patch.sort_order = input.sort_order;

  if (input.id) {
    const { data: existing, error: fErr } = await supabase
      .from("plans")
      .select("id, tenant_id, updated_at")
      .eq("id", input.id)
      .maybeSingle();
    if (fErr) return { ok: false, error: fErr.message };
    if (!existing) return { ok: false, error: "Plan not found", code: "not_found" };
    if (existing.tenant_id !== profile.tenant_id) {
      return { ok: false, error: "Forbidden", code: "forbidden" };
    }
    if (!versionMatches(existing.updated_at, input.ifUpdatedAt)) {
      return {
        ok: false,
        error: "This plan was changed elsewhere. Reload and try again.",
        code: "conflict",
      };
    }
    const { error } = await supabase
      .from("plans")
      .update(patch)
      .eq("id", input.id)
      .eq("tenant_id", profile.tenant_id);
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: { id: input.id } };
  }

  const { data, error } = await supabase
    .from("plans")
    .insert({ ...patch, tenant_id: profile.tenant_id })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { id: data.id } };
}
