import test from "node:test";
import assert from "node:assert/strict";

import {
  NOTIFICATION_GROUPS,
  catalogForRole,
  groupsForRole,
} from "../../lib/notification-catalog";

/**
 * The settings screen offers five switches instead of twenty-four, and
 * that only stays honest if the grouping covers everything.
 *
 * The failure this guards is silent: add a notification type, forget the
 * group, and the customer has no way to switch it off — the switch does
 * not error, it simply is not there. `groupsForRole` sweeps the leftovers
 * into "Everything else" so that cannot happen, and this test makes sure
 * that safety net is never the thing doing the work.
 */
test("every customer notification type sits in a named group", () => {
  const named = new Set(NOTIFICATION_GROUPS.flatMap((g) => g.types));
  const missing = catalogForRole("advertiser")
    .map((e) => String(e.type))
    .filter((t) => !named.has(t));
  assert.deepEqual(
    missing,
    [],
    `these types have no group, so they would land in "Everything else": ${missing.join(", ")}`,
  );
});

test("no type is claimed by two groups", () => {
  const seen = new Set<string>();
  const twice: string[] = [];
  for (const g of NOTIFICATION_GROUPS) {
    for (const t of g.types) {
      if (seen.has(t)) twice.push(t);
      seen.add(t);
    }
  }
  assert.deepEqual(twice, [], `claimed twice: ${twice.join(", ")}`);
});

test("the groups a customer sees hold every switch they used to have", () => {
  const flat = catalogForRole("advertiser").map((e) => String(e.type)).sort();
  const grouped = groupsForRole("advertiser")
    .flatMap((g) => g.entries.map((e) => String(e.type)))
    .sort();
  assert.deepEqual(grouped, flat);
});

test("a group with nothing in it for this role is not shown", () => {
  for (const g of groupsForRole("advertiser")) {
    assert.ok(g.entries.length > 0, `${g.id} is empty`);
  }
});
