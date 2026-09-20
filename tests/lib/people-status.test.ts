import test from "node:test";
import assert from "node:assert/strict";
import {
  peopleStatusView,
  planStatusLabel,
} from "../../lib/pure-people-status.ts";

test("active is active", () => {
  assert.deepEqual(peopleStatusView("active", true), {
    label: "Active",
    tone: "ok",
    cls: "badge ok",
  });
});

test("either column saying off means off", () => {
  // The two columns disagree on live rows; off has to win.
  assert.equal(peopleStatusView("active", false).label, "Inactive");
  assert.equal(peopleStatusView("inactive", true).label, "Inactive");
  assert.equal(peopleStatusView("disabled", null).label, "Inactive");
});

test("casing and padding do not change the answer", () => {
  assert.equal(peopleStatusView("  ACTIVE ", null).label, "Active");
  assert.equal(peopleStatusView("Inactive", null).label, "Inactive");
});

test("knowing nothing prints a dash, not a claim", () => {
  assert.equal(peopleStatusView(null, null).label, "\u2014");
  assert.equal(peopleStatusView("", undefined).label, "\u2014");
  assert.equal(peopleStatusView(undefined, undefined).cls, "badge muted");
});

test("an unknown word is not treated as permission", () => {
  assert.equal(peopleStatusView("pending_review", null).label, "\u2014");
});

test("one pill class per state, so no screen can invent its own", () => {
  const seen = new Set(
    [
      peopleStatusView("active", true),
      peopleStatusView("inactive", false),
      peopleStatusView(null, null),
    ].map((v) => v.cls),
  );
  assert.equal(seen.size, 3);
});

test("a plan's status never prints the bare word 'Inactive'", () => {
  assert.equal(planStatusLabel("inactive"), "Plan stopped");
  assert.equal(planStatusLabel("paused"), "Plan paused");
  assert.equal(planStatusLabel("past_due"), "Plan overdue");
  // An ordinary plan says nothing at all.
  assert.equal(planStatusLabel("active"), null);
  assert.equal(planStatusLabel(null), null);
});

test("an unknown plan status is still prefixed, never bare", () => {
  const out = planStatusLabel("awaiting_setup");
  assert.equal(out, "Plan awaiting setup");
  assert.ok(out!.startsWith("Plan "));
});
