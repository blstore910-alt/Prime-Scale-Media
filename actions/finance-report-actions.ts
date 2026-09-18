"use server";

import { resolveUserContext, type ActionResult } from "./_shared";
import { pageAllRows } from "@/lib/page-all-rows";
import type { FinanceLine } from "@/lib/pure-finance-report";
import { sortLines } from "@/lib/pure-finance-report";
import { safeErrorMessage } from "@/lib/pure-error";

/**
 * Everything that moved, for the person asking.
 *
 * WHO IT IS FOR is resolved SERVER-SIDE, from the session. No advertiser
 * id, no affiliate id and no tenant id is ever accepted from the caller —
 * the combi sweep found three RPCs that resolved an advertiser without a
 * tenant filter and could therefore be pointed at another tenant's rows,
 * and a report is the last place to repeat that.
 *
 * EACH SOURCE IS READ ON ITS OWN, and a source that fails is NAMED rather
 * than silently contributing nothing. The live schema is hand-authored
 * and diverges from both the repo migrations and the generated types, so
 * "this table is not shaped the way the code expects" is a real outcome —
 * and on a financial report, a missing source that renders as a smaller
 * total is a lie. The screen says which part it could not read.
 *
 * Every read is PAGED. PostgREST stops at 1,000 rows, and a report is
 * exactly the place somebody would notice a year of history ending in
 * March.
 */

type Row = Record<string, unknown>;

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown): string | null => {
  const s = v === null || v === undefined ? "" : String(v);
  return s.trim() === "" ? null : s;
};
const cur = (v: unknown): string =>
  String(v ?? "EUR").toUpperCase() === "USD" ? "USD" : "EUR";

export type FinanceReport = {
  lines: FinanceLine[];
  /** Sources that could not be read. The screen must say so. */
  failed: string[];
  /** True if any source hit its page ceiling, so totals are a floor. */
  truncated: boolean;
  /** What the caller is, so the screen can label itself. */
  audience: "advertiser" | "affiliate" | "none";
};

export async function financeReportForMe(): Promise<
  ActionResult<FinanceReport>
> {
  const auth = await resolveUserContext();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, profile } = auth.ctx;

  const failed: string[] = [];
  let truncated = false;

  /** One source. Never throws; records its own failure by name. */
  async function source(
    name: string,
    build: (from: number, to: number) => PromiseLike<{
      data: Row[] | null;
      error: { message: string } | null;
    }>,
  ): Promise<Row[]> {
    try {
      const res = await pageAllRows<Row>(build);
      if (res.error) {
        failed.push(name);
        return [];
      }
      if (res.truncated) truncated = true;
      return res.rows;
    } catch {
      failed.push(name);
      return [];
    }
  }

  // ── Who is asking ───────────────────────────────────────────────────
  // Tenant-scoped, because one person can hold an advertiser row in more
  // than one tenant and an unfiltered `limit 1` would pick an arbitrary
  // one.
  const { data: adv } = await supabase
    .from("advertisers")
    .select("id, tenant_client_code")
    .eq("user_id", profile.user_id)
    .eq("tenant_id", profile.tenant_id)
    .maybeSingle();

  const advertiserId = adv?.id as string | undefined;

  if (!advertiserId) {
    return {
      ok: true,
      data: { lines: [], failed, truncated, audience: "none" },
    };
  }

  const { data: walletRow } = await supabase
    .from("wallets")
    .select("id")
    .eq("advertiser_id", advertiserId)
    .maybeSingle();
  const walletId = walletRow?.id as string | undefined;

  // Ad account names, so a line can say which account it belongs to
  // rather than printing a uuid — an internal identifier where a name
  // belongs reads as information when it is noise.
  const accountName = new Map<string, string>();
  const accounts = await source("ad accounts", (from, to) =>
    supabase
      .from("ad_accounts")
      .select("id, name")
      .eq("advertiser_id", advertiserId)
      .range(from, to),
  );
  for (const a of accounts) {
    if (a.id) accountName.set(String(a.id), String(a.name ?? "Ad account"));
  }

  const lines: FinanceLine[] = [];

  // ── Money into the wallet ───────────────────────────────────────────
  for (const r of await source("wallet top-ups", (from, to) =>
    supabase
      .from("wallet_topups")
      .select("id, amount, currency, status, reference, created_at")
      .eq("advertiser_id", advertiserId)
      .order("created_at", { ascending: true })
      .range(from, to),
  )) {
    // Only completed money is money. A pending transfer is a claim, and
    // adding it to a total would tell somebody they have funds they do
    // not have.
    const status = String(r.status ?? "");
    lines.push({
      id: `wt-${r.id}`,
      at: String(r.created_at ?? ""),
      kind: "wallet_topup",
      label: status === "completed" ? "Top-up received" : "Top-up pending",
      reference: str(r.reference),
      account: null,
      counterparty: null,
      currency: cur(r.currency),
      amount: status === "completed" ? num(r.amount) : 0,
      status,
    });
  }

  // ── Wallet out to an ad account ─────────────────────────────────────
  // topup_amount, amount_usd and fee_amount are ALWAYS USD by
  // construction; `currency` is what the customer paid in, and
  // amount_received is what actually left their wallet. See the note in
  // the loop for why that distinction decides the whole report.
  for (const r of await source("ad account funding", (from, to) =>
    supabase
      .from("top_ups")
      .select(
        "id, account_id, topup_amount, fee_amount, amount_received, currency, status, created_at, type",
      )
      .eq("advertiser_id", advertiserId)
      .order("created_at", { ascending: true })
      .range(from, to),
  )) {
    const done = String(r.status ?? "") === "completed";
    const acct = r.account_id ? accountName.get(String(r.account_id)) ?? null : null;

    // THE WALLET LEG, IN THE WALLET'S OWN CURRENCY.
    //
    // This booked the movement in USD at topup_amount, because
    // topup_amount, amount_usd and fee_amount are USD by construction.
    // But what LEAVES THE WALLET is amount_received, in the currency the
    // customer chose — that is the figure the top-up form validates
    // against the balance and prints as "wallet afterwards". Reporting
    // the USD leg against a EUR wallet made the per-currency net
    // meaningless: a EUR 10,000 top-up spent down to EUR 1,000 read as
    // "EUR in 10,000, out 0, net 10,000", plus an invented -$10,465 in a
    // currency the customer never held.
    //
    // One line per movement, in the currency that moved. The USD side —
    // what landed on the account and what the fee was — is stated in the
    // line's own text, where it informs without being added to a total
    // it does not belong to.
    const landed = Math.abs(num(r.topup_amount));
    const fee = Math.abs(num(r.fee_amount));
    const left = Math.abs(num(r.amount_received));
    const detail = done
      ? [
          landed > 0 ? `$${landed.toFixed(2)} landed` : null,
          fee > 0 ? `$${fee.toFixed(2)} fee` : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : "";

    lines.push({
      id: `tu-${r.id}`,
      at: String(r.created_at ?? ""),
      kind: "account_topup",
      label: done
        ? detail
          ? `Funded ad account — ${detail}`
          : "Funded ad account"
        : "Funding pending",
      reference: null,
      account: acct,
      counterparty: null,
      currency: cur(r.currency),
      // amount_received, not topup_amount: the wallet is what this report
      // reconciles against, and the fee is already inside this figure.
      // Booking the fee again as its own line would subtract it twice.
      amount: done ? -left : 0,
      status: String(r.status ?? ""),
    });
  }

  // ── Money coming back out of an ad account ──────────────────────────
  for (const r of await source("withdrawals", (from, to) =>
    supabase
      .from("ad_account_withdrawals")
      .select("id, ad_account_id, amount, currency, status, created_at")
      .eq("advertiser_id", advertiserId)
      .order("created_at", { ascending: true })
      .range(from, to),
  )) {
    const done = ["approved", "completed", "paid"].includes(
      String(r.status ?? "").toLowerCase(),
    );
    lines.push({
      id: `wd-${r.id}`,
      at: String(r.created_at ?? ""),
      kind: "account_withdrawal",
      label: done ? "Returned to wallet" : "Return requested",
      reference: null,
      account: r.ad_account_id
        ? accountName.get(String(r.ad_account_id)) ?? null
        : null,
      counterparty: null,
      currency: cur(r.currency),
      amount: done ? Math.abs(num(r.amount)) : 0,
      status: String(r.status ?? ""),
    });
  }

  // ── Invoices ────────────────────────────────────────────────────────
  for (const r of await source("invoices", (from, to) =>
    supabase
      .from("invoices")
      .select("id, number, total, currency, status, type, created_at, paid_at")
      .eq("advertiser_id", advertiserId)
      .eq("tenant_id", profile.tenant_id)
      .order("created_at", { ascending: true })
      .range(from, to),
  )) {
    const paid = String(r.status ?? "") === "paid";
    lines.push({
      id: `inv-${r.id}`,
      at: String(r.paid_at ?? r.created_at ?? ""),
      kind: "invoice",
      label:
        String(r.type ?? "invoice").replace(/_/g, " ") +
        (paid ? "" : " (unpaid)"),
      reference: str(r.number),
      account: null,
      counterparty: null,
      currency: cur(r.currency),
      // Only a PAID invoice has moved money. An unpaid one belongs on the
      // report — a customer asks about what they owe — but it must not
      // change a total.
      amount: paid ? -Math.abs(num(r.total)) : 0,
      status: String(r.status ?? ""),
    });
  }

  // ── Advances ────────────────────────────────────────────────────────
  for (const r of await source("advances", (from, to) =>
    supabase
      .from("wallet_precharges")
      .select("id, amount, currency, status, reference, created_at")
      .eq("advertiser_id", advertiserId)
      .order("created_at", { ascending: true })
      .range(from, to),
  )) {
    lines.push({
      id: `pc-${r.id}`,
      at: String(r.created_at ?? ""),
      kind: "precharge",
      label: "Credit advanced before payment cleared",
      reference: str(r.reference),
      account: null,
      counterparty: null,
      currency: cur(r.currency),
      // An advance puts money in the wallet; settling it takes the same
      // amount back out, so a settled one nets to zero and is shown for
      // the record rather than as a movement.
      amount:
        String(r.status ?? "") === "outstanding" ? Math.abs(num(r.amount)) : 0,
      status: String(r.status ?? ""),
    });
  }

  // ── Currency exchanges: two lines, because two currencies moved ─────
  if (walletId) {
    for (const r of await source("exchanges", (from, to) =>
      supabase
        .from("wallet_exchanges")
        .select(
          "id, created_at, from_currency, to_currency, from_amount, to_amount",
        )
        .eq("wallet_id", walletId)
        .order("created_at", { ascending: true })
        .range(from, to),
    )) {
      const at = String(r.created_at ?? "");
      lines.push({
        id: `fx-out-${r.id}`,
        at,
        kind: "exchange",
        label: `Exchanged to ${String(r.to_currency ?? "").toUpperCase()}`,
        reference: null,
        account: null,
        counterparty: null,
        currency: cur(r.from_currency),
        amount: -Math.abs(num(r.from_amount)),
        status: "completed",
      });
      lines.push({
        id: `fx-in-${r.id}`,
        at,
        kind: "exchange",
        label: `Exchanged from ${String(r.from_currency ?? "").toUpperCase()}`,
        reference: null,
        account: null,
        counterparty: null,
        currency: cur(r.to_currency),
        amount: Math.abs(num(r.to_amount)),
        status: "completed",
      });
    }
  }

  return {
    ok: true,
    data: { lines: sortLines(lines), failed, truncated, audience: "advertiser" },
  };
}

/**
 * The affiliate's version: what they earned, from whom, and whether it is
 * theirs yet.
 *
 * Commission is PROVISIONAL until the money it came from has stayed put —
 * a clawback follows an ad-account withdrawal — so status is not a
 * decoration here, it is the difference between earned and paid.
 */
export async function affiliateFinanceReportForMe(): Promise<
  ActionResult<FinanceReport>
> {
  const auth = await resolveUserContext();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, profile } = auth.ctx;

  const failed: string[] = [];
  let truncated = false;

  const { data: adv } = await supabase
    .from("advertisers")
    .select("id")
    .eq("user_id", profile.user_id)
    .eq("tenant_id", profile.tenant_id)
    .maybeSingle();
  const myId = adv?.id as string | undefined;
  if (!myId) {
    return {
      ok: true,
      data: { lines: [], failed, truncated, audience: "none" },
    };
  }

  // Who they referred, so a commission line can name the advertiser it
  // came from instead of a uuid.
  const referredName = new Map<string, string>();
  try {
    const { data } = await supabase
      .from("referral_links")
      .select(
        "referred_advertiser_id, referred:advertisers!referral_links_referred_advertiser_id_fkey(tenant_client_code)",
      )
      .eq("affiliate_advertiser_id", myId);
    for (const r of (data ?? []) as Row[]) {
      const id = str(r.referred_advertiser_id);
      const ref = r.referred as { tenant_client_code?: string } | null;
      if (id) referredName.set(id, ref?.tenant_client_code ?? "Referred customer");
    }
  } catch {
    // Not fatal: the lines still render, just without a name on them.
    failed.push("referred customers");
  }

  const lines: FinanceLine[] = [];
  try {
    const res = await pageAllRows<Row>((from, to) =>
      supabase
        .from("referral_commissions")
        .select(
          "id, amount, currency, status, created_at, referred_advertiser_id",
        )
        .eq("affiliate_advertiser_id", myId)
        .order("created_at", { ascending: true })
        .range(from, to),
    );
    if (res.error) failed.push("commissions");
    if (res.truncated) truncated = true;
    for (const r of res.rows) {
      const status = String(r.status ?? "");
      const clawed = status === "clawed_back" || status === "reversed";
      lines.push({
        id: `cm-${r.id}`,
        at: String(r.created_at ?? ""),
        kind: "commission",
        label: clawed
          ? "Commission taken back"
          : status === "paid"
            ? "Commission paid out"
            : "Commission earned",
        reference: null,
        account: null,
        counterparty: r.referred_advertiser_id
          ? referredName.get(String(r.referred_advertiser_id)) ?? null
          : null,
        currency: cur(r.currency),
        amount: clawed ? -Math.abs(num(r.amount)) : Math.abs(num(r.amount)),
        status,
      });
    }
  } catch (err) {
    // safeErrorMessage, never the raw object: Supabase's details/hint/row
    // fields carry PII.
    void safeErrorMessage(err);
    failed.push("commissions");
  }

  return {
    ok: true,
    data: { lines: sortLines(lines), failed, truncated, audience: "affiliate" },
  };
}
