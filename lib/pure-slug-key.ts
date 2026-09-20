// ─────────────────────────────────────────────────────────────────────
// Two spellings of the same ad-account type
// ─────────────────────────────────────────────────────────────────────
// The seed migration writes `eu-meta-premium`. A type created through
// /settings/ad-account-types is slugified from its LABEL, so
// "Meta-EU-Premium" becomes `meta-eu-premium`. They are the same type,
// written by two different hands.
//
// lib/bank-routing.ts hit this first and fixed it there: on that tenant
// NONE of the eight live types matched the routing map, so the Banks
// page could not name a single destination. That fallback was safe.
//
// THE MONEY PATH IS NOT SAFE IN THE SAME WAY. resolveEffectiveFeePct
// takes two percentage points off a Meta-EU-Premium top-up, and it
// decides with an exact string compare — so a type created through the
// settings screen never gets the discount, silently, for ever. On a
// EUR 10,000 top-up that is EUR 200 over-collected, and the customer's
// own screen previews whichever answer the browser's copy of the same
// comparison arrived at.
//
// One function, so the next comparison on a type slug cannot pick the
// third spelling.
// ─────────────────────────────────────────────────────────────────────

/** A slug reduced to its set of words, lowercased and sorted. */
export function slugKey(slug: string | null | undefined): string {
  return String(slug ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .sort()
    .join("-");
}

/** True when two slugs name the same type however they were spelled. */
export function sameSlug(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const ka = slugKey(a);
  return ka.length > 0 && ka === slugKey(b);
}
