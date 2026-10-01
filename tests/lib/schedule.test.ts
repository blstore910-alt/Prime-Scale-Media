import { strict as assert } from "node:assert";
import { test } from "node:test";
import { autoFill, blocks, onNow, weekStart, weekDays, isoWeekday } from "../../lib/pure-schedule";

test("de week begint op maandag", () => {
  assert.equal(weekStart("2026-10-01"), "2026-09-28"); // donderdag -> maandag
  assert.equal(weekStart("2026-09-28"), "2026-09-28");
  assert.equal(weekStart("2026-10-04"), "2026-09-28"); // zondag
  assert.equal(isoWeekday("2026-10-04"), 7);
  assert.equal(weekDays("2026-09-28").length, 7);
});

test("09:00-21:00 valt in ochtend tot 15:00 en laat vanaf 15:00", () => {
  const b = blocks("09:00", "21:00");
  assert.deepEqual(b.morning, { start: "09:00", end: "15:00" });
  assert.deepEqual(b.late, { start: "15:00", end: "21:00" });
});

test("twee admins: ochtend en laat elke werkdag, eerlijk verdeeld, max dagen gerespecteerd", () => {
  const r = autoFill({
    monday: "2026-10-05",
    prefs: [
      { profileId: "a", days: [1, 2, 3, 4, 5], block: "morning", maxDays: 5 },
      { profileId: "b", days: [1, 2, 3, 4, 5, 6], block: "late", maxDays: 4 },
    ],
    existing: [],
    coverageStart: "09:00",
    coverageEnd: "21:00",
  });
  const a = r.shifts.filter((s) => s.profileId === "a");
  const b = r.shifts.filter((s) => s.profileId === "b");
  assert.equal(a.length, 5);
  assert.ok(a.every((s) => s.start === "09:00"));
  assert.equal(b.length, 4);
  assert.ok(b.every((s) => s.start === "15:00"));
  // zondag kan niemand: beide blokken open
  assert.ok(r.gaps.some((g) => g.day === "2026-10-11" && g.block === "morning"));
});

test("vastgezette dagen en dagen met een dienst blijven af", () => {
  const r = autoFill({
    monday: "2026-10-05",
    prefs: [{ profileId: "a", days: [1, 2, 3, 4, 5, 6, 7], block: "full", maxDays: 7 }],
    existing: [{ profileId: "x", day: "2026-10-08", start: "10:00", end: "12:00" }],
    coverageStart: "09:00",
    coverageEnd: "21:00",
    lockedUntil: "2026-10-06",
  });
  const dagen = r.shifts.map((s) => s.day);
  assert.ok(!dagen.includes("2026-10-05"));
  assert.ok(!dagen.includes("2026-10-06"));
  assert.ok(!dagen.includes("2026-10-08"));
  assert.ok(dagen.includes("2026-10-07"));
  assert.ok(r.shifts.every((s) => s.start === "09:00" && s.end === "21:00"));
});

test("wie heeft er nu dienst", () => {
  const s = [
    { profileId: "a", day: "2026-10-01", start: "09:00", end: "15:00" },
    { profileId: "b", day: "2026-10-01", start: "15:00", end: "21:00" },
  ];
  assert.deepEqual(onNow(s, "2026-10-01", "14:59").map((x) => x.profileId), ["a"]);
  assert.deepEqual(onNow(s, "2026-10-01", "15:00").map((x) => x.profileId), ["b"]);
  assert.deepEqual(onNow(s, "2026-10-02", "10:00"), []);
});
