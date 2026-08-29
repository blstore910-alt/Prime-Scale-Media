import { test } from "node:test";
import assert from "node:assert/strict";
import { versionMatches } from "../../actions/_shared.ts";

test("versionMatches — skip when caller sends no version", () => {
  assert.equal(versionMatches("2026-01-01T00:00:00Z", undefined), true);
  assert.equal(versionMatches("2026-01-01T00:00:00Z", null), true);
});

test("versionMatches — skip when server has no version yet", () => {
  assert.equal(versionMatches(null, "2026-01-01T00:00:00Z"), true);
  assert.equal(versionMatches(undefined, "2026-01-01T00:00:00Z"), true);
});

test("versionMatches — exact match passes", () => {
  const t = "2026-08-29T12:34:56.789Z";
  assert.equal(versionMatches(t, t), true);
});

test("versionMatches — sub-second precision difference passes", () => {
  // Postgres returns ISO with microseconds; JS parses to ms — same instant.
  const server = "2026-08-29T12:34:56.789+00:00";
  const client = "2026-08-29T12:34:56.789Z";
  assert.equal(versionMatches(server, client), true);
});

test("versionMatches — different timestamps refuse", () => {
  assert.equal(
    versionMatches("2026-08-29T12:34:56.789Z", "2026-08-29T12:34:56.790Z"),
    false,
  );
});

test("versionMatches — one second later refuses", () => {
  assert.equal(
    versionMatches("2026-08-29T12:34:57Z", "2026-08-29T12:34:56Z"),
    false,
  );
});

test("versionMatches — malformed client version refuses safely", () => {
  assert.equal(versionMatches("2026-08-29T12:34:56Z", "not-a-date"), false);
});
