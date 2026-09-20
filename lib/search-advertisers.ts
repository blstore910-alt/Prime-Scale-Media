import type { SupabaseClient } from "@supabase/supabase-js";
import { safeIlikeTerm } from "@/lib/utils/search";

/**
 * Which advertisers match what somebody typed — resolved to IDS FIRST.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────
 *
 * Two screens searched a customer by putting the filter on an EMBEDDED
 * column:
 *
 *     .select("*, advertiser:advertisers(tenant_client_code)")
 *     .or('advertiser.tenant_client_code.ilike."*PSM0005*"')
 *
 * PostgREST cannot restrict PARENT rows that way unless the embed is
 * `!inner`. Without it the filter applies to the embedded resource --
 * it nulls the advertiser on rows that do not match and returns every
 * parent row anyway. The comment in use-ad-account-requests names this
 * exactly ("the invoices search has been quietly broken for the same
 * reason") and neither hook was actually fixed.
 *
 * On /invoices that is not a cosmetic miss. /subscriptions puts an
 * "Invoices" button on every row linking to /invoices?q=<client code>;
 * the code fails the numeric test and lands in that branch. The screen
 * then asserts the narrow reading anyway -- the box is filled in, the
 * filter badge says 1 active, and the pager counts the UNRESTRICTED
 * set. An admin sees an unpaid EUR 200 row under what they believe is
 * PSM0005, presses Mark paid, and it lands on somebody else's invoice.
 * Paid is one-way: paid -> unpaid is refused, and a paid invoice cannot
 * be voided. EUR 200 written off a customer who never paid, and PSM0005
 * still owes it.
 *
 * Resolving to ids first is one extra round trip and it cannot be
 * misread: the caller filters on the parent's own column.
 *
 * Returns `null` when the term is empty -- "do not narrow". An empty
 * ARRAY means "narrowed, and nothing matched", which is a different
 * answer and the caller must render it as an empty list rather than
 * dropping the filter.
 */
export async function advertiserIdsMatching(
  supabase: SupabaseClient,
  tenantId: string | null | undefined,
  rawTerm: string | null | undefined,
): Promise<string[] | null> {
  const term = safeIlikeTerm(String(rawTerm ?? "").trim());
  if (!term || !tenantId) return null;

  const ids = new Set<string>();

  // The client code, which is what every screen prints and what the
  // Invoices button passes.
  const byCode = await supabase
    .from("advertisers")
    .select("id")
    .eq("tenant_id", tenantId)
    .ilike("tenant_client_code", `%${term}%`)
    .limit(500);
  if (byCode.error) throw byCode.error;
  for (const r of byCode.data ?? []) ids.add(String((r as { id: string }).id));

  // ...and the person's own name or email, because that is the other
  // thing somebody types into a box labelled "search".
  const byPerson = await supabase
    .from("user_profiles")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .or(`full_name.ilike."*${term}*",email.ilike."*${term}*"`)
    .limit(500);
  if (byPerson.error) throw byPerson.error;
  const userIds = (byPerson.data ?? [])
    .map((r) => (r as { user_id: string | null }).user_id)
    .filter((v): v is string => typeof v === "string" && v.length > 0);
  if (userIds.length > 0) {
    const byUser = await supabase
      .from("advertisers")
      .select("id")
      .eq("tenant_id", tenantId)
      .in("user_id", userIds)
      .limit(500);
    if (byUser.error) throw byUser.error;
    for (const r of byUser.data ?? []) ids.add(String((r as { id: string }).id));
  }

  return Array.from(ids);
}
