import { strict as assert } from "node:assert";
import { test } from "node:test";
import fs from "node:fs";

/**
 * HET HANDBOEK DAT EEN KLANT LEEST NOEMT GEEN LEVERANCIER.
 *
 * Sinds 30-09 staan de adverteerder- en affiliatehandboeken uit
 * components/admin/manual-content.ts niet alleen bij de beheerkant maar
 * ook in de app van de klant zelf (components/guide/customer-guide.tsx).
 *
 * Dat verandert wat die tekst IS. Tot die dag was het een naslag voor
 * een admin, en een admin mag weten dat een account bij RockAds staat
 * en wat wij ervoor betalen. Nu is het klanttekst, en de regel van de
 * eigenaar is absoluut: de naam van de leverancier, het accounttype en
 * onze marge komen niet in de UI, niet in een e-mail, niet op een
 * factuur en niet in de JSON achter de pagina.
 *
 * Het risico is niet vandaag -- een grep op 30-09 gaf nul treffers. Het
 * risico is de volgende keer dat iemand dit bestand bewerkt en niet weet
 * dat twee van de vier handboeken bij een klant op het scherm staan. Het
 * bestand is gedeeld met de beheer- en de super-admin-handboeken, en
 * DAAR horen die woorden wel. Deze test kijkt dus alleen naar de twee
 * klantarrays.
 *
 * Hij leest de BRON en niet een geïmporteerde module: manual-content.ts
 * importeert lucide-iconen, en die lopen niet onder node:test. De
 * arrays worden uit de tekst geknipt op hun eigen `const NAAM`-regel.
 */

// Sinds de lekcontrole van 01-10 staan de klanthandboeken in een eigen bestand.
const SRC = fs.readFileSync("components/admin/manual-customer.ts", "utf8");
// Het eigenaarshandboek bleef bij de beheerkant.
const SRC_BEHEER = fs.readFileSync("components/admin/manual-content.ts", "utf8");

/** De tekst van `const NAAM: Section[] = [ ... ];` */
function array(naam: string): string {
  const klant = SRC.indexOf(`export const ${naam}: Section[] = [`);
  const bron = klant >= 0 ? SRC : SRC_BEHEER;
  const start = klant >= 0 ? klant : SRC_BEHEER.indexOf(`const ${naam}: Section[] = [`);
  assert.ok(start >= 0, `${naam} niet gevonden`);
  const eind = bron.indexOf("\n];", start);
  assert.ok(eind > start, `einde van ${naam} niet gevonden`);
  return bron.slice(start, eind);
}

/** Commentaar weg: een uitleg MAG de leverancier noemen, klanttekst niet. */
function zonderCommentaar(s: string): string {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

const VERBODEN: [RegExp, string][] = [
  [/rockads/i, "de naam van een leverancier"],
  [/seamx|falkyn|gradyn|supplier1/i, "de naam van een leverancier"],
  [/\bsupplier\b/i, "het woord supplier -- een klant heeft geen leverancier"],
  [/\bmargin\b|\bmarge\b/i, "onze marge"],
  [/meta-eu|eu-meta|hk-meta|psm-ra/i, "een ad-accounttype"],
  [/\bwe pay\b|\bour cost\b/i, "wat wij betalen"],
];

for (const naam of ["ADVERTISER", "AFFILIATE"]) {
  test(`het ${naam.toLowerCase()}-handboek noemt geen leverancier, type of marge`, () => {
    const tekst = zonderCommentaar(array(naam));
    const fout: string[] = [];
    for (const [re, wat] of VERBODEN) {
      const m = tekst.match(re);
      if (m) fout.push(`"${m[0]}" -- ${wat}`);
    }
    assert.deepEqual(
      fout,
      [],
      `Dit handboek staat op het scherm van een KLANT ` +
        `(components/guide/customer-guide.tsx):\n  ` +
        fout.join("\n  "),
    );
  });
}

// De zelftest: zonder deze zou een kapotte knip-functie een LEGE array
// teruggeven, en een lege array bevat nooit iets verbodens. Een test die
// groen is omdat hij niets las, is erger dan geen test.
test("de knip vindt echt tekst in beide klanthandboeken", () => {
  for (const naam of ["ADVERTISER", "AFFILIATE"]) {
    const tekst = array(naam);
    assert.ok(tekst.length > 500, `${naam} is verdacht kort: ${tekst.length}`);
    assert.match(tekst, /title: "/, `${naam} bevat geen enkel hoofdstuk`);
  }
});

// En de tegenproef: in het SUPER-ADMIN-handboek horen die woorden wel.
// Als deze faalt, knipt array() het verkeerde stuk.
test("het super-admin-handboek mag de leverancier wel noemen", () => {
  const tekst = zonderCommentaar(array("OWNER"));
  assert.ok(tekst.length > 500, "OWNER is verdacht kort");
});
