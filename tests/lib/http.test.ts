import { test } from "node:test";
import { strict as assert } from "node:assert";
import { safeErrorMessage } from "../../lib/pure-error.ts";

test("safeErrorMessage unwraps Error.message", () => {
  assert.equal(safeErrorMessage(new Error("boom")), "boom");
});

test("safeErrorMessage returns string input directly", () => {
  assert.equal(safeErrorMessage("nope"), "nope");
});

test("safeErrorMessage reads .message from plain objects", () => {
  assert.equal(safeErrorMessage({ message: "hi", details: "secret" }), "hi");
});

test("safeErrorMessage falls back to 'unknown error' for weird shapes", () => {
  assert.equal(safeErrorMessage(null), "unknown error");
  assert.equal(safeErrorMessage(undefined), "unknown error");
  assert.equal(safeErrorMessage({ foo: "bar" }), "unknown error");
  assert.equal(safeErrorMessage(42), "unknown error");
});

test("safeErrorMessage doesn't leak Supabase-style details", () => {
  const supabaseError = {
    code: "23505",
    message: "duplicate key",
    details: "Key (email)=(secret@example.com) already exists.",
    hint: null,
  };
  const scrubbed = safeErrorMessage(supabaseError);
  assert.equal(scrubbed, "duplicate key");
  assert.ok(!scrubbed.includes("secret@example.com"));
});
