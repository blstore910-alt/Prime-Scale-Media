import { strict as assert } from "node:assert";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * THE TWO PLAK RULES THAT COST US SOMETHING TODAY.
 *
 * A plak is hand-pasted into the SQL editor by the owner. Nothing runs
 * it in CI, nobody reviews it, and it goes straight onto production —
 * so the only place these rules can be held is here, over the file,
 * before it is sent.
 *
 * ── RULE 1: ONE `execute` PER do-BLOCK ────────────────────────────
 *
 * 2026-09-28. Plak 124 carried a first attempt at a text surgery that
 * referenced an undeclared variable, and the corrected version right
 * below it. The FIRST one ran. The second no longer matched its own
 * pattern, so the broken text stayed — and every advertiser pressing
 * "Join the affiliate program" got an error for twenty minutes, on
 * production, until plak 127.
 *
 * A do-block that rewrites a function runs its `execute` and is done.
 * A second one in the same block is either dead or a second rewrite of
 * something already rewritten, and both are mistakes.
 *
 * ── RULE 2: A NEW TABLE REVOKES FROM `authenticated` TOO ──────────
 *
 * CLAUDE.md says to end a `create table` with
 * `revoke all ... from anon, public`. Followed to the letter on
 * `wallet_ledger`, `polls` and `poll_votes` — and all three came out
 * with insert, update and delete for `authenticated`, because that
 * role takes its rights from Supabase's DEFAULT PRIVILEGES and not
 * from PUBLIC, and the `grant select` afterwards ADDS rather than
 * replaces. RLS refused the writes, so nothing was exploitable; on an
 * append-only ledger that is one forgotten policy away from being so.
 */

const DIR = "supabase/checks";

function sqlFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sqlFiles(full, out);
    else if (entry.endsWith(".sql")) out.push(full);
  }
  return out;
}

/** Strip -- comments so a quoted example never counts as a statement. */
function live(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("--"));
}

test("a plak runs at most one execute per do-block", () => {
  const offenders: string[] = [];

  for (const file of sqlFiles(DIR)) {
    const rel = file.split("\\").join("/");
    const text = readFileSync(file, "utf8");
    // Blocks are `do $blkN$ ... $blkN$;` — named tags, per CLAUDE.md.
    const blocks = text.split(/\bdo\s+\$blk\d+\$/i).slice(1);
    blocks.forEach((block, i) => {
      const body = block.split(/\$blk\d+\$\s*;/)[0] ?? block;
      const n = live(body).filter((l) =>
        /^execute\b/i.test(l) || /\bexecute\s+(v_new|regexp_replace)\b/i.test(l),
      ).length;
      // Two or more is the plak-124 shape. A loop that revokes per
      // function is different and is caught by the word `execute '`
      // with a literal string, which is not a rewrite — so only
      // regexp_replace/v_new rewrites are counted here.
      const rewrites = live(body).filter((l) =>
        /\bexecute\s+(v_new\b|regexp_replace\s*\()/i.test(l),
      ).length;
      if (rewrites > 1) {
        offenders.push(`${rel}  block ${i}: ${rewrites} rewrites (n=${n})`);
      }
    });
  }

  assert.deepEqual(
    offenders,
    [],
    `A do-block that rewrites a live function runs its execute and is done.\n` +
      `A second one runs against text the first already changed, so its pattern\n` +
      `no longer matches and it silently does nothing — plak 124 broke the Join\n` +
      `button on production that way.\n\n` +
      offenders.join("\n"),
  );
});

test("a plak that creates a table in public revokes from authenticated", () => {
  const offenders: string[] = [];

  for (const file of sqlFiles(DIR)) {
    const rel = file.split("\\").join("/");
    const text = readFileSync(file, "utf8");
    const lines = live(text);

    const creates = lines
      .map((l) => /^create\s+table\s+(?:if\s+not\s+exists\s+)?public\.(\w+)/i.exec(l))
      .filter(Boolean)
      .map((m) => (m as RegExpExecArray)[1])
      // A temporary report table is not a table in public.
      .filter((name) => !name.startsWith("_plak"));

    for (const name of creates) {
      // A scratch table the same file drops again never outlives the
      // paste, so there is nothing to revoke from. `_money_freeze` is
      // the exception in this codebase and is dropped by
      // UNFREEZE-MONEY.sql, which is the point of the pair.
      const droppedHere =
        new RegExp(`drop\\s+table\\s+(if\\s+exists\\s+)?public\\.${name}\\b`, "i").test(
          text,
        ) || name === "_money_freeze";
      if (droppedHere) continue;

      // A revoke inside `execute '...'` counts: several plaks build
      // their grants as strings so they can loop over a list.
      const revoked = lines.some(
        (l) =>
          /revoke/i.test(l) &&
          l.toLowerCase().includes("authenticated") &&
          (l.includes(name) || /\bfrom\b[^;]*authenticated/i.test(l)),
      );
      if (!revoked) offenders.push(`${rel}  create table public.${name}`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `Supabase's DEFAULT PRIVILEGES hand \`authenticated\` insert/update/delete on\n` +
      `every new table in public. \`revoke all ... from anon, public\` does NOT\n` +
      `reach that role, and the \`grant select\` afterwards adds rather than\n` +
      `replaces. End the same block with:\n\n` +
      `  revoke insert, update, delete, truncate on public.<name> from authenticated;\n\n` +
      offenders.join("\n"),
  );
});
