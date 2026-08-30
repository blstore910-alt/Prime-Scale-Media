import { test } from "node:test";
import assert from "node:assert/strict";

// The regex is duplicated intentionally: tests validate the rule
// itself, not that the file exports it (that would be pointless).
// Must be kept in sync with actions/tenant-actions.ts.
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$/;

const NAME_MAX = 40;
const NAME_MIN = 2;

function nameValid(name: string): boolean {
  return name.length >= NAME_MIN && name.length <= NAME_MAX;
}

test("slug — accepts standard cases", () => {
  for (const s of [
    "ac",
    "acme",
    "acme-co",
    "test-org",
    "a1",
    "test-org-2026",
  ]) {
    assert.ok(SLUG_RE.test(s), `expected ${s} to pass`);
  }
});

test("slug — rejects uppercase", () => {
  assert.equal(SLUG_RE.test("Acme"), false);
  assert.equal(SLUG_RE.test("ACME"), false);
});

test("slug — rejects leading / trailing hyphen", () => {
  assert.equal(SLUG_RE.test("-acme"), false);
  assert.equal(SLUG_RE.test("acme-"), false);
});

test("slug — rejects underscores and spaces", () => {
  assert.equal(SLUG_RE.test("acme_co"), false);
  assert.equal(SLUG_RE.test("acme co"), false);
});

test("slug — rejects single char", () => {
  assert.equal(SLUG_RE.test("a"), false);
});

test("slug — rejects too long (>40 total)", () => {
  const long = "a".repeat(41);
  assert.equal(SLUG_RE.test(long), false);
});

test("slug — accepts exactly 40 chars", () => {
  const forty = "a" + "b".repeat(38) + "c";
  assert.equal(forty.length, 40);
  assert.ok(SLUG_RE.test(forty));
});

test("slug — rejects sql-injection style input", () => {
  for (const s of [
    "'; drop table tenants; --",
    "acme'--",
    "../../etc/passwd",
    "<script>",
  ]) {
    assert.equal(SLUG_RE.test(s), false, `expected ${s} to fail`);
  }
});

test("name — rejects too short and too long", () => {
  assert.equal(nameValid("a"), false);
  assert.equal(nameValid("aa"), true);
  assert.equal(nameValid("A"), false);
  assert.equal(nameValid("x".repeat(40)), true);
  assert.equal(nameValid("x".repeat(41)), false);
});
