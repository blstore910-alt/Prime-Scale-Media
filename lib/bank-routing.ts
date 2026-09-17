/**
 * Which beneficiary bank an ad-account type's money goes to.
 *
 * The top-up dialog used to show EVERY customer all three beneficiary
 * companies and ask them to route their own payment — including a brand-new
 * advertiser with no ad accounts at all, for whom there was nothing to decide
 * and no reason to see the rest of the banking structure. The destination
 * follows from the accounts someone holds, so it can be worked out.
 *
 * The union is declared here rather than imported from the instructions
 * component so this file stays plain TypeScript with no JSX — it is business
 * logic, and it is covered by tests.
 */
export type BankGroup = "turlit" | "zanel" | "muxue";

/**
 * Display order, and the order any choice is offered in.
 *
 * MUXUE is NOT here. It is kept in the BankGroup union so historical rows and
 * the stored bank details still render, but nothing routes to it any more and
 * it is never offered to a customer — the HK families it used to take now go
 * to TURLIT like everything else.
 */
export const BANK_GROUP_ORDER: BankGroup[] = ["turlit", "zanel"];

/**
 * Deliberately NOT exhaustive. A slug that is not listed is one whose routing
 * nobody has stated — eu-meta-premium is a real seeded type that no bank
 * option mentions. Guessing would send real money to the wrong company, so an
 * unknown type narrows nothing and the caller asks instead of defaulting.
 */
export const BANK_BY_TYPE_SLUG: Record<string, BankGroup> = {
  "eu-meta-psm": "turlit",
  google: "turlit",
  tiktok: "turlit",
  taboola: "turlit",
  snapchat: "turlit",
  // The Hong Kong families used to go to MUXUE. They come to our own bank
  // now, so there is one destination for everything except GH.
  "hk-meta-premium": "turlit",
  "hk-meta-business": "turlit",
  "hk-meta-business-green": "turlit",
  "eu-meta-psm-gh": "zanel",
};

/**
 * The beneficiaries this advertiser could legitimately be paying, derived
 * from their own ad accounts, in display order.
 *
 * An empty result means "cannot tell" — not "none" — and the caller keeps its
 * default rather than showing the whole banking structure to someone who has
 * no accounts yet.
 */
export function banksForAccountTypes(
  slugs: Array<string | null | undefined>,
): BankGroup[] {
  const seen = new Set<BankGroup>();
  for (const slug of slugs) {
    const bank = bankForTypeSlug(slug);
    if (bank) seen.add(bank);
  }
  return BANK_GROUP_ORDER.filter((v) => seen.has(v));
}

/**
 * A slug reduced to its set of words, sorted. "meta-hk-premium" and
 * "hk-meta-premium" are the same type written by two different hands.
 *
 * WHY THIS IS NOT PEDANTRY
 *
 * The seed migration writes `hk-meta-premium`. A type created through
 * /settings/ad-account-types is slugified from its LABEL — "Meta-HK-Premium"
 * becomes `meta-hk-premium`. The map below was written against the seed, so
 * every type added through the UI routed nowhere, and on this tenant NONE of
 * the eight live types matched at all: the Banks page could not name a single
 * destination and every advertiser fell through to "we cannot tell, pick your
 * own bank".
 *
 * That fallback is safe — it is why the unknown case asks instead of
 * defaulting — but it is not routing, and the whole point of the feature is
 * that a customer should not be shown the rest of the banking structure.
 *
 * Order-insensitive matching fixes both spellings at once without a second
 * table to keep in sync. It does NOT make the map exhaustive: a set of words
 * that is not listed is still a type whose routing nobody has stated.
 */
function tokenKey(slug: string): string {
  return slug
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .sort()
    .join("-");
}

const BANK_BY_TOKEN_KEY: Record<string, BankGroup> = Object.fromEntries(
  Object.entries(BANK_BY_TYPE_SLUG).map(([slug, bank]) => [
    tokenKey(slug),
    bank,
  ]),
);

/** The beneficiary for one ad-account type slug, or null if unstated. */
export function bankForTypeSlug(
  slug: string | null | undefined,
): BankGroup | null {
  const raw = (slug ?? "").trim().toLowerCase();
  if (!raw) return null;
  return BANK_BY_TYPE_SLUG[raw] ?? BANK_BY_TOKEN_KEY[tokenKey(raw)] ?? null;
}
