// ── THIS FILE IS A SUMMARY, NOT A GATE ──────────────────────────────
//
// It used to say "Every guard in server actions and API routes MUST
// consult one of the helpers here. Never hand-roll a role check." That
// was never true and is now actively dangerous: `can()` has no callers
// outside its own test, and two of the entries below were WRONG —
// exchange rates and the top-up fee were listed as employee-level and
// have been owner-only for weeks.
//
// A file that tells the next person to trust it, that nothing uses,
// and that is wrong, is worse than no file. So it says what it is.
//
// ── WHERE THE REAL GATE IS ──────────────────────────────────────────
//
//   actions/_shared.ts      resolveOwnerContext()    owners only
//                           resolveCapability(name)  owner, or granted
//                           resolveAdminContext()    admin, and the
//                                                    read-only check
//   lib/auth/is-tenant-owner.ts   the ONE ownership test
//   lib/capabilities.ts     the sixteen toggles an owner can hand out
//   the database            _is_super_admin_of, _in_owner_set,
//                           has_capability, and the RLS policies
//
// Four places, and all four are consulted for real. This file is the
// human-readable shape of the same thing, kept because a list of what
// each tier may do is worth reading — and kept HONEST, which means
// changing it when the answer changes.
//
// ── TWO TIERS, AND ONE THING THAT MOVED ─────────────────────────────
//
//   - owner: there can be MORE THAN ONE (plak 143 — the owner has a
//     business partner). It is no longer `tenants.owner_id === you`;
//     it is membership of `tenant_owners`, which needs a database
//     read. That is why `isSuperAdmin` below cannot be the real test
//     any more, and says so.
//   - admin: employee-level day-to-day ops, plus whatever an owner has
//     granted by name — and minus everything, if an owner has set the
//     account to read-only.
//
// Advertiser / affiliate are end-user roles, not administrative.

export type Role = "super_admin" | "admin" | "advertiser" | "affiliate";

// Actions a super-admin has that a plain admin does not.
export const SUPER_ADMIN_ONLY = [
  "wallet_balance_write",      // credit/debit a wallet outside the normal topup flow
  "admin_user_manage",         // invite / demote / remove other admins
  "affiliate_commission_rate", // change % / fixed commission paid to an affiliate
  "integration_credentials",   // rotate Supplier 1 / Wise / any external-API secret
  "audit_events_view",         // read the append-only audit log
  "maintenance_mode_toggle",   // put the app in read-only mode
  "tenant_settings_write",     // rename tenant, change owner, GDPR bulk actions
  "gdpr_export_erase",         // export or delete another user's data
  // Measured 29-09: both of these are owner-only and have been for
  // weeks. They sat in the employee list below, which is exactly the
  // kind of wrong that a file nobody calls stays wrong in.
  "exchange_rate_write",       // the FX rate every conversion divides by
  "topup_fee_write",           // the default fee on funding an ad account
] as const;

// Actions any admin (super or plain) can do.
export const ADMIN_CAPABILITIES = [
  "advertiser_manage",         // create/edit advertisers, companies, billing
  "ad_account_request_review", // approve/reject requests
  "ad_account_write",          // edit ad accounts in the pool, assign to advertisers
  "wallet_topup_verify",       // mark a customer top-up as received
  "invoice_issue",             // create/void manual invoices
  "invoice_view",              // read all invoices
  "affiliate_user_manage",     // create/edit affiliate profiles (NOT commission %)
  "referral_link_manage",      // generate/revoke referral links
  "user_invite",               // invite new advertisers/affiliates (NOT admins)
] as const;

export type SuperAdminAction = (typeof SUPER_ADMIN_ONLY)[number];
export type AdminAction = (typeof ADMIN_CAPABILITIES)[number];
export type Capability = SuperAdminAction | AdminAction;

/**
 * ⚠ THIS ONLY KNOWS THE FIRST OWNER.
 *
 * There can be more than one (plak 143), and the others live in
 * `tenant_owners` — which needs a database read, so a pure function
 * cannot answer the question any more.
 *
 * It is kept because it is pure and testable and still answers "is
 * this the owner named on the tenant row", which a couple of places
 * legitimately want. It must NOT be used to decide access: use
 * `isTenantOwner` from lib/auth/is-tenant-owner.ts, or the
 * `isSuperAdmin` flag on the app context, both of which consult the
 * list.
 *
 * `ownerIds` is optional and folds the list in when the caller
 * happens to have it, so the pure path and the real one can agree.
 */
export function isSuperAdmin(args: {
  role: string | null | undefined;
  userId: string | null | undefined;
  tenantOwnerId: string | null | undefined;
  ownerIds?: readonly (string | null | undefined)[];
}): boolean {
  if (args.role !== "admin") return false;
  if (!args.userId) return false;
  if (args.tenantOwnerId && args.userId === args.tenantOwnerId) return true;
  return (args.ownerIds ?? []).includes(args.userId);
}

export function can(
  args: {
    role: string | null | undefined;
    userId: string | null | undefined;
    tenantOwnerId: string | null | undefined;
  },
  action: Capability,
): boolean {
  const superFlag = isSuperAdmin(args);

  if ((SUPER_ADMIN_ONLY as readonly string[]).includes(action)) {
    return superFlag;
  }
  if ((ADMIN_CAPABILITIES as readonly string[]).includes(action)) {
    return args.role === "admin";
  }
  return false;
}
