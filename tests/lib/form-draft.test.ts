import { test } from "node:test";
import assert from "node:assert/strict";
import { debounced } from "../../lib/form-draft.ts";

test("debounced — only fires the last call within the window", async () => {
  let calls = 0;
  const fn = debounced(() => {
    calls += 1;
  }, 20);
  fn();
  fn();
  fn();
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(calls, 1);
});

test("debounced — waits at least the delay before firing", async () => {
  let firedAt = 0;
  const start = Date.now();
  const fn = debounced(() => {
    firedAt = Date.now();
  }, 30);
  fn();
  await new Promise((r) => setTimeout(r, 50));
  assert.ok(firedAt - start >= 25);
});

test("debounced — cancel prevents the pending call", async () => {
  let calls = 0;
  const fn = debounced(() => {
    calls += 1;
  }, 20);
  fn();
  fn.cancel();
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(calls, 0);
});

test("debounced — multiple bursts each fire once", async () => {
  let calls = 0;
  const fn = debounced(() => {
    calls += 1;
  }, 15);
  fn();
  await new Promise((r) => setTimeout(r, 30));
  fn();
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(calls, 2);
});
