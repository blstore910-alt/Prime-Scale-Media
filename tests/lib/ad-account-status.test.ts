import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  AD_ACCOUNT_STATUS_CHOICES,
  INACTIVE_AFTER_DAYS,
  adAccountStatusView,
} from "../../lib/ad-account-status";

const NOW = Date.parse("2026-09-17T12:00:00Z");
const daysAgo = (n: number) =>
  new Date(NOW - n * 86_400_000).toISOString();

test("an account topped up this month is active", () => {
  const v = adAccountStatusView("active", daysAgo(3), daysAgo(200), NOW);
  assert.equal(v.key, "active");
  assert.equal(v.label, "Active");
  assert.equal(v.derived, false);
});

test("active plus no top-up for 30 days reads as inactive", () => {
  const v = adAccountStatusView("active", daysAgo(31), daysAgo(200), NOW);
  assert.equal(v.key, "inactive");
  assert.equal(v.derived, true);
  assert.match(v.why, /30 days/);
});

test("the boundary day itself still counts as active", () => {
  // Exactly 30 days is inside the window: the rule is "no top-up IN 30
  // days", so the day that is 30 days old is the last one that counts.
  const v = adAccountStatusView(
    "active",
    new Date(NOW - INACTIVE_AFTER_DAYS * 86_400_000 + 1000).toISOString(),
    daysAgo(200),
    NOW,
  );
  assert.equal(v.key, "active");
});

test("a brand-new account with no top-ups is not inactive", () => {
  // Otherwise every account is born inactive, which would have the desk
  // chasing accounts that were created an hour ago.
  const v = adAccountStatusView("active", null, daysAgo(2), NOW);
  assert.equal(v.key, "active");
});

test("never topped up and open for months does read as inactive", () => {
  const v = adAccountStatusView("active", null, daysAgo(120), NOW);
  assert.equal(v.key, "inactive");
  assert.match(v.why, /Never topped up/);
});

test("banned stays banned however long ago it was touched", () => {
  // The 30-day rule must never overwrite a decision somebody made: a
  // banned account showing "Inactive" hides WHY it stopped.
  const v = adAccountStatusView("banned", daysAgo(400), daysAgo(500), NOW);
  assert.equal(v.key, "banned");
  assert.equal(v.label, "Banned");
  assert.equal(v.tone, "due");
  assert.equal(v.derived, false);
});

test("disabled is its own state, not the absence of active", () => {
  const v = adAccountStatusView("disabled", null, daysAgo(500), NOW);
  assert.equal(v.label, "Disabled");
  assert.equal(v.tone, "due");
});

test("the values the supplier sync writes keep their own names", () => {
  assert.equal(adAccountStatusView("paused", null, null, NOW).label, "Paused");
  assert.equal(
    adAccountStatusView("suspended", null, null, NOW).label,
    "Suspended",
  );
  assert.equal(
    adAccountStatusView("pending", null, null, NOW).label,
    "Pending",
  );
});

test("an unknown status is shown, not swallowed", () => {
  const v = adAccountStatusView("weird_new_thing", null, null, NOW);
  assert.equal(v.label, "Weird_new_thing");
  assert.equal(v.tone, "muted");
});

test("a row with no status at all says so", () => {
  const v = adAccountStatusView(null, null, null, NOW);
  assert.equal(v.label, "Unknown");
  assert.match(v.why, /no status/);
});

test("a bad date never turns into a wrong verdict", () => {
  // Date.parse returns NaN; the account must fall back to what the row
  // says rather than silently reading inactive.
  const v = adAccountStatusView("active", "not-a-date", "also-not", NOW);
  assert.equal(v.key, "active");
});

test("the menu offers exactly the three an admin may choose", () => {
  assert.deepEqual(
    AD_ACCOUNT_STATUS_CHOICES.map((c) => c.value),
    ["active", "disabled", "banned"],
  );
});
