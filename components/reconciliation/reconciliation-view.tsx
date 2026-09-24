"use client";

import { shortDate } from "@/lib/pure-finance-range";
import {
  addLedgerEntry,
  getReconciliation,
  listLedgerEntries,
} from "@/actions/bank-ledger-actions";
import {
  DESTINATION_LABELS,
  type LedgerCurrency,
  type LedgerDestination,
  type LedgerDirection,
  type WalletCurrency,
} from "@/lib/types/bank-ledger";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Loader2, Plus } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

const DESTS: LedgerDestination[] = ["our_bank", "supplier"];
// ── FOUR, BECAUSE FOUR IS WHAT ARRIVES ──────────────────────────────
//
// The wallet top-up dialog lets a customer pay in USD, EUR, GBP or HKD,
// and TURLIT holds a real account for each. This list had two, so a
// pound or a Hong Kong dollar that landed in the bank could not be
// written down at all -- on the one screen whose job is to notice money
// that never arrived.
const CURRENCIES: LedgerCurrency[] = ["EUR", "USD", "GBP", "HKD"];
// What a wallet can hold, and therefore what a deposit can be credited
// as. A GBP transfer funds a EUR wallet.
const WALLET_CURRENCIES: WalletCurrency[] = ["EUR", "USD"];
const SYMB: Record<LedgerCurrency, string> = {
  EUR: "€",
  USD: "$",
  GBP: "£",
  HKD: "HK$",
};

function fmt(v: number, c: LedgerCurrency) {
  // ── THE SIGN GOES BEFORE THE SYMBOL ─────────────────────────────────
  //
  // Intl puts it inside, so this rendered €-1,234.00 while the rest of
  // the app writes −€1,234.00. On the one screen whose job is to make a
  // column of money add up, a sign in the wrong place is a column that
  // reads wrong at a glance.
  const n = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(v));
  return `${v < 0 ? "−" : ""}${SYMB[c]}${n}`;
}

// Scoped styles for the mockup-only classes (.recon-hero, .check, .field,
// the responsive form/destination grids). Rule bodies copied from the
// approved super-admin mockup and prefixed under .psm-recon so they never
// leak; every color/spacing token comes from the .psmapp shell variables.
const RECON_CSS = `
.psm-recon .recon-hero{position:relative;overflow:hidden;border-radius:16px;padding:22px;color:#fff;background:linear-gradient(135deg,#0e9e6e,var(--win) 60%,#3ad1a0);box-shadow:0 22px 46px -26px rgba(16,185,129,.7)}
/* The hero was green whatever it said, so "3 to investigate" — the one
   sentence on this screen that means money is missing — arrived on a
   celebratory green gradient. It now carries the tone of what it says. */
.psm-recon .recon-hero.warn{background:linear-gradient(135deg,#b45309,var(--warn) 60%,#f0b357);box-shadow:0 22px 46px -26px rgba(224,138,0,.7)}
.psm-recon .recon-hero.idle{background:linear-gradient(135deg,#2b3350,#3f4a6b 60%,#55618a);box-shadow:0 22px 46px -26px rgba(20,30,80,.6)}
.psm-recon .recon-hero.err{background:linear-gradient(135deg,#9b1c20,var(--danger) 60%,#f07076);box-shadow:0 22px 46px -26px rgba(229,72,77,.7)}
.psm-recon .recon-hero .rh-l{font-size:.72rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;opacity:.85}
.psm-recon .recon-hero .rh-v{font-family:var(--hd);font-weight:800;font-size:1.9rem;margin:6px 0 2px}
.psm-recon .recon-hero .rh-d{opacity:.9;font-size:.9rem}
.psm-recon .checks{display:flex;flex-direction:column;gap:10px}
.psm-recon .check{display:flex;align-items:center;gap:13px;padding:14px 16px;border:1px solid var(--line);border-radius:14px;background:var(--panel);box-shadow:var(--shadow-sm)}
.psm-recon .check .cki{width:36px;height:36px;border-radius:10px;display:grid;place-items:center;flex:0 0 auto}
.psm-recon .check.ok .cki{background:var(--win-soft);color:var(--win)}
.psm-recon .check.warn .cki{background:var(--danger-soft);color:var(--danger)}
.psm-recon .check .cx{min-width:0}
.psm-recon .check .ct{font-weight:700}
.psm-recon .check .cd{color:var(--faint);font-size:.84rem}
.psm-recon .check .cw{color:var(--warn);font-size:.8rem;margin-top:4px;line-height:1.35}
.psm-recon .check.actionable{cursor:pointer;transition:border-color .14s,box-shadow .14s}
.psm-recon .check.actionable:hover{border-color:var(--warn);box-shadow:var(--shadow-sm)}
.psm-recon .check.actionable:focus-visible{outline:2px solid var(--primary);outline-offset:2px}
.psm-recon .check .cv{margin-left:auto;display:inline-flex;align-items:center;gap:10px;text-align:right;font-family:var(--hd);font-weight:800;white-space:nowrap}
.psm-recon .dgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(220px,100%),1fr));gap:12px}
.psm-recon .dcard{border:1px solid var(--line);border-radius:14px;padding:14px 16px;background:var(--panel);box-shadow:var(--shadow-sm)}
.psm-recon .dcard .dl{color:var(--faint);font-size:.78rem;font-weight:600}
.psm-recon .dcard .dv{font-family:var(--hd);font-weight:800;font-size:1.15rem;margin-top:6px}
.psm-recon .frow{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(150px,100%),1fr));gap:12px}
.psm-recon .field label{font-size:.8rem;font-weight:600;color:var(--txt-2);display:block;margin-bottom:6px}
.psm-recon .field input,.psm-recon .field select{width:100%;font-family:var(--bd);font-size:.92rem;border:1px solid var(--line-2);border-radius:11px;padding:11px 13px;background:var(--panel-2);color:var(--ink)}
.psm-recon .field input:focus,.psm-recon .field select:focus{outline:0;border-color:var(--primary);background:var(--panel);box-shadow:0 0 0 3px var(--primary-tint)}
.psm-recon .field select{-webkit-appearance:none;appearance:none;background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238b93a6' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'><path d='m6 9 6 6 6-6'/></svg>");background-repeat:no-repeat;background-position:right 11px center;background-size:15px;padding-right:34px}
.psm-recon .rspin{display:grid;place-items:center;padding:26px 0;color:var(--txt-2)}
`;

export default function ReconciliationView() {
  const queryClient = useQueryClient();

  const reconQ = useQuery({
    queryKey: ["reconciliation"],
    queryFn: async () => {
      const res = await getReconciliation();
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
  });

  const entriesQ = useQuery({
    queryKey: ["bank-ledger-entries"],
    queryFn: async () => {
      const res = await listLedgerEntries();
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
  });

  // ── NO DEFAULT DESTINATION ────────────────────────────────────────
  //
  // This started on "supplier". Pressing Check on a gap fills in the
  // currency, the direction and the amount and scrolls you here, and it
  // does not touch the destination -- so one press and one Add put the
  // whole missing amount against the supplier bank whether or not that
  // is where it landed, and the two balance cards below then both lie.
  // The server already refuses an empty one ("Pick a destination"), so
  // an unset default costs nothing and guesses nothing.
  const [destination, setDestination] = useState<LedgerDestination | "">("");
  const [currency, setCurrency] = useState<LedgerCurrency>("EUR");
  const [direction, setDirection] = useState<LedgerDirection>("deposit");
  const [amount, setAmount] = useState("");
  const [occurredOn, setOccurredOn] = useState("");
  const [note, setNote] = useState("");
  // What this deposit was credited to wallets as, when the bank received
  // something else. Both or neither.
  const [creditedCurrency, setCreditedCurrency] =
    useState<WalletCurrency>("EUR");
  const [creditedAmount, setCreditedAmount] = useState("");

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["reconciliation"] });
    queryClient.invalidateQueries({ queryKey: ["bank-ledger-entries"] });
  };

  const { mutate: add, isPending: adding } = useMutation({
    mutationFn: async () => {
      const amt = Number(amount);
      if (!(amt > 0)) throw new Error("Enter a positive amount.");
      if (!destination) throw new Error("Pick a destination first.");
      const credAmt = Number(creditedAmount);
      if (creditedAmount.trim() && !(credAmt > 0)) {
        throw new Error("Credited amount must be more than zero, or empty.");
      }
      const res = await addLedgerEntry({
        destination,
        currency,
        direction,
        amount: amt,
        occurred_on: occurredOn || undefined,
        note: note || undefined,
        ...(credAmt > 0
          ? { credited_currency: creditedCurrency, credited_amount: credAmt }
          : {}),
      });
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success("Entry recorded");
      setAmount("");
      setNote("");
      setOccurredOn("");
      setCreditedAmount("");
      invalidate();
    },
    onError: (e: Error) =>
      toast.error("Failed to record entry", { description: e.message }),
  });

  // ── "CHECK" WAS A LABEL OVER A DEAD END ───────────────────────────
  //
  // The hero said "1 to investigate" and the row said "Check", and
  // there was nothing to press. The owner read it as a broken control:
  // "ik kan hier niet eens wat checken, staat gewoon alleen Check".
  //
  // The gap has exactly one cause and one cure. Credited comes from the
  // completed wallet top-ups; received comes from what somebody typed
  // in off the bank statement. A gap means the bank side has not been
  // entered. So pressing the row now FILLS IN that form with the
  // currency and the missing amount and takes you to it.
  const formRef = useRef<HTMLDivElement | null>(null);
  const investigate = (r: { currency: string; gap: number }) => {
    const cur = String(r.currency).toUpperCase();
    if (cur === "EUR" || cur === "USD") setCurrency(cur as LedgerCurrency);
    // Deliberately NOT a destination. Which bank received it is the one
    // thing this row cannot know, and guessing it puts real money on the
    // wrong account.
    setDestination("");
    // A positive gap is money credited to wallets that the bank has not
    // been recorded as receiving, so the entry to add is a deposit. A
    // negative one is the other way round.
    setDirection(r.gap >= 0 ? "deposit" : "withdrawal");
    setAmount(Math.abs(r.gap).toFixed(2));
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const rows = reconQ.data?.rows ?? [];
  const mismatches = rows.filter((r) => Math.abs(r.gap) >= 0.01);
  // Nothing recorded on EITHER side is not a reconciliation that passed —
  // it is a reconciliation that had nothing to compare. This screen said
  // "All balanced ✓" in a green hero on a tenant with no ledger entries at
  // all, which is the same trick as "You're all caught up" over a failed
  // read: confidence projected out of emptiness. An empty ledger beside a
  // hundred real bank deposits is itself the thing to look at.
  const anyMovement = rows.some(
    (r) => Math.abs(r.credited) >= 0.01 || Math.abs(r.received) >= 0.01,
  );
  // A TRUNCATED READ IS NOT A BALANCED BOOK. Both walks hit a page
  // ceiling at 50,000 rows; past that the totals are a floor, and a floor
  // compared against a floor can come out level while real money is
  // missing from both sides. The screen is careful everywhere else to
  // distinguish "unknown" from "balanced"; this is the one input it did
  // not have.
  const truncated = reconQ.data?.truncated === true;
  const heroTone = reconQ.isLoading
    ? "idle"
    : reconQ.isError
      ? "err"
      : truncated
        ? "warn"
        : !anyMovement
        ? "idle"
        : mismatches.length === 0
          ? ""
          : "warn";
  const heroStatus = reconQ.isLoading
    ? "Checking…"
    : reconQ.isError
      ? "Unable to load"
      : truncated
        ? "Too much history to check in one pass"
      : !anyMovement
        ? "Nothing to compare yet"
        : mismatches.length === 0
          ? "All balanced ✓"
          : `${mismatches.length} to investigate`;

  return (
    <div
      className="psmview psm-recon"
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
    >
      <style>{RECON_CSS}</style>

      <div className="phead">
        <div>
          <h1>Bank Balances &amp; Reconciliation</h1>
          {/* ── SAY WHAT IT ACTUALLY COMPARES ────────────────────────
              "Banks against wallets" is not what this does, and the
              difference matters. It sums completed wallet_topups against
              bank_ledger_entries. It never reads `wallets` at all, and
              seven things can legitimately move a balance -- exchanges,
              ad-account funding, withdrawals, invoices, precharges,
              refunds and admin adjustments -- none of which are on
              either side of this comparison.
              So a gap here means "what we credited does not match what
              the bank shows", which is the useful question. It does NOT
              mean the wallets are right, and a screen that implies it
              does makes a blind spot look like a clean bill. */}
          <p>
            What we credited to wallets, against what the bank actually
            received. It does not check the wallet balances themselves.
          </p>
        </div>
      </div>

      {/* Status hero */}
      <div className={`recon-hero${heroTone ? ` ${heroTone}` : ""}`}>
        <div className="rh-l">Reconciliation status</div>
        <div className="rh-v">{heroStatus}</div>
        <div className="rh-d">
          Credited to wallets (completed topups) vs actually received (ledger),
          per currency.
        </div>
      </div>

      {/* Per-currency checks */}
      {reconQ.isLoading ? (
        <div className="card">
          <div className="rspin">
            <Loader2 className="animate-spin" />
          </div>
        </div>
      ) : reconQ.isError ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            {(reconQ.error as Error)?.message ?? "Failed to load reconciliation."}
          </p>
        </div>
      ) : (
        <>
          <h2>Per currency</h2>
          <div className="checks">
            {rows.map((r) => {
              const ok = Math.abs(r.gap) < 0.01;
              return (
                <div
                  key={r.currency}
                  className={`check ${ok ? "ok" : "warn"}${ok ? "" : " actionable"}`}
                  role={ok ? undefined : "button"}
                  tabIndex={ok ? undefined : 0}
                  title={
                    ok
                      ? undefined
                      : "Record what the bank actually received for this currency"
                  }
                  onClick={ok ? undefined : () => investigate(r)}
                  onKeyDown={
                    ok
                      ? undefined
                      : (e) => {
                          if (e.target !== e.currentTarget) return;
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            investigate(r);
                          }
                        }
                  }
                >
                  <span className="cki">
                    {ok ? (
                      <CheckCircle2 size={18} />
                    ) : (
                      <AlertTriangle size={18} />
                    )}
                  </span>
                  <div className="cx">
                    <div className="ct">{r.currency}</div>
                    <div className="cd">
                      Credited {fmt(r.credited, r.currency)} · Received{" "}
                      {fmt(r.received, r.currency)}
                    </div>
                    {/* The number alone does not say what to do about it.
                        This row is the only place the difference is
                        visible, so it is the place to say what it means. */}
                    {ok ? null : (
                      <div className="cw">
                        {r.received === 0
                          ? "Nothing has been entered from the bank statement for this currency yet — press to record it."
                          : "The bank side is short by this much — press to record the missing entry."}
                      </div>
                    )}
                  </div>
                  <div className="cv">
                    <span
                      className="mono"
                      style={{
                        fontSize: ".82rem",
                        color: ok ? "var(--faint)" : "var(--danger)",
                      }}
                    >
                      {fmt(r.gap, r.currency)}
                    </span>
                    <span className={`badge ${ok ? "ok" : "due"}`}>
                      {ok ? "Balanced" : "Check"}
                    </span>
                  </div>
                </div>
              );
            })}
            {rows.length === 0 && (
              <div className="card">
                <p className="muted" style={{ margin: 0 }}>
                  Nothing to reconcile yet.
                </p>
              </div>
            )}
          </div>

          {/* Per-destination balances */}
          <h2>Bank destinations</h2>
          <div className="dgrid">
            {(reconQ.data?.balances ?? []).map((b) => (
              <div key={`${b.destination}-${b.currency}`} className="dcard">
                <div className="dl">
                  {DESTINATION_LABELS[b.destination]} · {b.currency}
                </div>
                <div className="dv mono">{fmt(b.balance, b.currency)}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Record an entry */}
      <div className="card" ref={formRef}>
        <h2>Record a bank entry</h2>
        <p className="muted" style={{ fontSize: ".9rem", margin: "6px 0 14px" }}>
          From the actual bank/supplier statement.
        </p>

        <div className="frow">
          <div className="field">
            <label>Destination</label>
            <select
              value={destination}
              onChange={(e) =>
                setDestination(e.target.value as LedgerDestination | "")
              }
            >
              <option value="">Which account received it?</option>
              {DESTS.map((d) => (
                <option key={d} value={d}>
                  {DESTINATION_LABELS[d]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Currency</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as LedgerCurrency)}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Direction</label>
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value as LedgerDirection)}
            >
              <option value="deposit">Deposit (in)</option>
              <option value="withdrawal">Withdrawal (out)</option>
            </select>
          </div>
          <div className="field">
            <label>Amount</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              placeholder="0.00"
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Date</label>
            <input
              type="date"
              value={occurredOn}
              onChange={(e) => setOccurredOn(e.target.value)}
            />
          </div>
        </div>

        {/* ── WHAT IT CREDITED, WHEN THAT IS NOT WHAT THE BANK GOT ──
            A GBP 1,000 transfer puts EUR 1,150 in a wallet. Without this
            the EUR row above is short by 1,150 for ever and the hero
            shows an alarm nobody can clear. Only the owner knows the
            rate the bank gave. */}
        {direction === "deposit" && currency !== creditedCurrency ? (
          <div className="frow" style={{ marginTop: 12 }}>
            <div className="field">
              <label>Credited to wallets as (optional)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={creditedAmount}
                placeholder="0.00"
                onChange={(e) => setCreditedAmount(e.target.value)}
              />
            </div>
            <div className="field">
              <label>In</label>
              <select
                value={creditedCurrency}
                onChange={(e) =>
                  setCreditedCurrency(e.target.value as WalletCurrency)
                }
              >
                {WALLET_CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : null}
        {direction === "deposit" &&
        currency !== creditedCurrency &&
        !creditedAmount.trim() ? (
          <p className="muted" style={{ fontSize: ".82rem", margin: "8px 0 0" }}>
            Leave this empty and the {currency} you received counts towards
            nothing on the per-currency check above — only towards the
            balance of the account it landed in.
          </p>
        ) : null}

        <div className="field" style={{ marginTop: 2 }}>
          <label>Note (optional)</label>
          <input
            value={note}
            placeholder="e.g. statement ref, sender name"
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        <button
          type="button"
          className="btn grad"
          disabled={adding}
          onClick={() => add()}
          style={{ marginTop: 14 }}
        >
          {adding ? <Loader2 className="animate-spin" /> : <Plus />}
          Add entry
        </button>
      </div>

      {/* Ledger */}
      <h2>Ledger</h2>
      <div className="card" style={{ padding: entriesQ.isLoading ? 20 : 0 }}>
        {entriesQ.isLoading ? (
          <div className="rspin">
            <Loader2 className="animate-spin" />
          </div>
        ) : entriesQ.isError ? (
          // NOT "no entries yet", on the screen whose whole purpose is
          // noticing money that never arrived. The hero above is already
          // careful about this distinction; the ledger below it was not.
          <p style={{ margin: 0, padding: 20, color: "var(--danger)", fontWeight: 600 }}>
            We couldn&apos;t load the ledger — this is NOT an empty ledger.
            Reload before drawing any conclusion from this screen.
          </p>
        ) : (entriesQ.data?.entries ?? []).length === 0 ? (
          <p className="muted" style={{ margin: 0, padding: 20 }}>
            No entries yet.
          </p>
        ) : (
          <div className="tblwrap">
            <table className="tbl wide">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Destination</th>
                  <th>Direction</th>
                  <th className="r">Amount</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {(entriesQ.data?.entries ?? []).map((e) => (
                  <tr key={e.id}>
                    {/* A date, not the raw ISO string. Every other screen
                        in the app writes "18 Sep 2026"; this one printed
                        2026-09-18 straight out of the column. */}
                    <td data-label="Date" style={{ whiteSpace: "nowrap" }}>
                      {shortDate(e.occurred_on)}
                    </td>
                    <td data-label="Destination">{DESTINATION_LABELS[e.destination]}</td>
                    <td data-label="Direction">
                      <span
                        className={`badge ${
                          e.direction === "deposit" ? "ok" : "pend"
                        }`}
                      >
                        {e.direction === "deposit" ? "in" : "out"}
                      </span>
                    </td>
                    {/* ── SIGNED, SO THE COLUMN ADDS UP ────────────────
                        Both directions printed unsigned, while the
                        Bank-destinations card above is the SIGNED
                        running balance — so a reader adding this column
                        got deposits plus withdrawals and could not
                        reconcile it against the figure it is meant to
                        explain. */}
                    <td data-label="Amount" className="r mono">
                      {e.direction === "withdrawal" ? "−" : "+"}
                      {fmt(Math.abs(e.amount), e.currency)}
                      {e.credited_currency && Number(e.credited_amount) > 0 ? (
                        <div
                          className="muted"
                          style={{ fontSize: ".76rem", fontWeight: 600 }}
                        >
                          credited{" "}
                          {fmt(
                            Number(e.credited_amount),
                            e.credited_currency,
                          )}
                        </div>
                      ) : null}
                    </td>
                    <td
                      data-label="Note"
                      className="muted"
                      style={{
                        maxWidth: "16rem",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {e.note ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* A LIST THAT STOPS HAS TO SAY SO. It showed the most recent
                100 and nothing else, so a reader adding this column up
                got a total with no relation to the balances above it and
                no way to tell. */}
            {entriesQ.data?.capped ? (
              <p
                className="muted"
                style={{ margin: 0, padding: "12px 16px", fontSize: ".84rem" }}
              >
                Showing the {entriesQ.data.limit} most recent entries. There
                are older ones — the totals above include all of them.
              </p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
