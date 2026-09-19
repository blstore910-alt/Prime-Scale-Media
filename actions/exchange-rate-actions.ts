"use server";

import { getExchangeRate } from "@/lib/get-exchange-rates";
import { createClient } from "@/lib/supabase/server";
import { formatRate } from "@/lib/utils";
import { cookies } from "next/headers";
import { maintenanceGuard, wroteSomething,
  resolveOwnerContext,
} from "./_shared";

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

// Sanity bounds — reject 3rd-party API responses that look garbage.
function isSaneRate(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 && v < 1000;
}

// ─────────────────────────────────────────
// ensureInitialExchangeRates
//
// Called once per admin session load. If no active rate exists for the
// tenant, fetch USD rates from the 3rd-party API, validate, and insert.
// Server-side so the anon key never touches exchange_rates.
// ─────────────────────────────────────────
export async function ensureInitialExchangeRates(): Promise<
  ActionResult<{ created: boolean }>
> {
  const ctx = await requireAdminCtx();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const { supabase, profile } = ctx;

  // ── SEEDING IS THE OWNER'S, TOO ─────────────────────────────────────
  //
  // Every real write in this file is resolveOwnerContext, with a comment
  // saying "the UI said owner-only; nothing behind it agreed". The
  // SEEDER was left at admin level — and app-provider calls
  // ensureTenantBootstrap once per session from every shell. So on a
  // tenant with no rate row yet, whichever employee admin opened the app
  // first set the rate that calculateTopupAmount divides by, from an
  // unauthenticated CDN, by loading a page.
  //
  // It is a no-op when a rate already exists, so gating it costs nothing
  // in the normal case and closes the one case that matters.
  {
    const { data: ownerRow } = await supabase
      .from("tenants")
      .select("owner_id")
      .eq("id", profile.tenant_id)
      .maybeSingle();
    if (
      !ownerRow ||
      (ownerRow as { owner_id: string | null }).owner_id !== profile.user_id
    ) {
      return { ok: false, error: "Forbidden" };
    }
  }

  // ── The guard has to survive the state it is guarding against ──────
  // This was .maybeSingle(), whose ERROR was discarded — and maybeSingle
  // ERRORS when two or more rows match. So the moment a tenant ended up
  // with two active rates, `existing` came back null and this function
  // inserted a THIRD, then a fourth on the next session. Self-amplifying,
  // and it reported { created: true } every time.
  //
  // A limit(1) list cannot fail that way: any number of active rows is
  // "there is already one" and this returns without writing.
  const { data: existingRows, error: existingErr } = await supabase
    .from("exchange_rates")
    .select("id")
    .eq("tenant_id", profile.tenant_id)
    .eq("is_active", true)
    .limit(1);
  // A failed READ is not permission to write. This runs on every browser
  // session via ensureTenantBootstrap, so erring the other way would mean
  // a transient error minting a duplicate rate row.
  if (existingErr) {
    return { ok: false, error: existingErr.message };
  }
  if ((existingRows ?? []).length > 0) {
    return { ok: true, data: { created: false } };
  }

  // ── AND HAS THIS TENANT EVER HAD A RATE? ───────────────────────────
  //
  // "No ACTIVE rate" is two different situations. One is a brand-new
  // tenant, which is what this function is for. The other is a tenant
  // whose owner stood the old rate down — upsertExchangeRate deactivates
  // first, in a separate statement — and whose second write then failed,
  // or who deactivated one deliberately.
  //
  // In that second case the next EMPLOYEE admin to open any page would
  // fetch a rate from an unpinned public CDN and publish it as the
  // tenant's active rate. upsertExchangeRate was deliberately raised to
  // owner-only because "an employee admin could change the rate every
  // conversion in the app divides by" — and this routed straight around
  // that gate, on a page load, with no one pressing anything.
  //
  // A tenant that has ever had a rate does not get one invented for it.
  const { data: everRows, error: everErr } = await supabase
    .from("exchange_rates")
    .select("id")
    .eq("tenant_id", profile.tenant_id)
    .limit(1);
  if (everErr) return { ok: false, error: everErr.message };
  if ((everRows ?? []).length > 0) {
    return { ok: true, data: { created: false } };
  }

  let usdRates;
  try {
    usdRates = await getExchangeRate("USD");
  } catch (err) {
    return {
      ok: false,
      error: `Exchange rate provider unavailable: ${
        err instanceof Error ? err.message : "unknown"
      }`,
    };
  }
  const eur = Number(formatRate(usdRates?.usd?.eur));
  const gbp = Number(formatRate(usdRates?.usd?.gbp));
  const hkd = Number(formatRate(usdRates?.usd?.hkd));
  if (!isSaneRate(eur) || !isSaneRate(gbp) || !isSaneRate(hkd)) {
    return { ok: false, error: "Exchange rate response failed validation" };
  }

  // insert, not upsert. The upsert had NO conflict target and no id in
  // the payload, so it was a plain INSERT wearing the word "upsert" — the
  // exact hazard upsertExchangeRate documents forty lines below ("saving
  // rates a second time left two rows active, and from that moment
  // maybeSingle() returned PGRST116 to every caller: the top-up
  // calculator, the fee preview, the request form"). Calling it insert is
  // honest about what it does; the guard above is what makes it safe.
  const { data: created, error } = await supabase
    .from("exchange_rates")
    .insert({
      currency: "USD",
      eur,
      gbp,
      hkd,
      is_active: true,
      tenant_id: profile.tenant_id,
      updated_by: profile.user_id,
      updated_at: new Date().toISOString(),
    })
    .select("id");
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { created: (created ?? []).length > 0 } };
}

// ─────────────────────────────────────────
// upsertExchangeRate — admin edit from settings UI
// ─────────────────────────────────────────
type UpsertRateInput = {
  currency: string;
  eur: number;
  gbp: number;
  hkd: number;
  is_active?: boolean;
};

export async function upsertExchangeRate(
  input: UpsertRateInput,
): Promise<ActionResult> {
  // OWNER, not admin. This was enforced only by the settings layout
  // calling requireSuperAdmin — a page guard, which a server action never
  // goes through. So an employee admin could invoke this directly and
  // change the rate every conversion in the app divides by. The UI said owner-only; nothing behind it agreed.
  const auth = await resolveOwnerContext();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, profile } = auth.ctx;

  const currency = String(input?.currency ?? "").toUpperCase();
  if (!["USD", "EUR", "GBP", "HKD"].includes(currency)) {
    return { ok: false, error: "Unsupported currency" };
  }
  if (
    !isSaneRate(input.eur) ||
    !isSaneRate(input.gbp) ||
    !isSaneRate(input.hkd)
  ) {
    return { ok: false, error: "Rate values out of range" };
  }

  const makeActive = input.is_active ?? true;

  // Every reader of this table does
  //   .eq("tenant_id", …).eq("is_active", true).maybeSingle()
  // so the tenant may have exactly ONE active row. The upsert below has no
  // conflict target and the payload carries no id, so it INSERTS — saving
  // rates a second time left two rows active, and from that moment
  // maybeSingle() returned PGRST116 ("more than one row") to every caller:
  // the top-up calculator, the fee preview, the request form. The app stops
  // being able to convert currency at all, and the only visible symptom is
  // things quietly failing elsewhere.
  //
  // So: stand the new row down over the old one, explicitly, first. Two
  // statements rather than one — if the deactivate succeeds and the write
  // then fails, the tenant is left with NO active row, which every reader
  // already handles (maybeSingle returns null) and which is recoverable by
  // saving again. The other order could leave two active rows, which is the
  // state we are removing.
  if (makeActive) {
    // No row count here ON PURPOSE: "stand down whatever is active" matches
    // nothing on a tenant that has never had an active rate, which is the
    // normal first-save case.
    const { error: standDownError } = await supabase
      .from("exchange_rates")
      .update({ is_active: false })
      .eq("tenant_id", profile.tenant_id)
      .eq("is_active", true);
    if (standDownError) return { ok: false, error: standDownError.message };
  }

  // Update the tenant's row for this currency if it exists, insert if not.
  // There is no unique constraint on (tenant_id, currency) in the repo
  // migrations to conflict-target, so this is done by hand.
  const { data: existing } = await supabase
    .from("exchange_rates")
    .select("id")
    .eq("tenant_id", profile.tenant_id)
    .eq("currency", currency)
    .limit(1)
    .maybeSingle();

  const row = {
    currency,
    eur: input.eur,
    gbp: input.gbp,
    hkd: input.hkd,
    is_active: makeActive,
    tenant_id: profile.tenant_id,
    updated_by: profile.user_id,
    updated_at: new Date().toISOString(),
  };

  // Count the rows on the UPDATE branch. A rate that reports saved and did
  // not is the worst of the three: the previous row was already stood down
  // just above, so the tenant would be left with no active rate at all while
  // the screen says the new one is in force.
  if (existing?.id) {
    const { data: rows, error } = await supabase
      .from("exchange_rates")
      .update(row)
      .eq("id", existing.id)
      .select("id");
    if (error) return { ok: false, error: error.message };
    const wrote = wroteSomething(rows);
    if (!wrote.ok) return wrote;
  } else {
    const { error } = await supabase.from("exchange_rates").insert(row);
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true, data: null };
}

// ─────────────────────────────────────────
// latestReferenceRates — the provider fetch, SERVER-SIDE
// ─────────────────────────────────────────
// "Apply Latest Rates" used to call lib/get-exchange-rates.ts straight from
// the browser, so an admin's device fetched the numbers that price every
// conversion in the app from an unauthenticated CDN. A poisoned or stale
// response there becomes a wrong rate on every top-up, every profit figure
// and every balance shown in the other currency — and it also violated the
// app's own connect-src, which meant the button was one CSP flip away from
// failing with a generic "provider unavailable".
//
// Same helper, same provider, fetched by us. Admin-gated because the result
// is what the caller is about to write.
export async function latestReferenceRates(): Promise<
  ActionResult<Record<string, number>>
> {
  const ctx = await requireAdminCtx();
  if (!ctx.ok) return { ok: false, error: ctx.error };

  try {
    const data = await getExchangeRate("USD");
    const usd = (data as { usd?: Record<string, number> } | undefined)?.usd;
    if (!usd || typeof usd !== "object") {
      return { ok: false, error: "The rate provider returned no USD rates." };
    }
    return { ok: true, data: usd };
  } catch (err) {
    return {
      ok: false,
      error: `Rate provider unavailable: ${
        err instanceof Error ? err.message : "unknown"
      }`,
    };
  }
}
