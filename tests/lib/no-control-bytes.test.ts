import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

// ── RAW CONTROL BYTES IN SOURCE ──────────────────────────────────────
//
// Twice tonight a file was written with a control-character ESCAPE
// (`\u0000`) that something along the way interpreted, leaving the real
// byte in the source. The code still ran — and the file stopped being
// text: grep reports "Binary file ... matches" and refuses to search
// it, so the file silently drops out of every sweep that greps, which
// is most of them. One of those files was a security helper.
//
// Tabs, newlines and carriage returns are ordinary. Nothing else below
// 0x20 belongs in this codebase's source.

// Everything a person edits by hand. `supabase` is here for the .sql
// files in particular: a migration is pasted into an editor by hand,
// and one grep treats as binary drops out of every sweep that greps —
// which is most of them.
const ROOTS = [
  "app",
  "actions",
  "components",
  "context",
  "hooks",
  "lib",
  "scripts",
  "supabase",
  "tests",
];
const EXTS = [".ts", ".tsx", ".js", ".mjs", ".sql"];
const ALLOWED = new Set([9, 10, 13]); // tab, LF, CR

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (EXTS.some((e) => entry.endsWith(e))) out.push(full);
  }
  return out;
}

test("no source file carries a raw control byte", () => {
  const offenders: string[] = [];
  for (const root of ROOTS) {
    let files: string[];
    try {
      files = walk(root);
    } catch {
      continue;
    }
    for (const file of files) {
      const buf = readFileSync(file);
      for (let i = 0; i < buf.length; i += 1) {
        const b = buf[i];
        if (b < 0x20 && !ALLOWED.has(b)) {
          offenders.push(`${file} byte ${i} = 0x${b.toString(16)}`);
          break;
        }
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `write the escape (\u0000), not the byte — grep treats these files as binary and skips them:\n  ${offenders.join("\n  ")}`,
  );
});
