// Central permission matrix.
//
// Two admin tiers:
//   - super_admin: tenant owner (tenants.owner_id === user.id).
//     Structural + financial authority: manages other admins, rotates
//     API credentials, sets commission rates paid to affiliates,
//     changes wallet balances directly.
//   - admin: employee-level. Runs day-to-day ops: approves ad-account
//     requests, verifies wallet top-ups from customers, edits topup
//     fees per platform, issues manual invoices, manages advertisers
//     and their companies.
//
// Advertiser / affiliate are end-user roles, not administrative.
//
// Every guard in server actions and API routes MUST consult one of
// the helpers here. Never hand-roll a role check — future adds land
// here and become visible instead of scattered.

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
] as const;

// Actions any admin (super or plain) can do.
export const ADMIN_CAPABILITIES = [
  "advertiser_manage",         // create/edit advertisers, companies, billing
  "ad_account_request_review", // approve/reject requests
  "ad_account_write",          // edit ad accounts in the pool, assign to advertisers
  "wallet_topup_verify",       // mark a customer top-up as received
  "invoice_issue",             // create/void manual invoices
  "invoice_view",              // read all invoices
  "topup_fee_write",           // change default fee per platform/type
  "affiliate_user_manage",     // create/edit affiliate profiles (NOT commission %)
  "referral_link_manage",      // generate/revoke referral links
  "exchange_rate_write",       // adjust FX rates
  "user_invite",               // invite new advertisers/affiliates (NOT admins)
] as const;

export type SuperAdminAction = (typeof SUPER_ADMIN_ONLY)[number];
export type AdminAction = (typeof ADMIN_CAPABILITIES)[number];
export type Capability = SuperAdminAction | AdminAction;

// A profile is a super-admin when it owns its tenant. Kept as a
// derived flag rather than a stored role so ownership transfer stays
// a single UPDATE on tenants.owner_id.
export function isSuperAdmin(args: {
  role: string | null | undefined;
  userId: string | null | undefined;
  tenantOwnerId: string | null | undefined;
}): boolean {
  if (args.role !== "admin") return false;
  if (!args.userId || !args.tenantOwnerId) return false;
  return args.userId === args.tenantOwnerId;
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
