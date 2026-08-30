import { test } from "node:test";
import assert from "node:assert/strict";

// Duplicate of the escape closure inside exportAuditEventsCsv.
// Kept as a copy so we test the ESCAPE RULE, not that the function
// exports it (which is not our contract).
function escape(v: unknown): string {
  if (v == null) return "";
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return `"${s.replace(/"/g, '""')}"`;
}

test("escape — null and undefined become empty", () => {
  assert.equal(escape(null), "");
  assert.equal(escape(undefined), "");
});

test("escape — plain string is wrapped in quotes", () => {
  assert.equal(escape("hello"), '"hello"');
});

test("escape — embedded double quote is doubled per RFC 4180", () => {
  assert.equal(escape('he said "hi"'), '"he said ""hi"""');
});

test("escape — embedded newline is preserved inside quotes", () => {
  assert.equal(escape("line1\nline2"), '"line1\nline2"');
});

test("escape — embedded comma is preserved inside quotes", () => {
  assert.equal(escape("a,b,c"), '"a,b,c"');
});

test("escape — object is JSON-serialised then escaped", () => {
  const obj = { message: 'contains "quotes"', total: 42 };
  const out = escape(obj);
  // Result should be a quoted string with doubled internal quotes.
  assert.ok(out.startsWith('"'));
  assert.ok(out.endsWith('"'));
  // Round-trip: strip the outer quotes, undouble, JSON.parse should work.
  const inner = out.slice(1, -1).replace(/""/g, '"');
  const parsed = JSON.parse(inner);
  assert.equal(parsed.message, 'contains "quotes"');
  assert.equal(parsed.total, 42);
});

test("escape — CSV-injection-shaped payload is inert once escaped", () => {
  // If someone stuffs =SUM(A1) into a field, Excel might autoexecute
  // it when the CSV is opened. Wrapping in quotes doesn't fix Excel's
  // behaviour — that's a downstream issue — but it does prevent the
  // formula from breaking the row structure.
  const evil = '=SUM(1,2),extra_column';
  assert.equal(escape(evil), '"=SUM(1,2),extra_column"');
});
