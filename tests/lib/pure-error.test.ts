import { test } from "node:test";
import assert from "node:assert/strict";
import {
  safeErrorMessage,
  userFacingErrorMessage,
} from "../../lib/pure-error.ts";

test("safeErrorMessage — Error instance returns .message", () => {
  assert.equal(safeErrorMessage(new Error("boom")), "boom");
});

test("safeErrorMessage — string passes through", () => {
  assert.equal(safeErrorMessage("oh no"), "oh no");
});

test("safeErrorMessage — object with string .message", () => {
  assert.equal(
    safeErrorMessage({ message: "supabase says no" }),
    "supabase says no",
  );
});

test("safeErrorMessage — null / undefined => unknown error", () => {
  assert.equal(safeErrorMessage(null), "unknown error");
  assert.equal(safeErrorMessage(undefined), "unknown error");
});

test("safeErrorMessage — number => unknown error", () => {
  assert.equal(safeErrorMessage(42), "unknown error");
});

test("safeErrorMessage — object without message => unknown error", () => {
  assert.equal(safeErrorMessage({ code: "23505" }), "unknown error");
});

test("safeErrorMessage — object with non-string message => unknown error", () => {
  assert.equal(safeErrorMessage({ message: 123 }), "unknown error");
});

test("safeErrorMessage — never returns .details or .hint from Supabase errors", () => {
  // Simulate a PostgrestError-like object.
  const supErr = {
    message: "duplicate key value violates unique constraint",
    details:
      "Key (email)=(leaked@example.com) already exists.",
    hint: null,
    code: "23505",
  };
  const out = safeErrorMessage(supErr);
  assert.equal(out, "duplicate key value violates unique constraint");
  assert.ok(!out.includes("leaked@example.com"));
});

// ── userFacingErrorMessage ───────────────────────────────────────────
// safeErrorMessage keeps details/hint/row out of a LOG. This keeps the
// message itself off a CUSTOMER's screen when it came from the database
// — "column plans_1.features does not exist" has been read by one.
test("a database message is replaced by the caller's sentence", () => {
  const fb = "We couldn't load your ad accounts just now.";
  for (const m of [
    "column plans_1.features does not exist",
    'relation "public.wallet_refunds" does not exist',
    "Could not find the function public.my_wallet_extras(uuid) in the schema cache",
    'duplicate key value violates unique constraint "invoices_pkey"',
    "new row violates row-level security policy for table \"wallets\"",
    "permission denied for function rate_limit_check",
    "invalid input syntax for type uuid: \"nope\"",
    "JWT expired",
    "Failed to fetch",
  ]) {
    assert.equal(userFacingErrorMessage(new Error(m), fb), fb, m);
  }
});

// The opposite mistake would be worse than the fault: our own refusals
// are written for people and are exactly what somebody needs to read.
test("a sentence we wrote ourselves is passed through", () => {
  const fb = "Something went wrong.";
  for (const m of [
    "This top-up was updated by someone else. Reload and retry.",
    "There is no active exchange rate, so a non-USD top-up cannot be converted.",
    "A paid commission can't be set back to unpaid.",
    "Not enough balance — top up before requesting.",
  ]) {
    assert.equal(userFacingErrorMessage(new Error(m), fb), m);
  }
});

test("nothing useful falls back", () => {
  const fb = "Couldn't load that.";
  assert.equal(userFacingErrorMessage(null, fb), fb);
  assert.equal(userFacingErrorMessage(undefined, fb), fb);
  assert.equal(userFacingErrorMessage({}, fb), fb);
  assert.equal(userFacingErrorMessage(new Error(""), fb), fb);
  // A bare uuid is not a sentence anybody can act on.
  assert.equal(
    userFacingErrorMessage(
      new Error("row 7f4a1b2c-1111-2222-3333-444455556666 failed"),
      fb,
    ),
    fb,
  );
});
