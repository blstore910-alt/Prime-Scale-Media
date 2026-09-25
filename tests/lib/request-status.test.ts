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

/**
 * The fault this guards, measured on production 25-09: the Ad accounts
 * card printed "Ad account on the way — Waiting for us" and the Requests
 * tab printed "We set it up on our Business Manager" for a request whose
 * status is `payment_pending`. That status means the fee invoice is
 * raised and it is waiting on the CUSTOMER. We were telling somebody who
 * owes us money that we were busy on it.
 */
test("payment_pending never claims we are working on it", () => {
  const v = requestStatusView("payment_pending");
  assert.match(v.title, /payment/i);
  assert.ok(v.hint);
  assert.doesNotMatch(v.hint!, /Business Manager/i);
  assert.match(v.hint!, /paid|pay/i);
});

test("only what is really in flight says we are building it", () => {
  const building = REAL.filter((s) =>
    /Business Manager/i.test(requestStatusView(s).hint ?? ""),
  );
  assert.deepEqual(building, ["pending", "in_progress"]);
});

test("a finished request adds no instruction, because it has none", () => {
  for (const st of ["completed", "rejected", "cancelled"]) {
    assert.equal(requestStatusView(st).hint, null, st);
  }
});

test("every status has a card title that is not the raw column", () => {
  for (const st of [...REAL, "needs_documents", null]) {
    const t = requestStatusView(st).title;
    assert.ok(t.length > 5, String(st));
    assert.ok(!t.includes("_"), `${String(st)} -> ${t}`);
  }
});
