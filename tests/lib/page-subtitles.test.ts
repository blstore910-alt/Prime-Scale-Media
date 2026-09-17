import { strict as assert } from "node:assert";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";

/**
 * Every admin page header clamps its subtitle to ONE line on a phone and
 * ellipsizes — so a long one does not lose its second line, it loses the end
 * of its first. "Create accounts, assign advertisers and set fees." rendered
 * as "Create accounts, assign..." at 400px, which reads as a bug rather than
 * as brevity.
 *
 * The rule lives in components/advertiser/psm-shell-css.ts and states a
 * budget of about 30 characters. This is that budget, enforced: eleven
 * subtitles have been shortened one at a time across two sessions, which is
 * the sign that a rule in a comment is not a rule.
 *
 * The limit is deliberately 34 rather than 30 — the clamp measures pixels,
 * not characters, and a few narrow characters fit. A subtitle that needs
 * more than 34 is one that has not been written yet.
 *
 * ONLY the .psmapp shell clamps. The advertiser and affiliate shells let
 * their subtitle wrap (adv-shell-css.ts declares `.phead p` with no
 * line-clamp), so a long one there costs a line and reads fine — it is not
 * cut. Those files are skipped rather than held to a rule that does not
 * apply to them.
 */
const LIMIT = 34;
const SKIP = ["components/advertiser/", "components/affiliate/"];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (entry.name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

test("page subtitles fit the one-line clamp", () => {
  const offenders: string[] = [];

  for (const file of walk("components")) {
    const posix = file.split(path.sep).join("/");
    if (SKIP.some((prefix) => posix.startsWith(prefix))) continue;
    const src = fs.readFileSync(file, "utf8");
    // The header block is `<div className="phead">…<p>subtitle</p>`. Only
    // look at a <p> whose whole content is plain text on one or two lines,
    // which is how every one of them is written.
    for (const m of src.matchAll(
      /className="phead[^"]*"[\s\S]{0,400}?<p>([\s\S]{0,200}?)<\/p>/g,
    )) {
      const text = m[1].replace(/\s+/g, " ").trim();
      if (!text || text.includes("{")) continue; // expressions are judged by hand
      if (text.length > LIMIT) {
        offenders.push(
          `${file.split(path.sep).join("/")}: ${text.length} chars — "${text}"`,
        );
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `These subtitles exceed the ${LIMIT}-character budget and will be cut ` +
      `mid-word on a phone:\n  ${offenders.join("\n  ")}`,
  );
});
