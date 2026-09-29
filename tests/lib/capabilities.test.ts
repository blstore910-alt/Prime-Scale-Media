import { strict as assert } from "node:assert";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import {
  CAPABILITIES,
  GRANTABLE,
  capabilityByKey,
} from "../../lib/capabilities.ts";

/**
 * The two rules of the capability model, held here so they cannot be
 * relaxed by accident.
 */

test("granting rights can never itself be granted", () => {
  // An admin who can grant himself rights has all rights. This is the
  // one rule that makes every other one meaningless if it bends.
  for (const key of ["capabilities.manage", "owners.manage"]) {
    const c = capabilityByKey(key);
    assert.ok(c, `${key} must exist in the list so the screen can show it`);
    assert.equal(c!.ownerOnly, true, `${key} must be owner-only`);
    assert.equal(
      GRANTABLE.some((g) => g.key === key),
      false,
      `${key} must not appear in the grantable list`,
    );
  }
});

test("every capability key is unique", () => {
  // The key is what is stored in admin_capabilities. A duplicate means
  // two different toggles writing the same row, so switching one off
  // silently switches the other off too.
  const keys = CAPABILITIES.map((c) => c.key);
  assert.deepEqual([...new Set(keys)], keys);
});

test("every capability says what it actually lets someone do", () => {
  // A toggle labelled "plans.edit" with no sentence under it gets
  // switched on by someone who is guessing.
  for (const c of CAPABILITIES) {
    assert.ok(c.label.length > 3, `${c.key} needs a readable label`);
    assert.ok(
      c.what.length > 40,
      `${c.key} needs a sentence saying what it allows and what it risks`,
    );
    assert.ok(c.group, `${c.key} needs a group`);
  }
});

test("no capability key is a label — the stored string must be stable", () => {
  // These strings live in the database. A key with a space or a
  // capital is a key somebody has retyped from the screen.
  for (const c of CAPABILITIES) {
    assert.match(
      c.key,
      /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/,
      `${c.key} must be lowercase dotted, e.g. wallet.adjust`,
    );
  }
});

test("a capability used in the code exists in the list", () => {
  // resolveCapability('typo.here') refuses for ever and silently: the
  // row can never exist, so the action is dead for every admin and
  // still works for the owner, which is exactly the shape that gets
  // shipped unnoticed.
  const used = new Set<string>();
  for (const f of listActionFiles()) {
    const text = readFileSync(f, "utf8");
    for (const m of text.matchAll(/resolveCapability\(\s*["'`]([^"'`]+)["'`]/g)) {
      used.add(m[1]);
    }
  }
  const known = new Set(CAPABILITIES.map((c) => c.key));
  const unknown = [...used].filter((u) => !known.has(u));
  assert.deepEqual(
    unknown,
    [],
    `These capability names are checked in the code but are not in ` +
      `lib/capabilities.ts, so no owner can ever grant them:\n` +
      unknown.join("\n"),
  );
});

function listActionFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir)) {
      if (e === "node_modules" || e === ".next") continue;
      const full = join(dir, e);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(e)) out.push(full);
    }
  };
  for (const root of ["actions", "app", "lib", "components"]) {
    try {
      walk(root);
    } catch {
      /* a root that is not there is not a failure */
    }
  }
  return out;
}
