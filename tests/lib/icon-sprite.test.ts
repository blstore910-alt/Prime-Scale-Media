import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/**
 * Both single-page apps draw their icons from an SVG sprite by id. A name
 * that is not in the sprite renders as NOTHING — no icon, no error, no
 * console warning — so a button quietly becomes a bare word and nobody
 * notices until a screenshot is looked at closely.
 *
 * `i-refresh` was referenced before it existed; this test is why it was
 * caught in the same minute rather than on a phone weeks later.
 *
 * AND THEN `i-chart` GOT THROUGH IT ANYWAY. The sidebar's Financial
 * report row printed its label with a blank where every other row has a
 * glyph, on production, for as long as that row has existed — because
 * this test only looked at `name="i-x"` on <Ic>, and the nav tables
 * declare their icons as `icon: "i-x"` in a plain object. A check that
 * covers one of the two ways the codebase names an icon is a check that
 * passes while the bug ships. Both spellings now.
 */
const SHELLS: [string, string][] = [
  ["components/advertiser/adv-app.tsx", "components/advertiser/adv-icons.tsx"],
  ["components/affiliate/aff-app.tsx", "components/affiliate/aff-icons.tsx"],
];

for (const [appFile, spriteFile] of SHELLS) {
  test(`${appFile} asks for no icon its sprite lacks`, () => {
    const app = readFileSync(appFile, "utf8");
    const sprite = readFileSync(spriteFile, "utf8");

    const have = new Set(
      [...sprite.matchAll(/id="(i-[a-z0-9-]+)"/g)].map((m) => m[1]),
    );
    // name="i-x" on <Ic>, and icon: "i-x" in the nav tables.
    const asked = new Set(
      [...app.matchAll(/(?:name=|icon:\s*)"(i-[a-z0-9-]+)"/g)].map((m) => m[1]),
    );

    const missing = [...asked].filter((i) => !have.has(i)).sort();
    assert.deepEqual(
      missing,
      [],
      `${appFile} renders ${missing.join(", ")}, which ${spriteFile} does not define — those render as a blank space.`,
    );
  });
}
