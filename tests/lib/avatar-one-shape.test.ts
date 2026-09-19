import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/**
 * The same person must look the same in every place they appear.
 *
 * WHY THIS EXISTS. Each shell draws its user three times — the sidebar
 * foot, the topbar button, and the account menu — and the three had
 * drifted to three different treatments: a 36px circle, a 30px rounded
 * SQUARE (set inside a mobile media query), and a 34px circle. On one
 * screen that reads as two different people, which is exactly what the
 * owner kept reporting and what no amount of changing the drawing could
 * fix, because the drawing was never the problem.
 *
 * The rule is: one size, one radius, in every `.avatar` box in every
 * shell. This asserts it on the stylesheets, because the suite has no
 * DOM and therefore cannot see the symptom.
 */
const SHELLS = [
  "components/advertiser/adv-shell-css.ts",
  "components/advertiser/psm-shell-css.ts",
  "components/affiliate/aff-shell-css.ts",
];

for (const file of SHELLS) {
  test(`${file}: every .avatar box is one size and one shape`, () => {
    const css = readFileSync(file, "utf8");

    // Every rule whose selector ends in `.avatar` and which sets a width.
    const rules = [...css.matchAll(/\.avatar\{([^}]*)\}/g)].map((m) => m[1]);
    const sized = rules.filter((body) => /width:\s*\d+px/.test(body));
    assert.ok(sized.length > 0, "no sized .avatar rules found — did the class change?");

    const widths = new Set(
      sized.map((body) => /width:\s*(\d+)px/.exec(body)?.[1] ?? "?"),
    );
    assert.deepEqual(
      [...widths],
      ["34"],
      `.avatar is sized ${[...widths].join(", ")}px in ${file} — it must be one size everywhere.`,
    );

    const radii = new Set(
      sized.map((body) => /border-radius:\s*([^;}]+)/.exec(body)?.[1]?.trim() ?? "(none)"),
    );
    assert.deepEqual(
      [...radii],
      ["50%"],
      `.avatar uses border-radius ${[...radii].join(", ")} in ${file} — a square one beside two round ones reads as a different person.`,
    );
  });
}
