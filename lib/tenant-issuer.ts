import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * THE COMPANY WE INVOICE FROM.
 *
 * One row per tenant in `companies` with `advertiser_id IS NULL` — the
 * tenant's own details, printed as the sender on every invoice. Every
 * other row in that table belongs to a customer.
 *
 * ── WHY THIS IS A FUNCTION AND NOT SEVEN COPIES OF A QUERY ────────
 *
 * It was seven copies of
 *
 *     .eq("tenant_id", t).is("advertiser_id", null).maybeSingle()
 *
 * and `maybeSingle()` does not mean "give me one of them". On more
 * than one row it returns PGRST116 with status 406 and no data — an
 * ERROR, not a null.
 *
 * That looked safe because there is exactly one such row today. But
 * `companies.advertiser_id` is `ON DELETE SET NULL`, so deleting an
 * advertiser turns their company into another issuer. Measured 29-09
 * on the real tenant: 1 issuer and 11 customer companies, all eleven
 * belonging to the test accounts we are about to clear out. Deleting
 * them would have produced twelve issuers and:
 *
 *   - every invoice PDF 500s, for every customer, permanently
 *   - the invoice export 500s
 *   - the admin Settings screen throws
 *   - and worst, `saveTenantCompany` IGNORED the error, found no
 *     existing row, and INSERTED ANOTHER issuer — so every save made
 *     it further from repairable
 *
 * None of that is about deletion really. It is that seven places
 * asked a question that has no single answer and assumed it did.
 *
 * ── SO: DETERMINISTIC, AND NEVER AN ERROR ─────────────────────────
 *
 * Oldest first, take one. With one row it behaves exactly as before.
 * With none it returns null, which every caller already handles. With
 * twelve it returns the original — the one that was there before
 * anybody was deleted — instead of breaking.
 *
 * `found` is separate from `issuer` on purpose: a read that FAILED is
 * not a tenant without an issuer, and the caller that writes needs to
 * tell those apart before it inserts a second one.
 */
export async function tenantIssuerCompany(
  supabase: SupabaseClient,
  tenantId: string | null | undefined,
  columns = "*",
): Promise<{
  issuer: Record<string, unknown> | null;
  /** False when the read itself failed. Not the same as "there is none". */
  ok: boolean;
  error: string | null;
}> {
  if (!tenantId) return { issuer: null, ok: true, error: null };

  const { data, error } = await supabase
    .from("companies")
    .select(columns)
    .eq("tenant_id", tenantId)
    .is("advertiser_id", null)
    // Oldest first: if a customer company ever becomes an issuer by
    // having its advertiser deleted, the REAL one is still the one
    // that was created first.
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) return { issuer: null, ok: false, error: error.message };
  const row = (data ?? [])[0] ?? null;
  return {
    issuer: row as unknown as Record<string, unknown> | null,
    ok: true,
    error: null,
  };
}
