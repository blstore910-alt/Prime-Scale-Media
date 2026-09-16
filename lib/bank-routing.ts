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

/** Display order, and the order any choice is offered in. */
export const BANK_GROUP_ORDER: BankGroup[] = ["turlit", "zanel", "muxue"];

/**
 * Deliberately NOT exhaustive. A slug that is not listed is one whose routing
 * the UI has never stated — eu-meta-premium and hk-meta-business-green are
 * both real seeded types that no bank option mentions. Guessing would send
 * real money to the wrong company, so an unknown type narrows nothing.
 */
export const BANK_BY_TYPE_SLUG: Record<string, BankGroup> = {
  "eu-meta-psm": "turlit",
  google: "turlit",
  tiktok: "turlit",
  taboola: "turlit",
  snapchat: "turlit",
  "eu-meta-psm-gh": "zanel",
  "hk-meta-premium": "muxue",
  "hk-meta-business": "muxue",
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
    const bank = BANK_BY_TYPE_SLUG[(slug ?? "").trim().toLowerCase()];
    if (bank) seen.add(bank);
  }
  return BANK_GROUP_ORDER.filter((v) => seen.has(v));
}
