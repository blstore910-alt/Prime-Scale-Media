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

/**
 * A slug nobody has a label for, printed so a customer can read it.
 *
 * `platformLabel` looks a slug up in the hard-coded PLATFORMS list and
 * falls back to `?? p` -- the raw slug. Two vocabularies reach it:
 * PLATFORMS holds `eu-meta-psm`, while the ad-account REQUEST form
 * writes `meta-ads` / `tiktok-ads` / `google-ads`, which is in no list
 * at all. So the customer's own Requests screen printed "meta-ads".
 *
 * And /settings/ad-account-types is data-driven, so every type created
 * through that screen is absent from PLATFORMS by construction -- the
 * fallback is not an edge case, it is the normal path for anything new.
 *
 * A humanised slug is not a substitute for a real label. It is what to
 * print instead of a database value.
 */
const UPPER = new Set(["eu", "hk", "psm", "uk", "us", "gh", "bm", "id", "vat"]);
const SPECIAL: Record<string, string> = { tiktok: "TikTok", psm: "PSM" };

export function humanSlug(slug: string | null | undefined): string {
  const words = String(slug ?? "")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  if (words.length === 0) return "";
  return words
    .map((w) => {
      const lower = w.toLowerCase();
      if (SPECIAL[lower]) return SPECIAL[lower];
      if (UPPER.has(lower)) return lower.toUpperCase();
      if (/^\d+$/.test(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}
