import { test } from "node:test";
import assert from "node:assert/strict";

// Inline copy — the helper lives next to the component to keep the
// admins table self-contained. If we ever share it, extract to lib/.
function formatLastSeen(
  iso: string | null,
  now = Date.now(),
): { label: string; fresh: boolean } {
  if (!iso) return { label: "Never", fresh: false };
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return { label: "Never", fresh: false };
  const ageMinutes = (now - t) / 60000;
  if (ageMinutes < 6) return { label: "Active now", fresh: true };
  if (ageMinutes < 60)
    return { label: `${Math.round(ageMinutes)}m ago`, fresh: true };
  if (ageMinutes < 60 * 24)
    return { label: `${Math.round(ageMinutes / 60)}h ago`, fresh: false };
  return {
    label: `${Math.round(ageMinutes / 60 / 24)}d ago`,
    fresh: false,
  };
}

test("formatLastSeen — null returns Never", () => {
  const r = formatLastSeen(null);
  assert.equal(r.label, "Never");
  assert.equal(r.fresh, false);
});

test("formatLastSeen — malformed date returns Never", () => {
  const r = formatLastSeen("not-a-date");
  assert.equal(r.label, "Never");
});

test("formatLastSeen — under 6 min = Active now (fresh)", () => {
  const now = new Date("2026-08-29T12:00:00Z").getTime();
  const iso = new Date(now - 5 * 60000).toISOString();
  const r = formatLastSeen(iso, now);
  assert.equal(r.label, "Active now");
  assert.equal(r.fresh, true);
});

test("formatLastSeen — 30 min ago = 30m ago (fresh)", () => {
  const now = new Date("2026-08-29T12:00:00Z").getTime();
  const iso = new Date(now - 30 * 60000).toISOString();
  const r = formatLastSeen(iso, now);
  assert.equal(r.label, "30m ago");
  assert.equal(r.fresh, true);
});

test("formatLastSeen — 3h ago = 3h ago (not fresh)", () => {
  const now = new Date("2026-08-29T12:00:00Z").getTime();
  const iso = new Date(now - 3 * 3600 * 1000).toISOString();
  const r = formatLastSeen(iso, now);
  assert.equal(r.label, "3h ago");
  assert.equal(r.fresh, false);
});

test("formatLastSeen — 5d ago = 5d ago (not fresh)", () => {
  const now = new Date("2026-08-29T12:00:00Z").getTime();
  const iso = new Date(now - 5 * 86400 * 1000).toISOString();
  const r = formatLastSeen(iso, now);
  assert.equal(r.label, "5d ago");
  assert.equal(r.fresh, false);
});
