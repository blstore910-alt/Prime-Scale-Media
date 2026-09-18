import test from "node:test";
import assert from "node:assert/strict";
import { pageAllRows } from "../../lib/page-all-rows.ts";

function pagesOf(total: number, pageSize: number) {
  const all = Array.from({ length: total }, (_, i) => ({ i }));
  return async (from: number, to: number) => ({
    data: all.slice(from, to + 1),
    error: null as { message: string } | null,
  });
}

test("a short first page is the whole answer", async () => {
  const r = await pageAllRows(pagesOf(7, 10), { pageSize: 10 });
  assert.equal(r.rows.length, 7);
  assert.equal(r.truncated, false);
  assert.equal(r.error, null);
});

// The exact case that made the dashboard understate: one more row than a
// full page, where an unpaged select returns the page and stops.
test("one past a full page is still counted", async () => {
  const r = await pageAllRows(pagesOf(1001, 1000), { pageSize: 1000 });
  assert.equal(r.rows.length, 1001);
  assert.equal(r.truncated, false);
});

test("an exact multiple does not lose the last page", async () => {
  const r = await pageAllRows(pagesOf(2000, 1000), { pageSize: 1000 });
  assert.equal(r.rows.length, 2000);
  assert.equal(r.truncated, false);
});

test("hitting the cap is reported, never silent", async () => {
  const r = await pageAllRows(pagesOf(50, 10), { pageSize: 10, maxPages: 2 });
  assert.equal(r.rows.length, 20);
  assert.equal(r.truncated, true);
});

test("an error stops the walk and is returned with what was read", async () => {
  let calls = 0;
  const r = await pageAllRows(
    async (from: number, to: number) => {
      calls += 1;
      if (calls === 2) return { data: null, error: { message: "boom" } };
      return {
        data: Array.from({ length: to - from + 1 }, (_, i) => ({ i })),
        error: null as { message: string } | null,
      };
    },
    { pageSize: 10 },
  );
  assert.equal(r.error, "boom");
  assert.equal(r.rows.length, 10);
});

test("no rows at all is an empty answer, not an error", async () => {
  const r = await pageAllRows(pagesOf(0, 10), { pageSize: 10 });
  assert.deepEqual(r.rows, []);
  assert.equal(r.error, null);
});
