import test from "node:test";
import assert from "node:assert/strict";

import { applyInvoiceStatusFilter } from "../../lib/invoice-status";

/** A stand-in for the Supabase filter builder: records what was asked. */
type Call = [string, ...unknown[]];
class FakeQuery {
  calls: Call[] = [];
  eq(c: string, v: unknown) {
    this.calls.push(["eq", c, v]);
    return this;
  }
  not(c: string, op: string, v: unknown) {
    this.calls.push(["not", c, op, v]);
    return this;
  }
  lt(c: string, v: unknown) {
    this.calls.push(["lt", c, v]);
    return this;
  }
}

const NOW = new Date("2026-09-28T12:00:00.000Z");
const run = (status: string | null | undefined) => {
  const q = new FakeQuery();
  applyInvoiceStatusFilter(q, status, NOW);
  return q.calls;
};

test("no filter is no filter", () => {
  assert.deepEqual(run("all"), []);
  assert.deepEqual(run(""), []);
  assert.deepEqual(run(null), []);
  assert.deepEqual(run(undefined), []);
  assert.deepEqual(run("   "), []);
});

test("overdue is derived, never asked for as a status", () => {
  // The bug: .eq("status","overdue") matches nothing, for ever.
  const calls = run("overdue");
  assert.deepEqual(calls, [
    ["eq", "status", "unpaid"],
    ["not", "due_date", "is", null],
    ["lt", "due_date", NOW.toISOString()],
  ]);
  assert.ok(!calls.some((c) => c.includes("overdue")));
});

test("past due is the same thing said differently", () => {
  assert.deepEqual(run("past_due"), run("overdue"));
  assert.deepEqual(run("past due"), run("overdue"));
});

test("cancelled is the customer's word for void", () => {
  assert.deepEqual(run("cancelled"), [["eq", "status", "void"]]);
  assert.deepEqual(run("canceled"), [["eq", "status", "void"]]);
});

test("a real status is passed through, lowercased and trimmed", () => {
  assert.deepEqual(run("paid"), [["eq", "status", "paid"]]);
  assert.deepEqual(run("  Unpaid "), [["eq", "status", "unpaid"]]);
  assert.deepEqual(run("VOID"), [["eq", "status", "void"]]);
});
