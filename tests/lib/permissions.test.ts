import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  can,
  isSuperAdmin,
  ADMIN_CAPABILITIES,
  SUPER_ADMIN_ONLY,
} from "../../lib/permissions.ts";

const superCtx = {
  role: "admin",
  userId: "u-owner",
  tenantOwnerId: "u-owner",
};
const employeeCtx = {
  role: "admin",
  userId: "u-employee",
  tenantOwnerId: "u-owner",
};
const advertiserCtx = {
  role: "advertiser",
  userId: "u-adv",
  tenantOwnerId: "u-owner",
};
const nullCtx = {
  role: null,
  userId: null,
  tenantOwnerId: null,
};

describe("isSuperAdmin", () => {
  it("returns true only for admin whose user_id matches tenant owner_id", () => {
    assert.equal(isSuperAdmin(superCtx), true);
    assert.equal(isSuperAdmin(employeeCtx), false);
    assert.equal(isSuperAdmin(advertiserCtx), false);
    assert.equal(isSuperAdmin(nullCtx), false);
  });

  it("refuses when either id is missing even for admin role", () => {
    assert.equal(
      isSuperAdmin({ role: "admin", userId: "u", tenantOwnerId: null }),
      false,
    );
    assert.equal(
      isSuperAdmin({ role: "admin", userId: null, tenantOwnerId: "u" }),
      false,
    );
  });
});

describe("can", () => {
  it("super-admin passes every super-admin-only action", () => {
    for (const action of SUPER_ADMIN_ONLY) {
      assert.equal(can(superCtx, action), true, action);
    }
  });

  it("plain admin fails every super-admin-only action", () => {
    for (const action of SUPER_ADMIN_ONLY) {
      assert.equal(can(employeeCtx, action), false, action);
    }
  });

  it("plain admin passes every generic admin capability", () => {
    for (const action of ADMIN_CAPABILITIES) {
      assert.equal(can(employeeCtx, action), true, action);
    }
  });

  it("super-admin also passes every generic admin capability", () => {
    for (const action of ADMIN_CAPABILITIES) {
      assert.equal(can(superCtx, action), true, action);
    }
  });

  it("advertiser fails every administrative action", () => {
    for (const action of [...ADMIN_CAPABILITIES, ...SUPER_ADMIN_ONLY]) {
      assert.equal(can(advertiserCtx, action), false, action);
    }
  });
});
