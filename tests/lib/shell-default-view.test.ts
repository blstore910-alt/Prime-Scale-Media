import { strict as assert } from "node:assert";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";

/**
 * Both customer shells must open on the tab their own navigation calls
 * home.
 *
 * The affiliate portal opened on My Referrals for weeks. Nobody decided
 * that — it came over with the mockup port, which happened to be drawn on
 * that screen. The nav disagreed with it in two places at once: the
 * sidebar lists Dashboard first, and the bottom bar puts Home in the
 * CENTRE, the primary slot on a phone. So a new affiliate signed up,
 * landed somewhere that is not marked home, and the highlighted item did
 * not match the middle button. The owner spotted it within a minute of
 * the first real affiliate signing in.
 *
 * This reads the source rather than rendering, which is enough: the fault
 * was a literal in a useState, and a literal is what this pins.
 */
const SHELLS = [
  "components/advertiser/adv-app.tsx",
  "components/affiliate/aff-app.tsx",
];

for (const rel of SHELLS) {
  test(`${rel} opens on the home tab`, () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), rel),
      "utf8",
    );
    const m = src.match(/useState<View>\((["'])([a-z]+)\1\)/);
    assert.ok(m, `no useState<View>(...) found in ${rel}`);
    assert.equal(
      m![2],
      "dash",
      `${rel} opens on "${m![2]}" — the nav calls "dash" home`,
    );
  });

  test(`${rel} still has a home item in its navigation`, () => {
    const src = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
    // If the shell ever renames the view, the assertion above would pass
    // against a tab that no longer exists.
    assert.match(
      src,
      /\{\s*v:\s*"dash"/,
      `${rel} has no nav entry for "dash"`,
    );
  });
}
