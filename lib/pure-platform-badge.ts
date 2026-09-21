// ── "meta-ads" IS NOT A WORD ─────────────────────────────────────────
//
// Ad-account requests store whatever the customer's form put in
// `platform`, and the vocabularies have drifted: the seeded ad-account
// types use slugs like `eu-meta-psm`, older requests carry `meta-ads`,
// and lib/constants PLATFORMS knows only the first kind. So
// `PLATFORMS.find(...)?.label ?? p` fell through to the raw slug and the
// admin queue printed "meta-ads" under a customer's name.
//
// This maps any of them onto the platform FAMILY, which is what the
// request is actually choosing — the specific internal type
// (Meta-EU-PSM, Meta-HK-Premium) is picked later, by an admin, when the
// account is created.

export type PlatformFamily = "meta" | "google" | "tiktok" | "other";

const FAMILY_LABEL: Record<PlatformFamily, string> = {
  meta: "Meta",
  google: "Google",
  tiktok: "TikTok",
  other: "Other",
};

/**
 * The family a platform slug belongs to.
 *
 * Substring matching on purpose: every vocabulary in play embeds the
 * family name somewhere (`meta-ads`, `eu-meta-psm`, `hk-meta-premium`,
 * `google-ads`, `tiktok`), and a new type the owner adds in Settings
 * will too.
 */
export function platformFamily(slug: unknown): PlatformFamily {
  const s = String(slug ?? "").toLowerCase();
  if (!s) return "other";
  if (s.includes("meta") || s.includes("facebook")) return "meta";
  if (s.includes("google") || s.includes("gdn") || s.includes("youtube")) {
    return "google";
  }
  if (s.includes("tiktok")) return "tiktok";
  return "other";
}

/**
 * What a CUSTOMER may read for a platform slug: the network, nothing
 * else.
 *
 * `ad_accounts.platform` holds the ad-account TYPE slug (`eu-meta-psm`,
 * `hk-meta-premium`), and the type is ours: its region, its supplier
 * routing, its price tier. The advertiser app looked the slug up in
 * PLATFORMS and printed "Meta-EU-PSM" under the customer's own account --
 * the owner found it there more than once.
 *
 * So this never returns a type label and never returns the raw slug (a
 * new type's slug carries the same internals). A family we know becomes
 * its name; anything else is null, and the caller prints nothing rather
 * than a guess.
 */
export function customerPlatformName(slug: unknown): string | null {
  const family = platformFamily(slug);
  return family === "other" ? null : FAMILY_LABEL[family];
}

/**
 * What to print for a platform slug.
 *
 * `known` is the label from the tenant's own type list when the slug is
 * one of theirs — that wins, because the owner named it. Otherwise the
 * family name, so an unrecognised slug reads as "Meta" rather than as
 * "meta-ads". A slug in no family at all is title-cased rather than
 * dropped: an admin still needs to see what the customer asked for.
 */
export function platformLabel(slug: unknown, known?: string | null): string {
  const label = String(known ?? "").trim();
  if (label) return label;

  const family = platformFamily(slug);
  if (family !== "other") return FAMILY_LABEL[family];

  const raw = String(slug ?? "").trim();
  if (!raw) return "—";
  return raw
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
