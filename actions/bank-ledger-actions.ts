"use server";

import {
  isMissingColumn as messageIsMissingColumn,
  pageAllRows,
  pageAllRowsTolerant,
} from "@/lib/page-all-rows";

import {
  type BankLedgerEntry,
  type DestinationBalance,
  type LedgerCurrency,
  type LedgerDestination,
  type LedgerDirection,
  type ReconciliationRow,
  type WalletCurrency,
} from "@/lib/types/bank-ledger";
import { type ActionResult, resolveAdminContext } from "./_shared";

const DESTS: LedgerDestination[] = ["our_bank", "supplier"];
const CURRENCIES: LedgerCurrency[] = ["USD", "EUR", "GBP", "HKD"];
const WALLET_CURRENCIES: WalletCurrency[] = ["USD", "EUR"];
const DIRECTIONS: LedgerDirection[] = ["deposit", "withdrawal"];

// The columns plak 89 adds. Code reaches production in minutes and a
// migration is pasted in by hand whenever somebody gets to it, so every
// read asks for them and retries without them on 42703 -- the feature
// stays dark until the migration lands instead of the screen breaking.
const CREDITED_PENDING =
  "Recording what a deposit credited needs the pending migration (plak 89). " +
  "Paste it in the SQL editor first, or leave those two fields empty.";

// PostgREST says it two ways -- 42703 from the planner, PGRST204 from a
// stale schema cache on an insert -- and lib/page-all-rows already knows
// both. Match on the message, not the code.
function isMissingColumn(err: unknown): boolean {
  const e = err as { message?: string; code?: string } | null;
  return messageIsMissingColumn(e?.message) || e?.code === "42703";
}

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

// Reconciliation is super-admin-only in the UI (/reconciliation uses
// requireSuperAdmin). Server actions are independently-invokable endpoints,
// so a plain admin could otherwise call these directly to read the books or
// inject fake "received" deposits that hide a rogue admin. Re-fetch the
// tenant owner and require the caller to be it — mirroring bank-account-actions.
async function resolveOwnerContext() {
  const auth = await resolveAdminContext();
  if (!auth.ok) return auth;
  const { supabase, profile } = auth.ctx;
  const { data: tenant } = await supabase
    .from("tenants")
    .select("owner_id")
    .eq("id", profile.tenant_id)
    .maybeSingle();
  if (!tenant || tenant.owner_id !== profile.user_id) {
    return { ok: false as const, error: "Only the tenant owner can do this" };
  }
  return auth;
}

// ─────────────────────────────────────────
// listLedgerEntries — recent manual bank/supplier entries, admin-only.
// ─────────────────────────────────────────
export type LedgerPage = {
  entries: BankLedgerEntry[];
  /** There are older entries this page does not show. */
  capped: boolean;
  limit: number;
};

export async function listLedgerEntries(
  limit = 100,
): Promise<ActionResult<LedgerPage>> {
  const auth = await resolveOwnerContext();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, profile } = auth.ctx;
  const want = Math.min(Math.max(limit, 1), 500);

  // ── ASK FOR ONE MORE THAN WE SHOW ─────────────────────────────────
  //
  // This cut the list off at `limit` and said nothing, on a page whose
  // job is to make a column of money add up. A reader adding it up got a
  // total that has no relation to the balances above it, with nothing on
  // screen to say why. One extra row turns "there is more" from a guess
  // into a fact.
  const withCredited = await supabase
    .from("bank_ledger_entries")
    .select(
      "id, tenant_id, destination, currency, direction, amount, credited_currency, credited_amount, occurred_on, note, recorded_by, created_at, updated_at",
    )
    .eq("tenant_id", profile.tenant_id)
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(want + 1);

  let rows: unknown[] | null = withCredited.data as unknown[] | null;
  let readError = withCredited.error;

  if (readError && isMissingColumn(readError)) {
    const plain = await supabase
      .from("bank_ledger_entries")
      .select(
        "id, tenant_id, destination, currency, direction, amount, occurred_on, note, recorded_by, created_at, updated_at",
      )
      .eq("tenant_id", profile.tenant_id)
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(want + 1);
    rows = plain.data as unknown[] | null;
    readError = plain.error;
  }
  if (readError) return { ok: false, error: readError.message };

  const all = (rows ?? []) as unknown as BankLedgerEntry[];
  const capped = all.length > want;
  return {
    ok: true,
    data: { entries: capped ? all.slice(0, want) : all, capped, limit: want },
  };
}

// ─────────────────────────────────────────
// addLedgerEntry — record a real deposit/withdrawal from a statement.
// Column-allowlisted; tenant + recorder forced from the session.
// ─────────────────────────────────────────
export async function addLedgerEntry(input: {
  destination: string;
  currency: string;
  direction: string;
  amount: number;
  occurred_on?: string;
  note?: string;
  /** What this deposit was credited to wallets as. Both or neither. */
  credited_currency?: string;
  credited_amount?: number;
}): Promise<ActionResult<{ id: string }>> {
  const auth = await resolveOwnerContext();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, profile } = auth.ctx;

  const destination = String(input?.destination ?? "") as LedgerDestination;
  const currency = String(input?.currency ?? "").toUpperCase() as LedgerCurrency;
  const direction = String(input?.direction ?? "") as LedgerDirection;
  const amount = n(input?.amount);

  if (!DESTS.includes(destination)) {
    return { ok: false, error: "Pick a destination (our bank or supplier)." };
  }
  if (!CURRENCIES.includes(currency)) {
    return { ok: false, error: "Unsupported currency." };
  }
  if (!DIRECTIONS.includes(direction)) {
    return { ok: false, error: "Pick deposit or withdrawal." };
  }
  if (!(amount > 0)) {
    return { ok: false, error: "Enter a positive amount." };
  }

  const row: Record<string, unknown> = {
    tenant_id: profile.tenant_id,
    destination,
    currency,
    direction,
    amount,
    recorded_by: profile.user_id,
  };
  // occurred_on optional — DB defaults to current_date. Only pass a
  // valid ISO date if given, and never a future date (a future occurred_on
  // mis-orders the ledger and skews reconciliation).
  if (input.occurred_on && /^\d{4}-\d{2}-\d{2}$/.test(input.occurred_on)) {
    if (input.occurred_on > new Date().toISOString().slice(0, 10)) {
      return { ok: false, error: "Date can't be in the future." };
    }
    row.occurred_on = input.occurred_on;
  }
  if (typeof input.note === "string" && input.note.trim()) {
    row.note = input.note.trim().slice(0, 500);
  }

  // ── WHAT IT CREDITED, WHEN THAT IS NOT WHAT THE BANK GOT ──────────
  //
  // A customer pays GBP 1,000 into the pound account and EUR 1,150 goes
  // into their wallet. Reconciliation compares wallet credits against
  // deposits, so without this the EUR side is short by 1,150 for ever
  // and the screen shows an alarm that can never be cleared. Only the
  // owner knows the rate the bank gave, so the owner states it.
  const creditedCur = String(input?.credited_currency ?? "")
    .toUpperCase() as WalletCurrency;
  const creditedAmt = n(input?.credited_amount);
  const wantsCredited = !!input?.credited_currency || creditedAmt > 0;
  if (wantsCredited) {
    if (direction !== "deposit") {
      return {
        ok: false,
        error: "Only a deposit can credit wallets. Leave those fields empty.",
      };
    }
    if (!WALLET_CURRENCIES.includes(creditedCur)) {
      return { ok: false, error: "Credited currency must be EUR or USD." };
    }
    if (!(creditedAmt > 0)) {
      return { ok: false, error: "Enter what this deposit credited, or leave both empty." };
    }
    row.credited_currency = creditedCur;
    row.credited_amount = creditedAmt;
  }

  const { data, error } = await supabase
    .from("bank_ledger_entries")
    .insert(row)
    .select("id")
    .single();
  if (error) {
    // The migration is pasted by hand and code ships in minutes, so say
    // which of the two is missing instead of handing over a PostgREST
    // message. Nothing is written half-way: the insert is one row.
    if (wantsCredited && isMissingColumn(error)) {
      return { ok: false, error: CREDITED_PENDING };
    }
    if (
      (error as { code?: string }).code === "23514" &&
      !["USD", "EUR"].includes(currency)
    ) {
      return {
        ok: false,
        error:
          `The database still only accepts USD and EUR here. ${currency} needs ` +
          "the pending migration (plak 89).",
      };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true, data: { id: data.id } };
}

// ─────────────────────────────────────────
// getReconciliation — the integrity check. Compares total credited to
// wallets (completed topups) against total actually received (ledger
// DEPOSITS only — withdrawals are excluded, because `credited` does not
// move when the owner takes money out of the bank), per currency; plus
// per-destination balances, which DO use the signed figure.
//
// KNOWN GAP, deliberately not papered over: an internal transfer between
// the two bank destinations is recorded honestly as a withdrawal on one
// and a deposit on the other — the per-destination balances need both
// legs — and the deposit leg then inflates `received`. There is no
// `transfer` direction to distinguish it. Until there is, a transfer
// shows up as a gap in our favour. Flagged rather than guessed at,
// because inventing a heuristic ("a deposit that matches a withdrawal on
// the same day") would hide real money.
// ─────────────────────────────────────────
export async function getReconciliation(): Promise<
  ActionResult<{
    rows: ReconciliationRow[];
    balances: DestinationBalance[];
    /** A page ceiling was hit, so these totals are a floor. */
    truncated: boolean;
  }>
> {
  const auth = await resolveOwnerContext();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, profile } = auth.ctx;

  // PostgREST caps a response at 1000 rows by default and says nothing about
  // it. This screen exists to answer "does everything add up?", so a silently
  // truncated sum does not merely under-report — it MANUFACTURES a gap
  // between credited and received, on the one page an owner would use to
  // decide whether an admin has been stealing. Both sides are paged in full.
  const PAGE = 1000;

  type TopupRow = { amount: number | string | null; currency: string | null };
  type LedgerRow = {
    destination: string | null;
    currency: string | null;
    direction: string | null;
    amount: number | string | null;
    credited_currency?: string | null;
    credited_amount?: number | string | null;
  };

  // ── BOTH WALKS NEED AN ORDER, AND IT HAS TO BE UNIQUE ───────────────
  //
  // These paged with .range() and NO .order() at all. Postgres gives no
  // stable row order without ORDER BY, so consecutive LIMIT/OFFSET pages
  // can repeat one row and skip another — and on the one screen that
  // answers "is somebody taking money", both sides of the comparison
  // became non-deterministic past 1,000 rows, with the gap changing
  // between refreshes.
  //
  // lib/page-all-rows.ts names THIS FILE as one of the two places already
  // bitten by paging, and its header says the pages must be ordered by
  // the caller so they are stable while we walk them. This file did not
  // use it. It does now, which also gives it the page ceiling and the
  // `truncated` flag — so "we could not read all of it" stops looking
  // exactly like "it balances".
  const topupPage = await pageAllRows<TopupRow>((from, to) =>
    supabase
      .from("wallet_topups")
      .select("amount, currency")
      .eq("tenant_id", profile.tenant_id)
      .eq("status", "completed")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );
  if (topupPage.error) return { ok: false, error: topupPage.error };
  const topupRows = topupPage.rows;

  // Tolerant: `credited_currency`/`credited_amount` arrive with plak 89,
  // and until it is pasted in this reads exactly as it did before.
  const ledgerPage = await pageAllRowsTolerant<LedgerRow>(
    (from, to) =>
      supabase
        .from("bank_ledger_entries")
        .select(
          "destination, currency, direction, amount, credited_currency, credited_amount",
        )
        .eq("tenant_id", profile.tenant_id)
        .order("occurred_on", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    (from, to) =>
    supabase
      .from("bank_ledger_entries")
      .select("destination, currency, direction, amount")
      .eq("tenant_id", profile.tenant_id)
      // occurred_on, not entry_date. There is no entry_date column
      // anywhere — the migration, the type, the render and the OTHER
      // query in this same file all say occurred_on. Getting it wrong
      // took the whole reconciliation screen down with a raw PostgREST
      // 42703 printed on the super-admin's page, in the very commit that
      // set out to make that screen trustworthy.
      .order("occurred_on", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );
  if (ledgerPage.error) return { ok: false, error: ledgerPage.error };
  const ledgerRows = ledgerPage.rows;

  // A truncated read is not a balanced book. The view distinguishes
  // "unknown" from "balanced" everywhere else; give it the input.
  const truncated = topupPage.truncated || ledgerPage.truncated;

  const credited: Record<string, number> = { USD: 0, EUR: 0 };
  for (const t of topupRows ?? []) {
    const c = String(t.currency ?? "").toUpperCase();
    if (c === "USD" || c === "EUR") credited[c] += n(t.amount);
  }

  const received: Record<string, number> = { USD: 0, EUR: 0 };
  const balMap = new Map<string, number>();
  for (const e of ledgerRows ?? []) {
    const c = String(e.currency ?? "").toUpperCase();
    const dest = String(e.destination ?? "");
    const signed = e.direction === "withdrawal" ? -n(e.amount) : n(e.amount);
    // ── A POUND THAT PAID FOR EUROS COUNTS AS THOSE EUROS ───────────
    //
    // The top-up dialog lets a customer pay in GBP or HKD; the wallet it
    // funds is EUR or USD. Comparing "credited EUR" against "received
    // EUR" then leaves the EUR side short by the whole transfer, for
    // ever -- and this is the screen that answers "is somebody taking
    // money". An alarm that can never be cleared is not an alarm.
    // So when the owner states what a deposit was credited as, that is
    // what counts here. The bank's own figure still drives the balance
    // below, because that is what the account actually holds.
    const credCur = String(e.credited_currency ?? "").toUpperCase();
    const credAmt = n(e.credited_amount);
    // ── "RECEIVED" MEANS MONEY THAT ARRIVED ─────────────────────────
    //
    // This added the SIGNED figure, so every withdrawal the owner
    // recorded was subtracted from what customers had paid in — and
    // `credited` on the other side of the comparison is the sum of
    // completed wallet top-ups, which withdrawals do not touch.
    //
    // Record a EUR 10,000 deposit: "All balanced". Then record the EUR
    // 8,000 you moved out of the bank, and the same screen flips to
    // amber, "1 to investigate", "Credited 10,000 · Received 2,000",
    // with a red Check badge — on the one screen that answers "is
    // somebody taking money". Nothing is missing. And once that alarm is
    // known to be false, a real gap is invisible.
    //
    // The signed sum is still right for the per-destination balance,
    // which is what a bank account actually holds.
    if (e.direction !== "withdrawal") {
      if ((credCur === "USD" || credCur === "EUR") && credAmt > 0) {
        received[credCur] += credAmt;
      } else if (c === "USD" || c === "EUR") {
        received[c] += n(e.amount);
      }
    }
    const key = `${dest}|${c}`;
    balMap.set(key, (balMap.get(key) ?? 0) + signed);
  }

  const rows: ReconciliationRow[] = WALLET_CURRENCIES.map((currency) => ({
    currency,
    credited: Number(credited[currency].toFixed(2)),
    received: Number(received[currency].toFixed(2)),
    gap: Number((credited[currency] - received[currency]).toFixed(2)),
  }));

  const balances: DestinationBalance[] = [];
  for (const destination of DESTS) {
    for (const currency of CURRENCIES) {
      balances.push({
        destination,
        currency,
        balance: Number((balMap.get(`${destination}|${currency}`) ?? 0).toFixed(2)),
      });
    }
  }

  return { ok: true, data: { rows, balances, truncated } };
}
