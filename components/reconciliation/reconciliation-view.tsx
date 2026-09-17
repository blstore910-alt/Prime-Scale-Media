"use client";

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
} from "@/lib/types/bank-ledger";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const DESTS: LedgerDestination[] = ["our_bank", "supplier"];
const CURRENCIES: LedgerCurrency[] = ["EUR", "USD"];
const SYMB: Record<LedgerCurrency, string> = { EUR: "€", USD: "$" };

function fmt(v: number, c: LedgerCurrency) {
  return `${SYMB[c]}${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v)}`;
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

  const [destination, setDestination] =
    useState<LedgerDestination>("supplier");
  const [currency, setCurrency] = useState<LedgerCurrency>("EUR");
  const [direction, setDirection] = useState<LedgerDirection>("deposit");
  const [amount, setAmount] = useState("");
  const [occurredOn, setOccurredOn] = useState("");
  const [note, setNote] = useState("");

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["reconciliation"] });
    queryClient.invalidateQueries({ queryKey: ["bank-ledger-entries"] });
  };

  const { mutate: add, isPending: adding } = useMutation({
    mutationFn: async () => {
      const amt = Number(amount);
      if (!(amt > 0)) throw new Error("Enter a positive amount.");
      const res = await addLedgerEntry({
        destination,
        currency,
        direction,
        amount: amt,
        occurred_on: occurredOn || undefined,
        note: note || undefined,
      });
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success("Entry recorded");
      setAmount("");
      setNote("");
      setOccurredOn("");
      invalidate();
    },
    onError: (e: Error) =>
      toast.error("Failed to record entry", { description: e.message }),
  });

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
  const heroTone = reconQ.isLoading
    ? "idle"
    : reconQ.isError
      ? "err"
      : !anyMovement
        ? "idle"
        : mismatches.length === 0
          ? ""
          : "warn";
  const heroStatus = reconQ.isLoading
    ? "Checking…"
    : reconQ.isError
      ? "Unable to load"
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
          <p>
            Banks received, against wallets credited.
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
                <div key={r.currency} className={`check ${ok ? "ok" : "warn"}`}>
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
      <div className="card">
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
                setDestination(e.target.value as LedgerDestination)
              }
            >
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
        ) : (entriesQ.data ?? []).length === 0 ? (
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
                {(entriesQ.data ?? []).map((e) => (
                  <tr key={e.id}>
                    <td data-label="Date" style={{ whiteSpace: "nowrap" }}>{e.occurred_on}</td>
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
                    <td data-label="Amount" className="r mono">{fmt(e.amount, e.currency)}</td>
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
          </div>
        )}
      </div>
    </div>
  );
}
