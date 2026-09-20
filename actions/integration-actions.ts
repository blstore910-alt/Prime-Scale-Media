"use server";

import { resolveAdminContext } from "./_shared";
import { getSupplier1Adapter } from "@/lib/integrations/supplier1";
import { getWiseAdapter } from "@/lib/integrations/wise";
import { autoPushGate, supplier1Mode } from "@/lib/integrations/autopush";

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
  /**
   * Push jobs that have EXHAUSTED their attempts.
   *
   * Nothing in app/, components/, actions/ or hooks/ read a `failed`
   * integration job -- integration_jobs had exactly one reader outside
   * the worker and it counted `pending` only. So: the customer's wallet
   * is already down EUR 10,000, the top-up is green in the queue, the
   * push burns five attempts against a supplier outage and lands on
   * `failed`, and the "N push jobs waiting" tile reads 0. The ad
   * account is never funded and no screen says so.
   */
  failed: number;
  /** When the newest failure happened, so "3 failed" has an age. */
  lastFailureAt: string | null;
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

  // ...and the ones that gave up. See the type above for what a 0 here
  // was hiding.
  const { data: failedRows, count: failedCount } = await supabase
    .from("integration_jobs")
    .select("finished_at", { count: "exact" })
    .eq("tenant_id", profile.tenant_id)
    .eq("provider", "supplier1")
    .in("operation", ["push_topup", "push_withdraw"])
    .eq("status", "failed")
    .order("finished_at", { ascending: false })
    .limit(1);
  const lastFailureAt =
    (failedRows?.[0] as { finished_at?: string | null } | undefined)
      ?.finished_at ?? null;

  return {
    armed: gate.enabled,
    reason: gate.reason,
    mode: gate.mode,
    held,
    failed: failedCount ?? 0,
    lastFailureAt,
  };
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
  const mode = supplier1Mode();
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

export type FeeReconRow = {
  adAccountId: string | null;
  externalId: string;
  name: string | null;
  /** What we have on record as the fee we pay. null = not recorded. */
  recordedPct: number | null;
  /** Effective fee actually charged, across the top-ups we could read. */
  actualPct: number | null;
  topupsChecked: number;
  /** Top-ups where the supplier reported no fee figure at all. */
  topupsWithoutFee: number;
  grossCents: number;
  feeCents: number;
  /** Set when recorded and actual disagree by more than the tolerance. */
  mismatch: string | null;
  error: string | null;
};

export type FeeReconResult =
  | {
      ok: true;
      mode: string;
      rows: FeeReconRow[];
      accountsChecked: number;
      accountsSkipped: number;
      note: string;
    }
  | { ok: false; mode: string; error: string };

// Compare the supplier fee we BELIEVE we pay against the fee actually charged.
// The supplier computes its own fee server-side, so ad_account_costs is a
// belief until it is checked — and the rate has not been the same for every
// account over time.
//
// Read-only. Bounded on purpose: it walks allocated supplier accounts and
// reads each one's top-up history, which is one request per account plus (when
// the listing omits the fee) one per top-up. The caps are reported back rather
// than silently applied, because "we checked everything" must not be a guess.
const RECON_MAX_ACCOUNTS = 40;

export async function reconcileSupplierFees(): Promise<FeeReconResult> {
  const mode = supplier1Mode();
  const guard = await requireOwner();
  if (!guard.ok) return { ok: false, mode, error: guard.error };
  if (!guard.ctx.ok) return { ok: false, mode, error: "Forbidden" };
  const { supabase, profile } = guard.ctx.ctx;

  const { data: pool, error: poolErr } = await supabase
    .from("supplier_ad_accounts")
    .select("external_id, name, ad_account_id, fee_percentage")
    .eq("tenant_id", profile.tenant_id)
    .eq("provider", "supplier1")
    .not("ad_account_id", "is", null)
    .limit(RECON_MAX_ACCOUNTS + 1);
  if (poolErr) return { ok: false, mode, error: poolErr.message };

  const all = (pool ?? []) as Array<{
    external_id: string;
    name: string | null;
    ad_account_id: string | null;
    fee_percentage: number | null;
  }>;
  const accounts = all.slice(0, RECON_MAX_ACCOUNTS);
  const skipped = Math.max(0, all.length - accounts.length);

  // What we have on record, from the admin-only cost table.
  const ids = accounts.map((a) => a.ad_account_id).filter(Boolean) as string[];
  const recorded = new Map<string, number | null>();
  if (ids.length) {
    const { data: costs } = await supabase
      .from("ad_account_costs")
      .select("ad_account_id, supplier_fee_pct")
      .in("ad_account_id", ids);
    for (const c of (costs ?? []) as Array<{
      ad_account_id: string;
      supplier_fee_pct: number | null;
    }>) {
      recorded.set(
        c.ad_account_id,
        c.supplier_fee_pct == null ? null : Number(c.supplier_fee_pct),
      );
    }
  }

  const adapter = getSupplier1Adapter();
  const rows: FeeReconRow[] = [];

  for (const a of accounts) {
    const res = await adapter.listAccountTopups(a.external_id);
    const rec = a.ad_account_id ? (recorded.get(a.ad_account_id) ?? null) : null;

    if (!res.ok) {
      rows.push({
        adAccountId: a.ad_account_id,
        externalId: a.external_id,
        name: a.name,
        recordedPct: rec,
        actualPct: null,
        topupsChecked: 0,
        topupsWithoutFee: 0,
        grossCents: 0,
        feeCents: 0,
        mismatch: null,
        error: res.error,
      });
      continue;
    }

    let gross = 0;
    let fee = 0;
    let withoutFee = 0;
    let counted = 0;
    for (const t of res.data) {
      // A top-up whose fee the supplier didn't report cannot contribute to an
      // effective rate — counting it as zero would drag the average down and
      // manufacture a mismatch.
      if (t.fee_cents == null || t.gross_cents == null) {
        withoutFee++;
        continue;
      }
      // Rate against what LANDED, matching how the supplier quotes it
      // (fee 6.00 on 299.76 net = 2%, not 1.96% of the 305.76 gross).
      const net = t.net_cents ?? t.gross_cents - t.fee_cents;
      if (net <= 0) continue;
      gross += net;
      fee += t.fee_cents;
      counted++;
    }

    const actual = counted > 0 && gross > 0 ? (fee / gross) * 100 : null;
    let mismatch: string | null = null;
    if (actual != null && rec != null && Math.abs(actual - rec) > 0.05) {
      mismatch = `recorded ${rec}%, actually charged ${actual.toFixed(2)}%`;
    } else if (actual != null && rec == null) {
      mismatch = `not recorded, actually charged ${actual.toFixed(2)}%`;
    }

    rows.push({
      adAccountId: a.ad_account_id,
      externalId: a.external_id,
      name: a.name,
      recordedPct: rec,
      actualPct: actual,
      topupsChecked: counted,
      topupsWithoutFee: withoutFee,
      grossCents: gross,
      feeCents: fee,
      mismatch,
      error: null,
    });
  }

  rows.sort((x, y) => (y.mismatch ? 1 : 0) - (x.mismatch ? 1 : 0));

  return {
    ok: true,
    mode,
    rows,
    accountsChecked: accounts.length,
    accountsSkipped: skipped,
    note:
      mode === "live"
        ? `Compared against the supplier's own top-up records.${skipped ? ` ${skipped} allocated account(s) beyond the ${RECON_MAX_ACCOUNTS}-per-run cap were NOT checked.` : ""}`
        : "Mock mode — these are canned figures, not your real fees. Set SUPPLIER1_MODE=live to compare real data.",
  };
}

// Calls the WIRED SeamX adapter (mock or live, per SUPPLIER1_MODE) and
// returns a small redacted summary so an owner can verify the connection
// on any deployment without reading logs.
export async function testSupplier1Connection(): Promise<IntegrationPing> {
  const mode = supplier1Mode();
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

// ─────────────────────────────────────────
// Wise INGEST status — the path that is actually in use
// ─────────────────────────────────────────
// testWiseConnection() above exercises the POLLER adapter, which is not
// wired. Real deposits arrive through the webhook
// (/api/webhooks/wise/[token] -> processWiseWebhook), and the reference the
// customer typed is fetched separately from the balance statement, because
// the balances#credit payload usually does not carry it.
//
// So "is Wise on?" has three separate answers, and the screen was showing
// none of them: every deposit in the list read "no reference" and there was
// nothing to say whether that is because the read token is unset, or
// because the senders genuinely left the field blank.
//
// Booleans only. A token's VALUE never leaves the server, not even
// truncated — a prefix is enough to identify an account.
export type WiseIngestStatus = {
  ok: boolean;
  error?: string;
  /**
   * At least ONE of the two webhook routes can accept a delivery:
   *   /api/webhooks/wise/<WISE_WEBHOOK_SECRET>   shared-secret path
   *   /api/webhooks/wise                         RSA, needs WISE_PUBLIC_KEY
   * With neither set, every POST Wise makes is answered 401 and no deposit
   * can ever arrive — which is a silent outage, because Wise retries for a
   * while and then stops.
   */
  webhookConfigured: boolean;
  /** References and sender names can be enriched from the statement API. */
  readTokenConfigured: boolean;
  /** TRUE means deposits settle without an admin confirming. Safe-start = false. */
  autoSettle: boolean;
  total: number;
  withReference: number;
  /** When we last RECEIVED one — the signal for "is the feed alive". */
  newestReceivedAt: string | null;
};

export async function wiseIngestStatus(): Promise<WiseIngestStatus> {
  // ── THE GUARD COMES FIRST, AND THE ANSWER IS BUILT AFTER IT ─────────
  //
  // This built the configuration flags from the environment and then
  // spread them onto the REJECTION return — so a caller who had just
  // been refused still learned webhookConfigured, readTokenConfigured
  // and autoSettle. The action is imported by a client component, so its
  // id ships in a public chunk and a POST with that id from any session,
  // or none, got the answer.
  //
  // autoSettle is "do incoming bank deposits credit wallets without an
  // admin looking", which is exactly the reconnaissance somebody wants
  // before trying a forged reference. A refusal now says nothing about
  // how this tenant is set up.
  const ctx = await resolveAdminContext();
  if (!ctx.ok) {
    return {
      ok: false,
      error: ctx.error,
      webhookConfigured: false,
      readTokenConfigured: false,
      autoSettle: false,
      total: 0,
      withReference: 0,
      newestReceivedAt: null,
    };
  }
  const { supabase, profile } = ctx.ctx;
  const tenantId = profile.tenant_id;

  const empty = {
    webhookConfigured:
      !!process.env.WISE_WEBHOOK_SECRET || !!process.env.WISE_PUBLIC_KEY,
    readTokenConfigured: !!process.env.WISE_API_TOKEN,
    autoSettle: ["true", "1", "yes"].includes(
      (process.env.WISE_AUTO_SETTLE ?? "").toLowerCase(),
    ),
    total: 0,
    withReference: 0,
    newestReceivedAt: null,
  };

  // ── OURS, AND THE ONES NOBODY HAS PLACED YET ──────────────────────
  //
  // These three counts had no tenant predicate at all, so on a
  // deployment with two tenants the "280 deposits" tile included the
  // other tenant's entire payment history -- while the tab badge six
  // pixels away, which IS scoped, said 3. The sibling read in the panel
  // was fixed for exactly this and carries the note; these never were.
  //
  // .or() rather than .eq(), because .eq excludes NULL and an
  // unassigned deposit is the normal state for anything the matcher
  // could not place.
  const mine = `tenant_id.eq.${tenantId},tenant_id.is.null`;
  const [totalRes, refRes, newestRes] = await Promise.all([
    supabase
      .from("wise_incoming_transfers")
      .select("id", { count: "exact", head: true })
      .or(mine),
    supabase
      .from("wise_incoming_transfers")
      .select("id", { count: "exact", head: true })
      .or(mine)
      .not("reference", "is", null),
    supabase
      .from("wise_incoming_transfers")
      .select("created_at")
      .or(mine)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  // ── AND A FAILED COUNT IS NOT ZERO ────────────────────────────────
  //
  // All three errors were discarded and the function returned ok:true
  // regardless, which defeats the panel's own failure branch -- so a
  // refused read printed "0 Deposits" with nothing anywhere saying the
  // feed could not be reached. The third tile already renders a dash
  // for unknown; now the first two can too.
  if (totalRes.error || refRes.error || newestRes.error) {
    return {
      ok: false,
      error:
        "We couldn't read the deposit feed just now, so these figures are not shown.",
      ...empty,
      total: 0,
      withReference: 0,
      newestReceivedAt: null,
    };
  }

  return {
    ok: true,
    ...empty,
    total: totalRes.count ?? 0,
    withReference: refRes.count ?? 0,
    newestReceivedAt: newestRes.data?.[0]?.created_at ?? null,
  };
}
