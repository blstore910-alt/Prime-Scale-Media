/**
 * WHAT AN OWNER CAN HAND TO AN ADMIN.
 *
 * The owner, 26-09: "mooiste zou zijn als ik per admin wat
 * bevoegdheden kan instellen."
 *
 * ── HOW THE LIST WAS DERIVED, NOT INVENTED ────────────────────────
 *
 * Every owner-only action in the app goes through `resolveOwnerContext`
 * in actions/_shared.ts. Counted 29-09, it has callers in twelve action
 * files, and each file is already one coherent area of the business.
 * So the capabilities are those areas, named the way somebody reading
 * a list of toggles next to an employee would read them — not the way
 * the code is organised.
 *
 * ── THE TWO RULES ─────────────────────────────────────────────────
 *
 * DEFAULT NO. A capability nobody has been granted, nobody has. This
 * matters most for the one somebody adds next year and forgets to
 * check: it must be shut, not open. `resolveCapability` returns a
 * refusal for anything it cannot find, which is what makes that true.
 *
 * GRANTING IS NEVER A CAPABILITY. An admin who can grant himself
 * rights has all rights. `set_admin_capability` and
 * `set_tenant_owner` check ownership in the database, and neither
 * appears in this list. The things marked `ownerOnly` below are in the
 * list only so the screen can SHOW that they exist and cannot be
 * given — a toggle that is absent looks like an oversight; one that is
 * there and explained is a decision.
 */

export type Capability = {
  /** The string stored in `admin_capabilities.capability`. Never change
   *  one of these: the rows in the database hold this exact text. */
  key: string;
  /** What a non-technical owner reads next to a toggle. */
  label: string;
  /** What this actually lets the person do, and what it risks. */
  what: string;
  /** Which part of the app it covers, for grouping the screen. */
  group: "Money" | "Prices and rules" | "Customers" | "The books";
  /** True when it can never be handed over, whatever the owner wants. */
  ownerOnly?: boolean;
};

export const CAPABILITIES: Capability[] = [
  // ── MONEY ────────────────────────────────────────────────────────
  {
    key: "wallet.adjust",
    label: "Correct a wallet by hand",
    what: "Add to or take from a customer's balance directly, without a payment behind it. This is the only way to move money with no transaction to point at, so every use of it needs a reason a stranger could follow.",
    group: "Money",
  },
  {
    key: "payout.release",
    label: "Release a payout below the minimum",
    what: "Pay an affiliate who has not reached the threshold yet. It overrides a rule, so it is worth knowing who did it.",
    group: "Money",
  },
  {
    key: "bank.accounts",
    label: "Change the bank details customers pay into",
    what: "The account numbers shown in the top-up dialog. Getting this wrong, or being tricked into changing it, sends every customer's money somewhere else. Hand it over carefully.",
    group: "Money",
  },
  {
    key: "finance.check",
    label: "See the finance check",
    what: "Review every money decision a machine did not settle, and see each customer's refund ceiling. Read-only by design: whoever checks cannot approve.",
    group: "Money",
  },

  // ── PRICES AND RULES ─────────────────────────────────────────────
  {
    key: "plans.edit",
    label: "Change prices and plans",
    what: "Monthly fees, what is included, and which plan a customer is on.",
    group: "Prices and rules",
  },
  {
    key: "fees.edit",
    label: "Change the default fees",
    what: "The fee charged on funding an ad account, and the defaults a new customer starts on.",
    group: "Prices and rules",
  },
  {
    key: "rates.edit",
    label: "Change exchange rates",
    what: "The EUR/USD rate used when a customer exchanges. It moves real money on every exchange after it.",
    group: "Prices and rules",
  },
  {
    key: "commission.rules",
    label: "Set commission rules",
    what: "What an affiliate earns, per referral. Changing it changes what we owe.",
    group: "Prices and rules",
  },
  {
    key: "perks.edit",
    label: "Give perks and discounts",
    what: "Waive a fee, give free requests, discount a subscription for a period.",
    group: "Prices and rules",
  },
  {
    key: "adaccounttypes.edit",
    label: "Manage ad-account types",
    what: "Which kinds of ad account can be requested, and the fee each one carries.",
    group: "Prices and rules",
  },

  // ── CUSTOMERS ────────────────────────────────────────────────────
  {
    key: "customers.email",
    label: "Email customers",
    what: "Send a message to customers from inside the app. It leaves the building under our name.",
    group: "Customers",
  },
  {
    key: "polls.manage",
    label: "Ask customers a question",
    what: "Create and close polls, and read the answers.",
    group: "Customers",
  },

  // ── THE BOOKS ────────────────────────────────────────────────────
  {
    key: "ledger.read",
    label: "See the ledger and reconciliation",
    what: "Every movement behind every customer's balance, what came in on the banks, and what we keep. It is the whole book, so it shows every customer side by side.",
    group: "The books",
  },
  {
    key: "bankledger.write",
    label: "Record what the bank received",
    what: "Enter the bank statement against what we credited, on the reconciliation screen.",
    group: "The books",
  },

  // ── NEVER HANDED OVER ────────────────────────────────────────────
  {
    key: "owners.manage",
    label: "Add or remove an owner",
    what: "Owners only, always. An admin who can make himself an owner is already one.",
    group: "The books",
    ownerOnly: true,
  },
  {
    key: "capabilities.manage",
    label: "Hand out these permissions",
    what: "Owners only, always. An admin who can grant himself rights has all rights, so this cannot be a toggle no matter who asks.",
    group: "The books",
    ownerOnly: true,
  },
];

/** The ones an owner can actually switch on for somebody. */
export const GRANTABLE = CAPABILITIES.filter((c) => !c.ownerOnly);

export const CAPABILITY_GROUPS = [
  "Money",
  "Prices and rules",
  "Customers",
  "The books",
] as const;

export function capabilityByKey(key: string): Capability | undefined {
  return CAPABILITIES.find((c) => c.key === key);
}
