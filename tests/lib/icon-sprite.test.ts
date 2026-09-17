import { strict as assert } from "node:assert";
import { test } from "node:test";
import fs from "node:fs";

/**
 * Both single-page apps draw their icons from an SVG sprite by id. A name
 * that is not in the sprite renders as NOTHING — no icon, no error, no
 * console warning — so a button quietly becomes a bare word and nobody
 * notices until a screenshot is looked at closely.
 *
 * `i-refresh` was referenced before it existed; this test is why it was
 * caught in the same minute rather than on a phone weeks later.
 */
const PAIRS: Array<[app: string, sprite: string]> = [
  ["components/advertiser/adv-app.tsx", "components/advertiser/adv-icons.tsx"],
  ["components/affiliate/aff-app.tsx", "components/affiliate/aff-icons.tsx"],
];

for (const [app, sprite] of PAIRS) {
  test(`${app}: every icon it names exists in its sprite`, () => {
    const spriteSrc = fs.readFileSync(sprite, "utf8");
    const appSrc = fs.readFileSync(app, "utf8");

    const have = new Set(
      [...spriteSrc.matchAll(/id="(i-[a-z-]+)"/g)].map((m) => m[1]),
    );
    const used = new Set(
      [...appSrc.matchAll(/name="(i-[a-z-]+)"/g)].map((m) => m[1]),
    );

    const missing = [...used].filter((n) => !have.has(n)).sort();
    assert.deepEqual(
      missing,
      [],
      `${app} draws ${missing.join(", ")} but ${sprite} does not define ${
        missing.length === 1 ? "it" : "them"
      } — those render as nothing at all.`,
    );
  });
}
