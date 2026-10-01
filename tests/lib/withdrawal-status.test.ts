import test from "node:test";
import assert from "node:assert/strict";

import {
  WITHDRAWAL_STATUS_CHOICES,
  isOnOurDesk,
  withdrawalStatusLook,
} from "../../lib/pure-withdrawal-status";

test("at_supplier never renders as 'At_supplier'", () => {
  const l = withdrawalStatusLook("at_supplier");
  assert.equal(l.label, "With the provider");
  assert.doesNotMatch(l.label, /_/);
});

test("the customer is never told who we buy from", () => {
  // The supplier's name must not reach an advertiser — not in the UI,
  // not in an email, not in the JSON behind the page.
  for (const v of WITHDRAWAL_STATUS_CHOICES.map((c) => c.value)) {
    const l = withdrawalStatusLook(v);
    for (const text of [l.customerLabel, l.customerHint]) {
      assert.doesNotMatch(text, /supplier|seamx|falkyn|gradyn|rockads/i, `${v}: ${text}`);
    }
  }
});

test("every status has a label, a tone and both customer strings", () => {
  for (const c of WITHDRAWAL_STATUS_CHOICES) {
    const l = withdrawalStatusLook(c.value);
    assert.ok(l.label.length > 0);
    assert.ok(["ok", "pend", "due"].includes(l.tone));
    assert.ok(l.hint.length > 0);
    assert.ok(l.customerLabel.length > 0);
    assert.ok(l.customerHint.length > 0);
  }
});

test("a status we do not know says so rather than passing it through", () => {
  const l = withdrawalStatusLook("banana");
  assert.equal(l.label, "Unknown");
  assert.equal(l.tone, "due", "an unknown state is not a green one");
});

test("null and blank do not crash and do not read as approved", () => {
  assert.equal(withdrawalStatusLook(null).tone, "due");
  assert.equal(withdrawalStatusLook("").tone, "due");
  assert.equal(withdrawalStatusLook(undefined).label, "Unknown");
});

test("case and padding do not matter", () => {
  assert.equal(withdrawalStatusLook("  At_Supplier ").label, "With the provider");
});

test("only approved is green", () => {
  assert.equal(withdrawalStatusLook("approved").tone, "ok");
  assert.equal(withdrawalStatusLook("at_supplier").tone, "pend");
  assert.equal(withdrawalStatusLook("pending").tone, "pend");
});

test("the desk counter counts only what is on the desk", () => {
  // at_supplier is waiting on the provider, not on us. A counter that
  // never goes down teaches people to ignore the counter.
  assert.equal(isOnOurDesk("pending"), true);
  assert.equal(isOnOurDesk("at_supplier"), false);
  assert.equal(isOnOurDesk("approved"), false);
  assert.equal(isOnOurDesk(null), false);
});

test("the filter offers every status a row can actually have", () => {
  // `cancelled` is out on purpose, 28-09. The column allows it and
  // nothing writes it -- the only two writers are
  // ad_account_withdrawal_approve and _reject -- so picking it gave
  // "Nothing matches that filter", every time, for ever. And because
  // all three screens appended their own `rejected` to work around
  // its absence, Rejected appeared in the dropdown twice.
  assert.deepEqual(
    WITHDRAWAL_STATUS_CHOICES.map((c) => c.value),
    ["pending", "at_supplier", "approved", "rejected"],
  );
});

test("no option appears twice", () => {
  const values = WITHDRAWAL_STATUS_CHOICES.map((c) => c.value);
  assert.equal(new Set(values).size, values.length);
});
