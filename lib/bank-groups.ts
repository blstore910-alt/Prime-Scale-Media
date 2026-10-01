// ── DE BANKROUTE, ZONDER TYPENAMEN (wat de klant laadt) ─────────────
//
// Lekcontrole 01-10 (L2): lib/bank-routing.ts kent de interne typeslugs
// (hk-meta-premium, eu-meta-psm-gh) en zat zo in de JavaScript die de
// browser van ELKE klant laadt. De klant heeft die niet nodig: sinds
// plak 192 geeft de view my_ad_accounts per account al de bankgroep
// (turlit/zanel). Dit bestand rekent alleen met die groepen.
//
// lib/bank-routing.ts (de slugs) blijft voor de beheerschermen en de
// tests, en gebruikt deze regels zelf -- er is dus één regel, niet twee.

export type BankGroup = "turlit" | "zanel" | "muxue";

/** Volgorde, en de volgorde waarin een keuze wordt aangeboden. MUXUE
 *  staat er niet in: er gaat niets meer heen. */
export const BANK_GROUP_ORDER: BankGroup[] = ["turlit", "zanel"];

/** Een opgeslagen waarde (advertisers.bank_group, my_ad_accounts.bank_group)
 *  als groep, of null. */
export function bankGroupFromStored(value: string | null | undefined): BankGroup | null {
  const raw = (value ?? "").trim().toLowerCase();
  if (!raw) return null;
  return (BANK_GROUP_ORDER as string[]).includes(raw) ? (raw as BankGroup) : null;
}

/** De groepen waar deze klant heen kan, in volgorde. Leeg = "weet niet". */
export function routedGroups(groups: Array<string | null | undefined>): BankGroup[] {
  const seen = new Set<BankGroup>();
  for (const g of groups) {
    const b = bankGroupFromStored(g);
    if (b) seen.add(b);
  }
  return BANK_GROUP_ORDER.filter((v) => seen.has(v));
}

/** What the top-up dialog needs to know, in one answer. */
export type BankDestination = {
  /** Where the money goes. */
  group: BankGroup;
  /** "accounts" (from what they hold), "assigned" (owner, at the invite),
   *  or "default" (we could not tell: TURLIT, and we say so). */
  from: "accounts" | "assigned" | "default";
  /** Accounts in BOTH families: a real fork, the customer chooses. */
  fork: BankGroup[];
};

export function destinationFromGroups(args: {
  routed: BankGroup[];
  accountsUnknown: boolean;
  assigned?: string | null;
}): BankDestination {
  const assigned = bankGroupFromStored(args.assigned);
  const routed = args.accountsUnknown ? [] : args.routed;
  if (routed.length > 1) return { group: routed[0], from: "accounts", fork: routed };
  if (routed.length === 1) return { group: routed[0], from: "accounts", fork: [] };
  if (assigned) return { group: assigned, from: "assigned", fork: [] };
  return { group: "turlit", from: "default", fork: [] };
}
