import { test } from "node:test";
import assert from "node:assert/strict";
import { safeErrorMessage } from "../../lib/pure-error.ts";

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
