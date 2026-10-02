// ── DE KLANTHANDBOEKEN (adverteerder, affiliate) ─────────────────────
//
// Uit manual-content.ts gehaald (lekcontrole 01-10): de klant laadt de
// help, en met één bestand laadde hij ook het EIGENAARShandboek mee --
// prijzen, kosten, marge. Dit bestand bevat alleen wat een klant mag
// lezen; components/admin/manual-content.ts voegt de beheerkant toe.

import type { LucideIcon } from "lucide-react";
import {
  BadgePercent,
  Banknote,
  Building2,
  Coins,
  Link2,
  Megaphone,
  Receipt,
  ShieldCheck,
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
export const ADVERTISER: Section[] = [
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
        label: "Another currency",
        tone: "info",
        text: "You can send a different currency than your wallet holds, for example USD into your EUR wallet. We convert it at that day's rate less a 0.6% conversion fee, and the screen shows the exact amount we credit before you send. To move money between your own EUR and USD wallets, use Exchange: same rate, same fee, done at once.",
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
      // "platform", not "type". This handbook is now shown TO the
      // customer (components/guide/customer-guide.tsx), and the
      // ad-account TYPE names the supplier family -- the one thing a
      // customer must never see. What they actually pick is Meta,
      // Google or TikTok, which the app already calls the platform
      // (customerPlatformName).
      "Open Ad accounts and press Request one. Pick the platform, the currency and the timezone, and give the website you will advertise.",
      "The currency and timezone cannot be changed once the account exists, so check them before submitting.",
      "We review the request. If something is missing you get a reason and can file a new one.",
      // Carried over from the FAQ this handbook replaced in the app's
      // Help screen, so the one fact only the FAQ had is not lost.
      "It is usually live within one working day of approval, and you get a notification the moment it is.",
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
    // The button is in the account's own details, not on the card --
    // walked on production 30-09.
    path: "Ad accounts › Details › Withdraw to wallet",
    intro:
      "If an account holds money you would rather spend elsewhere, you can ask for it back into your wallet.",
    steps: [
      "Open the account, press Details, then Withdraw to wallet.",
      "Enter the amount. The screen shows the most you can ask back, and will not let you go over it.",
      "Check the summary and send it. The request comes to us for approval; it is not instant.",
      "Once approved, the amount is credited to your wallet in the account's own currency, and can go to another account or an invoice.",
    ],
    notes: [
      {
        label: "Back to the wallet",
        tone: "info",
        text: "A withdrawal returns money to your wallet, never to your bank.",
      },
      {
        // The ceiling changed on 30-09: for an account whose live
        // balance we can read, that balance caps it. Said in the
        // customer's terms -- no supplier, no mechanism.
        label: "How much you can ask back",
        tone: "pend",
        text: "Up to what was put on the account, less anything you already asked back. Money that has already been spent on ads cannot come back, so where we can see the account's live balance, the most you can ask for is what is actually on it.",
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
      // Plak 173, 30-09: true for every subscription invoice now, not
      // only the ones the nightly run raised.
      "You get an email for every new invoice, and a reminder a few days before it is due.",
      "An open invoice has a Pay now button, which takes the amount out of your wallet. You see your balance before and after before you confirm.",
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
        // "cannot be reissued with them" was true until plak 164
        // (30-09), which fills the company onto a first invoice that
        // was raised before the details existed. A handbook that says
        // something the app no longer does is the one a customer
        // quotes back at us.
        label: "Before your first invoice",
        tone: "info",
        text: "Fill these in early. If your first invoice was raised before you did, it picks up your company details once you save them.",
      },
    ],
  },
  {
    id: "adv-privacy",
    title: "Notifications and your data",
    icon: ShieldCheck,
    // 01-10: the Export and Activity steps described screens this app
    // does not have (the GDPR export is out of scope for day one). What
    // Settings actually holds is below.
    path: "Settings › Notifications / Your data",
    intro:
      "You choose what you are told about, and you decide what happens to your account.",
    steps: [
      "Settings › Notifications: switch each kind of alert on or off, and turn on push if you want them on your phone.",
      "Settings › Your data: sign out of every device at once, for example after using a shared computer.",
      "Settings › Your data: ask us to delete your account. We review the request and contact you first; nothing is deleted before that.",
    ],
  },
];

// ── AFFILIATE ────────────────────────────────────────────────────────
export const AFFILIATE: Section[] = [
  {
    id: "aff-link",
    title: "Your referral link",
    icon: Link2,
    path: "My Referrals",
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
    path: "My Referrals",
    intro:
      "Commission is agreed per referral, so two of your customers can be on different terms. Your own terms are shown on each referral.",
    steps: [
      "My Referrals lists each referred customer and what they have generated.",
      "Commission may be a one-off amount, a monthly amount or a share of what they spend, depending on what was agreed.",
      "Use the period filter, and Export for a spreadsheet.",
      // Carried over from the FAQ this handbook replaced in the app, so
      // the one topic only the FAQ covered is not lost.
      "Your tier — Starter, Riser, Scaler, Legend — follows your total lifetime earnings. It is a milestone, not a rate: your commission is set per referral and does not change with your tier.",
    ],
    notes: [
      {
        // Measured 30-09, journey 6: a withdrawal reversed nothing on a
        // commission that was already PAID (EUR 37.50, PSM0017) -- the
        // clawback stops at what is still open. The old sentence said
        // "commission already counted on it is reversed", which promised
        // more than the system does, in a handbook customers now read.
        label: "Provisional until paid",
        tone: "pend",
        text: "Commission you have not been paid yet is provisional. If a customer takes money back off an ad account, the part of your open commission that came from it is reversed. Commission already paid out to you stays paid.",
      },
    ],
  },
  {
    id: "aff-payout",
    title: "Getting paid",
    icon: Wallet,
    path: "Wallet",
    // 01-10: "there is no self-service withdrawal" stopped being true
    // when PayoutCard got its Request payout button.
    intro: "You ask for a payout here; we transfer it by hand.",
    steps: [
      "Wallet shows what you have earned and what is ready to be paid out.",
      "Once you reach the payout minimum, press Request payout. Choose what to be paid, the currency, and your bank details.",
      "We check the request and transfer it by hand. Nothing leaves automatically.",
      "Every payout appears under Earlier payouts with its date, amount and our reference.",
    ],
  },
  {
    id: "aff-customers",
    title: "Your customers",
    icon: Users,
    path: "My Referrals",
    intro:
      "You can see who you referred and how they are doing, without seeing anything private to them.",
    steps: [
      "Referrals lists each customer, when they joined and their total spend.",
      "You see totals, not their individual transactions, invoices or bank details.",
    ],
  },
];

// ── DE KLANT LEEST ZIJN EIGEN HANDBOEK ─────────────────────────────
//
// De eigenaar, 30-09: "PSM app guide > affiliates > advertisers >
// admins > super admin, manuals en handleidingen."
//
// Die vier bestonden al -- hierboven. Maar `manualsFor` gaf ze alleen
// aan de BEHEERKANT: de advertiser-handleiding stond er, en een
// advertiser kon hem niet openen. Dezelfde tekst, voor de verkeerde
// lezer.
//
// Dit is dezelfde inhoud -- dezelfde secties, niet een kopie ervan --
// met een inleiding die tot de klant spreekt. De `lead` hierboven
// ("Open it when somebody asks why they were charged a fee") is voor
// een admin geschreven en zou op het scherm van een klant vreemd
// staan.
//
// Omdat het DEZELFDE secties zijn, kan de uitleg die een admin aan de
// telefoon voorleest nooit meer afwijken van wat de klant op zijn
// eigen scherm leest. Dat was de reden dat de eigenaar ze wilde kunnen
// lezen, en nu geldt het ook andersom.
//
// De regel bovenaan dit bestand geldt hier dubbel: GEEN leverancier,
// geen accounttype, geen marge. Nagelopen op 30-09 met een grep over
// beide klanthandboeken -- nul treffers.
export type CustomerGuide = {
  heading: string;
  lead: string;
  sections: Section[];
};

export const CUSTOMER_GUIDES: Record<"advertiser" | "affiliate", CustomerGuide> = {
  advertiser: {
    heading: "How it works",
    lead: "Everything you can do here, step by step — the same way our team explains it.",
    sections: ADVERTISER,
  },
  affiliate: {
    heading: "How it works",
    lead: "How your link earns, what you are paid for, and how the money reaches you.",
    sections: AFFILIATE,
  },
};

/** Which handbooks a role may open. */