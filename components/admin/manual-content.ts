import type { LucideIcon } from "lucide-react";
import {
  BadgePercent,
  Banknote,
  Building2,
  Coins,
  CreditCard,
  Gift,
  Landmark,
  Link2,
  Megaphone,
  Receipt,
  Settings,
  ShieldCheck,
  Upload,
  Users,
  Wallet,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────
// The handbooks, one per audience
// ─────────────────────────────────────────────────────────────────────
// There was one: the admin's. The owner asked to be able to read the
// other three as well, and the reason is practical rather than
// completist. When a customer asks why they were charged a fee on a
// top-up, the person answering needs the page the customer is looking
// at -- not a reconstruction of it from the code.
//
// Content only; admin-manual.tsx renders it.
//
// NOTHING HERE MAY NAME A SUPPLIER. The advertiser and affiliate
// handbooks are customer-facing text by intent, and the admin one gets
// read aloud to customers on the phone.
// ─────────────────────────────────────────────────────────────────────

export type Tone = "ok" | "pend" | "due" | "info";
export type Note = { label: string; tone: Tone; text: string };

export type Section = {
  id: string;
  title: string;
  icon: LucideIcon;
  /** Where it lives in that role's sidebar. */
  path: string;
  intro: string;
  steps: string[];
  notes?: Note[];
};

export type Audience = "advertiser" | "affiliate" | "admin" | "owner";

export type Manual = {
  key: Audience;
  label: string;
  heading: string;
  blurb: string;
  lead: string;
  sections: Section[];
};

// ── ADVERTISER ───────────────────────────────────────────────────────
const ADVERTISER: Section[] = [
  {
    id: "adv-wallet",
    title: "Your wallet",
    icon: Wallet,
    path: "Wallet",
    intro:
      "Your wallet holds the money you have sent us. Everything else — funding an ad account, paying an invoice — is paid out of it. You top it up by bank transfer.",
    steps: [
      "Open Wallet and press Top up. Choose the currency you are going to send, then the amount.",
      "You are shown the bank details to pay to and a payment reference. Copy the reference exactly and put it in the description of your transfer — that is how the payment is matched to you.",
      "Upload the payment slip from your bank, then press Submit. The top-up now sits as pending.",
      "Once we have seen the money arrive we verify it and the amount appears in your balance. You are notified either way.",
    ],
    notes: [
      {
        label: "The reference",
        tone: "due",
        text: "A transfer sent without the reference, or with the reference from a different top-up, has to be matched by hand and takes longer. Copy it from the screen; do not type it from memory.",
      },
      {
        label: "Which bank",
        tone: "pend",
        text: "The bank details differ per currency and per account type. Use the ones on that top-up screen rather than details you saved earlier.",
      },
      {
        label: "No withdrawals",
        tone: "info",
        text: "Money in your wallet cannot be paid back out to your bank. It can be spent on ad accounts and invoices, and money sitting on an ad account can be requested back into your wallet.",
      },
    ],
  },
  {
    id: "adv-accounts",
    title: "Your ad accounts",
    icon: Megaphone,
    path: "Ad accounts",
    intro:
      "An ad account is what you actually spend on. You ask for one, we set it up, and then you fund it from your wallet.",
    steps: [
      "Open Ad accounts and press Request account. Pick the type, the currency and the timezone, and give the website you will advertise.",
      "The currency and timezone cannot be changed once the account exists, so check them before submitting.",
      "We review the request. If something is missing you get a reason and can file a new one.",
      "Once the account is live it appears in your list with its name and ID, and a Top up button.",
    ],
    notes: [
      {
        label: "Extra accounts",
        tone: "pend",
        text: "Your plan includes a number of ad accounts. Beyond that, an extra account is charged from your wallet, and the amount is shown before you confirm.",
      },
    ],
  },
  {
    id: "adv-funding",
    title: "Funding an ad account",
    icon: Coins,
    path: "Ad accounts › Top up",
    intro:
      "Money moves from your wallet onto the account, less the top-up fee. This is the one step you cannot undo on your own.",
    steps: [
      "Press Top up on the account and enter the amount.",
      "The screen shows the fee and what will actually land on the account. Check both before confirming.",
      "Confirm. The amount leaves your wallet immediately and the funding shows as on its way.",
      "When it has landed, the status changes to on the account.",
    ],
    notes: [
      {
        label: "One way",
        tone: "due",
        text: "Money on an ad account comes back only through a withdrawal request, which we have to approve. Do not fund an account with more than you intend to spend on it.",
      },
    ],
  },
  {
    id: "adv-withdraw",
    title: "Getting money off an account",
    icon: Banknote,
    path: "Ad accounts › Withdraw",
    intro:
      "If an account holds money you would rather spend elsewhere, you can ask for it back into your wallet.",
    steps: [
      "Press Withdraw on the account and enter the amount.",
      "The request comes to us for approval; it is not instant.",
      "Once approved, the amount is credited back to your wallet and can go to another account or an invoice.",
    ],
    notes: [
      {
        label: "Back to the wallet",
        tone: "info",
        text: "A withdrawal returns money to your wallet, never to your bank.",
      },
    ],
  },
  {
    id: "adv-billing",
    title: "Your plan and invoices",
    icon: Receipt,
    path: "Billing",
    intro:
      "Your plan is a monthly amount. An invoice is raised each period and paid from your wallet.",
    steps: [
      "Billing shows your plan, the next payment date and every invoice.",
      "An open invoice has a Pay now button, which takes the amount out of your wallet.",
      "If an invoice is not paid by its due date, we collect it from your wallet automatically.",
      "Each invoice can be downloaded as a PDF for your own bookkeeping.",
    ],
    notes: [
      {
        label: "Keep a balance",
        tone: "pend",
        text: "If your wallet is short when an invoice falls due, the invoice stays open and we tell you. Topping up clears it.",
      },
    ],
  },
  {
    id: "adv-company",
    title: "Your company details",
    icon: Building2,
    path: "Settings › Company",
    intro:
      "Your company name, address and VAT number are what appear on your invoices.",
    steps: [
      "Open Settings › Company and fill in the details.",
      "Save. New invoices use the updated details; invoices already issued keep what they were issued with.",
    ],
    notes: [
      {
        label: "Before your first invoice",
        tone: "pend",
        text: "Fill these in before you are billed, otherwise that invoice goes out without them and cannot be reissued with them.",
      },
    ],
  },
  {
    id: "adv-privacy",
    title: "Notifications and your data",
    icon: ShieldCheck,
    path: "Settings › Notifications / Privacy",
    intro:
      "You choose what you are told about, and you can take a copy of everything we hold on you.",
    steps: [
      "Settings › Notifications: switch each kind of alert on or off, and turn on push if you want them on your phone.",
      "Settings › Privacy: Export downloads everything we hold about you as a file.",
      "Settings › Activity: every action on your account, with when it happened.",
    ],
  },
];

// ── AFFILIATE ────────────────────────────────────────────────────────
const AFFILIATE: Section[] = [
  {
    id: "aff-link",
    title: "Your referral link",
    icon: Link2,
    path: "Dashboard",
    intro:
      "Everyone you refer arrives through your link. It is what ties a new customer to you.",
    steps: [
      "Copy your link from the dashboard.",
      "Anyone who signs up through it is attached to you from that moment.",
      "Referred customers appear in your list once their account is created.",
    ],
    notes: [
      {
        label: "The link is the record",
        tone: "due",
        text: "Someone who signs up without your link is not attached to you, and you cannot correct that afterwards from your side. If it has happened, tell us before they start spending.",
      },
    ],
  },
  {
    id: "aff-earnings",
    title: "What you earn",
    icon: BadgePercent,
    path: "Earnings",
    intro:
      "Commission is agreed per referral, so two of your customers can be on different terms. Your own terms are shown on each referral.",
    steps: [
      "Earnings lists each referred customer and what they have generated.",
      "Commission may be a one-off amount, a monthly amount or a share of what they spend, depending on what was agreed.",
      "Use the date filter for a period, and Export for a spreadsheet.",
    ],
    notes: [
      {
        label: "Provisional until settled",
        tone: "pend",
        text: "Commission on money that has not settled is provisional. If a customer takes money back off an ad account, commission already counted on it is reversed.",
      },
    ],
  },
  {
    id: "aff-payout",
    title: "Getting paid",
    icon: Wallet,
    path: "Earnings › Payouts",
    intro: "Payouts are made by us, by hand, against what has settled.",
    steps: [
      "Your balance shows what has settled and is payable.",
      "Payouts are arranged with us directly; there is no self-service withdrawal.",
      "Every payout appears in your history with its date and amount.",
    ],
  },
  {
    id: "aff-customers",
    title: "Your customers",
    icon: Users,
    path: "Referrals",
    intro:
      "You can see who you referred and how they are doing, without seeing anything private to them.",
    steps: [
      "Referrals lists each customer, when they joined and their total spend.",
      "You see totals, not their individual transactions, invoices or bank details.",
    ],
  },
];

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

/** Which handbooks a role may open. */
export function manualsFor(isSuperAdmin: boolean, all: Manual[]): Manual[] {
  // An employee admin gets the two customer-facing handbooks as well,
  // because answering "why was I charged this" is their job and neither
  // contains anything a customer cannot already read. The super-admin
  // handbook is the one with pricing and margin in it, so it is not in
  // that list.
  if (isSuperAdmin) return all;
  return all.filter((m) => m.key !== "owner");
}
