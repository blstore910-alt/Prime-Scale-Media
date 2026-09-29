// ── WHAT WE HOLD AT THE SUPPLIERS, PER CURRENCY ─────────────────────
//
// The owner, 29-09: "kunnen we in ons dashboard ook easy on balance
// zien wat we momenteel usd en eur hebben bij rockads en bij seamx."
//
// It is the one figure the desk has to open two other people's websites
// to learn, and it decides whether a top-up can be pushed at all. A
// verified top-up with no credit behind it is a customer waiting on
// nothing.
//
// WHY THIS IS A PURE MODULE AND NOT A `reduce` IN THE PANEL. RockAds
// returns a LIST of wallets, each with its OWN currency. Adding them up
// is one line, and that one line is exactly the fault that put
// "Money involved $85,940.06" on /finance-check this morning — a reduce
// over a mixed list wearing the currency of whichever row happened to
// be first. Euros and dollars are added SEPARATELY here, or they are
// not added at all.
//
// WHY "UNKNOWN" IS A STATE. A supplier we could not reach must not read
// as a supplier holding nothing. Zero is a decision — do not fund
// anything today — and a failed fetch is not. Every figure below is
// either a number or null, never a hopeful 0.

/** One wallet as RockAds reports it. Only the fields the sum needs. */
export type HoldingWallet = {
  name?: string | null;
  code?: string | null;
  balance?: number | string | null;
  currency?: string | null;
};

/** What SeamX returns from /v1/wallets/balance, already parsed. */
export type HoldingSeamx = {
  usd_balance?: number | null;
  eur_balance?: number | null;
  /** Spendable after their tax reserve. */
  available_usd?: number | null;
  available_eur?: number | null;
};

export type HoldingLine = {
  /** Upper-case ISO code. */
  currency: string;
  /** Gross, as the supplier states it. */
  total: number;
  /**
   * Spendable now, when the supplier distinguishes the two. Null means
   * they do not — NOT that everything is spendable.
   */
  available: number | null;
  /**
   * Gross minus spendable, when both are known and gross is the larger.
   * For SeamX this is the DST the supplier is holding back. Null when
   * the supplier reports no such split.
   */
  heldBack: number | null;
  /** The wallets behind the figure, for the click-through. */
  parts: { label: string; amount: number }[];
};

export type SupplierHolding = {
  /** The supplier as the DESK knows it. Never shown to a customer. */
  supplier: string;
  /**
   * "bank" is OUR OWN money (Wise), not credit at a supplier. It is
   * shown in the same panel because it answers the same question --
   * what can we spend today -- but it is kept OUT of the supplier
   * total, because credit that can only be spent at one supplier and
   * money that can go anywhere are not one figure.
   */
  kind?: "supplier" | "bank";
  /**
   * ok    — read it, the lines are real.
   * off   — no credentials set; there is nothing to read, and that is
   *         not a fault.
   * error — we asked and did not get an answer. Figures are unknown.
   * demo  — the MOCK adapter answered. It returns USD 5,000 / EUR 2,000
   *         with a plausible 3% reserve and `ok: true`, and SeamX is in
   *         mock mode unless SUPPLIER1_MODE is exactly "live" — which is
   *         the default. Without this state the dashboard would have
   *         shown invented supplier credit as fact, to the one person
   *         who decides whether a top-up can be funded. It is the whole
   *         reason this union has four members and not three.
   */
  status: "ok" | "off" | "error" | "demo";
  error: string | null;
  /**
   * When THIS supplier answered, as an ISO string. Per supplier and not
   * one timestamp for the panel: the three are fetched independently
   * and one can be an hour stale from a cache or a retry while the
   * others are fresh. A single "read at" over three reads is a claim
   * about all of them that only one of them earned.
   */
  readAt?: string | null;
  lines: HoldingLine[];
};

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Currency codes are compared upper-case and trimmed, because "eur",
 * "EUR " and "Eur" are one currency and three keys in a naive map — and
 * three keys is three rows on screen that each look like a separate pot
 * of money.
 */
function code(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

/** Round to cents once, at the end. Floats drift over a list. */
function cents(n: number): number {
  return Math.round(n * 100) / 100;
}

/** EUR first, then USD, then the rest alphabetically. The two the desk
 *  works in should not move position because a third appeared. */
function sortLines(a: { currency: string }, b: { currency: string }): number {
  const rank = (c: string) => (c === "EUR" ? 0 : c === "USD" ? 1 : 2);
  return (
    rank(a.currency) - rank(b.currency) ||
    a.currency.localeCompare(b.currency)
  );
}

/**
 * RockAds: a flat list of wallets, each with its own currency.
 *
 * A wallet in an UNEXPECTED currency is not silently dropped and not
 * folded into euros — it gets its own line under its own code, so a pot
 * of money in a third currency appears on screen instead of vanishing
 * or inflating a figure somebody will reconcile against a bank. A
 * wallet with no currency at all is the only thing skipped, because
 * there is no line it could honestly go on; those are counted so the
 * panel can say how many it could not place.
 */
export function rockadsHoldings(
  wallets: HoldingWallet[] | null | undefined,
): { lines: HoldingLine[]; skipped: number } {
  const by = new Map<string, HoldingLine>();
  let skipped = 0;
  for (const w of wallets ?? []) {
    const cur = code(w?.currency);
    const amount = num(w?.balance);
    if (!cur || amount === null) {
      skipped += 1;
      continue;
    }
    const line = by.get(cur) ?? {
      currency: cur,
      total: 0,
      available: null,
      heldBack: null,
      parts: [],
    };
    line.total += amount;
    line.parts.push({
      label: String(w?.name ?? w?.code ?? "Wallet").trim() || "Wallet",
      amount,
    });
    by.set(cur, line);
  }
  const lines = [...by.values()].map((l) => ({
    ...l,
    total: cents(l.total),
    parts: l.parts.map((p) => ({ ...p, amount: cents(p.amount) })),
  }));
  lines.sort(sortLines);
  return { lines, skipped };
}

/**
 * SeamX: one balance object, two currencies, with a spendable figure
 * beside each.
 *
 * A currency they report as null is LEFT OUT rather than shown as zero.
 * Their balance endpoint omits a currency we hold no account in, and
 * "EUR 0.00" on the screen is a different sentence from "we have no
 * euro wallet there".
 */
export function seamxHoldings(
  balance: HoldingSeamx | null | undefined,
): HoldingLine[] {
  const out: HoldingLine[] = [];
  const pairs: [string, number | null, number | null][] = [
    ["USD", num(balance?.usd_balance), num(balance?.available_usd)],
    ["EUR", num(balance?.eur_balance), num(balance?.available_eur)],
  ];
  for (const [currency, gross, avail] of pairs) {
    if (gross === null) continue;
    // Only a POSITIVE difference is a reserve. An account can report an
    // available figure ABOVE the gross (a credit line), and calling that
    // a negative amount "held back for DST" would be nonsense — so the
    // split is simply not claimed.
    const held =
      avail !== null && gross - avail > 0.004 ? cents(gross - avail) : null;
    out.push({
      currency,
      total: cents(gross),
      available: avail === null ? null : cents(avail),
      heldBack: held,
      parts: [],
    });
  }
  out.sort(sortLines);
  return out;
}

/**
 * Across every supplier, per currency.
 *
 * ONLY the suppliers that answered. A total over two suppliers where one
 * failed is not a total — it is a smaller number that looks like one,
 * and it is the figure somebody would decide against. So a currency is
 * summed from `ok` suppliers only, and `complete` says whether every
 * supplier was one of them. The panel refuses to print a total when it
 * is false.
 */
export function totalHoldings(
  suppliers: SupplierHolding[] | null | undefined,
): { lines: { currency: string; total: number }[]; complete: boolean } {
  const list = suppliers ?? [];
  // A supplier that is switched OFF holds nothing by definition, so it
  // does not make the total incomplete. One we could not READ does —
  // and so does one in DEMO, because an invented figure leaves the real
  // one just as unknown as a timeout does.
  const complete = list.every((s) => s.status === "ok" || s.status === "off");
  const by = new Map<string, number>();
  for (const s of list) {
    if (s.status !== "ok") continue;
    for (const l of s.lines) {
      by.set(l.currency, (by.get(l.currency) ?? 0) + l.total);
    }
  }
  const lines = [...by.entries()]
    .map(([currency, total]) => ({ currency, total: cents(total) }))
    .sort(sortLines);
  return { lines, complete };
}

/**
 * De regels die het tonen waard zijn.
 *
 * De eigenaar, 29-09: "alles wat 0 is mag je hiden." Wise geeft elke
 * rekening terug die bestaat, dus GBP 0,00 en HKD 0,00 stonden naast
 * de bedragen die er wel toe doen -- op een paneel dat de vraag "wat
 * kunnen we vandaag uitgeven" beantwoordt.
 *
 * MAAR NOOIT ALLES WEG. Staat alles op nul, dan IS nul het antwoord en
 * hoort het er te staan: een leverancier zonder saldo en een
 * leverancier die niet antwoordde moeten verschillend lezen, en een
 * lege lijst zou die twee op een hoop gooien.
 */
export function visibleLines(lines: HoldingLine[]): HoldingLine[] {
  const real = lines.filter((l) => Math.abs(l.total) > 0.004);
  return real.length ? real : lines;
}
