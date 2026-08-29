import { test } from "node:test";
import { strict as assert } from "node:assert";
import { safeIlikeTerm } from "../../lib/utils/search.ts";

test("safeIlikeTerm strips comma, paren, quote, backslash, wildcards", () => {
  const raw = `foo,(bar) "baz\\qux%_end`;
  const cleaned = safeIlikeTerm(raw);
  assert.equal(cleaned, "foo bar baz qux end");
});

test("safeIlikeTerm collapses whitespace and trims", () => {
  assert.equal(safeIlikeTerm("   a\t\tb\n\nc  "), "a b c");
});

test("safeIlikeTerm caps to maxLength", () => {
  const long = "x".repeat(500);
  assert.equal(safeIlikeTerm(long, 100).length, 100);
});

test("safeIlikeTerm returns empty string for empty input", () => {
  assert.equal(safeIlikeTerm(""), "");
  assert.equal(safeIlikeTerm("   "), "");
});

test("safeIlikeTerm keeps unicode and normal text", () => {
  assert.equal(safeIlikeTerm("Björn müller"), "Björn müller");
  assert.equal(safeIlikeTerm("test@example.com"), "test@example.com");
});
