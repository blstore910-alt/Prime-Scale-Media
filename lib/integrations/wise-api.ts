// Wise API client — fetch the real transaction detail (reference +
// sender) for an incoming deposit.
//
// The balances#credit webhook is thin: amount + currency + a balance
// id + occurred_at, often WITHOUT the sender's payment reference or
// IBAN. To match reliably we fetch the balance statement for a narrow
// window around occurred_at and pull the matching credit line's
// reference + sender.
//
// Read-only token is enough (statements are a read). Guarded: if the
// token/mode isn't set, or the call fails, we return null and the
// webhook falls back to whatever the payload carried.

export type WiseTxnDetail = {
  reference: string | null;
  senderIban: string | null;
  senderName: string | null;
  /**
   * The human line Wise itself shows for this credit, e.g. "Received money
   * from JOHN DOE with reference 0005-6164655424". Kept because for SEPA
   * payments the payer's reference text frequently lands ONLY here, and
   * because an admin staring at an unmatched deposit needs something to
   * recognise it by other than the amount.
   */
  description: string | null;
};

type StatementTxn = {
  type?: string; // "CREDIT" / "DEBIT"
  amount?: { value?: number; currency?: string };
  date?: string;
  details?: {
    paymentReference?: string;
    reference?: string;
    description?: string;
    senderName?: string;
    senderAccount?: string;
    sender?: { name?: string; bankAccount?: string; iban?: string };
  };
  referenceNumber?: string;
};

type Statement = { transactions?: StatementTxn[] };

// Pure: pick the CREDIT transaction that matches the deposit's amount,
// and pull reference + sender from it. Exported for unit tests.
export function parseStatementForMatch(
  statement: Statement,
  amountCents: number,
): WiseTxnDetail | null {
  const txns = statement.transactions ?? [];
  const credits = txns.filter((t) => {
    if ((t.type ?? "").toUpperCase() !== "CREDIT") return false;
    const cents = Math.round(Number(t.amount?.value ?? NaN) * 100);
    return Number.isFinite(cents) && Math.abs(cents - amountCents) <= 1;
  });
  if (credits.length !== 1) {
    // 0 or >1 amount matches in the window — can't safely pick one.
    return null;
  }
  const d = credits[0].details ?? {};
  const description = d.description ?? null;
  // The reference, in order of how much we trust it. The last resort is the
  // DESCRIPTION: Wise writes "… with reference XYZ" in prose, and for SEPA
  // credits that is very often the only place the payer's reference appears
  // at all — paymentReference comes back null while the reference is
  // sitting right there in words. 231 deposits on this account, none with a
  // reference, is what that looks like from the outside.
  const reference =
    d.paymentReference ??
    d.reference ??
    credits[0].referenceNumber ??
    referenceFromDescription(description);
  const senderName = d.senderName ?? d.sender?.name ?? null;
  const rawIban =
    d.sender?.iban ?? d.sender?.bankAccount ?? d.senderAccount ?? null;
  const senderIban = rawIban
    ? rawIban.replace(/\s/g, "").toUpperCase()
    : null;
  return { reference, senderIban, senderName, description };
}

/**
 * Pull a payment reference out of Wise's own prose.
 *
 * Only two shapes are accepted, and both are anchored, because this runs
 * on a string that also contains the SENDER'S NAME and the amount — a
 * loose "longest run of digits" would happily return a fragment of an
 * account number or a date and hand the matcher a confident wrong answer.
 *
 *   "... with reference 0005-6164655424"   → 0005-6164655424
 *   "... reference: 6164655424"            → 6164655424
 *
 * The returned string still goes through extractTopupReference in the
 * matcher, which is what understands the client-code prefix.
 */
export function referenceFromDescription(
  description: string | null | undefined,
): string | null {
  if (!description) return null;
  const m = description.match(
    /\breference[:\s]+([0-9]{4,}(?:-[0-9]{4,})?)\b/i,
  );
  return m ? m[1] : null;
}

function wiseApiBase(): string {
  return process.env.WISE_API_URL ?? "https://api.wise.com";
}

// Fetch the balance statement for a small window around occurredAt and
// return the matching credit's detail. Returns null on any problem
// (unconfigured, network, no unambiguous match).
export async function fetchWiseTxnDetail(args: {
  profileId: string | number;
  balanceId: string | number;
  currency: string;
  amountCents: number;
  occurredAt: string; // ISO
}): Promise<WiseTxnDetail | null> {
  const token = process.env.WISE_API_TOKEN;
  if (!token || !args.profileId || !args.balanceId || !args.occurredAt) {
    return null;
  }

  // ±36h window around the credit — banks post with some delay.
  let start: string;
  let end: string;
  try {
    const t = new Date(args.occurredAt).getTime();
    if (!Number.isFinite(t)) return null;
    start = new Date(t - 36 * 3600_000).toISOString();
    end = new Date(t + 36 * 3600_000).toISOString();
  } catch {
    return null;
  }

  // encodeURIComponent the path segments too — defense in depth even
  // though the host is fixed and these come from an authenticated
  // webhook payload.
  const pid = encodeURIComponent(String(args.profileId));
  const bid = encodeURIComponent(String(args.balanceId));
  const url =
    `${wiseApiBase()}/v1/profiles/${pid}/balance-statements/` +
    `${bid}/statement.json` +
    `?currency=${encodeURIComponent(args.currency)}` +
    `&intervalStart=${encodeURIComponent(start)}` +
    `&intervalEnd=${encodeURIComponent(end)}&type=COMPACT`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      // Never cache a financial fetch.
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as Statement;
    return parseStatementForMatch(json, args.amountCents);
  } catch {
    return null;
  }
}
