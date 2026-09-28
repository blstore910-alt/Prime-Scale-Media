import { strict as assert } from "node:assert";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * A SUPABASE `count` MAY ONLY FALL BACK TO null — NEVER TO A NUMBER.
 *
 * ── WHY THIS IS A TEST AND NOT A NOTE ─────────────────────────────
 *
 * The owner, 28-09, after the second full sweep: "de derde test zullen
 * we dan weer veel fouten vinden... hoelang moet ik door als jij
 * steeds kritieke fouten vindt".
 *
 * That is the right question, and the answer is in this file. Counting
 * that day: `count ?? 0` and friends appeared at 41 places across more
 * than twenty files. It is not forty-one different faults — it is ONE
 * fault written forty-one times. Every sweep is scoped to one journey,
 * so every sweep re-discovers it in the files the last one did not
 * open, and it never ends.
 *
 * So it is closed once, here, for the whole repository. A sweep finds
 * instances; a test ends a class.
 *
 * ── WHAT IS ACTUALLY WRONG WITH IT ────────────────────────────────
 *
 * postgrest-js parses `count` out of the content-range HEADER. When
 * that header is missing or unparseable it leaves `count` null — with
 * `error` null. So `count ?? 0` states, with confidence, that there
 * are none: a queue badge reading 0 over eight waiting top-ups, a
 * pager that vanishes because "this page is everything", an
 * entitlement denied because "you have no referral links".
 *
 * null means "we do not know", and every caller in this codebase can
 * render that — as a dash, as a skeleton, as "could not read". A
 * number cannot be told apart from the truth.
 *
 * NaN is caught for the same reason: it fails every comparison and
 * reaches a badge as the literal text "NaN".
 */

const ROOTS = ["components", "hooks", "actions", "app", "lib"];

/** Things named `count` that are not a Supabase count. */
const ALLOWED = new Set<string>([
  // A Map counter: `(map.get(k) ?? 0) + 1`.
  "hooks/use-matched-deposits.ts",
  // `account_count` / `*_count` string fields being trimmed for a
  // filter — not a row count at all.
  "components/promotions/psm-promotions.tsx",
  "lib/pure-finance-report.ts",
  // Nothing imports this; it is listed in docs/UNREACHABLE.md and the
  // live screen is affiliate/affiliates-book.tsx.
  "components/affiliate/affiliate-table.tsx",
  // `count` here is a FIELD of the JSON from /api/stats/wallet, not a
  // content-range header — `?? 0` guards an absent response object,
  // which is a different thing and is correct.
  "components/dashboard/wallet-stats-cards.tsx",
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

test("no Supabase count is defaulted to a number", () => {
  const offenders: string[] = [];

  for (const root of ROOTS) {
    for (const file of walk(root)) {
      const rel = file.replace(/\\/g, "/");
      if (ALLOWED.has(rel)) continue;
      const text = readFileSync(file, "utf8");

      text.split("\n").forEach((line, i) => {
        const bare = line.trim();
        // A commented-out example is the whole point of this file —
        // several of the fixes explain the bug by quoting it.
        if (bare.startsWith("//") || bare.startsWith("*") || bare.startsWith("/*")) {
          return;
        }
        // `count ?? null` is the correct shape and stays.
        const m = /\bcount\s*\?\?\s*(?!null\b)(\S)/.exec(line);
        if (m) offenders.push(`${rel}:${i + 1}  ${bare.slice(0, 90)}`);
      });
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `A Supabase count may only fall back to null — a number cannot be told apart from the truth.\n` +
      `postgrest-js leaves count null, with error null, when the content-range header is\n` +
      `missing. Return null and let the caller say "we do not know".\n\n` +
      offenders.join("\n"),
  );
});
