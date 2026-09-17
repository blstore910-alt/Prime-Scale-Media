import { strict as assert } from "node:assert";
import { test } from "node:test";
import fs from "node:fs";

/**
 * The shell CSS lives inside JavaScript template literals, so a backtick
 * anywhere inside one ENDS THE STRING and the file stops parsing. It reads
 * as a perfectly ordinary CSS comment — a `dense` here, a `bg-muted` there —
 * which is why it has now broken the build four separate times, twice after
 * being pushed.
 *
 * tsc catches it, but only if someone runs tsc before pushing.
 *
 * THE RULE: after the literal's OPENING backtick there must be exactly ONE
 * backtick left in the file — its closing delimiter.
 *
 * Counting that way is deliberate. The obvious check — "no backtick between
 * the opening one and the next one" — is the bug's own logic: a stray
 * backtick simply becomes the closing delimiter and the check passes. This
 * test was written that way first, and a seeded stray backtick sailed
 * straight through it.
 *
 * Backticks BEFORE the opening delimiter are fine; they sit in the file's
 * own leading comments, outside the string.
 */
const FILES = [
  "components/advertiser/psm-shell-css.ts",
  "components/advertiser/adv-shell-css.ts",
  "components/affiliate/aff-shell-css.ts",
  "components/advertiser/refine-css.ts",
];

for (const file of FILES) {
  test(`${file}: the CSS template literal closes exactly once`, () => {
    const src = fs.readFileSync(file, "utf8");

    const open = src.search(/(?:[=(]|return)\s*`/);
    assert.notEqual(open, -1, `${file}: no template literal found`);
    const start = src.indexOf("`", open);

    const rest = src.slice(start + 1);
    const count = (rest.match(/`/g) ?? []).length;

    if (count !== 1) {
      const first = rest.indexOf("`");
      const near = rest.slice(Math.max(0, first - 80), first + 80);
      assert.fail(
        `${file}: expected exactly 1 backtick after the opening delimiter ` +
          `(its closing one) but found ${count}. A backtick inside the CSS ` +
          `ends the template literal and the file stops parsing.\nNear: ` +
          JSON.stringify(near),
      );
    }
  });
}
