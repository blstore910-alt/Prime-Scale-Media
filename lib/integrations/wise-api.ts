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
  // The instant the webhook says the credit happened. Used to pick between
  // several credits of the same amount in the window; optional so the old
  // two-argument call still behaves.
  occurredAt?: string | null,
): WiseTxnDetail | null {
  const txns = statement.transactions ?? [];
  const credits = txns.filter((t) => {
    if ((t.type ?? "").toUpperCase() !== "CREDIT") return false;
    const cents = Math.round(Number(t.amount?.value ?? NaN) * 100);
    return Number.isFinite(cents) && Math.abs(cents - amountCents) <= 1;
  });
  if (credits.length === 0) return null;

  // MORE THAN ONE credit of this amount in the window used to mean "give
  // up", and on a real account that is the normal case rather than the
  // exception: this one has dozens of 0.01 test payments, so almost every
  // enrichment returned null and 231 deposits arrived with no reference and
  // no sender — which is also why nothing could be matched automatically.
  //
  // The webhook already tells us WHEN the credit happened, to the second.
  // The statement lines carry their own date. So the tie is broken by time,
  // not by giving up — and only when one line is clearly nearest: if two
  // credits of the same amount are within a minute of each other we are
  // genuinely unable to tell them apart, and guessing there would attach
  // one payer's reference to another payer's money.
  let chosen = credits[0];
  if (credits.length > 1) {
    const target = occurredAt ? Date.parse(occurredAt) : NaN;
    if (!Number.isFinite(target)) return null;
    const scored = credits
      .map((t) => ({ t, at: t.date ? Date.parse(t.date) : NaN }))
      .filter((x) => Number.isFinite(x.at))
      .map((x) => ({ ...x, d: Math.abs(x.at - target) }))
      .sort((a, b) => a.d - b.d);
    if (scored.length === 0) return null;
    if (scored.length > 1 && scored[1].d - scored[0].d < 60_000) return null;
    chosen = scored[0].t;
  }

  const d = chosen.details ?? {};
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
    chosen.referenceNumber ??
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
    return parseStatementForMatch(json, args.amountCents, args.occurredAt);
  } catch {
    return null;
  }
}

/**
 * The Wise profiles this token can read.
 *
 * The webhook takes the profile id out of the payload, which is fine while
 * a payload has one. A REFETCH has no payload — it is working from a row we
 * stored days ago — so it asks Wise instead. That also means the refetch
 * needs no new environment variable: the read token already implies which
 * profiles it may see.
 *
 * Returns [] on any problem, so a caller falls back to "we could not ask"
 * rather than to a wrong id.
 */
export async function fetchWiseProfileIds(): Promise<Array<string | number>> {
  const token = process.env.WISE_API_TOKEN;
  if (!token) return [];
  try {
    const res = await fetch(`${wiseApiBase()}/v1/profiles`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const json = (await res.json()) as Array<{ id?: string | number }>;
    return (Array.isArray(json) ? json : [])
      .map((p) => p?.id)
      .filter((v): v is string | number => v !== undefined && v !== null);
  } catch {
    return [];
  }
}

/**
 * Take apart the idempotency key the webhook composed.
 *
 * It is `balanceId:occurredAt:amount`, and occurredAt is an ISO timestamp
 * with colons of its own — so this is not a split on ":" but a first
 * segment, a last segment, and everything between.
 */
export function parseExternalId(externalId: string): {
  balanceId: string;
  occurredAt: string;
  amount: string;
} | null {
  const parts = String(externalId ?? "").split(":");
  if (parts.length < 3) return null;
  const balanceId = parts[0];
  const amount = parts[parts.length - 1];
  const occurredAt = parts.slice(1, -1).join(":");
  if (!balanceId || !occurredAt) return null;
  return { balanceId, occurredAt, amount };
}

/**
 * Ask Wise once, and report exactly what it said.
 *
 * Every other call in this file swallows failures and returns null,
 * deliberately — a webhook must not fall over because a statement lookup
 * 404s. The cost of that is a screen that can only say "Wise returned
 * nothing", which is indistinguishable from an expired token, a balance
 * the token cannot see, a statement window outside the plan's retention,
 * and the SCA challenge Wise puts in front of statement endpoints for some
 * business accounts.
 *
 * So this one reports. It is read-only, it makes ONE request, and it never
 * returns a token or a header value — only the status, whether the shape
 * looks like a statement, and a short snippet of the body.
 */
export type WiseProbe = {
  tokenConfigured: boolean;
  profilesStatus: number | null;
  profileIds: Array<string | number>;
  statementStatus: number | null;
  /** Wise asks for SCA on statement endpoints for some accounts. */
  scaRequired: boolean;
  transactions: number | null;
  bodySnippet: string | null;
  error: string | null;
};

export async function probeWiseStatement(args: {
  balanceId: string;
  currency: string;
  occurredAt: string;
}): Promise<WiseProbe> {
  const out: WiseProbe = {
    tokenConfigured: !!process.env.WISE_API_TOKEN,
    profilesStatus: null,
    profileIds: [],
    statementStatus: null,
    scaRequired: false,
    transactions: null,
    bodySnippet: null,
    error: null,
  };
  const token = process.env.WISE_API_TOKEN;
  if (!token) {
    out.error = "WISE_API_TOKEN is not set on this deployment.";
    return out;
  }

  try {
    const pres = await fetch(`${wiseApiBase()}/v1/profiles`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    out.profilesStatus = pres.status;
    if (pres.ok) {
      const json = (await pres.json()) as Array<{ id?: string | number }>;
      out.profileIds = (Array.isArray(json) ? json : [])
        .map((p) => p?.id)
        .filter((v): v is string | number => v !== undefined && v !== null);
    }
  } catch (e) {
    out.error = e instanceof Error ? e.message : "profiles request failed";
    return out;
  }

  if (out.profileIds.length === 0) {
    out.error =
      out.profilesStatus === 401
        ? "The token was rejected (401). It is expired, revoked, or for a different Wise account."
        : `Wise listed no profiles (HTTP ${out.profilesStatus}).`;
    return out;
  }

  const t = Date.parse(args.occurredAt);
  if (!Number.isFinite(t)) {
    out.error = "That deposit has no usable timestamp in its key.";
    return out;
  }
  const start = new Date(t - 36 * 3600_000).toISOString();
  const end = new Date(t + 36 * 3600_000).toISOString();

  for (const pid of out.profileIds) {
    const url =
      `${wiseApiBase()}/v1/profiles/${encodeURIComponent(String(pid))}` +
      `/balance-statements/${encodeURIComponent(args.balanceId)}/statement.json` +
      `?currency=${encodeURIComponent(args.currency)}` +
      `&intervalStart=${encodeURIComponent(start)}` +
      `&intervalEnd=${encodeURIComponent(end)}&type=COMPACT`;
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      out.statementStatus = res.status;
      // Wise signals a Strict Customer Authentication challenge with this
      // header on read endpoints for some business accounts. Without it
      // the request 403s for ever and no amount of retrying helps.
      if (res.headers.get("x-2fa-approval")) out.scaRequired = true;
      const text = await res.text();
      out.bodySnippet = text.slice(0, 300);
      if (res.ok) {
        try {
          const json = JSON.parse(text) as { transactions?: unknown[] };
          out.transactions = Array.isArray(json.transactions)
            ? json.transactions.length
            : 0;
        } catch {
          out.transactions = null;
        }
        out.error = null;
        return out;
      }
    } catch (e) {
      out.error = e instanceof Error ? e.message : "statement request failed";
    }
  }

  if (out.scaRequired) {
    out.error =
      "Wise wants Strict Customer Authentication for statement reads on this account (x-2fa-approval). A plain read token cannot pass it, so references can only come from the webhook payload or be matched by hand.";
  } else if (out.statementStatus === 403) {
    out.error =
      "Wise refused the statement (403) — the token may be read-scoped to a different profile, or the account requires SCA.";
  } else if (out.statementStatus === 404) {
    out.error =
      "Wise has no such balance for these profiles (404) — the balance id in this deposit's key does not belong to the account the token can see.";
  } else if (out.statementStatus && out.statementStatus >= 400) {
    out.error = `Wise refused the statement (HTTP ${out.statementStatus}).`;
  }
  return out;
}
