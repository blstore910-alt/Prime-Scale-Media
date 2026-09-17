import { strict as assert } from "node:assert";
import { test } from "node:test";

import { invoiceStatusView } from "../../lib/invoice-status";

test("a voided invoice is not a debt on either side", () => {
  // This is the bug the file exists for: both lists drew every non-paid
  // invoice as owed, so voiding a superseded €200 changed nothing on
  // screen — the customer still read "Due €200".
  const admin = invoiceStatusView("void");
  assert.equal(admin.label, "Void");
  assert.equal(admin.tone, "muted");
  assert.equal(admin.settled, true);

  const cust = invoiceStatusView("void", { customer: true });
  assert.equal(cust.label, "Cancelled");
  assert.equal(cust.settled, true);
});

test("the desk and the customer get different words for the same row", () => {
  assert.equal(invoiceStatusView("unpaid").label, "Unpaid");
  assert.equal(invoiceStatusView("unpaid", { customer: true }).label, "Due");
});

test("paid is paid, whoever is looking", () => {
  assert.equal(invoiceStatusView("paid").label, "Paid");
  assert.equal(invoiceStatusView("paid", { customer: true }).label, "Paid");
  assert.equal(invoiceStatusView("paid").settled, true);
});

test("overdue keeps its own name and its red", () => {
  const v = invoiceStatusView("overdue");
  assert.equal(v.label, "Overdue");
  assert.equal(v.tone, "due");
  assert.equal(v.settled, false);
});

test("an unknown status counts as owed, never as settled", () => {
  // Erring the other way would hide a real debt behind a word nobody has
  // taught this function yet.
  const v = invoiceStatusView("awaiting_something");
  assert.equal(v.settled, false);
  assert.equal(v.label, "Unpaid");
});

test("case and padding do not change the verdict", () => {
  assert.equal(invoiceStatusView("  VOID ").label, "Void");
  assert.equal(invoiceStatusView("Paid").label, "Paid");
});

test("a missing status is treated as owed", () => {
  assert.equal(invoiceStatusView(null).settled, false);
  assert.equal(invoiceStatusView(undefined).label, "Unpaid");
});
