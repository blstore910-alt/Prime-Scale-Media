import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DISMISS_CAP,
  DISMISS_MAX_AGE_MS,
  isDismissed,
  parseDismissed,
  pruneDismissed,
  serialiseDismissed,
  withDismissed,
  withoutDismissed,
} from "../../lib/pure-dismissed";

const NOW = Date.UTC(2026, 8, 25);

test("a corrupt or absent value reads as nothing hidden", () => {
  for (const raw of [null, undefined, "", "not json", "[1,2]", '"text"', "42"]) {
    assert.deepEqual(parseDismissed(raw), {}, `raw: ${String(raw)}`);
  }
});

test("entries that are not a real timestamp are dropped, the rest survive", () => {
  const raw = JSON.stringify({
    good: NOW,
    alsoGood: String(NOW),
    nan: "later",
    zero: 0,
    negative: -5,
    nul: null,
  });
  assert.deepEqual(parseDismissed(raw), { good: NOW, alsoGood: NOW });
});

test("a round trip through storage keeps what was hidden", () => {
  const map = withDismissed(withDismissed({}, "a", NOW), "b", NOW + 1);
  const back = parseDismissed(serialiseDismissed(map));
  assert.ok(isDismissed(back, "a"));
  assert.ok(isDismissed(back, "b"));
  assert.ok(!isDismissed(back, "c"));
});

test("restoring one puts it back and leaves the others alone", () => {
  const map = withDismissed(withDismissed({}, "a", NOW), "b", NOW);
  const after = withoutDismissed(map, "a");
  assert.ok(!isDismissed(after, "a"));
  assert.ok(isDismissed(after, "b"));
  // and the original is untouched — the hook sets state from the result
  assert.ok(isDismissed(map, "a"));
});

test("an empty id cannot be hidden", () => {
  assert.deepEqual(withDismissed({}, "", NOW), {});
});

test("a dismissal ages out, so a card can never be hidden for ever", () => {
  const old = { stale: NOW - DISMISS_MAX_AGE_MS - 1, fresh: NOW - 1000 };
  assert.deepEqual(pruneDismissed(old, NOW), { fresh: NOW - 1000 });
});

test("the key cannot grow without bound, and it is the oldest that go", () => {
  const many: Record<string, number> = {};
  for (let i = 0; i < DISMISS_CAP + 25; i += 1) many[`id${i}`] = NOW - i;
  const pruned = pruneDismissed(many, NOW);
  assert.equal(Object.keys(pruned).length, DISMISS_CAP);
  assert.ok(isDismissed(pruned, "id0"), "the newest stayed");
  assert.ok(!isDismissed(pruned, `id${DISMISS_CAP + 24}`), "the oldest went");
});

/**
 * The fault this guards is the one the wallet statement already had
 * once: a read fails, the code treats the empty result as the truth,
 * and the screen states something false with confidence. Here the false
 * statement would be "you hid nothing" — every card the customer closed
 * comes back. Pruning must depend on the clock and nothing else.
 */
test("pruning never consults a list that a failed read could empty", () => {
  const map = withDismissed({}, "a", NOW);
  // Only `map` is required. Add a required `keepIds` and this is 2 --
  // which is the moment the fault above becomes possible again.
  assert.equal(pruneDismissed.length, 1);
  assert.deepEqual(pruneDismissed(map, NOW), map);
});
