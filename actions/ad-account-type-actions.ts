"use server";

import {
  AD_ACCOUNT_TYPE_SEED,
  type AdAccountPlatformGroup,
  type AdAccountType,
  type AdAccountTypeOption,
} from "@/lib/types/ad-account-type";
import { isMissingColumn } from "@/lib/page-all-rows";
import { normalizeSupplierUrl } from "@/lib/pure-supplier-link";
import {
  type ActionResult,
  resolveAdminContext,
  versionMatches,
  wroteSomething,
  resolveOwnerContext,
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

  // A COLUMN A MIGRATION HAS NOT ADDED YET. supplier_label/_url arrive
  // with 20260920120000, and code reaches production in minutes while
  // migrations are pasted by hand — so ask for them, and on error ask
  // again without them. The supplier link stays dark until the
  // migration lands instead of taking the settings screen down.
  const BASE =
    "id, tenant_id, label, slug, platform_group, default_fee_pct, api_topup_enabled, is_active, sort_order, updated_by, created_at, updated_at";
  const query = (cols: string) =>
    supabase
      .from("ad_account_types")
      .select(cols)
      .eq("tenant_id", profile.tenant_id)
      .order("sort_order", { ascending: true })
      .order("label", { ascending: true });

  let { data, error } = await query(`${BASE}, supplier_label, supplier_url`);
  if (error) ({ data, error } = await query(BASE));
  if (error) return { ok: false, error: error.message };

  return { ok: true, data: (data ?? []) as unknown as AdAccountType[] };
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
  supplier_label?: string | null;
  supplier_url?: string | null;
  ifUpdatedAt?: string;
}): Promise<ActionResult<{ id: string }>> {
  // OWNER, not admin. This was enforced only by the settings layout
  // calling requireSuperAdmin — a page guard, which a server action never
  // goes through. So an employee admin could invoke this directly and
  // change the default fee applied to every new ad account. The UI said owner-only; nothing behind it agreed.
  const auth = await resolveOwnerContext();
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

  // ── THE LINK IS NORMALISED HERE, NOT ONLY IN THE COMPONENT ────────
  //
  // A server action is reachable without the form, so a client-side
  // check is a convenience and not a guard. normalizeSupplierUrl
  // refuses anything that is not http(s) — a pasted `javascript:` URL
  // would otherwise be stored and later rendered as an href an admin
  // clicks, inside their own session.
  const supplierTouched =
    Object.hasOwn(input, "supplier_label") ||
    Object.hasOwn(input, "supplier_url");
  const supplierLabel = String(input.supplier_label ?? "").trim().slice(0, 60);
  const rawUrl = String(input.supplier_url ?? "").trim();
  const supplierUrl = rawUrl ? normalizeSupplierUrl(rawUrl) : null;
  if (rawUrl && !supplierUrl) {
    return {
      ok: false,
      error: "The supplier dashboard link must be an http or https address.",
    };
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
    if (supplierTouched) {
      patch.supplier_label = supplierLabel || null;
      patch.supplier_url = supplierUrl;
    }

    let { data: rows, error } = await supabase
      .from("ad_account_types")
      .update(patch)
      .eq("id", input.id)
      .eq("tenant_id", profile.tenant_id)
      .select("id");
    // Writing a column the migration has not added yet fails the WHOLE
    // update, so the fee change the admin actually came here for would
    // be lost too. Drop the supplier fields and write the rest, and say
    // so rather than reporting a clean save.
    let supplierDropped = false;
    if (error && supplierTouched) {
      delete patch.supplier_label;
      delete patch.supplier_url;
      supplierDropped = true;
      ({ data: rows, error } = await supabase
        .from("ad_account_types")
        .update(patch)
        .eq("id", input.id)
        .eq("tenant_id", profile.tenant_id)
        .select("id"));
    }
    if (error) return { ok: false, error: error.message };
    // An UPDATE that matches nothing is not an error in PostgREST, so this
    // used to report a saved fee change that never happened — and the fee is
    // what every future top-up on that type is charged at.
    const wrote = wroteSomething(rows);
    if (!wrote.ok) return wrote;
    return {
      ok: true,
      data: { id: input.id },
      warning: supplierDropped
        ? "Saved, but the supplier link was not: that column is not on the database yet."
        : undefined,
    };
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

  // ── THE LIVE TABLE IS NOT THE MIGRATION ─────────────────────────────
  //
  // This inserted one fixed row shape, so ANY column the live database
  // does not have — supplier_label and supplier_url arrive with
  // 20260920120000, and sort_order/updated_by are only guaranteed by a
  // migration that may itself never have been pasted — failed the whole
  // insert and "Add a type" did nothing but show a red toast.
  //
  // So: the full row, then the row without the newest columns, then the
  // row with only what the table has had since the day it was created.
  // Whatever lands, the type exists; what could not be written is named
  // rather than reported as saved.
  const core: Record<string, unknown> = {
    tenant_id: profile.tenant_id,
    label,
    slug,
    platform_group,
    default_fee_pct: input.default_fee_pct,
    api_topup_enabled: input.api_topup_enabled ?? false,
    is_active: input.is_active ?? true,
  };
  const withOrder = { ...core, sort_order, updated_by: profile.user_id };
  const full = supplierTouched
    ? {
        ...withOrder,
        supplier_label: supplierLabel || null,
        supplier_url: supplierUrl,
      }
    : withOrder;

  const attempts: Array<{ row: Record<string, unknown>; lost: string | null }> =
    full === withOrder
      ? [
          { row: withOrder, lost: null },
          { row: core, lost: "sort order" },
        ]
      : [
          { row: full, lost: null },
          { row: withOrder, lost: "the supplier link" },
          { row: core, lost: "the supplier link and the sort order" },
        ];

  let lastError = "";
  for (const attempt of attempts) {
    const { data, error } = await supabase
      .from("ad_account_types")
      .insert(attempt.row)
      .select("id")
      .single();
    if (!error) {
      return {
        ok: true,
        data: { id: data.id },
        warning: attempt.lost
          ? `Type created, but ${attempt.lost} could not be saved: that column is not on the database yet.`
          : undefined,
      };
    }
    lastError = error.message;
    // Only a missing column is worth retrying a narrower row for. A
    // duplicate name, a failed policy or a broken constraint will fail
    // exactly the same way three times, and the caller needs to be told
    // what it actually was.
    if (!isMissingColumn(error.message)) break;
  }

  // The real message, not "something went wrong". This is the owner's
  // own settings screen and the reason matters: a policy refusal, a
  // duplicate slug and a missing column each need a different answer.
  return { ok: false, error: lastError || "The type could not be created." };
}
