"use server";

import { resolveAdminContext } from "./_shared";
import { getSupplier1Adapter } from "@/lib/integrations/supplier1";
import { getWiseAdapter } from "@/lib/integrations/wise";
import { autoPushGate } from "@/lib/integrations/autopush";

// A redacted connectivity summary — never the token, never raw rows.
export type IntegrationPing =
  | {
      ok: true;
      mode: string;
      count: number;
      sample: Record<string, string> | null;
      note?: string;
    }
  | { ok: false; mode: string; error: string };

// Settings → Integrations is super-admin-only in the UI, but a server action
// is directly invokable, so re-check the tenant owner here too (defence in
// depth — same lesson as the affiliate/commission actions).
async function requireOwner(): Promise<
  | { ok: true; ctx: Awaited<ReturnType<typeof resolveAdminContext>> }
  | { ok: false; error: string }
> {
  const ctx = await resolveAdminContext();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const { supabase, profile } = ctx.ctx;
  const { data: tenant } = await supabase
    .from("tenants")
    .select("owner_id")
    .eq("id", profile.tenant_id)
    .maybeSingle();
  if (!tenant || tenant.owner_id !== profile.user_id) {
    return { ok: false, error: "Forbidden (super-admin only)" };
  }
  return { ok: true, ctx };
}

export type AutoPushStatus = {
  armed: boolean;
  reason: string;
  mode: string;
  /** Number of push jobs currently waiting, if any are held. */
  held: number;
};

// Whether the app is allowed to fund ad accounts at the supplier by itself.
// Surfaced in Settings → Integrations so an owner can SEE the state of the
// money switch instead of inferring it from a deployment's env vars, and can
// see whether anything is queued behind it. Owner-only: the count is a
// business signal and the reason string names env vars.
export async function getAutoPushStatus(): Promise<
  AutoPushStatus | { error: string }
> {
  const guard = await requireOwner();
  if (!guard.ok) return { error: guard.error };

  const gate = autoPushGate();
  let held = 0;
  if (!guard.ctx.ok) return { error: "Forbidden" };
  const { supabase, profile } = guard.ctx.ctx;
  const { count } = await supabase
    .from("integration_jobs")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", profile.tenant_id)
    .eq("provider", "supplier1")
    .in("operation", ["push_topup", "push_withdraw"])
    .eq("status", "pending");
  held = count ?? 0;

  return { armed: gate.enabled, reason: gate.reason, mode: gate.mode, held };
}

export type SupplierAccountProbe =
  | {
      ok: true;
      mode: string;
      externalId: string;
      /** Per-account balance as the supplier reports it. */
      accountBalance: { balance_cents: number; currency: string } | null;
      accountBalanceError: string | null;
      /** Wallet-level figures, which DO distinguish gross from spendable. */
      wallet: {
        usd_balance: number;
        eur_balance: number;
        available_usd: number;
        available_eur: number;
      } | null;
      walletError: string | null;
      /** Our own reading of whether a tax reserve is in play. */
      note: string;
    }
  | { ok: false; mode: string; error: string };

// Read-only probe of ONE supplier ad account. Exists to answer a question we
// could not answer from the docs: the wallet balance explicitly separates
// gross from spendable-after-tax-reserve, but the per-account `current_balance`
// has no such split, so it is unknown whether it is before or after the DST
// reserve. Showing an advertiser a gross figure would tell them they can spend
// money they cannot.
//
// Read-only and owner-only: it calls the same GET endpoints the balance check
// already uses and writes nothing.
export async function probeSupplierAdAccount(
  externalId: string,
): Promise<SupplierAccountProbe> {
  const mode = (process.env.SUPPLIER1_MODE ?? "mock").toLowerCase();
  const guard = await requireOwner();
  if (!guard.ok) return { ok: false, mode, error: guard.error };

  const id = (externalId ?? "").trim();
  if (!id) return { ok: false, mode, error: "Enter the supplier's ad account id" };

  const adapter = getSupplier1Adapter();
  const [acct, wallet] = await Promise.all([
    adapter.getBalance(id),
    adapter.getWalletBalance(),
  ]);

  const reserveUsd = wallet.ok
    ? wallet.data.usd_balance - wallet.data.available_usd
    : 0;
  const reserveEur = wallet.ok
    ? wallet.data.eur_balance - wallet.data.available_eur
    : 0;
  const hasReserve = reserveUsd > 0.005 || reserveEur > 0.005;

  return {
    ok: true,
    mode,
    externalId: id,
    accountBalance: acct.ok ? acct.data : null,
    accountBalanceError: acct.ok ? null : acct.error,
    wallet: wallet.ok ? wallet.data : null,
    walletError: wallet.ok ? null : wallet.error,
    note: hasReserve
      ? `A tax reserve IS in play at wallet level (USD ${reserveUsd.toFixed(2)}, EUR ${reserveEur.toFixed(2)}). Compare this account's balance against the supplier's own dashboard for the same account: if they match, current_balance is GROSS and must have the reserve applied before an advertiser sees it.`
      : "No tax reserve reported at wallet level right now, so this run cannot tell gross from net. Re-run when a reserve exists.",
  };
}

// Calls the WIRED SeamX adapter (mock or live, per SUPPLIER1_MODE) and
// returns a small redacted summary so an owner can verify the connection
// on any deployment without reading logs.
export async function testSupplier1Connection(): Promise<IntegrationPing> {
  const mode = (process.env.SUPPLIER1_MODE ?? "mock").toLowerCase();
  const guard = await requireOwner();
  if (!guard.ok) return { ok: false, mode, error: guard.error };

  const adapter = getSupplier1Adapter();

  // Balance is the connectivity signal: it proves the key + host are good
  // WITHOUT depending on the ad-accounts listing, so a broken /adaccounts
  // endpoint can't mask a working credential.
  const bal = await adapter.getWalletBalance();
  if (!bal.ok) {
    return { ok: false, mode, error: `Balance check failed: ${bal.error}` };
  }

  // Credential works. Report the ad-accounts listing as a secondary note so
  // a server-side failure there is visible but doesn't fail the whole check.
  const accts = await adapter.listAdAccounts();
  const note = accts.ok
    ? `Ad accounts endpoint OK — ${accts.data.length} found.`
    : `Ad accounts endpoint FAILED: ${accts.error}`;

  return {
    ok: true,
    mode,
    count: accts.ok ? accts.data.length : 0,
    sample: {
      usd_balance: String(bal.data.usd_balance),
      eur_balance: String(bal.data.eur_balance),
    },
    note,
  };
}

// Wise connectivity via the incoming-transfers adapter. In live mode this
// exercises the real credential path; if only the webhook path is wired the
// poller reports that clearly rather than pretending to succeed.
export async function testWiseConnection(): Promise<IntegrationPing> {
  const mode = (process.env.WISE_MODE ?? "mock").toLowerCase();
  const guard = await requireOwner();
  if (!guard.ok) return { ok: false, mode, error: guard.error };

  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const res = await getWiseAdapter().listIncomingSince(since);
  if (!res.ok) return { ok: false, mode, error: res.error };
  const first = res.data[0];
  return {
    ok: true,
    mode,
    count: res.data.length,
    sample: first
      ? {
          external_id: first.external_id,
          currency: first.currency,
          status: first.status,
        }
      : null,
  };
}
