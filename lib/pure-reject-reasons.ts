// ─────────────────────────────────────────────────────────────────────
// What we tell a customer when we refuse something
// ─────────────────────────────────────────────────────────────────────
// A rejection reason is not an internal note: it is printed on the
// customer's own screen, next to money they tried to move. Typed fresh
// each time, under pressure, in a queue of twenty, it comes out as
// "no valid pop" -- which means nothing to the person reading it and
// tells them nothing about what to do next.
//
// So: a starting sentence per ordinary case, written for the customer,
// saying what was wrong AND what to do about it. The admin picks one
// and edits it; nothing here is forced.
//
// HARD RULE, TESTED: no template may name a supplier or a platform
// partner. The customer's world contains us and their ad accounts.
// See tests/lib/reject-reasons.test.ts.
// ─────────────────────────────────────────────────────────────────────

export type RejectContext =
  | "wallet_topup"
  | "account_topup"
  | "account_request"
  | "withdrawal";

export interface RejectTemplate {
  /** The chip's word. Short enough for a row of five on a phone. */
  short: string;
  /** What lands in the box. Written to the customer, second person. */
  text: string;
}

const WALLET_TOPUP: RejectTemplate[] = [
  {
    short: "No payment found",
    text: "We could not find a payment matching this top-up. Nothing has arrived in our account for this amount and reference. If you have already sent it, reply with the transfer receipt and we will look again.",
  },
  {
    short: "Slip unreadable",
    text: "We could not read your payment slip. Please upload a clearer copy that shows the amount, the date, the sender and the account it was sent to.",
  },
  {
    short: "Amount differs",
    text: "The amount on the slip is not the amount requested here. Please file a new top-up for the amount you actually sent, and we will credit that.",
  },
  {
    short: "Wrong reference",
    text: "The payment reached us without the reference shown on your top-up screen, so we could not match it to your account. Please file a new top-up and quote the reference exactly as it is shown.",
  },
  {
    short: "Wrong account",
    text: "This transfer was sent to a different bank account than the one shown for your top-up. Please use the details on the top-up screen, which can differ per currency.",
  },
  {
    short: "Duplicate",
    text: "This top-up is a duplicate: the payment it refers to has already been credited to your wallet under an earlier request.",
  },
];

const ACCOUNT_TOPUP: RejectTemplate[] = [
  {
    short: "Wallet too low",
    text: "Your wallet does not hold enough to cover this top-up, including the top-up fee. Please top up your wallet first and then request this again.",
  },
  {
    short: "Account not active",
    text: "This ad account is not active at the moment, so it cannot be funded. Once it is running again you can request the top-up.",
  },
  {
    short: "Below minimum",
    text: "This amount is below the minimum for your ad account. Please request at least the minimum shown on the top-up screen.",
  },
  {
    short: "Duplicate",
    text: "A top-up for the same amount on your account is already in progress, so this one has been refused rather than funding it twice.",
  },
];

const ACCOUNT_REQUEST: RejectTemplate[] = [
  {
    short: "Site unreachable",
    text: "We could not reach the website on your request, so we cannot submit it. Please check the address and file a new request once the site is live.",
  },
  {
    short: "Policy",
    text: "The website on your request does not meet the advertising policies for this account type, so it cannot be submitted as it stands.",
  },
  {
    short: "Missing business ID",
    text: "We need your Business Manager ID before this account can be created. Please add it and file a new request.",
  },
  {
    short: "Incomplete",
    text: "Your request is missing details we need. Please file a new one with the account name, the timezone and the currency filled in.",
  },
  {
    short: "Already have one",
    text: "You already have an ad account of this type. If you need a second one, request an extra ad account instead.",
  },
];

// ── THE ONE THAT MOVES MONEY BACK ───────────────────────────────────
//
// /withdrawals had no reason field at all: the confirm dialog called
// `reject.mutate({ id })` and the optional reason was never collected,
// so every refusal reached the RPC as null and the customer's
// notification said nothing but "no". The three sibling reject flows
// all demand a reason. The one where the customer is asking for their
// own money back was the one that did not.
const WITHDRAWAL: RejectTemplate[] = [
  {
    short: "Still spending",
    text: "This ad account is still running campaigns, so the amount you asked back is not free to return yet. Pause the account, or ask for a smaller amount, and we will process it.",
  },
  {
    short: "More than is on it",
    text: "The amount you asked back is more than this ad account currently holds. Please request an amount up to the balance shown on the account.",
  },
  {
    short: "Account under review",
    text: "This ad account is under review at the moment, so nothing can be moved off it. We will let you know as soon as that is finished.",
  },
  // ── NOT A BANK PAYOUT ─────────────────────────────────────────────
  //
  // This template asked for "company and bank details on file before
  // money can be returned". Money off an ad account goes to the
  // customer's WALLET, in this app, and there is no wallet-to-bank
  // withdrawal in this product at all — so the sentence asked a
  // customer to complete something that would change nothing, to
  // unblock something that was never blocked on it. It went out
  // verbatim as the notification body.
  //
  // What an admin actually needs in its place is the company, because
  // an invoice cannot be raised without one.
  {
    short: "Company missing",
    text: "We need your company details on file before we can move money on your account. Please complete them under Settings and request this again.",
  },
  {
    short: "Duplicate",
    text: "You already have a request for the same amount on this ad account in progress, so this one has been refused rather than returning the money twice.",
  },
];

const BY_CONTEXT: Record<RejectContext, RejectTemplate[]> = {
  wallet_topup: WALLET_TOPUP,
  account_topup: ACCOUNT_TOPUP,
  account_request: ACCOUNT_REQUEST,
  withdrawal: WITHDRAWAL,
};

export function rejectTemplates(ctx: RejectContext): RejectTemplate[] {
  return BY_CONTEXT[ctx] ?? [];
}

/** Every template in the file, for the rules that apply to all of them. */
export function allRejectTemplates(): RejectTemplate[] {
  return Object.values(BY_CONTEXT).flat();
}
