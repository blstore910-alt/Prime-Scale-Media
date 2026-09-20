import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Setting a customer's top-up fee is the owner's — but only when it is a
 * PRICE, not when it is the rate that was already agreed.
 *
 * ── WHY THIS IS NOT JUST "OWNER ONLY" ───────────────────────────────
 *
 * The first version of the rule refused any non-owner who sent a `fee`
 * at all. Both create dialogs auto-fill one — Quick Create sets the ad
 * account type's `default_fee_pct` the moment a platform is chosen, and
 * the create-from-request dialog prefills the advertiser's plan rate —
 * and a disabled input still submits its value. So an employee admin
 * could no longer create ANY ad account, and was told to "leave the fee
 * blank", which the form would not let them do. An admin fulfilling a
 * request the customer had already paid EUR 50 for was stopped at the
 * last step.
 *
 * ── WHY IT IS ALSO NOT JUST "ADMIN" ─────────────────────────────────
 *
 * resolveEffectiveFeePct reads `ad_accounts.fee` FIRST and it beats the
 * plan, so it overrides upsertPlan, upsertFeeDefault, upsertExchangeRate,
 * upsertAdAccountType and changeSubscriptionAmount — every one of which
 * was deliberately raised to owner-only. An employee moving one account
 * from 5% to 25% charges EUR 2,500 instead of EUR 500 on a EUR 10,000
 * top-up, invoiced, with no owner in the loop.
 *
 * ── THE RULE ─────────────────────────────────────────────────────────
 *
 * Nothing, zero, the customer's plan rate, or the ad-account type's own
 * default: an employee admin may set any of those, because none of them
 * is a decision about what this customer pays. Any other figure is a
 * price, and a price needs the owner.
 *
 * Read failures fail CLOSED — if we cannot find out what was agreed, we
 * cannot tell a price from the agreed rate, and the owner is the safe
 * answer. That direction stops a desk rather than mispricing an account.
 */
export async function feeIsAPrice(
  supabase: SupabaseClient,
  params: {
    advertiserId?: string | null;
    /** The ad-account type slug, when the caller knows it. */
    platform?: string | null;
    /** The tenant, so the type lookup cannot match another one's. */
    tenantId?: string | null;
    fee: unknown;
  },
): Promise<boolean> {
  const n = Number(params.fee);
  // Absent, unparseable or zero all mean "use whatever is configured".
  if (params.fee === null || params.fee === undefined || params.fee === "") {
    return false;
  }
  if (!Number.isFinite(n) || n <= 0) return false;

  const allowed: number[] = [];

  if (params.advertiserId) {
    const { data, error } = await supabase
      .from("advertiser_plans")
      .select("topup_fee_pct")
      .eq("advertiser_id", params.advertiserId)
      .maybeSingle();
    // A table or column a pending migration has not added is "no plan
    // configured", not a failure. Anything else is unreadable, and
    // unreadable means we cannot say this is the agreed rate.
    const code = (error as { code?: string } | null)?.code ?? "";
    if (error && code !== "42P01" && code !== "42703") return true;
    const pct = Number((data as { topup_fee_pct?: unknown } | null)?.topup_fee_pct);
    if (Number.isFinite(pct) && pct > 0) allowed.push(pct);
  }

  if (params.platform) {
    // ── .eq(tenant_id) OR maybeSingle() ERRORS FOR A TWO-TENANT ADMIN ─
    //
    // The unique key on ad_account_types is (tenant_id, slug) and the
    // read policy matches ANY of the caller's profiles -- and this app
    // explicitly supports one email in two tenants. Two rows come back,
    // maybeSingle() raises PGRST116, which is neither 42P01 nor 42703,
    // so it fell to "unreadable, therefore a price" and that admin
    // could not create an ad account at the TYPE DEFAULT at all.
    let q = supabase
      .from("ad_account_types")
      .select("default_fee_pct")
      .eq("slug", params.platform);
    if (params.tenantId) q = q.eq("tenant_id", params.tenantId);
    const { data, error } = await q.maybeSingle();
    const code = (error as { code?: string } | null)?.code ?? "";
    if (error && code !== "42P01" && code !== "42703") return true;
    const pct = Number(
      (data as { default_fee_pct?: unknown } | null)?.default_fee_pct,
    );
    if (Number.isFinite(pct) && pct > 0) allowed.push(pct);
  }

  // To the cent, so 5 and 5.00 are the same rate and 5.01 is not.
  const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;
  return !allowed.some((a) => r2(a) === r2(n));
}

/** Is this caller the tenant owner? Used with feeIsAPrice, above. */
export async function isTenantOwner(
  supabase: SupabaseClient,
  tenantId: string,
  userId: string,
): Promise<{ owner: boolean; unreadable: boolean }> {
  // The error was discarded, so a transient failure made the OWNER not
  // the owner -- and the message they then got was "only the
  // super-admin can set a different one", about themselves. Every
  // tenant member can read this row, so this is a transient path, not a
  // structural one; the caller says which it was.
  const { data, error } = await supabase
    .from("tenants")
    .select("owner_id")
    .eq("id", tenantId)
    .maybeSingle();
  if (error) return { owner: false, unreadable: true };
  return {
    owner: !!data && (data as { owner_id?: string }).owner_id === userId,
    unreadable: false,
  };
}
