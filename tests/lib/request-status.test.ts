import { test } from "node:test";
import assert from "node:assert/strict";

import { requestStatusView } from "../../lib/pure-request-status";

/** The six the table actually holds. */
const REAL = [
  "pending",
  "payment_pending",
  "in_progress",
  "completed",
  "rejected",
  "cancelled",
];

test("every real status has a word a customer would recognise", () => {
  for (const st of REAL) {
    const v = requestStatusView(st);
    assert.ok(v.label.length > 2, st);
    // No column name leaking through: no underscores, no all-lowercase
    // machine word.
    assert.ok(!v.label.includes("_"), `${st} -> ${v.label}`);
    assert.equal(v.label[0], v.label[0].toUpperCase(), st);
  }
});

test("only the two that finish well and badly are marked done", () => {
  assert.deepEqual(
    REAL.filter((s) => requestStatusView(s).done),
    ["completed", "rejected", "cancelled"],
  );
});

/**
 * The fault this guards: the old table read "rejected or declined ->
 * red, pending or in_review -> amber, ANYTHING ELSE -> green". So a
 * request blocked on money, one still being built and one that was
 * cancelled all rendered as completed — green, which to a customer
 * means the account is there.
 */
test("nothing unfinished is ever green", () => {
  for (const st of [...REAL, "in_review", "", null, undefined, "whatever"]) {
    const v = requestStatusView(st);
    if (v.badge === "ok") assert.equal(st, "completed", `${String(st)} was green`);
  }
});

test("a refusal is red, and red is a variant this shell actually has", () => {
  const variants = new Set(["ok", "due", "pend", "muted"]);
  assert.equal(requestStatusView("rejected").badge, "due");
  for (const st of [...REAL, "surprise", null]) {
    assert.ok(variants.has(requestStatusView(st).badge), String(st));
  }
});

test("an unknown status is readable and never blank", () => {
  assert.equal(requestStatusView("needs_documents").label, "Needs documents");
  assert.equal(requestStatusView("").label, "In progress");
  assert.equal(requestStatusView(null).label, "Waiting for us");
  assert.equal(requestStatusView("  REJECTED ").label, "Not approved");
});
