"use server";

import {
  AD_ACCOUNT_TYPE_SEED,
  type AdAccountPlatformGroup,
  type AdAccountType,
  type AdAccountTypeOption,
} from "@/lib/types/ad-account-type";
import {
  type ActionResult,
  resolveAdminContext,
  versionMatches,
} from "./_shared";

const GROUPS: AdAccountPlatformGroup[] = ["meta", "google", "tiktok"];

function slugify(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function isValidPct(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100;
}

// ─────────────────────────────────────────
// listAdAccountTypes — admin, full list for the settings screen.
// ─────────────────────────────────────────
export async function listAdAccountTypes(): Promise<
  ActionResult<AdAccountType[]>
> {
  const auth = await resolveAdminContext();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, profile } = auth.ctx;

  const { data, error } = await supabase
    .from("ad_account_types")
    .select(
      "id, tenant_id, label, slug, platform_group, default_fee_pct, api_topup_enabled, is_active, sort_order, updated_by, created_at, updated_at",
    )
    .eq("tenant_id", profile.tenant_id)
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });
  if (error) return { ok: false, error: error.message };

  return { ok: true, data: (data ?? []) as AdAccountType[] };
}

// ─────────────────────────────────────────
// listActiveAdAccountTypes — the minimal shape the create/update forms
// need for the dropdown + fee auto-fill. Active types only, ordered.
// ─────────────────────────────────────────
export async function listActiveAdAccountTypes(): Promise<
  ActionResult<AdAccountTypeOption[]>
> {
  const auth = await resolveAdminContext();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, profile } = auth.ctx;

  const { data, error } = await supabase
    .from("ad_account_types")
    .select("label, slug, platform_group, default_fee_pct")
    .eq("tenant_id", profile.tenant_id)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });
  if (error) return { ok: false, error: error.message };

  return { ok: true, data: (data ?? []) as AdAccountTypeOption[] };
}

// ─────────────────────────────────────────
// ensureInitialAdAccountTypes — fired from the app-provider mount.
// Idempotent: if the tenant already has any type, does nothing.
// ─────────────────────────────────────────
export async function ensureInitialAdAccountTypes(): Promise<
  ActionResult<{ created: number }>
> {
  const auth = await resolveAdminContext();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, profile } = auth.ctx;

  const { count, error: countError } = await supabase
    .from("ad_account_types")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", profile.tenant_id);
  if (countError) return { ok: false, error: countError.message };
  if ((count ?? 0) > 0) return { ok: true, data: { created: 0 } };

  const rows = AD_ACCOUNT_TYPE_SEED.map((s) => ({
    tenant_id: profile.tenant_id,
    label: s.label,
    slug: s.slug,
    platform_group: s.platform_group,
    default_fee_pct: s.default_fee_pct,
    api_topup_enabled: s.api_topup_enabled,
    sort_order: s.sort_order,
    is_active: true,
    updated_by: profile.user_id,
  }));
  const { error } = await supabase.from("ad_account_types").insert(rows);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { created: rows.length } };
}

// ─────────────────────────────────────────
// upsertAdAccountType — admin create (no id) or edit (id). Column-
// allowlisted; tenant forced from the session; optimistic-concurrency
// guarded on edit.
// ─────────────────────────────────────────
export async function upsertAdAccountType(input: {
  id?: string;
  label: string;
  platform_group: string;
  default_fee_pct: number;
  api_topup_enabled?: boolean;
  is_active?: boolean;
  sort_order?: number;
  ifUpdatedAt?: string;
}): Promise<ActionResult<{ id: string }>> {
  const auth = await resolveAdminContext();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, profile } = auth.ctx;

  const label = String(input?.label ?? "").trim();
  const platform_group = String(
    input?.platform_group ?? "",
  ) as AdAccountPlatformGroup;

  if (!label) return { ok: false, error: "Enter a type name." };
  if (label.length > 60) {
    return { ok: false, error: "Type name is too long (max 60)." };
  }
  if (!GROUPS.includes(platform_group)) {
    return { ok: false, error: "Pick a platform group (Meta, Google or TikTok)." };
  }
  if (!isValidPct(input.default_fee_pct)) {
    return { ok: false, error: "Fee must be a percent between 0 and 100." };
  }

  // ---- UPDATE ----
  if (input.id) {
    const { data: existing, error: fetchErr } = await supabase
      .from("ad_account_types")
      .select("id, tenant_id, updated_at")
      .eq("id", input.id)
      .maybeSingle();
    if (fetchErr) return { ok: false, error: fetchErr.message };
    if (!existing) return { ok: false, error: "Type not found.", code: "not_found" };
    if (existing.tenant_id !== profile.tenant_id) {
      return { ok: false, error: "Forbidden", code: "forbidden" };
    }
    if (!versionMatches(existing.updated_at, input.ifUpdatedAt)) {
      return {
        ok: false,
        error: "This type was changed elsewhere. Reload and try again.",
        code: "conflict",
      };
    }

    const patch: Record<string, unknown> = {
      label,
      platform_group,
      default_fee_pct: input.default_fee_pct,
      updated_by: profile.user_id,
    };
    if (typeof input.api_topup_enabled === "boolean") {
      patch.api_topup_enabled = input.api_topup_enabled;
    }
    if (typeof input.is_active === "boolean") patch.is_active = input.is_active;
    if (typeof input.sort_order === "number") patch.sort_order = input.sort_order;

    const { error } = await supabase
      .from("ad_account_types")
      .update(patch)
      .eq("id", input.id)
      .eq("tenant_id", profile.tenant_id);
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: { id: input.id } };
  }

  // ---- CREATE ----
  // Unique slug per tenant: slugify, then dedupe against existing.
  const base = slugify(label) || "type";
  const { data: siblings } = await supabase
    .from("ad_account_types")
    .select("slug, sort_order")
    .eq("tenant_id", profile.tenant_id);
  const taken = new Set((siblings ?? []).map((s) => s.slug));
  let slug = base;
  let n = 2;
  while (taken.has(slug)) slug = `${base}-${n++}`;

  const maxOrder = (siblings ?? []).reduce(
    (m, s) => Math.max(m, Number(s.sort_order) || 0),
    0,
  );
  const sort_order =
    typeof input.sort_order === "number" ? input.sort_order : maxOrder + 1;

  const { data, error } = await supabase
    .from("ad_account_types")
    .insert({
      tenant_id: profile.tenant_id,
      label,
      slug,
      platform_group,
      default_fee_pct: input.default_fee_pct,
      api_topup_enabled: input.api_topup_enabled ?? false,
      is_active: input.is_active ?? true,
      sort_order,
      updated_by: profile.user_id,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { id: data.id } };
}
