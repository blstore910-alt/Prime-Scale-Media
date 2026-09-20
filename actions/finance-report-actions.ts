"use server";

import { resolveUserContextForRead, type ActionResult } from "./_shared";
import { isMissingColumn, pageAllRows } from "@/lib/page-all-rows";
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
  const auth = await resolveUserContextForRead();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, profile } = auth.ctx;

  const failed: string[] = [];
  let truncated = false;

  /**
   * The same, with a narrower query to fall back on when the first one
   * fails ONLY because a column is not there yet. `top_ups.is_deleted` is
   * the case this exists for: filtering it out is right, and the live
   * schema is hand-authored, so without a fallback a missing column would
   * drop every ad-account funding line off the customer's own statement.
   */
  async function sourceTolerant(
    name: string,
    strict: (from: number, to: number) => PromiseLike<{
      data: Row[] | null;
      error: { message: string } | null;
    }>,
    fallback: (from: number, to: number) => PromiseLike<{
      data: Row[] | null;
      error: { message: string } | null;
    }>,
  ): Promise<Row[]> {
    try {
      const res = await pageAllRows<Row>(strict);
      if (res.error && isMissingColumn(res.error)) {
        return source(name, fallback);
      }
      if (res.error) {
        failed.push(name);
        return [];
      }
      if (res.truncated) truncated = true;
      return res.rows;
    } catch {
      return source(name, fallback);
    }
  }

  /**
   * One source. Never throws; records its own failure by name.
   *
   * EVERY WALK CARRIES A UNIQUE TIEBREAKER. Ordering by created_at alone
   * is not a total order — a bulk top-up inserts up to 200 rows sharing
   * one now(), and Postgres gives no stable order among ties — so a row
   * sitting on a 1,000-row page boundary can be returned twice or not at
   * all, and which it is changes between requests. That lands in the
   * In/Out/Net tiles and in the CSV the customer hands a bookkeeper.
   * `truncated` does not catch it: that only fires at the page ceiling.
   * The same fix went into app/api/stats/route.ts and missed this file.
   */
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
  // ── A READ WE COULD NOT MAKE IS NOT AN EMPTY REPORT ─────────────────
  //
  // This discarded `error` and then keyed everything off `adv?.id`, so
  // ANY failure — an RLS hiccup, or PGRST116 because .maybeSingle()
  // THROWS when two rows match, which is a state this database has
  // reached — returned ok:true with no lines and an empty `failed` list.
  // The screen then has nothing to warn about and prints "Nothing has
  // moved yet. Your first top-up will appear here." to somebody who has
  // moved EUR 40,000, and disables Export CSV with "Nothing to export".
  //
  // Genuinely having no advertiser row is a different thing and still
  // returns the empty report, because that IS the answer.
  const { data: adv, error: advErr } = await supabase
    .from("advertisers")
    .select("id, tenant_client_code")
    .eq("user_id", profile.user_id)
    .eq("tenant_id", profile.tenant_id)
    .maybeSingle();

  if (advErr) {
    return {
      ok: false,
      error:
        "We could not work out which account this report is for, so nothing below would be complete. Reload and try again.",
    };
  }

  const advertiserId = adv?.id as string | undefined;

  if (!advertiserId) {
    return {
      ok: true,
      data: { lines: [], failed, truncated, audience: "none" },
    };
  }

  // Same shape, smaller blast radius: the wallet id is what scopes the
  // EXCHANGES source, so discarding this error dropped that entire
  // source without naming it, and a customer who moved EUR into USD got
  // both currency totals wrong with no warning anywhere.
  const { data: walletRow, error: walletErr } = await supabase
    .from("wallets")
    .select("id")
    .eq("advertiser_id", advertiserId)
    .maybeSingle();
  if (walletErr) failed.push("currency exchanges");
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
      // .range() with NO order at all. Postgres is free to return rows in
      // any order it likes and to change its mind between the two calls,
      // so a second page could repeat a row the first page already had
      // and skip one it did not — which here means an ad account's name
      // going missing and every line belonging to it printing a uuid.
      .order("id", { ascending: true })
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
      // reference_no, not reference. This asked for a column that does
      // not exist on wallet_topups — the neighbouring precharges block is
      // where `reference` is real, and it looks copied. PostgREST throws
      // 42703, the source is recorded as failed, and the report loses
      // EVERY credit: an advertiser who put in EUR 40,000 and spent
      // 36,000 read "In EUR 0.00 · Out EUR 36,000 · Net -36,000", and
      // the CSV they hand a bookkeeper had no income rows at all.
      //
      // The banner did say the totals were incomplete, which is honest
      // and still a wrong statement of account.
      .select("id, amount, currency, status, reference_no, created_at")
      .eq("advertiser_id", advertiserId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
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
      reference: str(r.reference_no),
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
  const TOPUP_COLS =
    "id, account_id, topup_amount, fee_amount, amount_received, currency, status, created_at, type";
  for (const r of await sourceTolerant(
    "ad account funding",
    // A DELETED TOP-UP IS NOT A DEBIT. `is_deleted` is the only way to
    // strike out a completed top-up, and this statement showed the
    // struck-out ones as money that left the wallet — so a customer's own
    // report carried a phantom debit and its Net disagreed with their
    // actual balance by exactly that amount. They hand this CSV to a
    // bookkeeper.
    (from, to) =>
      supabase
        .from("top_ups")
        .select(TOPUP_COLS)
        .eq("advertiser_id", advertiserId)
        .not("is_deleted", "is", true)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    // ...and the same read without it, for a database where that column
    // has not been added yet. Losing the filter costs accuracy on struck
    // rows; losing the SOURCE would drop every funding line off the
    // customer's statement.
    (from, to) =>
      supabase
        .from("top_ups")
        .select(TOPUP_COLS)
        .eq("advertiser_id", advertiserId)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
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
      .order("id", { ascending: true })
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
      .order("id", { ascending: true })
      .range(from, to),
  )) {
    const paid = String(r.status ?? "") === "paid";
    // ── A DEPOSIT IS NOT A CHARGE ───────────────────────────────────
    //
    // A completed wallet top-up raises its own invoice on live
    // (trg_create_invoice_on_wallet_topup_completed), marked paid, for
    // the full amount deposited. It is a receipt for money coming IN.
    // Booked like every other paid invoice it becomes money going OUT,
    // so a EUR 5 transfer lands on the statement as +5 and −5 and nets
    // to nothing — on the document the customer hands their bookkeeper,
    // while they are holding the 5.
    //
    // The row stays, because they should be able to see the invoice
    // exists and download it. It just does not move the total: the
    // deposit line already carries that money.
    // ad_account_topup too: a live trigger raises one every time an
    // ad-account funding is verified, and the funding itself is already
    // a line on this report. Booked as an invoice it becomes a second
    // debit for the same movement -- EUR 100 out and EUR 97 out, for
    // one EUR 100 transfer -- on the document the customer hands their
    // bookkeeper.
    const isDepositReceipt = [
      "wallet_topup",
      "topup",
      "ad_account_topup",
      "account_topup",
    ].includes(String(r.type ?? "").toLowerCase());
    lines.push({
      id: `inv-${r.id}`,
      at: String(r.paid_at ?? r.created_at ?? ""),
      kind: "invoice",
      // A VOID INVOICE IS NOT UNPAID. `(paid ? "" : " (unpaid)")` called
      // a cancelled invoice money owed, on the customer's own statement.
      // The amount is correctly 0 either way; the words were not.
      label:
        (isDepositReceipt
          ? String(r.type ?? "").toLowerCase().includes("account")
            ? "ad-account top-up receipt"
            : "wallet top-up receipt"
          : String(r.type ?? "invoice").replace(/_/g, " ")) +
        (isDepositReceipt
          ? ""
          : paid
          ? ""
          : String(r.status ?? "") === "void"
            ? " (cancelled)"
            : String(r.status ?? "") === "refunded"
              ? " (refunded)"
              : " (unpaid)"),
      reference: str(r.number),
      account: null,
      counterparty: null,
      currency: cur(r.currency),
      // Only a PAID invoice has moved money. An unpaid one belongs on the
      // report — a customer asks about what they owe — but it must not
      // change a total.
      amount: paid && !isDepositReceipt ? -Math.abs(num(r.total)) : 0,
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
      .order("id", { ascending: true })
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
      .order("id", { ascending: true })
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

  // ── Refunds and approved adjustments ────────────────────────────────
  //
  // Both tables are admin-read-only by design — they carry `reason`, an
  // internal note, plus the ids of the two members of staff who raised
  // and reviewed the row. That is the right default for the TABLE and
  // the wrong one for the AMOUNTS, which are the customer's own money: a
  // report that omits them reconciles to a number the wallet disagrees
  // with, and 500 EUR can leave without ever appearing.
  //
  // So they come through my_wallet_extras, a SECURITY DEFINER function
  // that re-checks the advertiser is the caller's own and returns six
  // columns: kind, id, date, signed amount, currency, status, reference.
  // No reason, no requested_by, no reviewed_by.
  //
  // ── AND ITS ABSENCE IS NOT A FAILURE ────────────────────────────────
  //
  // Migrations are pasted by hand and code reaches production in
  // minutes, so this function does not exist yet on live. A missing RPC
  // answers PGRST202 / 404, which the `source()` helper would put in
  // `failed` — and the screen would then tell every customer that part
  // of their report could not be read, on a report that is in fact
  // complete for everything that exists. Not-there-yet is dark, not
  // broken. A REAL error still lands in `failed`, which is the case
  // worth telling them about.
  {
    const { data: extras, error: extrasErr } = await supabase.rpc(
      "my_wallet_extras",
      { p_advertiser_id: advertiserId },
    );
    const notDeployed =
      !!extrasErr &&
      /PGRST202|Could not find the function|does not exist|schema cache/i.test(
        `${(extrasErr as { code?: string }).code ?? ""} ${safeErrorMessage(extrasErr)}`,
      );
    if (extrasErr && !notDeployed) {
      failed.push("refunds and adjustments");
    } else if (Array.isArray(extras)) {
      for (const raw of extras as Row[]) {
        const kind = String(raw.kind ?? "");
        if (kind !== "refund" && kind !== "adjustment") continue;
        lines.push({
          id: `${kind}-${String(raw.row_id ?? "")}`,
          at: String(raw.at ?? ""),
          kind,
          label:
            kind === "refund"
              ? "Refunded to your bank"
              : num(raw.amount) >= 0
                ? "Correction in your favour"
                : "Correction",
          reference: str(raw.reference),
          account: null,
          counterparty: null,
          currency: cur(raw.currency),
          // Already signed by the function: a refund is negative, an
          // adjustment carries its own delta.
          amount: num(raw.amount),
          status: str(raw.status),
        });
      }
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
  const auth = await resolveUserContextForRead();
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
      .order("id", { ascending: true })
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
