import { test } from "node:test";
import assert from "node:assert/strict";

// Mirrors the cutoff computation used inside useAuditEvents when
// the `sinceMinutes` param is set. Frozen here so a future rewrite
// (e.g. switching to a server-side computation) doesn't drift.
function sinceCutoff(sinceMinutes: number, now = Date.now()): string {
  return new Date(now - sinceMinutes * 60_000).toISOString();
}

test("sinceCutoff — 60 min ago returns ISO exactly 3600 s in the past", () => {
  const now = new Date("2026-08-30T12:00:00Z").getTime();
  const cutoff = sinceCutoff(60, now);
  assert.equal(cutoff, "2026-08-30T11:00:00.000Z");
});

test("sinceCutoff — 15 min ago", () => {
  const now = new Date("2026-08-30T12:00:00Z").getTime();
  const cutoff = sinceCutoff(15, now);
  assert.equal(cutoff, "2026-08-30T11:45:00.000Z");
});

test("sinceCutoff — 24 h ago", () => {
  const now = new Date("2026-08-30T12:00:00Z").getTime();
  const cutoff = sinceCutoff(1440, now);
  assert.equal(cutoff, "2026-08-29T12:00:00.000Z");
});

test("sinceCutoff — 7 days ago", () => {
  const now = new Date("2026-08-30T12:00:00Z").getTime();
  const cutoff = sinceCutoff(10_080, now);
  assert.equal(cutoff, "2026-08-23T12:00:00.000Z");
});

test("sinceCutoff — output is always ISO", () => {
  const cutoff = sinceCutoff(60);
  assert.match(cutoff, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
});
