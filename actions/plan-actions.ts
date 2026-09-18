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
  wroteSomething,
  resolveOwnerContext,
} from "./_shared";

const KINDS: PlanKind[] = ["tier", "community"];
const CURRENCIES: PlanCurrency[] = ["EUR", "USD"];

const SELECT_COLS =
  "id, tenant_id, name, kind, monthly_fee, currency, included_ad_accounts, topup_fee_pct, is_active, sort_order, updated_by, created_at, updated_at";

/**
 * The per-currency prices live in a migration applied BY HAND, while this
 * code deploys in two minutes. Naming a column the live database does not
 * have yet makes PostgREST throw, and the message lands on the admin's
 * screen in place of the plans list — which is exactly how `plans.features`
 * reached a customer earlier today. See the rule in CLAUDE.md.
 *
 * So: ask for them, and if the database has not got them yet, ask again
 * without. A missing price is derived by lib/pure-plan-price.ts, so the
 * screen is correct either way — it just cannot pin one until the
 * migration lands.
 */
const PRICE_COLS = "monthly_fee_eur, monthly_fee_usd, yearly_fee_eur, yearly_fee_usd, yearly_discount_pct";

function missingPriceColumn(err: { message?: string; code?: string } | null): boolean {
  if (!err) return false;
  const m = (err.message ?? "").toLowerCase();
  return (
    err.code === "42703" ||
    m.includes("does not exist") ||
    m.includes("could not find")
  );
}

// ─────────────────────────────────────────
// listPlans — admin, all presets for the settings screen.
// ─────────────────────────────────────────
export async function listPlans(): Promise<ActionResult<Plan[]>> {
  const auth = await resolveAdminContext();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, profile } = auth.ctx;

  const query = (cols: string) =>
    supabase
      .from("plans")
      .select(cols)
      .eq("tenant_id", profile.tenant_id)
      .order("kind", { ascending: true })
      .order("sort_order", { ascending: true });

  let { data, error } = await query(`${SELECT_COLS}, ${PRICE_COLS}`);
  if (error && missingPriceColumn(error)) {
    ({ data, error } = await query(SELECT_COLS));
  }
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []) as unknown as Plan[] };
}

// ─────────────────────────────────────────
// listActivePlans — the minimal shape the invite form pre-fills from.
// ─────────────────────────────────────────
export async function listActivePlans(): Promise<ActionResult<PlanOption[]>> {
  const auth = await resolveAdminContext();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, profile } = auth.ctx;

  const BASE =
    "id, name, kind, monthly_fee, currency, included_ad_accounts, topup_fee_pct";
  const query = (cols: string) =>
    supabase
      .from("plans")
      .select(cols)
      .eq("tenant_id", profile.tenant_id)
      .eq("is_active", true)
      .order("kind", { ascending: true })
      .order("sort_order", { ascending: true });

  let { data, error } = await query(`${BASE}, ${PRICE_COLS}`);
  if (error && missingPriceColumn(error)) {
    ({ data, error } = await query(BASE));
  }
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []) as unknown as PlanOption[] };
}

/**
 * A number, or null when the caller did not give one.
 *
 * AN EMPTY BOX IS NOT A ZERO. `Number("")` and `Number(null)` are both 0,
 * and both are finite and within every range here — so the guards below
 * (`if (monthly == null) return "Monthly fee must be >= 0"`) could never
 * fire for a blank field. An owner who cleared the Monthly box on the EUR
 * 200 Prime plan and pressed Save got "Saved 1 plan(s)" and a
 * monthly_fee of 0. Every invite afterwards prefills 0, and a
 * subscription of amount 0 "correctly creates no subscription at all" —
 * so every customer invited on that plan is billed nothing, for ever, at
 * EUR 2,400 a year each. The same helper governs topup_fee_pct, where a
 * blank became a permanent 0% fee.
 *
 * The contradiction was inside one feature: the per-currency price box
 * in the same form deliberately maps "" to null with the comment "an
 * empty box must never arrive as a zero". The base fee did the opposite.
 *
 * A real zero still passes — free is a decision somebody can make, and
 * they make it by typing 0.
 */
function num(v: unknown, min: number, max: number): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" && v.trim() === "") return null;
  // Booleans and arrays coerce to numbers too: Number(true) is 1,
  // Number([]) is 0, Number([5]) is 5. None of those is somebody typing
  // a price.
  if (typeof v !== "number" && typeof v !== "string") return null;
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
  // Prices somebody CHOSE, per currency and term. null clears one back to
  // derived; undefined (absent) leaves it alone. Zero is free, and is a
  // decision — see lib/pure-plan-price.ts.
  monthly_fee_eur?: number | null;
  monthly_fee_usd?: number | null;
  yearly_fee_eur?: number | null;
  yearly_fee_usd?: number | null;
  yearly_discount_pct?: number | null;
  ifUpdatedAt?: string;
}): Promise<ActionResult<{ id: string }>> {
  // OWNER, not admin. This was enforced only by the settings layout
  // calling requireSuperAdmin — a page guard, which a server action never
  // goes through. So an employee admin could invoke this directly and
  // change a customer's monthly price and their included ad accounts. The UI said owner-only; nothing behind it agreed.
  const auth = await resolveOwnerContext();
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

  // ── The per-currency prices, still column-allowlisted ───────────────
  // Only the keys actually supplied are touched, so a screen that does
  // not know about prices cannot blank one by omission.
  const PRICE_KEYS = [
    "monthly_fee_eur",
    "monthly_fee_usd",
    "yearly_fee_eur",
    "yearly_fee_usd",
  ] as const;
  let touchesPrices = false;
  for (const k of PRICE_KEYS) {
    const v = input[k];
    if (v === undefined) continue;
    touchesPrices = true;
    if (v === null) {
      patch[k] = null; // back to derived
      continue;
    }
    const parsed = num(v, 0, 1_000_000);
    if (parsed == null) {
      return { ok: false, error: `${k.replace(/_/g, " ")} must be 0 or more.` };
    }
    patch[k] = parsed;
  }
  if (input.yearly_discount_pct !== undefined) {
    touchesPrices = true;
    if (input.yearly_discount_pct === null) {
      patch.yearly_discount_pct = null;
    } else {
      const d = num(input.yearly_discount_pct, 0, 99);
      if (d == null) {
        return { ok: false, error: "Yearly discount must be 0–99%." };
      }
      patch.yearly_discount_pct = d;
    }
  }

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
    const { data: rows, error } = await supabase
      .from("plans")
      .update(patch)
      .eq("id", input.id)
      .eq("tenant_id", profile.tenant_id)
      .select("id");
    if (error) {
      // Naming a column the live database has not got yet fails here. The
      // admin typed a price; dropping it silently and reporting success
      // would be the worst of the three options.
      if (touchesPrices && missingPriceColumn(error)) {
        return {
          ok: false,
          error:
            "Per-currency prices need migration 20260918300000. Apply it, then set the price again.",
        };
      }
      return { ok: false, error: error.message };
    }
    // A plan carries the monthly fee, the included accounts and the topup
    // fee an advertiser is invited on. A save that quietly wrote nothing
    // means the next invite uses the old numbers.
    const wrote = wroteSomething(rows);
    if (!wrote.ok) return wrote;
    return { ok: true, data: { id: input.id } };
  }

  const { data, error } = await supabase
    .from("plans")
    .insert({ ...patch, tenant_id: profile.tenant_id })
    .select("id")
    .single();
  if (error) {
    if (touchesPrices && missingPriceColumn(error)) {
      return {
        ok: false,
        error:
          "Per-currency prices need migration 20260918300000. Apply it, then set the price again.",
      };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true, data: { id: data.id } };
}
