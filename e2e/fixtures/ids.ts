// Fixed IDs and credentials the E2E fixture seeds. Kept in one file
// so every spec references the same constants — no magic strings
// scattered across tests.
//
// Change seed.sql AND this file together, or specs will look up rows
// that don't exist.

export const E2E_PASSWORD = "E2E-passw0rd!";

export const E2E_TENANT = {
  id: "11111111-1111-1111-1111-111111111111",
  slug: "psm-e2e",
  name: "PSM E2E Test",
};

export const E2E_USERS = {
  superAdmin: {
    userId: "22222222-2222-2222-2222-222222222222",
    profileId: "a2222222-2222-2222-2222-222222222222",
    email: "e2e-super@primescalemedia.test",
    label: "super-admin",
  },
  admin: {
    userId: "33333333-3333-3333-3333-333333333333",
    profileId: "a3333333-3333-3333-3333-333333333333",
    email: "e2e-admin@primescalemedia.test",
    label: "admin",
  },
  advertiser: {
    userId: "44444444-4444-4444-4444-444444444444",
    profileId: "a4444444-4444-4444-4444-444444444444",
    email: "e2e-adv@primescalemedia.test",
    label: "advertiser",
  },
  affiliate: {
    userId: "55555555-5555-5555-5555-555555555555",
    profileId: "a5555555-5555-5555-5555-555555555555",
    email: "e2e-aff@primescalemedia.test",
    label: "affiliate",
  },
} as const;

export type E2ERole = keyof typeof E2E_USERS;
