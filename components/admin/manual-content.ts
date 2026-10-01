import {
  CreditCard,
  Gift,
  Landmark,
  Settings,
  ShieldCheck,
  Upload,
  Users,
} from "lucide-react";
import { ADVERTISER, AFFILIATE, type Manual, type Section } from "./manual-customer";
export * from "./manual-customer";

// De klantdelen staan in manual-customer.ts (de klant laadt de help; zo
// laadt hij niet ook het eigenaarshandboek). Hier: de beheerkant.

// ── SUPER-ADMIN ──────────────────────────────────────────────────────
const OWNER: Section[] = [
  {
    id: "own-plans",
    title: "Plans and pricing",
    icon: CreditCard,
    path: "Settings › Plans",
    intro:
      "A plan is a monthly fee, a number of included ad accounts and a top-up fee percentage. It is set when a customer is invited and drives their billing from then on.",
    steps: [
      "Settings › Plans: create or edit a plan. Editing a plan here does not reprice the customers already on it.",
      "An invite carries a plan; the customer is subscribed to it automatically when they accept.",
      "To change one customer, use their subscription on the advertiser record rather than the plan.",
    ],
    notes: [
      {
        label: "Changes work in our favour",
        tone: "pend",
        text: "Raising a subscription charges the new, higher amount straight away and again next period. Lowering it pays nothing back, and an invoice already issued stands at the old amount — the lower price starts at the next period.",
      },
      {
        label: "A typo is not a price change",
        tone: "due",
        text: "Because a lowering never cancels an issued invoice, correcting a mistyped amount leaves the wrong invoice open. Void that invoice explicitly rather than lowering the plan and hoping.",
      },
    ],
  },
  {
    id: "own-types",
    title: "Ad-account types and fees",
    icon: Settings,
    path: "Settings › Ad-account types",
    intro:
      "Each type carries its own default top-up fee, and which bank a customer is told to pay follows from the type. This is where the routing comes from.",
    steps: [
      "Settings › Ad-account types: add a type, set its default fee, mark it active or not.",
      "The cost side of a type is admin-only and never reaches a customer screen or the data behind it.",
      "An inactive type stops appearing on new requests and leaves existing accounts alone.",
    ],
    notes: [
      {
        label: "Cost data stays here",
        tone: "due",
        text: "Cost and margin belong on the type, never on a customer's own row — a customer row is readable by that customer.",
      },
    ],
  },
  {
    id: "own-perks",
    title: "Promotions and perks",
    icon: Gift,
    path: "Owner › Promotions",
    intro:
      "A perk is an exception for one customer: free ad-account requests, a waived or discounted fee, a waived subscription — for a period or permanently.",
    steps: [
      "Owner › Promotions: pick the customer, the kind of perk, the amount and the dates.",
      "Perks apply automatically where they are enforced: the top-up fee quote and the extra-account charge both take them into account.",
      "A perk with an end date stops applying on that date but stays on the record.",
    ],
    notes: [
      {
        label: "Visible on the customer",
        tone: "info",
        text: "Live perks are shown on the advertiser row, so nobody prices a customer without seeing them.",
      },
    ],
  },
  {
    id: "own-banks",
    title: "Bank accounts and routing",
    icon: Landmark,
    path: "Settings › Bank accounts",
    intro:
      "Which beneficiary a customer is told to pay depends on their ad-account type and the currency they are sending.",
    steps: [
      "Settings › Bank accounts: maintain the beneficiary details per entity and per currency.",
      "Check any change against the bank itself first — these are the numbers customers wire real money to.",
      "A customer with no ad account yet has no type to route from, and is given the general details.",
    ],
    notes: [
      {
        label: "Check twice",
        tone: "due",
        text: "A wrong digit here sends a customer's money somewhere it does not easily come back from. Change these only against a statement from the bank.",
      },
    ],
  },
  {
    id: "own-feed",
    title: "The deposit feed",
    icon: Upload,
    path: "Money › Wallet Topups › Deposits",
    intro:
      "Incoming bank transfers arrive here automatically and are matched to pending top-ups by amount, currency and reference.",
    steps: [
      "A matched deposit is offered against its top-up; confirming credits the customer.",
      "An unmatched deposit stays in the queue. Match it by hand only when the amount, the currency and the payer all agree.",
      "Put aside a deposit that is not ours. It leaves the queue and is never deleted.",
    ],
    notes: [
      {
        label: "Automatic matching needs the reference",
        tone: "pend",
        text: "Without the reference the payer typed, a deposit can only be matched by hand — and two customers who sent the same amount look identical.",
      },
    ],
  },
  {
    id: "own-audit",
    title: "Audit log and reconciliation",
    icon: ShieldCheck,
    path: "Owner › Audit / Reconciliation",
    intro:
      "Every change to a business record is written to the audit log with who did it and when. Reconciliation asks whether the money adds up.",
    steps: [
      "Owner › Audit: filter by table, by person or by period, and export a period you need to keep.",
      "Owner › Reconciliation: compares what came in against what is held and spent.",
      "A difference is a question, not a verdict — read the audit log for the same period before concluding anything.",
    ],
  },
  {
    id: "own-people",
    title: "Admins and access",
    icon: Users,
    path: "Owner › Admins",
    intro:
      "Employee admins run the day-to-day queues. Pricing, plans, perks and the owner screens are yours alone.",
    steps: [
      "Owner › Admins: invite an admin, or switch one off.",
      "A deactivated admin keeps their record but loses access immediately, including on a page they already had open.",
      "Everything an admin does is attributed to them in the audit log.",
    ],
  },
  {
    id: "own-maintenance",
    title: "Freezing the app",
    icon: ShieldCheck,
    path: "Environment",
    intro:
      "Maintenance mode stops every write in the app while reads keep working. It is the switch for an incident.",
    steps: [
      "Set MAINTENANCE_MODE=true in the hosting environment and redeploy.",
      "Every mutation is refused with a clear message; nobody can move money, including admins.",
      "Turn it off the same way once the incident is closed.",
    ],
    notes: [
      {
        label: "Reads still work",
        tone: "info",
        text: "Customers can still see their balances and history while writes are frozen, which is usually what they want during an incident.",
      },
    ],
  },
];

/**
 * The admin sections live in admin-manual.tsx, where they already were.
 * They are passed in rather than moved, so this change adds handbooks
 * without rewriting the one that was already being used.
 */
export function buildManuals(adminSections: Section[]): Manual[] {
  return [
    {
      key: "admin",
      label: "Admin",
      heading: "Admin handbook",
      blurb: "Where each control lives.",
      lead: "The working reference for admins. Each section says where the tool lives in the sidebar, what it does, and the exact steps to run it. Reading data is always safe — anything that moves money or changes a customer record is logged, so work deliberately. Controls in the Owner group are for the super-admin; the last section covers when to hand something over.",
      sections: adminSections,
    },
    {
      key: "advertiser",
      label: "Advertiser",
      heading: "Advertiser handbook",
      blurb: "What a customer sees, in their own words.",
      lead: "The handbook as an advertiser reads it. Open it when somebody asks why they were charged a fee, or where their reference went — this is the same sequence of screens they are looking at.",
      sections: ADVERTISER,
    },
    {
      key: "affiliate",
      label: "Affiliate",
      heading: "Affiliate handbook",
      blurb: "How a referrer earns and gets paid.",
      lead: "What an affiliate sees. Commission is agreed per referral, so this describes the mechanism rather than any one rate.",
      sections: AFFILIATE,
    },
    {
      key: "owner",
      label: "Super-admin",
      heading: "Super-admin handbook",
      blurb: "The controls only you have.",
      lead: "Pricing, plans, perks, bank routing and the audit trail. Everything here either sets what a customer is charged or is the record of what happened, and both are worth being deliberate about.",
      sections: OWNER,
    },
  ];
}

export function manualsFor(isSuperAdmin: boolean, all: Manual[]): Manual[] {
  // An employee admin gets the two customer-facing handbooks as well,
  // because answering "why was I charged this" is their job and neither
  // contains anything a customer cannot already read. The super-admin
  // handbook is the one with pricing and margin in it, so it is not in
  // that list.
  if (isSuperAdmin) return all;
  return all.filter((m) => m.key !== "owner");
}
