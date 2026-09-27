import test from "node:test";
import assert from "node:assert/strict";

import {
  BM_ID_MAX,
  formatBmIds,
  parseBmIds,
  primaryBmId,
  validateBmIds,
} from "../../lib/pure-bm-ids";

test("a bare string still reads — every row written before today", () => {
  assert.deepEqual(parseBmIds("1234567890"), ["1234567890"]);
  assert.equal(primaryBmId("1234567890"), "1234567890");
  assert.equal(formatBmIds("1234567890"), "1234567890");
});

test("a list reads as a list", () => {
  assert.deepEqual(parseBmIds(["111", "222", "333"]), ["111", "222", "333"]);
  assert.equal(formatBmIds(["111", "222"]), "111, 222");
});

test("the account takes the FIRST one, and never NaN", () => {
  // toBmId did Number(["111","222"]) -> NaN -> null, so the account was
  // created with no business manager at all and a success toast.
  assert.equal(primaryBmId(["111", "222"]), "111");
  assert.equal(primaryBmId([]), null);
  assert.equal(primaryBmId(null), null);
  assert.equal(primaryBmId(""), null);
});

test("a number is a string here — old rows stored it numerically", () => {
  assert.deepEqual(parseBmIds(1234567890), ["1234567890"]);
  assert.equal(primaryBmId(1234567890), "1234567890");
});

test("people paste lists, so separators are honoured", () => {
  assert.deepEqual(parseBmIds("111, 222 ; 333"), ["111", "222", "333"]);
  assert.deepEqual(parseBmIds("111\n222"), ["111", "222"]);
});

test("blanks and duplicates are dropped, order is kept", () => {
  assert.deepEqual(parseBmIds(["111", "", "  ", "111", "222"]), ["111", "222"]);
});

test("nothing renders as an em dash, never as an empty cell", () => {
  assert.equal(formatBmIds(null), "—");
  assert.equal(formatBmIds([]), "—");
  assert.equal(formatBmIds("   "), "—");
});

test("at least one is required", () => {
  const r = validateBmIds("");
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /at least one/i);
});

test("at most five, and the sixth is refused rather than dropped", () => {
  const six = ["1", "2", "3", "4", "5", "6"];
  const r = validateBmIds(six);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /6/);
  // Exactly five is fine.
  assert.equal(validateBmIds(["1", "2", "3", "4", "5"]).ok, true);
  // And the parser never hands back more than the cap either way.
  assert.equal(parseBmIds(six).length, BM_ID_MAX);
});

test("an implausible id is refused", () => {
  const r = validateBmIds("x".repeat(65));
  assert.equal(r.ok, false);
});

test("a single valid id passes end to end", () => {
  const r = validateBmIds("1234567890");
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.ids, ["1234567890"]);
});
