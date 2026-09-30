// ── HOEVEEL MAG ER TERUG VAN EEN AD-ACCOUNT ─────────────────────────
//
// De eigenaar, 30-09: "stel het is een API ad account, dan dus alleen
// wat er live op dat ad acc staat als max refundable."
//
// Er zijn twee getallen en ze beantwoorden een andere vraag:
//
//   GESTORT    wat wij erop gezet hebben, min wat al is teruggevraagd.
//              Altijd te berekenen, uit onze eigen boeken.
//   LIVE       wat er op dit moment op staat bij de leverancier.
//              Alleen als het account daaraan gekoppeld is EN de lees
//              lukt.
//
// ── WAAROM DE LAAGSTE WINT ────────────────────────────────────────
//
// Niet uit voorzichtigheid, maar omdat de twee richtingen twee
// verschillende fouten zijn en ze allebei geld kosten:
//
//   live LAGER dan gestort  -> er is al besteed. Meer toezeggen dan er
//                              staat kan de leverancier niet uitvoeren;
//                              de klant krijgt een belofte die bij de
//                              admin afketst.
//   live HOGER dan gestort  -> er staat geld op dat wij er niet op
//                              gezet hebben. Dat naar de wallet boeken
//                              crediteert een bedrag waar in onze
//                              boeken niets tegenover staat.
//
// ── EN EEN ONBEKENDE VERLAAGT NIETS ───────────────────────────────
//
// `live` is null wanneer het account niet gekoppeld is, de sleutels
// ontbreken, de leverancier niet antwoordt, of het antwoord in een
// ANDERE valuta terugkomt dan het account. In al die gevallen geldt
// het gestorte plafond en kijkt de admin het met de hand na -- precies
// zoals het vandaag gaat.
//
// Een mislukte lees als 0 behandelen zou de knop dichtzetten voor
// iedereen zodra de leverancier even hapert, en dat is de duurste
// manier om voorzichtig te zijn.

export type Plafond = {
  /** Wat er in het veld mag. Null = nog niet te zeggen. */
  max: number | null;
  /** Welke van de twee het bepaalt -- de uitleg op het scherm moet
   *  hiermee meebewegen, anders klopt de zin niet met het getal. */
  bron: "gestort" | "live" | "onbekend";
};

function getal(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Het plafond voor een terugboeking, en waar het vandaan komt.
 *
 * @param gestort  gestort min teruggevraagd, uit onze eigen boeken
 * @param live     het echte saldo bij de leverancier, of null
 */
export function withdrawCeiling(
  // `string` mag erbij, en dat is geen slordigheid: numeric komt uit
  // PostgREST als string terug, en een helper die dat niet aanneemt
  // verplaatst de conversie naar de beller -- waar hij vergeten wordt.
  gestort: number | string | null | undefined,
  live: number | string | null | undefined,
): Plafond {
  const g = getal(gestort);
  const l = getal(live);

  if (g === null) {
    // Zonder ons eigen cijfer zeggen we niets. Ook niet als de
    // leverancier wel antwoordde: dat getal alleen kan hoger zijn dan
    // wat wij ooit gestort hebben.
    return { max: null, bron: "onbekend" };
  }

  const gestortSchoon = Math.max(0, g);
  if (l === null) return { max: gestortSchoon, bron: "gestort" };

  const liveSchoon = Math.max(0, l);
  return liveSchoon < gestortSchoon
    ? { max: liveSchoon, bron: "live" }
    : { max: gestortSchoon, bron: "gestort" };
}
