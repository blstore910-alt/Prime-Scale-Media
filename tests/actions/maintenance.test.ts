import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  isMaintenanceMode,
  maintenanceGuard,
} from "../../actions/_shared.ts";

const original = process.env.MAINTENANCE_MODE;

beforeEach(() => {
  delete process.env.MAINTENANCE_MODE;
});
afterEach(() => {
  if (original === undefined) delete process.env.MAINTENANCE_MODE;
  else process.env.MAINTENANCE_MODE = original;
});

test("isMaintenanceMode — false when unset", () => {
  assert.equal(isMaintenanceMode(), false);
});

test("isMaintenanceMode — false for random values", () => {
  process.env.MAINTENANCE_MODE = "maybe";
  assert.equal(isMaintenanceMode(), false);
});

test("isMaintenanceMode — accepts true/1/yes/on (case-insensitive)", () => {
  for (const v of ["true", "TRUE", "1", "yes", "on", "On"]) {
    process.env.MAINTENANCE_MODE = v;
    assert.equal(isMaintenanceMode(), true, `expected true for ${v}`);
  }
});

test("maintenanceGuard — ok when off", () => {
  const r = maintenanceGuard();
  assert.equal(r.ok, true);
});

test("maintenanceGuard — refuses when on", () => {
  process.env.MAINTENANCE_MODE = "true";
  const r = maintenanceGuard();
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.code, "forbidden");
    assert.match(r.error, /maintenance/i);
  }
});
