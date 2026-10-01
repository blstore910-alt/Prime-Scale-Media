// ── HET DAGSALDO BIJ EEN HANDMATIGE LEVERANCIER, UITGEREKEND ────────
//
// Zie plak 185 en het spreadsheet van de eigenaar: per dag een begin,
// wat wij erheen stuurden, de klant-top-ups eraf, de fees, DST, het
// verwachte eind, het echte eind (uit het dashboard van de leverancier)
// en het verschil.
//
//   begin(dag)     = echt eind van de vorige dag met een echt eind,
//                    anders het verwachte eind van de vorige dag, anders 0
//   verwacht(dag)  = begin + deposits - top-ups - fees - DST (+ correcties)
//   verschil(dag)  = echt - verwacht, als er een echt eind is
//
// Puur en in centen gerekend: geen afronding die over dertig dagen een
// dollar wordt.

export type LineKind = "deposit" | "customer_topup" | "fee" | "dst" | "adjustment" | "adjustment_out";

export type LedgerLine = {
  id: string;
  day: string; // YYYY-MM-DD
  kind: LineKind;
  amount: number; // altijd positief; de soort bepaalt het teken
  clientRef?: string | null;
  note?: string | null;
  /** "app" = een top-up uit de app zelf, niet handmatig ingevoerd. */
  source?: "manual" | "app";
  /** Plak 186. Een correctie van een admin wacht op een eigenaar en
   *  telt tot dan niet mee; een afgewezen regel nooit. */
  status?: "approved" | "pending" | "rejected";
  rejectReason?: string | null;
  /** Bij een storting: wat WIJ stuurden (bv. EUR 4000), naast amount =
   *  wat zij in USD bijschreven. */
  sentAmount?: number | null;
  sentCurrency?: "EUR" | "USD" | null;
};

export type DayBalance = { day: string; actualEnd: number; note?: string | null };

export type LedgerDay = {
  day: string;
  start: number;
  deposits: number;
  topups: number;
  fees: number;
  dst: number;
  adjustments: number;
  expectedEnd: number;
  actualEnd: number | null;
  difference: number | null;
  status: "ok" | "off" | "open";
  lines: LedgerLine[];
  note: string | null;
};

const c = (n: number) => Math.round(n * 100);
const e = (cents: number) => cents / 100;

/** Binnen een cent verschil telt als kloppend. */
export const TOLERANCE_CENTS = 1;

export function buildLedgerDays(lines: LedgerLine[], balances: DayBalance[]): LedgerDay[] {
  const dagen = Array.from(new Set([...lines.map((l) => l.day), ...balances.map((b) => b.day)])).sort();
  const echt = new Map(balances.map((b) => [b.day, b]));
  const uit: LedgerDay[] = [];
  let vorigeEind = 0; // in centen
  for (const day of dagen) {
    const dl = lines.filter((l) => l.day === day);
    // Alleen goedgekeurde regels tellen; een wachtende correctie staat er
    // wel, maar verandert het saldo nog niet.
    const telt = dl.filter((l) => (l.status ?? "approved") === "approved");
    const som = (k: LineKind) => telt.filter((l) => l.kind === k).reduce((s, l) => s + c(l.amount), 0);
    const deposits = som("deposit");
    const topups = som("customer_topup");
    const fees = som("fee");
    const dst = som("dst");
    // adjustment is naar boven, adjustment_out naar beneden.
    const adjustments = som("adjustment") - som("adjustment_out");
    const start = vorigeEind;
    const expected = start + deposits - topups - fees - dst + adjustments;
    const b = echt.get(day);
    const actual = b ? c(b.actualEnd) : null;
    const diff = actual === null ? null : actual - expected;
    uit.push({
      day,
      start: e(start),
      deposits: e(deposits),
      topups: e(topups),
      fees: e(fees),
      dst: e(dst),
      adjustments: e(adjustments),
      expectedEnd: e(expected),
      actualEnd: actual === null ? null : e(actual),
      difference: diff === null ? null : e(diff),
      status: diff === null ? "open" : Math.abs(diff) <= TOLERANCE_CENTS ? "ok" : "off",
      lines: dl,
      note: b?.note ?? null,
    });
    // De volgende dag begint bij wat er ECHT stond, als we dat weten.
    vorigeEind = actual ?? expected;
  }
  return uit;
}

/** Het wisselgat van een storting in euro's: wat zij bijschreven tegen
 *  wat het tegen onze koers had moeten zijn. Positief = in ons voordeel. */
export function depositGap(l: LedgerLine, eurToUsd: number | null): { theirRate: number; gapUsd: number | null } | null {
  if (l.kind !== "deposit" || l.sentCurrency !== "EUR" || !l.sentAmount || !(l.sentAmount > 0)) return null;
  const theirRate = Math.round((l.amount / l.sentAmount) * 10000) / 10000;
  const gapUsd = eurToUsd && eurToUsd > 0 ? e(c(l.amount) - c(l.sentAmount * eurToUsd)) : null;
  return { theirRate, gapUsd };
}

/** Het meest recente saldo voor "What we hold": het laatste echte eind,
 *  of anders het laatste verwachte. Null als er nog niets is. */
export function latestBalance(days: LedgerDay[]): { day: string; amount: number; actual: boolean } | null {
  if (!days.length) return null;
  const laatste = days[days.length - 1];
  return laatste.actualEnd !== null
    ? { day: laatste.day, amount: laatste.actualEnd, actual: true }
    : { day: laatste.day, amount: laatste.expectedEnd, actual: false };
}
