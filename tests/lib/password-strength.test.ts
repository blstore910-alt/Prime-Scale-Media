import { test } from "node:test";
import assert from "node:assert/strict";
import { scorePassword } from "../../lib/password-strength.ts";

test("scorePassword — empty is 0 / Very weak", () => {
  const r = scorePassword("");
  assert.equal(r.score, 0);
  assert.equal(r.label, "Very weak");
});

test("scorePassword — short lowercase-only is Very weak", () => {
  const r = scorePassword("abc");
  assert.ok(r.score <= 1);
});

test("scorePassword — 12-char lowercase gets some credit", () => {
  // avoid "abcdef" which is on the common list
  const r = scorePassword("kraymnzvbouq");
  assert.ok(r.score >= 1 && r.score <= 2, `got ${r.score}`);
});

test("scorePassword — 16-char mixed classes scores Good+", () => {
  const r = scorePassword("MyLongPass1234!!");
  assert.ok(r.score >= 4, `got ${r.score}`);
});

test("scorePassword — 20-char full-variety scores Very strong", () => {
  // avoid "12345" which is on the common list
  const r = scorePassword("MyStrongPass9876$@#!K");
  assert.equal(r.score, 5);
});

test("scorePassword — long repeats are penalised", () => {
  const r = scorePassword("MyPass1111!!!!!!!!!");
  assert.ok(r.reasons.some((s) => /run|repeat|same/i.test(s)));
});

test("scorePassword — contains 'password' is penalised", () => {
  const r = scorePassword("MySuperPassword123!");
  assert.ok(
    r.reasons.some((s) => /common|password/i.test(s)),
    "expected common-word reason",
  );
});

test("scorePassword — product name 'psm-media-scale' penalised", () => {
  const r = scorePassword("prime-scale-media-12345!");
  assert.ok(
    r.reasons.some((s) => /product|common/i.test(s)),
    "expected product-name reason",
  );
});
