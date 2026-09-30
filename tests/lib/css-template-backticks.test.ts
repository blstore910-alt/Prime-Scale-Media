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

/**
 * THE SAME MISTAKE, IN A FILE THE RULE ABOVE CANNOT WATCH.
 *
 * 29-09: lib/shell-dark-css.ts got a CSS comment containing
 * ```.btn.ghost``` — prose with the selector quoted, exactly as the
 * comments elsewhere in this codebase are written. Inside a template
 * literal that ends the string, and the file stopped parsing.
 *
 * That file cannot be added to FILES above: it builds its CSS from
 * nested template literals on purpose, so "exactly one backtick after
 * the opening" is legitimately false there.
 *
 * But the MISTAKE is narrower than the rule, and the narrower version
 * works everywhere: a backtick inside a CSS comment is never anything
 * but this bug. Nobody needs a code quote in a stylesheet comment —
 * write the selector bare, the way the fix did.
 */
const COMMENT_FILES = [
  ...FILES,
  "lib/shell-dark-css.ts",
  "components/admin/dashboard.tsx",
  "components/admin/supplier-credit.tsx",
  "components/topups/supplier-pill.tsx",
];

for (const file of COMMENT_FILES) {
  test(`${file}: no backtick inside a CSS comment`, () => {
    const src = fs.readFileSync(file, "utf8");
    // Only the CSS ITSELF -- from where the literal opens to where it
    // closes, and not a character further.
    //
    // This rule has now been too broad twice, and both times the
    // false positive was the useful kind:
    //
    //   1. it flagged a JSDoc block ABOVE the function, which is
    //      ordinary JavaScript where quoting a selector is idiomatic;
    //   2. it flagged a JSDoc block BELOW the closing delimiter, in a
    //      .tsx file where the stylesheet is a const near the top and
    //      several hundred lines of React follow it.
    //
    // Both are harmless -- tsc compiles them -- and a test that fails
    // on harmless code teaches people to ignore it. Every one of
    // these files closes its literal with a line that is exactly
    // "`;", which is what bounds the scan.
    const open = src.search(/(?:[=(]|return)\s*`/);
    const rest = open === -1 ? "" : src.slice(open + 1);
    const close = rest.search(/^`;\s*$/m);
    const body = close === -1 ? rest : rest.slice(0, close);
    const offenders: string[] = [];
    for (const m of body.matchAll(/\/\*[\s\S]*?\*\//g)) {
      if (!m[0].includes("`")) continue;
      // Only comments that sit inside a template literal can do harm,
      // but telling those apart needs a parser. Every comment in these
      // files is either CSS or describes it, so the flat rule is the
      // honest one — and a backtick in any of them is still wrong.
      offenders.push(m[0].replace(/\s+/g, " ").slice(0, 120));
    }
    assert.deepEqual(
      offenders,
      [],
      `${file}: a backtick inside a comment ends the CSS template ` +
        `literal and the file stops parsing. Write the selector or the ` +
        `property without quotes:\n  ` + offenders.join("\n  "),
    );
  });
}
