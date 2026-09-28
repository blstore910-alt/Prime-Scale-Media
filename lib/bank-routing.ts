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

/**
 * The bank the owner PUT on this customer, before they hold anything we
 * could work it out from.
 *
 * The owner, 28-09: "als een klant zich aanmeldt bij ons en hij doet GH
 * dan moet zijn wallet topup al naar een andere bank, naar Zanel. Dus
 * bij aanmelding iedereen wallet topup naar turlit behalve GH mensen
 * naar zanel."
 *
 * Everything above this line derives the destination from the ad
 * accounts somebody HOLDS, which is exactly what a brand-new customer
 * does not have. Their first transfer — the one they have least basis
 * to doubt — therefore fell to the default, TURLIT, including for the
 * GH customers who belong at ZANEL.
 *
 * We know which they are, because we invite them. So it is written down
 * at the invite and carried onto their advertiser row, and this reads
 * it back. Anything unrecognised is null, not a guess: the whole file
 * refuses to pick where it does not know, and a wrong answer here is a
 * real transfer to the wrong legal entity.
 */
export function bankGroupFromStored(
  value: string | null | undefined,
): BankGroup | null {
  const raw = (value ?? "").trim().toLowerCase();
  if (!raw) return null;
  return (BANK_GROUP_ORDER as string[]).includes(raw)
    ? (raw as BankGroup)
    : null;
}

/** What the top-up dialog needs to know, in one answer. */
export type BankDestination = {
  /** Where the money goes. */
  group: BankGroup;
  /**
   * How we got there:
   *   "accounts" — worked out from the ad accounts they hold;
   *   "assigned" — the owner put it on them at the invite;
   *   "default"  — we could not tell, so TURLIT, and we say so.
   */
  from: "accounts" | "assigned" | "default";
  /** Two families at once: a real fork, so the customer picks. */
  fork: BankGroup[];
};

/**
 * The whole decision in one place, so the screen and the tests reason
 * about the same rules.
 *
 * Order, strongest first:
 *   1. their accounts, when those agree on one family — the money
 *      already goes there, so nothing can be more authoritative;
 *   2. their accounts, when they hold BOTH families — a genuine fork,
 *      which is the one case a customer is asked;
 *   3. what the owner assigned at the invite;
 *   4. TURLIT, named as a default so somebody who was given another one
 *      knows to use it.
 *
 * A failed READ of the accounts is NOT an empty list. The caller passes
 * `accountsUnknown` and we fall past the accounts entirely rather than
 * treating "could not read" as "holds nothing".
 */
export function bankDestination(args: {
  accountTypeSlugs: Array<string | null | undefined>;
  accountsUnknown: boolean;
  assigned?: string | null;
}): BankDestination {
  const assigned = bankGroupFromStored(args.assigned);
  const routed = args.accountsUnknown
    ? []
    : banksForAccountTypes(args.accountTypeSlugs);

  if (routed.length > 1) {
    return { group: routed[0], from: "accounts", fork: routed };
  }
  if (routed.length === 1) {
    return { group: routed[0], from: "accounts", fork: [] };
  }
  if (assigned) {
    return { group: assigned, from: "assigned", fork: [] };
  }
  return { group: "turlit", from: "default", fork: [] };
}
