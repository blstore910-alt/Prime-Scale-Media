// ── EEN AD-ACCOUNTNAAM ZIET DE KLANT ────────────────────────────────
//
// De naam van een ad account staat op het scherm van de klant, in zijn
// meldingen ("Your ad account AA-PSM0019-HK-01 is ready") en op facturen.
// Een admin typt hem met de hand. Lekcontrole 01-10: alle namen waren
// schoon (AA-PSM00xx-EU-01), maar de gewoonte "-HK-01" voor een
// Hongkong-account zou het interne type aan de klant tonen.
//
// Puur: geeft een foutmelding, of null als de naam mag.

const VERBODEN: { re: RegExp; wat: string }[] = [
  { re: /(^|[^a-z])hk([^a-z]|$)/i, wat: "HK" },
  { re: /(^|[^a-z])gh([^a-z]|$)/i, wat: "GH" },
  { re: /rock\s*ads/i, wat: "RockAds" },
  { re: /seam\s*x/i, wat: "SeamX" },
  { re: /falkyn/i, wat: "Falkyn" },
  { re: /bestads/i, wat: "Bestads" },
  { re: /muxue/i, wat: "Muxue" },
  { re: /gradyn/i, wat: "Gradyn" },
  { re: /slash/i, wat: "Slash" },
  { re: /premium|business[- ]?green/i, wat: "an internal account type" },
];

export function accountNameProblem(name: string | null | undefined): string | null {
  const n = String(name ?? "");
  for (const v of VERBODEN) {
    if (v.re.test(n)) {
      return `The customer sees this name. Leave out "${v.wat}" — use e.g. AA-PSM0019-01 or AA-PSM0019-EU-01.`;
    }
  }
  return null;
}
