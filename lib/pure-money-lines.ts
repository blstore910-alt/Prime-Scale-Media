// ── WELKE BEDRAGEN HOREN OP EEN METRIC-KAART ────────────────────────
//
// De eigenaar, 30-09: "als er geen currencys of iets extra is laat
// gewoon leeg, haal al die teksten weg."
//
// De kaarten toonden ALTIJD twee regels -- "$0.00" boven "€75.00" --
// ook als er die periode geen enkele dollar was omgegaan. Dat leest
// als "we hebben ook in dollars gemeten en het was nul", terwijl het
// betekent "er is geen dollarkant aan deze maand". Op een kaart van
// zes naast elkaar is dat zes nullen die niets zeggen.
//
// ── WAAROM OP DE TELLING EN NIET OP HET BEDRAG ────────────────────
//
// Een valuta hoort erbij zodra er IETS in gebeurd is, ook als de som
// toevallig op nul uitkomt -- een opwaardering en een terugboeking van
// hetzelfde bedrag is een echte nul en die mag je niet wegpoetsen. De
// telling zegt "er is hier iets gebeurd", het bedrag zegt "en dit was
// het". Dus de telling beslist of de regel er staat.
//
// ── EN ALS ER HELEMAAL NIETS WAS ──────────────────────────────────
//
// Dan EEN regel, in euro, met nul erop. Niet twee, en niet geen. Een
// kaart zonder cijfer ziet eruit als een kaart die niet geladen is, en
// dat is precies de verwarring die deze app overal probeert te
// vermijden: leeg en nul zijn niet hetzelfde, en hier is nul het
// antwoord.

export type MoneySide = { amount: number; count: number };

export type MoneyLine = { currency: "USD" | "EUR"; amount: number };

/**
 * De bedragregels voor een metric-kaart, in leesvolgorde.
 *
 * Nooit een lege lijst: er komt er altijd minstens een uit, zodat een
 * kaart altijd een cijfer heeft.
 */
export function moneyLines(
  usd: MoneySide | null | undefined,
  eur: MoneySide | null | undefined,
): MoneyLine[] {
  const n = (v: unknown) => {
    const x = Number(v);
    return Number.isFinite(x) ? x : 0;
  };

  const lines: MoneyLine[] = [];
  if (n(usd?.count) > 0) lines.push({ currency: "USD", amount: n(usd?.amount) });
  if (n(eur?.count) > 0) lines.push({ currency: "EUR", amount: n(eur?.amount) });

  // Niets gebeurd: een enkele nul in de huisvaluta.
  if (lines.length === 0) return [{ currency: "EUR", amount: 0 }];
  return lines;
}
