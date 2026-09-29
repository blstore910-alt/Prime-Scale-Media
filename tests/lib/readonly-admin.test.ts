import { strict as assert } from "node:assert";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { CAPABILITIES } from "../../lib/capabilities.ts";

/**
 * READ-ONLY HAS TO REACH THE QUEUE ACTIONS.
 *
 * The owner, 29-09: "bij permissions ook ad account topups en requests
 * en wallet topups etc, dat een admin alleen read only mode is — dus
 * ook vooral admin handelingen en queue handelingen."
 *
 * It is enforced in ONE place: `resolveAdminContextInner` in
 * actions/_shared.ts, on the `freeze` branch — the same branch that
 * MAINTENANCE_MODE already uses to tell a mutation from a read. That
 * is the whole design. A check spread over forty queue actions is a
 * check that is missing from the forty-first.
 *
 * So what has to hold is: every action that CHANGES something resolves
 * its context through the mutating helper. An action that reaches for
 * the read-only helper and then writes has stepped around both the
 * maintenance freeze and this.
 */

test("read-only is the one capability that takes something away", () => {
  const ro = CAPABILITIES.find((c) => c.key === "admin.readonly");
  assert.ok(ro, "admin.readonly must exist");
  assert.equal(ro!.restricts, true);
  // And it must not be owner-only: the whole point is handing it out.
  assert.notEqual(ro!.ownerOnly, true);
  // Exactly one. Two inverted toggles in a list of giving ones is a
  // list nobody can read at a glance.
  assert.equal(CAPABILITIES.filter((c) => c.restricts).length, 1);
});

test("read-only is checked on the mutating branch, not per action", () => {
  const shared = readFileSync("actions/_shared.ts", "utf8");
  assert.match(
    shared,
    /admin\.readonly/,
    "actions/_shared.ts must be where read-only is enforced",
  );
  // On the freeze branch — the one that means "this is a write".
  const idx = shared.indexOf("admin.readonly");
  const before = shared.slice(Math.max(0, idx - 2000), idx);
  assert.match(
    before,
    /if\s*\(\s*freeze/,
    "the read-only check must sit inside the `freeze` branch, so reads stay possible",
  );
});

test("an action that writes does not resolve context through the read helper", () => {
  // resolveAdminContextForRead skips the maintenance freeze AND the
  // read-only check, by design. A file that uses it and then writes
  // has stepped around both.
  const offenders: string[] = [];

  for (const file of walk("actions")) {
    const rel = file.replace(/\\/g, "/");
    const text = readFileSync(file, "utf8");
    if (!text.includes("resolveAdminContextForRead")) continue;

    // Does the same file write to a business table?
    const writes = /\.(insert|update|upsert|delete)\s*\(/.test(
      stripComments(text),
    );
    if (writes) offenders.push(rel);
  }

  assert.deepEqual(
    offenders,
    [],
    `resolveAdminContextForRead exists so that reading still works during\n` +
      `an incident. It skips the maintenance freeze and the read-only check.\n` +
      `A file that uses it and also writes has stepped around both — use\n` +
      `resolveAdminContext for the write.\n\n` +
      offenders.join("\n"),
  );
});

function stripComments(text: string): string {
  return text
    .split("\n")
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
    })
    .join("\n");
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.ts$/.test(entry)) out.push(full);
  }
  return out;
}
