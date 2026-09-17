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

import { normalizePem } from "./pem";

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

/**
 * Every request to Wise, with the SCA challenge answered.
 *
 * Wise puts Strict Customer Authentication in front of statement reads on
 * some business accounts. It does not simply refuse: it answers with an
 * `x-2fa-approval` header carrying a one-time token, and the request
 * succeeds when you send it back signed with the private half of a key
 * pair whose public half is registered on the Wise account. A plain
 * Authorization header alone can never get through — which is exactly what
 * this deployment was hitting, and why 231 deposits have no reference.
 *
 * So: try once, and if Wise asks for SCA and we have a key, sign the token
 * and try again. Without a key it returns the challenge response as-is, so
 * the caller can say "register a key" rather than "Wise returned nothing".
 *
 * The signature is RSA-SHA256 over the raw token, base64 — Wise's own
 * scheme. The key never leaves this function.
 */
async function wiseFetch(
  url: string,
  token: string,
): Promise<{
  res: Response;
  sca: boolean;
  signed: boolean;
  signError?: string | null;
}> {
  const first = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    // Never cache a financial fetch.
    cache: "no-store",
  });
  const challenge = first.headers.get("x-2fa-approval");
  if (first.ok || !challenge) {
    return { res: first, sca: !!challenge, signed: false };
  }

  // normalizePem, because a key moved through a hosting dashboard arrives
  // with its newlines turned into spaces, or into literal backslash-n, or
  // removed altogether — and Node's createSign accepts none of those while
  // the key material itself is perfectly intact. The first real attempt at
  // this was pasted WITHOUT the BEGIN/END lines, which is the one case that
  // cannot be recovered: there is no key there to reformat.
  // See lib/integrations/pem.ts.
  const pem = normalizePem(process.env.WISE_API_PRIVATE_KEY);
  if (!pem) {
    return {
      res: first,
      sca: true,
      signed: false,
      signError: process.env.WISE_API_PRIVATE_KEY
        ? "WISE_API_PRIVATE_KEY has no private key in it — the -----BEGIN PRIVATE KEY----- and -----END PRIVATE KEY----- lines have to be part of the value."
        : null,
    };
  }

  let signature: string;
  try {
    const { createSign } = await import("node:crypto");
    const signer = createSign("RSA-SHA256");
    signer.update(challenge);
    signer.end();
    signature = signer.sign(pem, "base64");
  } catch (e) {
    // A key that will not sign is a configuration fault, not a Wise fault.
    // Report the crypto layer's own message — it names the cause and
    // contains no key material.
    return {
      res: first,
      sca: true,
      signed: false,
      signError: e instanceof Error ? e.message : "could not sign",
    };
  }

  const second = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "x-2fa-approval": challenge,
      "X-Signature": signature,
    },
    cache: "no-store",
  });
  return { res: second, sca: true, signed: true };
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
  if (!token || !args.balanceId || !args.occurredAt) return null;

  // The profile id from the payload is a hint, not a fact: a token can see
  // several profiles and the statement endpoint answers
  // "Balance X not found for profile Y" — a 422 — when they do not line
  // up. Ask which profile actually holds this balance.
  let profileId: string | number | null = args.profileId || null;
  const owner = await findProfileForBalance(String(args.balanceId));
  if (owner.profileId !== null) profileId = owner.profileId;
  if (!profileId) return null;

  // ±36h around the credit — banks post with some delay — but NEVER past
  // now. A statement is a record of what happened; Wise refuses an
  // interval that ends in the future with a 422, and since every deposit
  // we look up is at most a few days old, +36h is in the future for all of
  // them. That is why every enrichment on a fresh deposit failed while the
  // token, the signature and the balance were all fine.
  let start: string;
  let end: string;
  try {
    const t = new Date(args.occurredAt).getTime();
    if (!Number.isFinite(t)) return null;
    const endMs = Math.min(t + 36 * 3600_000, Date.now());
    start = new Date(Math.min(t - 36 * 3600_000, endMs - 60_000)).toISOString();
    end = new Date(endMs).toISOString();
  } catch {
    return null;
  }

  // encodeURIComponent the path segments too — defense in depth even
  // though the host is fixed and these come from an authenticated
  // webhook payload.
  const pid = encodeURIComponent(String(profileId));
  const bid = encodeURIComponent(String(args.balanceId));
  const url =
    `${wiseApiBase()}/v1/profiles/${pid}/balance-statements/` +
    `${bid}/statement.json` +
    `?currency=${encodeURIComponent(args.currency)}` +
    `&intervalStart=${encodeURIComponent(start)}` +
    `&intervalEnd=${encodeURIComponent(end)}&type=COMPACT`;

  try {
    const { res } = await wiseFetch(url, token);
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
    const { res } = await wiseFetch(`${wiseApiBase()}/v1/profiles`, token);
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
  /** Is a private key configured to answer that challenge with? */
  signingKeyConfigured: boolean;
  /** Did we actually sign and retry? */
  signed: boolean;
  /** Why signing failed, in the crypto layer's words. No key material. */
  signError?: string | null;
  /** What balances each profile holds, so a mismatch is visible. */
  balancesSeen?: string[];
  /** Every statement attempt, so one profile's answer cannot hide another's. */
  attempts?: string[];
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
    signingKeyConfigured: !!process.env.WISE_API_PRIVATE_KEY,
    signed: false,
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
    const { res: pres } = await wiseFetch(`${wiseApiBase()}/v1/profiles`, token);
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
  // Same clamp as fetchWiseTxnDetail: an interval that ends in the future
  // is a 422 from Wise, and +36h on a deposit that arrived today is
  // always in the future.
  const endMs = Math.min(t + 36 * 3600_000, Date.now());
  const start = new Date(
    Math.min(t - 36 * 3600_000, endMs - 60_000),
  ).toISOString();
  const end = new Date(endMs).toISOString();

  // Which profile holds this balance? Asking is the difference between a
  // 422 and an answer.
  const owner = await findProfileForBalance(args.balanceId);
  out.balancesSeen = owner.seen;
  const tryProfiles =
    owner.profileId !== null ? [owner.profileId] : out.profileIds;
  if (owner.profileId === null) {
    out.error =
      `No profile this token can see holds balance ${args.balanceId}. ` +
      "That balance id came from the webhook payload, so either the token " +
      "is for a different Wise account or the payload's resource id is not " +
      "a balance id. Statement lookups cannot work for these deposits.";
  }

  for (const pid of tryProfiles) {
    const url =
      `${wiseApiBase()}/v1/profiles/${encodeURIComponent(String(pid))}` +
      `/balance-statements/${encodeURIComponent(args.balanceId)}/statement.json` +
      `?currency=${encodeURIComponent(args.currency)}` +
      `&intervalStart=${encodeURIComponent(start)}` +
      `&intervalEnd=${encodeURIComponent(end)}&type=COMPACT`;
    try {
      const { res, sca, signed, signError } = await wiseFetch(url, token);
      if (signError) out.signError = signError;
      out.statementStatus = res.status;
      // Record EVERY attempt. This was overwritten per profile, so a
      // meaningful answer from the first profile was replaced by the
      // last one's — and the body we displayed named a profile we had
      // already ruled out.
      out.attempts = [
        ...(out.attempts ?? []),
        `profile ${pid}: HTTP ${res.status}`,
      ];
      // Wise signals a Strict Customer Authentication challenge with an
      // x-2fa-approval header. wiseFetch answers it when a private key is
      // configured; without one, no amount of retrying helps.
      if (sca) out.scaRequired = true;
      if (signed) out.signed = true;
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

  if (out.scaRequired && !out.signingKeyConfigured) {
    out.error =
      "Wise wants Strict Customer Authentication for statement reads on this account. That IS passable: register a public key on the Wise account (Settings, API tokens, Manage public keys) and put the matching private key in WISE_API_PRIVATE_KEY. Until then, references can only come from the webhook payload or be matched by hand.";
  } else if (out.scaRequired && out.signed && out.statementStatus === 403) {
    out.error =
      "We signed Wise's SCA challenge and it still refused (403) — the registered public key does not match WISE_API_PRIVATE_KEY, or the token is scoped to a different profile.";
  } else if (out.scaRequired && !out.signed) {
    out.error =
      "Wise asked for SCA and WISE_API_PRIVATE_KEY could not sign it" +
      (out.signError ? ` — ${out.signError}` : ".");
  } else if (out.statementStatus === 422) {
    out.error =
      "Wise refused the statement parameters (422). The interval is capped (a year at most) and the currency has to be the balance's own currency, so one of those does not match this balance.";
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

/**
 * Which profile owns this balance?
 *
 * The webhook's composite key carries a balance id, and a token can see
 * several profiles (personal and business). Trying each profile blind gets
 * you `Balance 63309216 not found for profile 82348250` — which is Wise
 * telling you, correctly, that you asked the wrong one. That was the whole
 * of the 422 once the signature and the interval were right.
 *
 * So ask. /v1/profiles/{id}/balances lists what each profile actually
 * holds, and the one containing this balance is the one to request the
 * statement from. Returns null when NO profile holds it, which is a
 * different and much more useful answer than "422": it means the balance
 * id in that deposit's key is not one this token can ever read.
 */
/**
 * Per-process cache. A "fetch details" pass walks up to 60 deposits and
 * nearly all of them share one balance id — without this, each row paid
 * for a profile list plus up to two balance lists plus a statement, times
 * every profile, which on a real account is thousands of serial requests
 * in one action: a function timeout or a rate limit, and the admin sees
 * "couldn't reach Wise" with nothing filled in.
 *
 * Keyed by balance id, and it caches the MISS too, because "no profile
 * holds this" is the expensive answer and the one most likely to repeat.
 */
const balanceOwnerCache = new Map<
  string,
  { profileId: string | number | null; seen: string[] }
>();

export async function findProfileForBalance(
  balanceId: string,
): Promise<{ profileId: string | number | null; seen: string[] }> {
  const token = process.env.WISE_API_TOKEN;
  const seen: string[] = [];
  if (!token || !balanceId) return { profileId: null, seen };

  const cached = balanceOwnerCache.get(String(balanceId));
  if (cached) return cached;

  // v4, not v1. Wise moved the balances list, and /v1/profiles/{id}/
  // balances answers 404 — which reads exactly like "this profile has no
  // balances" and is really "this endpoint does not exist". The older
  // borderless-accounts shape is tried after it, because an account that
  // predates multi-balance still answers there.
  const paths = (pid: string | number) => [
    `${wiseApiBase()}/v4/profiles/${encodeURIComponent(String(pid))}/balances?types=STANDARD`,
    `${wiseApiBase()}/v3/profiles/${encodeURIComponent(String(pid))}/borderless-accounts`,
  ];

  for (const pid of await fetchWiseProfileIds()) {
    try {
      let res: Response | null = null;
      const statuses: number[] = [];
      for (const url of paths(pid)) {
        const attempt = await wiseFetch(url, token);
        statuses.push(attempt.res.status);
        if (attempt.res.ok) {
          res = attempt.res;
          break;
        }
      }
      if (!res) {
        seen.push(`profile ${pid}: HTTP ${statuses.join("/")}`);
        continue;
      }
      // v4 returns the balances directly; the v3 borderless shape wraps
      // them one level down, so flatten whichever came back.
      const raw = (await res.json()) as unknown;
      const json = (
        Array.isArray(raw)
          ? raw.flatMap((entry) => {
              const e = entry as {
                id?: string | number;
                currency?: string;
                balances?: Array<{ id?: string | number; currency?: string }>;
              };
              return Array.isArray(e.balances) && e.balances.length > 0
                ? e.balances
                : [e];
            })
          : []
      ) as Array<{
        id?: string | number;
        currency?: string;
      }>;
      const ids = (Array.isArray(json) ? json : []).map((b) => ({
        id: String(b?.id ?? ""),
        cur: String(b?.currency ?? ""),
      }));
      seen.push(
        `profile ${pid}: ${ids.map((b) => `${b.id}${b.cur ? `/${b.cur}` : ""}`).join(", ") || "none"}`,
      );
      if (ids.some((b) => b.id === String(balanceId))) {
        const hit = { profileId: pid, seen };
        balanceOwnerCache.set(String(balanceId), hit);
        return hit;
      }
    } catch {
      seen.push(`profile ${pid}: request failed`);
    }
  }
  const miss = { profileId: null, seen };
  balanceOwnerCache.set(String(balanceId), miss);
  return miss;
}
