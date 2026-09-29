import { strict as assert } from "node:assert";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * A FUNCTION YOU DROP MUST NOT STILL BE CALLED.
 *
 * ── WHY THIS IS A TEST ────────────────────────────────────────────
 *
 * 29-09. Plak 145 ended with:
 *
 *     drop function if exists public._is_tenant_owner(uuid, uuid);
 *
 * — removing an overload, because two functions with one name and a
 * different argument count invite the wrong call. Three functions
 * from plak 143 were calling exactly that overload.
 *
 * Postgres does not check a plpgsql body until it runs, so the drop
 * succeeded silently. Every permission toggle on /admins and every
 * attempt to make somebody an owner then failed with
 *
 *     function _is_tenant_owner(uuid, uuid) does not exist
 *
 * and the owner found it within a minute of opening the screen.
 *
 * This is the same class as plak 124, which broke the Join button for
 * twenty minutes: a change to a live function that nobody traced the
 * callers of. Two occurrences is a pattern, so it gets a test.
 *
 * ── WHAT IT CHECKS ────────────────────────────────────────────────
 *
 * For every `drop function public.X` in a plak, no OTHER plak that is
 * still current may call `X(`. It is deliberately crude — it does not
 * parse SQL, and it cannot know which definition is live — so it errs
 * toward complaining. A false alarm costs a line in the allowlist
 * below, with the reason. The real thing costs production.
 */

const DIR = "supabase/checks";

/** Drops whose callers were checked, with why it is safe. */
const CHECKED = new Set<string>([
  // Plak 148 rewrote all three callers. Both plaks stay on disk as the
  // record of what happened.
  "_is_tenant_owner/2|PLAK-DIT-145-DE-TWEEDE-EIGENAAR-MAG-OOK-ECHT-WAT.sql",

  // ── HISTORY, NOT A LIVE HOLE ────────────────────────────────────
  //
  // `supabase/checks` is an archive: every plak ever pasted stays on
  // disk as the record of what happened, superseded or not. So a
  // "caller" can be a plak that ran months before the drop, or one
  // that was itself replaced later.
  //
  // Checked against the live database on 29-09: all four of these
  // functions exist right now with the arity their callers use, so
  // nothing is broken. They are listed rather than worked around,
  // because the alternative is teaching the test to reason about plak
  // ordering — and the value of this test is the NEXT drop, not the
  // archive.
  "poll_vote/2|PLAK-DIT-133-POLL-OPEN-ANTWOORD.sql",
  "affiliate_commission_list/2|PLAK-DIT-40-AFFILIATE-ZIET-HET-NETWERK.sql",
  "affiliate_commission_list/2|PLAK-DIT-70-WAAR-KOMT-DIE-ELF-CENT-VANDAAN.sql",
  "affiliate_commission_list/2|PLAK-DIT-ALLES-69-73.sql",
]);

function sqlFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sqlFiles(full, out);
    else if (entry.endsWith(".sql")) out.push(full);
  }
  return out;
}

/** Lines that are not comments. A quoted example is not a drop. */
function live(text: string): string[] {
  return text
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .map((l) => l.replace(/--.*$/, ""));
}

/**
 * How many arguments, counted at the top level of one parenthesis.
 *
 * Arity is the whole point. A plak that drops `f(uuid, uuid)` and
 * creates `f(uuid)` in the same breath looks like an ordinary
 * drop-and-recreate and is not one: every caller passing two
 * arguments is now broken, and Postgres will not say so until one of
 * them runs. That is exactly what happened on 29-09.
 */
function arity(args: string): number {
  const t = args.trim();
  if (!t) return 0;
  let depth = 0;
  let n = 1;
  for (const ch of t) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "," && depth === 0) n++;
  }
  return n;
}

test("a plak that drops a function has no plak still calling it", () => {
  const files = sqlFiles(DIR);

  type Drop = { name: string; args: number; file: string };
  const drops: Drop[] = [];
  // What each file CREATES, so a drop-and-recreate of the same shape
  // is recognised as the ordinary thing it is.
  const creates = new Map<string, Set<string>>();

  for (const file of files) {
    const base = file.split(/[\\/]/).pop()!;
    const text = readFileSync(file, "utf8");
    for (const line of live(text)) {
      const d = /drop\s+function\s+(?:if\s+exists\s+)?public\.(\w+)\s*\(([^)]*)\)/i.exec(
        line,
      );
      if (d) drops.push({ name: d[1], args: arity(d[2]), file: base });

      const c = /create\s+(?:or\s+replace\s+)?function\s+public\.(\w+)\s*\(([^)]*)\)/i.exec(
        line,
      );
      if (c) {
        const set = creates.get(base) ?? new Set<string>();
        set.add(`${c[1]}/${arity(c[2])}`);
        creates.set(base, set);
      }
    }
  }

  const offenders: string[] = [];
  for (const d of drops) {
    const sig = `${d.name}/${d.args}`;
    if (CHECKED.has(`${sig}|${d.file}`)) continue;
    // Dropped and put straight back in the same shape: normal.
    if (creates.get(d.file)?.has(sig)) continue;

    const callers: string[] = [];
    for (const file of files) {
      const base = file.split(/[\\/]/).pop()!;
      if (base === d.file) continue;
      for (const line of live(readFileSync(file, "utf8"))) {
        if (/create\s+(or\s+replace\s+)?function/i.test(line)) continue;
        if (/drop\s+function/i.test(line)) continue;
        if (/\b(revoke|grant|comment)\b/i.test(line)) continue;
        const call = new RegExp(`\\b${d.name}\\s*\\(([^)]*)\\)`).exec(line);
        if (!call) continue;
        // Only a caller passing the number of arguments that was
        // dropped. A call with a different count was always going to
        // a different overload.
        if (arity(call[1]) !== d.args) continue;
        callers.push(base);
        break;
      }
    }
    if (callers.length) {
      offenders.push(
        `public.${d.name} with ${d.args} argument(s) is dropped by ${d.file} ` +
          `and still called with ${d.args} in: ` +
          [...new Set(callers)].join(", "),
      );
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `Postgres does not check a plpgsql body until it runs, so dropping a\n` +
      `function a live one calls succeeds in silence and fails on the first\n` +
      `click. That is how the permission toggles broke on 29-09, and how the\n` +
      `Join button broke on 28-09.\n\n` +
      `Rewrite the callers in the SAME plak, then add\n` +
      `  "<name>/<arity>|<the plak that drops it>"\n` +
      `to CHECKED at the top of this file with the reason.\n\n` +
      offenders.join("\n"),
  );
});
