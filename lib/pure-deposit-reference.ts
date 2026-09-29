/**
 * WHOSE MONEY IS THIS?
 *
 * ── THE PROBLEM, MEASURED ─────────────────────────────────────────
 *
 * 29-09: 80 bank deposits sit unattributed, worth EUR 38,410 and USD
 * 41,186. The finance-check screen showed all 80 with the same
 * checklist, the first line of which is "does the reference match any
 * customer's code in THIS system?" — eighty times, and the answer is
 * no eighty times.
 *
 * A review list where every row asks the same question and gets the
 * same answer is a list nobody finishes.
 *
 * ── WHAT THE REFERENCES ACTUALLY LOOK LIKE ────────────────────────
 *
 * Counted on the live feed:
 *
 *   64  carry an OLD-system client code   EUR/USD 30,818
 *   16  carry no reference at all         EUR/USD 12,236
 *   10  carry something with no code in it EUR/USD 41,636
 *
 * The old system numbered customers PSM1000 upward; this one starts
 * at PSM0001 and has reached PSM0016. So a four-digit code beginning
 * with a non-zero is somebody who has not been migrated, and no
 * amount of looking will match them here. That is 64 of the 80
 * answered by one rule.
 *
 * And the code is often buried rather than alone:
 *
 *   PSM2098/nca7d2d4ddfc78d3186571d9e9dbd1a23
 *   PSM1971/TRWIBEB1XXX
 *   PSM1737 Tribe
 *   PSM2129 (topup)
 *   Top-up Patrick Benschop - PSM2149/PSM2149
 *
 * so it is searched for anywhere in the string, not matched against
 * the whole of it. Doing it the strict way left 22 in "something
 * else" that are plainly old-system.
 *
 * ── WHAT IS LEFT IS THE REAL WORK ─────────────────────────────────
 *
 * 26 deposits: sixteen with nothing to go on and ten carrying a bank
 * transaction number. Those need a person — and now they are 26 rows
 * rather than hidden among eighty.
 */

export type DepositMatch =
  /** The reference names a customer in THIS system. Attribute it. */
  | { kind: "customer"; code: string }
  /** An old-system code. That customer has not been migrated. */
  | { kind: "legacy"; code: string }
  /** A reference with no client code in it — a bank's own number. */
  | { kind: "no-code" }
  /** Nothing to go on at all. */
  | { kind: "empty" };

/** Every PSM#### in the string, uppercased, in the order they appear. */
export function codesInReference(reference: string | null | undefined): string[] {
  if (!reference) return [];
  const out: string[] = [];
  for (const m of String(reference).matchAll(/PSM\s*(\d{4})/gi)) {
    out.push(`PSM${m[1]}`);
  }
  return out;
}

/**
 * `knownCodes` is this system's client codes. Passed in rather than
 * assumed, because "starts with a zero" is how they look TODAY and a
 * tenant that reaches PSM1000 would break a rule written that way.
 * The list decides; the shape is only the fallback.
 */
export function classifyDeposit(
  reference: string | null | undefined,
  knownCodes: Iterable<string>,
): DepositMatch {
  const text = (reference ?? "").trim();
  if (!text) return { kind: "empty" };

  const known = new Set(
    [...knownCodes].map((c) => String(c).trim().toUpperCase()).filter(Boolean),
  );
  const found = codesInReference(text);

  // A code we actually have wins, wherever it sits in the string.
  for (const c of found) {
    if (known.has(c)) return { kind: "customer", code: c };
  }
  // Otherwise the first code present is somebody we do not have.
  if (found.length > 0) return { kind: "legacy", code: found[0] };

  return { kind: "no-code" };
}

/** What the reviewer should be told, per kind. */
export function depositAdvice(m: DepositMatch): string {
  switch (m.kind) {
    case "customer":
      return `The reference names ${m.code}, who is a customer here. Match it to their top-up — this one should not need a decision.`;
    case "legacy":
      return `${m.code} is an OLD-system client code. That customer has not been moved into this system, so nothing here will ever match it. It stays until they are migrated, or until the money goes back.`;
    case "no-code":
      return "The reference carries no client code — it looks like the bank's own transaction number. Somebody has to work out who sent this from the amount, the date and the sending account.";
    case "empty":
      return "No reference at all. Money arrived and nothing says who from. This is the hardest kind and the one most worth chasing, because nobody is going to claim it on their own.";
  }
}
