import test from "node:test";
import assert from "node:assert/strict";
import {
  isAccountLocked,
  accountLockedReason,
} from "../../lib/pure-account-status.ts";

test("only the statuses we recognise are live", () => {
  for (const s of ["active", "approved", "live", "ACTIVE", " Active "]) {
    assert.equal(isAccountLocked(s), false, s);
  }
});

test("every known off-state is locked", () => {
  for (const s of [
    "banned", "paused", "pending", "disabled",
    "suspended", "rejected", "closed",
  ]) {
    assert.equal(isAccountLocked(s), true, s);
  }
});

// The point of the rule: a word nobody has taught this app is not a
// working account, and the customer must not be invited to move money.
test("an unknown status is locked, not live", () => {
  for (const s of ["under_review", "frozen", "whatever", "ACTIVE-ISH"]) {
    assert.equal(isAccountLocked(s), true, s);
  }
});

test("no status at all is locked", () => {
  assert.equal(isAccountLocked(null), true);
  assert.equal(isAccountLocked(undefined), true);
  assert.equal(isAccountLocked(""), true);
  assert.equal(isAccountLocked("   "), true);
});

test("a live account has no reason to show", () => {
  assert.equal(accountLockedReason("active"), null);
});

test("the reason names what happened, without jargon", () => {
  assert.match(accountLockedReason("pending") ?? "", /not set up/);
  assert.match(accountLockedReason("banned") ?? "", /closed by the platform/);
  assert.match(accountLockedReason("paused") ?? "", /switched off/);
  assert.match(accountLockedReason("mystery") ?? "", /not active/);
});
