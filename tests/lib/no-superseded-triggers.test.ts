import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * The two wallet-balance triggers that 20260913220000 replaced must not
 * be re-creatable by pasting any file in this repo.
 *
 * Four files carried live `create trigger` statements for them, in two
 * directories, and the fix's own comment named only one of them. Pasting
 * any of the four puts an old trigger back beside the new one and the
 * next verified top-up credits the wallet twice — and the assertion that
 * would catch it lives in a file nobody is running at that moment.
 *
 * A grep is the only thing that can hold this: the danger is not in code
 * that runs, it is in a file somebody might paste.
 */
const SUPERSEDED = [
  "trg_apply_wallet_topup_balance",
  "trg_settle_precharge_on_topup",
];

function sqlFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sqlFiles(full));
    else if (entry.endsWith(".sql")) out.push(full);
  }
  return out;
}

test("no SQL file in the repo re-creates a superseded balance trigger", () => {
  const offenders: string[] = [];
  for (const file of sqlFiles("supabase")) {
    const text = readFileSync(file, "utf8");
    text.split("\n").forEach((line, i) => {
      const bare = line.trim();
      // A commented-out statement is the whole point — only live ones count.
      if (bare.startsWith("--")) return;
      for (const name of SUPERSEDED) {
        if (bare.startsWith(`create trigger ${name}`)) {
          offenders.push(`${file}:${i + 1} ${name}`);
        }
      }
    });
  }
  assert.deepEqual(
    offenders,
    [],
    `These would double-credit every verified top-up if pasted:\n${offenders.join("\n")}`,
  );
});
