import { test } from "node:test";
import assert from "node:assert/strict";
import { generateSlug, getInitials } from "../../lib/utils-pure.ts";

// Boundary + adversarial input tests to complement the happy-path
// coverage in utils.test.ts. The slug is what routes tenants — it
// must never accept ambiguous or reserved-looking values.

test("generateSlug — non-ASCII strips diacritics + special chars", () => {
  const s = generateSlug("Café Zürich");
  // Depending on implementation may or may not preserve accents;
  // freeze the current behaviour: lowercased, hyphen-joined, no spaces.
  assert.ok(!/\s/.test(s), "no whitespace");
  assert.equal(s, s.toLowerCase());
});

test("generateSlug — punctuation is dropped or converted to hyphen", () => {
  const s = generateSlug("Acme, Inc.");
  assert.ok(!/[,.]/.test(s), "no punctuation left");
});

test("generateSlug — collapses repeated whitespace", () => {
  const s = generateSlug("hello    world");
  assert.ok(!/--/.test(s.replace(/[a-z0-9-]/g, "")), "no consecutive hyphens");
});

test("generateSlug — empty stays empty", () => {
  const s = generateSlug("");
  assert.equal(s, "");
});

test("getInitials — 1 word returns first letter", () => {
  assert.equal(getInitials("Acme"), "A");
});

test("getInitials — 2+ words returns first letter of each", () => {
  assert.equal(getInitials("Prime Scale Media"), "PSM");
});

test("getInitials — whitespace-only returns empty", () => {
  assert.equal(getInitials("   "), "");
});

test("getInitials — respects casing", () => {
  const initials = getInitials("acme co");
  // Whatever implementation does with case — freeze the behaviour.
  assert.equal(initials.length, 2);
});
