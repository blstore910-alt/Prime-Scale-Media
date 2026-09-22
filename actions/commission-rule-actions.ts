"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { safeErrorMessage } from "@/lib/pure-error";
import { sameSlug } from "@/lib/pure-slug-key";
import type { CommissionSource } from "@/lib/pure-commission-rules";
import { type ActionResult, resolveOwnerContext } from "./_shared";

export type CommissionRuleChange = {
  source: CommissionSource;
  /** Top-ups only; null = every account type. */
  adAccountType: string | null;
  /** null clears this level from now on; the next level down applies.
   *  Percentage sources only. */
  pct: number | null;
  /** One-time only: a fixed amount (null clears) and its currency. */
  amount?: number | null;
  currency?: string | null;
};

// Postgres: relation does not exist. The table arrives with plak 35;
// until it is pasted the editor says so instead of failing vaguely.
const MISSING_TABLE = "42P01";

/**
 * Save what an affiliate (or, with `affiliateAdvertiserId: null`, every
 * affiliate by default) earns FROM NOW ON.
 *
 * Append-only by construction. Nothing here updates or deletes a rule:
 * each change is a new version stamped `effective_from = now()`, and the
 * accrual trigger picks whichever version had started when the top-up was
 * verified or the invoice was paid. So commission already booked is never
 * touched, and the history of who changed what, when, is the table
 * itself. That is the owner's rule: "what he earned until now stays, new
 * rules count from now".
 *
 * OWNER ONLY. A rule decides how much of our profit goes out of the door;
 * an employee admin can read the rules and the commissions, not set them.
 */
export async function saveCommissionRules(input: {
  affiliateAdvertiserId: string | null;
  changes: CommissionRuleChange[];
}): Promise<ActionResult<{ saved: number; effectiveFrom: string }>> {
  const auth = await resolveOwnerContext();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, profile } = auth.ctx;

  const changes = Array.isArray(input?.changes) ? input.changes : [];
  if (changes.length === 0) {
    return { ok: false, error: "Nothing changed, so nothing was saved." };
  }
  if (changes.length > 100) {
    return { ok: false, error: "Too many changes at once." };
  }

  // ── WHOSE RULES ─────────────────────────────────────────────────
  const affiliateId =
    input?.affiliateAdvertiserId === null ||
    input?.affiliateAdvertiserId === undefined
      ? null
      : String(input.affiliateAdvertiserId);
  if (affiliateId !== null) {
    const { data: adv, error: advErr } = await supabase
      .from("advertisers")
      .select("id, tenant_id")
      .eq("id", affiliateId)
      .maybeSingle();
    if (advErr) return { ok: false, error: safeErrorMessage(advErr) };
    if (!adv || adv.tenant_id !== profile.tenant_id) {
      return { ok: false, error: "That affiliate is not in your organisation." };
    }
  }

  // ── WHICH TYPES EXIST ───────────────────────────────────────────
  // A rule for a type nobody has is a rule that never applies, and the
  // owner would read it as working. Store the tenant's own spelling of
  // the slug, matched on its words (see lib/pure-slug-key).
  const needsTypes = changes.some((c) => c?.adAccountType);
  let typeSlugs: string[] = [];
  if (needsTypes) {
    const { data: types, error: typesErr } = await supabase
      .from("ad_account_types")
      .select("slug")
      .eq("tenant_id", profile.tenant_id);
    if (typesErr) return { ok: false, error: safeErrorMessage(typesErr) };
    typeSlugs = (types ?? []).map((t) => String(t.slug));
  }

  const effectiveFrom = new Date().toISOString();
  const seen = new Set<string>();
  const rows: Array<Record<string, unknown>> = [];
  for (const c of changes) {
    const source = c?.source;
    if (
      source !== "topup" &&
      source !== "subscription" &&
      source !== "onetime" &&
      source !== "first_topup"
    ) {
      return { ok: false, error: "Unknown commission source." };
    }
    if (source === "onetime") {
      // A fixed amount, once per referred customer. No type, no percentage.
      if (c.adAccountType) {
        return { ok: false, error: "A one-time bonus is not set per account type." };
      }
      let amount: number | null = null;
      let currency: string | null = null;
      if (c.amount !== null && c.amount !== undefined) {
        const n = Number(c.amount);
        if (!Number.isFinite(n) || n < 0 || n > 100000) {
          return { ok: false, error: "A one-time amount must be between 0 and 100,000." };
        }
        amount = Math.round(n * 100) / 100;
        currency = String(c.currency ?? "").toUpperCase();
        if (currency !== "EUR" && currency !== "USD") {
          return { ok: false, error: "A one-time amount needs a currency: EUR or USD." };
        }
      }
      const okey = "onetime|*";
      if (seen.has(okey)) {
        return { ok: false, error: "The same rule was changed twice." };
      }
      seen.add(okey);
      rows.push({
        tenant_id: profile.tenant_id,
        affiliate_advertiser_id: affiliateId,
        source,
        ad_account_type: null,
        pct: null,
        amount,
        currency,
        effective_from: effectiveFrom,
        created_by: profile.id,
      });
      continue;
    }
    let type: string | null = null;
    if (c.adAccountType) {
      // Only the plain top-up rule is per account type; subscriptions and
      // the first-top-up rule apply to every type.
      if (source !== "topup") {
        return {
          ok: false,
          error: "Only top-up rules can be set per account type.",
        };
      }
      const match = typeSlugs.find((s) => sameSlug(s, c.adAccountType));
      if (!match) {
        return {
          ok: false,
          error: `There is no account type "${c.adAccountType}" in your settings.`,
        };
      }
      type = match;
    }
    let pct: number | null = null;
    if (c.pct !== null && c.pct !== undefined) {
      const n = Number(c.pct);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        return { ok: false, error: "A percentage must be between 0 and 100." };
      }
      pct = Math.round(n * 1000) / 1000;
    }
    const key = `${source}|${type ?? "*"}`;
    if (seen.has(key)) {
      return { ok: false, error: "The same rule was changed twice." };
    }
    seen.add(key);
    rows.push({
      tenant_id: profile.tenant_id,
      affiliate_advertiser_id: affiliateId,
      source,
      ad_account_type: type,
      pct,
      effective_from: effectiveFrom,
      created_by: profile.id,
    });
  }

  // Service key after the owner check and the validation above: the
  // table has no write grant for any session, on purpose.
  const admin = await createAdminClient();
  const { data: inserted, error } = await admin
    .from("commission_rules")
    .insert(rows)
    .select("id");
  if (error) {
    if ((error as { code?: string }).code === MISSING_TABLE) {
      return {
        ok: false,
        error:
          "Commission rules are not switched on in the database yet. Nothing was saved.",
      };
    }
    return { ok: false, error: safeErrorMessage(error) };
  }
  if ((inserted ?? []).length !== rows.length) {
    return {
      ok: false,
      error: "Not every change was saved. Reload and check the rules.",
    };
  }
  return { ok: true, data: { saved: rows.length, effectiveFrom } };
}

/**
 * Recalculate a commission that went ON HOLD because the supplier fee was
 * not recorded. Only once the fee is filled in does this produce a
 * figure; the database function refuses otherwise, and it refuses anyone
 * but the tenant owner (it checks tenants.owner_id = auth.uid()).
 *
 * The session client on purpose: the function is SECURITY DEFINER and
 * reads auth.uid() to decide who is asking.
 */
export async function recalculateCommission(
  commissionId: string,
): Promise<ActionResult<{ amount: number; currency: string | null }>> {
  const auth = await resolveOwnerContext();
  if (!auth.ok) return { ok: false, error: auth.error };
  if (typeof commissionId !== "string" || !commissionId) {
    return { ok: false, error: "Invalid commission." };
  }
  const { data, error } = await auth.ctx.supabase.rpc(
    "referral_commission_recalculate",
    { p_commission_id: commissionId },
  );
  if (error) {
    const msg = String(error.message ?? "");
    if (/PGRST202|could not find the function|does not exist/i.test(msg)) {
      return {
        ok: false,
        error: "Recalculating is not switched on in the database yet.",
      };
    }
    return { ok: false, error: safeErrorMessage(error) };
  }
  const r = (data ?? {}) as { amount?: number | string; currency?: string | null };
  return {
    ok: true,
    data: { amount: Number(r.amount ?? 0), currency: r.currency ?? null },
  };
}
