"use client";

import { useMemo, useState } from "react";
import dayjs from "dayjs";

import { useAppContext } from "@/context/app-provider";
import { useLedgerCheck, useLedgerLines } from "@/hooks/use-ledger";
import { formatCurrency } from "@/lib/utils";

/**
 * THE LEDGER, ON A SCREEN.
 *
 * The owner, 28-09: "waar is grootboek?" — and then, when told it was
 * in the database: "daarin kan ik ook dus alle geld lekken enz checken
 * ofzo?"
 *
 * Yes, and this is where. `wallets` carries a BALANCE; until plak 125
 * the movements behind it were spread over eight tables and the
 * balance was raised and lowered in place, so if one ever went wrong
 * we could not PROVE what it should have been. `wallet_ledger` writes
 * one line per movement with the balance before and after, from a
 * trigger on `wallets` — so nothing can move without a line.
 *
 * The page answers one question first, in one figure: do the books
 * add up? Everything below it is the evidence.
 *
 * ── WHAT IT DOES NOT CLAIM ────────────────────────────────────────
 *
 * Nothing from before the trigger went on. Every wallet starts with
 * one `opening` line carrying the balance of that moment, and that
 * line is not evidence of anything — it is the starting point. The
 * screen says so where somebody would otherwise assume otherwise.
 */
export default function LedgerScreen() {
  const { profile } = useAppContext();
  const tenantId = profile?.tenant_id ?? null;
  const [source, setSource] = useState("");

  const check = useLedgerCheck(tenantId);
  const lines = useLedgerLines(tenantId, { source });

  const sources = useMemo(() => {
    const seen = new Map<string, number>();
    for (const l of lines.data?.rows ?? []) {
      seen.set(l.source, (seen.get(l.source) ?? 0) + 1);
    }
    return [...seen.entries()].sort((a, b) => b[1] - a[1]);
  }, [lines.data]);

  if (check.data?.notSwitchedOn || lines.data?.notSwitchedOn) {
    return (
      <div className="psmview lg">
        <style>{LEDGER_CSS}</style>
        <div className="phead">
          <div>
            <h1>Ledger</h1>
            <p className="cap">Every movement behind every wallet balance.</p>
          </div>
        </div>
        <div className="lg-card">
          <p className="cap" style={{ margin: 0 }}>
            Not switched on in the database yet — run plak 125 and this page
            works.
          </p>
        </div>
      </div>
    );
  }

  const off = check.data?.off ?? [];
  // isPending, not isLoading: the query is gated on the tenant, so a
  // query that never ran reports isLoading false and this would say
  // "the books add up" over a read that did not happen.
  const checking = check.isPending;
  const checkFailed = check.isError;

  return (
    <div className="psmview lg">
      <style>{LEDGER_CSS}</style>

      <div className="phead">
        <div>
          <h1>Ledger</h1>
          <p className="cap">
            Every movement behind every wallet balance, with the balance
            before and after.
          </p>
        </div>
      </div>

      {/* ── THE ONE QUESTION, IN ONE FIGURE ───────────────────── */}
      <div
        className={`lg-verdict ${
          checkFailed ? "unknown" : checking ? "unknown" : off.length ? "bad" : "good"
        }`}
      >
        <div className="v">
          {checkFailed ? "—" : checking ? "…" : off.length}
        </div>
        <div className="t">
          <b>
            {checkFailed
              ? "We could not check the books just now"
              : checking
                ? "Checking the books…"
                : off.length === 0
                  ? "The books add up"
                  : off.length === 1
                    ? "One wallet does not add up"
                    : `${off.length} wallets do not add up`}
          </b>
          <span>
            {checkFailed
              ? "Reload. This is not a zero — we did not get an answer."
              : off.length === 0
                ? `Every wallet balance equals the sum of its own movements${
                    check.data?.wallets ? ` (${check.data.wallets} wallets)` : ""
                  }.`
                : "Each one below is money that moved without the ledger seeing it, or the other way round."}
          </span>
        </div>
      </div>

      {off.length ? (
        <div className="lg-card">
          {off.map((o, i) => (
            <div className="lg-off" key={i}>
              <span className="mono">{o.advertiser_id ?? "—"}</span>
              <span>
                balance {formatCurrency(o.balance, o.currency)} · lines{" "}
                {formatCurrency(o.fromLines, o.currency)} ·{" "}
                <b>
                  difference{" "}
                  {formatCurrency(
                    Math.round((o.balance - o.fromLines) * 100) / 100,
                    o.currency,
                  )}
                </b>
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {/* ── WHERE THE MOVEMENTS CAME FROM ─────────────────────── */}
      {sources.length ? (
        <div className="lg-chips">
          <button
            className={`lg-chip${source === "" ? " on" : ""}`}
            onClick={() => setSource("")}
          >
            All
          </button>
          {sources.map(([s, n]) => (
            <button
              key={s}
              className={`lg-chip${source === s ? " on" : ""}${
                s === "unknown" ? " todo" : ""
              }`}
              onClick={() => setSource(s)}
            >
              {s} <span className="n">{n}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="lg-card">
        {lines.isPending ? (
          <p className="cap" style={{ margin: 0 }}>
            Loading the movements…
          </p>
        ) : lines.isError ? (
          <p className="cap" style={{ margin: 0 }}>
            We could not read the movements. Reload — this is not an empty
            ledger.
          </p>
        ) : (lines.data?.rows ?? []).length === 0 ? (
          <p className="cap" style={{ margin: 0 }}>
            No movements yet.
          </p>
        ) : (
          <div className="lg-rows">
            {(lines.data?.rows ?? []).map((l) => (
              <div className="lg-row" key={l.id}>
                <span className="when">
                  {dayjs(l.occurred_at).format("D MMM, HH:mm")}
                </span>
                <span className={`delta ${l.delta < 0 ? "out" : "in"}`}>
                  {l.delta > 0 ? "+" : "−"}
                  {formatCurrency(Math.abs(l.delta), l.currency)}
                </span>
                <span className="bal mono">
                  {formatCurrency(l.balance_before, l.currency)} →{" "}
                  {formatCurrency(l.balance_after, l.currency)}
                </span>
                <span className={`src${l.source === "unknown" ? " todo" : ""}`}>
                  {l.source}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="lg-foot">
        The ledger is authoritative from the moment it was switched on, and
        not one day earlier. Each wallet&apos;s first line is marked{" "}
        <b>opening</b> and carries the balance of that moment — it is the
        starting point, not evidence of where that money came from. A line
        marked <b>unknown</b> is a movement whose cause we recorded without a
        name; that is a to-do, not a fault.
      </p>
    </div>
  );
}

const LEDGER_CSS = `
  .lg{display:flex;flex-direction:column;gap:14px}
  .lg-card{background:var(--panel,#fff);border:1px solid var(--line,#e3e8f4);
    border-radius:16px;padding:16px}

  .lg-verdict{display:flex;align-items:center;gap:16px;padding:18px;
    border-radius:16px;border:1px solid var(--line,#e3e8f4)}
  .lg-verdict .v{font-family:var(--hd,inherit);font-weight:800;font-size:2.4rem;
    line-height:1;min-width:64px;text-align:center;font-variant-numeric:tabular-nums}
  .lg-verdict .t{display:flex;flex-direction:column;gap:3px}
  .lg-verdict .t b{font-size:1rem;font-weight:800;color:var(--ink,#12162a)}
  .lg-verdict .t span{font-size:.84rem;line-height:1.45;color:var(--txt-2,#535e78)}
  .lg-verdict.good{background:#e7f8f1;border-color:#bfe9d8}
  .lg-verdict.good .v{color:#0e8f66}
  .lg-verdict.bad{background:#fdecec;border-color:#f6c9c9}
  .lg-verdict.bad .v{color:#c0392b}
  .lg-verdict.unknown{background:var(--panel-2,#f0f4fd)}
  .lg-verdict.unknown .v{color:var(--faint,#818ead)}

  .lg-off{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;
    padding:9px 0;border-bottom:1px solid var(--line,#e3e8f4);font-size:.86rem}
  .lg-off:last-child{border-bottom:0}

  .lg-chips{display:flex;flex-wrap:wrap;gap:7px}
  .lg-chip{padding:6px 12px;border-radius:99px;cursor:pointer;font:inherit;
    font-size:.8rem;font-weight:700;border:1px solid var(--line,#e3e8f4);
    background:var(--panel,#fff);color:var(--txt-2,#535e78)}
  .lg-chip.on{border-color:var(--primary,#3a6fff);color:var(--primary,#3a6fff);
    background:rgba(58,111,255,.06)}
  .lg-chip.todo{border-style:dashed}
  .lg-chip .n{opacity:.6;font-weight:600}

  .lg-rows{display:flex;flex-direction:column}
  .lg-row{display:grid;grid-template-columns:110px 110px 1fr auto;gap:12px;
    align-items:center;padding:9px 0;border-bottom:1px solid var(--line,#e3e8f4);
    font-size:.84rem}
  .lg-row:last-child{border-bottom:0}
  .lg-row .when{color:var(--faint,#818ead)}
  .lg-row .delta{font-weight:800;font-variant-numeric:tabular-nums}
  .lg-row .delta.in{color:#0e8f66}
  .lg-row .delta.out{color:#c0392b}
  .lg-row .bal{color:var(--txt-2,#535e78);font-size:.8rem}
  .lg-row .src{font-size:.76rem;font-weight:700;color:var(--txt-2,#535e78);
    background:var(--panel-2,#f0f4fd);padding:3px 9px;border-radius:99px}
  .lg-row .src.todo{border:1px dashed var(--line-2,#d3daec);background:transparent}

  .lg-foot{margin:0;font-size:.78rem;line-height:1.5;color:var(--faint,#818ead)}

  @media (max-width:720px){
    .lg-row{grid-template-columns:1fr auto;row-gap:4px}
    .lg-row .bal{grid-column:1 / -1}
    .lg-verdict{align-items:flex-start}
  }
`;
