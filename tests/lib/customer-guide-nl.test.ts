import { strict as assert } from "node:assert";
import { test } from "node:test";
import fs from "node:fs";
import { GUIDE_NL } from "../../components/guide/customer-guide-nl";

/**
 * HET NEDERLANDSE HANDBOEK LOOPT GELIJK MET HET ENGELSE.
 *
 * customer-guide.tsx toont een hoofdstuk alleen in het Nederlands als het
 * evenveel stappen en notities heeft als het Engels; anders valt het
 * terug op Engels. Dat is veilig, maar stil: een stap die in het Engels
 * bijkomt, maakt het hele hoofdstuk weer Engels voor een Nederlandse
 * klant. Deze test maakt dat luid.
 *
 * Hij leest de BRON van manual-content.ts, net als
 * customer-guide-no-leak.test.ts: dat bestand importeert lucide-iconen,
 * en die lopen niet onder node:test.
 */
const SRC = fs.readFileSync("components/admin/manual-content.ts", "utf8");

function secties(naam: string) {
  const start = SRC.indexOf(`const ${naam}: Section[] = [`);
  const eind = SRC.indexOf("\n];", start);
  const tekst = SRC.slice(start, eind).replace(/^\s*\/\/.*$/gm, "");
  return tekst
    .split(/\n  \{\n/)
    .slice(1)
    .map((blok) => {
      const id = /id: "([^"]+)"/.exec(blok)?.[1] ?? "?";
      const steps = /steps: \[([\s\S]*?)\n    \],/.exec(blok)?.[1] ?? "";
      return {
        id,
        stappen: (steps.match(/^\s{6}"/gm) ?? []).length,
        notities: (blok.match(/\blabel: "/g) ?? []).length,
      };
    });
}

const ALLE = [...secties("ADVERTISER"), ...secties("AFFILIATE")];

test("de knip vindt de klanthoofdstukken", () => {
  assert.ok(ALLE.length >= 10, `maar ${ALLE.length} hoofdstukken gevonden`);
  assert.ok(ALLE.every((s) => s.stappen > 0), JSON.stringify(ALLE));
});

for (const s of ALLE) {
  test(`hoofdstuk ${s.id} staat compleet in het Nederlands`, () => {
    const nl = GUIDE_NL[s.id];
    assert.ok(nl, `geen Nederlandse versie van ${s.id} in customer-guide-nl.ts`);
    assert.equal(nl.steps.length, s.stappen, `${s.id}: aantal stappen`);
    assert.equal(nl.notes?.length ?? 0, s.notities, `${s.id}: aantal notities`);
  });
}

test("de Nederlandse gids noemt geen leverancier en vertaalt geen vakterm", () => {
  const tekst = JSON.stringify(GUIDE_NL);
  for (const re of [
    /rockads|seamx|falkyn|gradyn|supplier|leverancier|marge/i,
    /abonnement|portemonnee|opwaardeer|advertentieaccount|doorverwijz|\bkosten\b/i,
  ]) {
    assert.doesNotMatch(tekst, re);
  }
});
