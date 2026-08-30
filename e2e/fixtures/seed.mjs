// Node seed script for the E2E test fixture.
//
// Direct INSERTs into auth.users don't reliably produce a login-able
// account — modern Supabase auth expects a specific hash format and
// several defaulted token columns, and the SQL editor's `crypt()` call
// sometimes lands in the wrong schema. Using the Admin API side-steps
// all of that.
//
// This script:
//   1. Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from env
//   2. Creates the four fixed-UUID auth users via admin.createUser
//      (idempotent — 422 "already registered" is treated as success)
//   3. Everything else (tenant, profiles, advertisers, wallets,
//      affiliates) is done by the SQL script — this script only
//      handles the auth side that SQL cannot.
//
// Run:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node e2e/fixtures/seed.mjs

import { createClient } from "@supabase/supabase-js";

const URL =
  process.env.SUPABASE_URL ??
  process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !KEY) {
  console.error(
    "Missing env. Need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
  );
  process.exit(1);
}

const supabase = createClient(URL, KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const PASSWORD = "E2E-passw0rd!";

const USERS = [
  {
    id: "22222222-2222-2222-2222-222222222222",
    email: "e2e-super@primescalemedia.test",
    name: "E2E Super Admin",
  },
  {
    id: "33333333-3333-3333-3333-333333333333",
    email: "e2e-admin@primescalemedia.test",
    name: "E2E Admin",
  },
  {
    id: "44444444-4444-4444-4444-444444444444",
    email: "e2e-adv@primescalemedia.test",
    name: "E2E Advertiser",
  },
  {
    id: "55555555-5555-5555-5555-555555555555",
    email: "e2e-aff@primescalemedia.test",
    name: "E2E Affiliate",
  },
];

async function upsertUser({ id, email, name }) {
  // createUser has no id override — but adminApi.updateUserById by
  // id will 404 if the user does not exist. Strategy: list by email,
  // if present update (password reset + confirm), else create.
  const { data: existing, error: listErr } =
    await supabase.auth.admin.listUsers({ perPage: 200 });
  if (listErr) throw new Error(`listUsers: ${listErr.message}`);
  const match = existing.users.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase(),
  );

  if (match) {
    const { error } = await supabase.auth.admin.updateUserById(match.id, {
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: name },
    });
    if (error) throw new Error(`updateUser ${email}: ${error.message}`);
    return { id: match.id, action: "updated" };
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: name },
    // id override is supported by the Admin API on Supabase — send it
    // so downstream profile FKs line up with the seed SQL.
    id,
  });
  if (error) throw new Error(`createUser ${email}: ${error.message}`);
  return { id: data.user.id, action: "created" };
}

for (const u of USERS) {
  try {
    const res = await upsertUser(u);
    console.log(`${res.action.padEnd(7)}  ${u.email}  →  ${res.id}`);
  } catch (err) {
    console.error(`FAIL     ${u.email}: ${err.message}`);
    process.exitCode = 1;
  }
}
