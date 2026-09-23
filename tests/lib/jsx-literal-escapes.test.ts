import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * A `—` inside JSX TEXT is four characters, not an em dash.
 *
 * In a string or a template literal, `"—"` is an escape and the
 * compiler turns it into the character. Between JSX tags it is not: the
 * text is taken as written, so the screen shows a backslash, a u and
 * four digits.
 *
 * This shipped three times in one afternoon, from writing patches that
 * emit `—` into markup, and the reviews did not catch it because
 * the source LOOKS like every other escape in the file. Two of the three
 * were on customer screens:
 *
 *   adv-app        the Reference cell of a wallet correction
 *   aff-app        "You've reached the top tier — Legend. 🎉"
 *   psm-withdrawals the Why cell of a refund with no reason
 *
 * tsc cannot see it — it is valid JSX — and neither can the linter. So
 * it is a test, like the CSS-backtick and icon-sprite guards beside it.
 *
 * The fix is always the same shape: `{"—"}` instead of `—`, or
 * simply the character itself.
 */

const ROOTS = ["components", "app"];
const ESCAPE = /\\u[0-9a-fA-F]{4}/g;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      walk(p, out);
    } else if (p.endsWith(".tsx")) {
      out.push(p);
    }
  }
  return out;
}

/**
 * Lines where an escape sits in JSX text rather than in a string.
 *
 * Deliberately crude, and it errs towards silence: a line is skipped
 * when it is a comment, and an escape is skipped when the text before it
 * has an odd number of quotes or backticks — which means we are inside
 * one, where the escape is processed correctly. A multi-line comment
 * whose continuation carries an escape is also skipped, because the
 * marker is on the line above.
 */
function offenders(file: string): { line: number; text: string }[] {
  const found: { line: number; text: string }[] = [];
  const lines = readFileSync(file, "utf8").split("\n");
  let inBlockComment = false;
  // A template literal runs ACROSS lines, and inside one the escape is
  // processed — so counting backticks per line flags a perfectly good
  // multi-line template as an offender. Carried between lines.
  let inTemplate = false;

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    const openedInTemplate = inTemplate;
    const ticks = (line.match(/(?<!\\)`/g) ?? []).length;
    if (ticks % 2 === 1) inTemplate = !inTemplate;

    // Track /* … */ so its continuation lines are not flagged.
    const opens = (line.match(/\/\*/g) ?? []).length;
    const closes = (line.match(/\*\//g) ?? []).length;
    const startedInComment = inBlockComment;
    if (opens > closes) inBlockComment = true;
    else if (closes > opens) inBlockComment = false;

    if (startedInComment) return;
    if (
      trimmed.startsWith("//") ||
      trimmed.startsWith("*") ||
      trimmed.startsWith("/*") ||
      trimmed.startsWith("{/*")
    ) {
      return;
    }

    for (const m of line.matchAll(ESCAPE)) {
      const before = line.slice(0, m.index);
      const odd = (s: string, c: string) =>
        (s.split(c).length - 1) % 2 === 1;
      // Inside a string or a template literal: processed, so fine. The
      // template may have opened lines above, hence openedInTemplate.
      const templateHere = openedInTemplate !== odd(before, "`");
      if (templateHere || odd(before, "'") || odd(before, '"')) continue;
      if (before.includes("//")) continue;
      found.push({ line: i + 1, text: trimmed.slice(0, 100) });
      return;
    }
  });
  return found;
}

describe("a unicode escape in JSX text renders as four characters", () => {
  const files = ROOTS.flatMap((r) => {
    try {
      return walk(r);
    } catch {
      return [];
    }
  });

  test("there are .tsx files to check at all", () => {
    assert.ok(files.length > 50, `only found ${files.length} .tsx files`);
  });

  test("no escape sits in markup instead of in a string", () => {
    const hits = files.flatMap((f) =>
      offenders(f).map((o) => `${f}:${o.line}  ${o.text}`),
    );
    assert.deepEqual(
      hits,
      [],
      `These render as a literal backslash-u on screen. Write {"\\u2014"} or the character itself:\n${hits.join("\n")}`,
    );
  });
});
