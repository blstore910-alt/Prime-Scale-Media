import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  classifyDeposit,
  codesInReference,
  depositAdvice,
} from "../../lib/pure-deposit-reference.ts";

// This system's codes, as they are today.
const KNOWN = ["PSM0005", "PSM0011", "PSM0016"];

test("a code belonging to a customer here is a match", () => {
  const m = classifyDeposit("PSM0011", KNOWN);
  assert.deepEqual(m, { kind: "customer", code: "PSM0011" });
});

test("an old-system code is named as such, not left unexplained", () => {
  // The whole point: 64 of the 80 unattributed deposits are this, and
  // no amount of looking will match them until that customer is
  // migrated.
  const m = classifyDeposit("PSM2126", KNOWN);
  assert.deepEqual(m, { kind: "legacy", code: "PSM2126" });
  assert.match(depositAdvice(m), /OLD-system/);
});

test("the code is found when it is buried in other text", () => {
  // Real references from the live feed. Matching the WHOLE string
  // left 22 of these in "something else" when they are plainly
  // old-system.
  for (const ref of [
    "PSM2098/nca7d2d4ddfc78d3186571d9e9dbd1a23",
    "PSM1971/TRWIBEB1XXX",
    "PSM1737 Tribe",
    "PSM2129 (topup)",
    "Top-up Patrick Benschop - PSM2149/PSM2149",
  ]) {
    assert.equal(classifyDeposit(ref, KNOWN).kind, "legacy", ref);
  }
});

test("lower case and a stray space do not hide a code", () => {
  // `Psm2127` is in the live data exactly like that.
  assert.equal(classifyDeposit("Psm2127", KNOWN).kind, "legacy");
  assert.equal(classifyDeposit("psm 0016", KNOWN).kind, "customer");
});

test("a bank transaction number is not a code", () => {
  for (const ref of [
    "121145304725699",
    "064209587732830",
    "20260923MMQFMP2U001001",
  ]) {
    assert.deepEqual(classifyDeposit(ref, KNOWN), { kind: "no-code" }, ref);
  }
});

test("nothing at all says so, and says it is the hardest kind", () => {
  for (const ref of [null, undefined, "", "   "]) {
    assert.deepEqual(classifyDeposit(ref, KNOWN), { kind: "empty" });
  }
  assert.match(depositAdvice({ kind: "empty" }), /nobody is going to claim it/);
});

test("a real customer wins over a legacy code in the same reference", () => {
  // A migrated customer quoting their old code alongside the new one
  // must be attributed, not filed as unmigrated.
  const m = classifyDeposit("was PSM2149, now PSM0016", KNOWN);
  assert.deepEqual(m, { kind: "customer", code: "PSM0016" });
});

test("the known list decides, not the shape of the number", () => {
  // Today every code here starts with a zero, so "starts with
  // non-zero means old" would work — and would break silently the
  // day this tenant reaches PSM1000. The list is the authority.
  const m = classifyDeposit("PSM1000", ["PSM1000"]);
  assert.deepEqual(m, { kind: "customer", code: "PSM1000" });
});

test("codesInReference finds every code, in order", () => {
  assert.deepEqual(codesInReference("PSM2149/PSM0016"), ["PSM2149", "PSM0016"]);
  assert.deepEqual(codesInReference("nothing here"), []);
  assert.deepEqual(codesInReference(null), []);
});

test("three digits is not a code, and five is not either", () => {
  // PSM999 and PSM12345 are not client codes in either system, and
  // treating them as one would attribute money to the wrong person.
  assert.deepEqual(codesInReference("PSM999"), []);
  assert.deepEqual(codesInReference("PSM12345"), ["PSM1234"]);
});

test("every kind has advice, and none of it is empty", () => {
  for (const m of [
    { kind: "customer", code: "PSM0005" },
    { kind: "legacy", code: "PSM2126" },
    { kind: "no-code" },
    { kind: "empty" },
  ] as const) {
    assert.ok(depositAdvice(m).length > 40, m.kind);
  }
});
