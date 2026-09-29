"use client";

import {
  useMargin,
  useMoneyIn,
  type MarginLine,
  type MoneyInRow,
} from "@/hooks/use-ledger-detail";
import { formatCurrency } from "@/lib/utils";

/**
 * MONEY IN, AND WHAT WE KEEP.
 *
 * The owner, 29-09: "wat erg belangrijk is dus de binnenkomsten op
 * alle banken en dan de fees en profit die we overhouden, dat moet ook
 * kloppen anders hebben we ergens een lek."
 *
 * Two panels, both built on one rule: never print a figure without
 * saying where it came from, and never add two things together that
 * are not the same kind of money.
 */

export function MoneyInPanel({ tenantId }: { tenantId: string | null }) {
  const q = useMoneyIn(tenantId);
  const rows = q.data?.rows ?? [];

  if (q.isPending) {
    return <p className="cap lg-pad">Reading the bank feed…</p>;
  }
  if (q.isError) {
    return (
      <p className="cap lg-pad">
        We could not read the bank feed. Reload — this is not &quot;nothing
        came in&quot;.
      </p>
    );
  }
  if (q.data?.notSwitchedOn) {
    return <p className="cap lg-pad">The bank feed is not set up on this database.</p>;
  }
  if (!rows.length) {
    return <p className="cap lg-pad">No deposits and no completed top-ups yet.</p>;
  }

  return (
    <>
      {/* ── EEN ONDERGRENS IS GEEN TOTAAL ────────────────────────
          pageAllRows loopt tot zijn eigen plafond en zegt het als hij
          dat raakt. Gebeurt dat, dan zijn de bedragen hieronder een
          ondergrens en moet dat er STAAN -- een afgekapt totaal ziet er
          precies zo uit als een compleet totaal, en dat is de fout waar
          dit hele scherm voor bestaat. */}
      {q.data?.truncated ? (
        <p className="lg-warn">
          <b>Dit is een ondergrens, geen totaal.</b> Er zijn meer rijen dan
          we in een keer konden lezen, dus alles hieronder telt te laag.
        </p>
      ) : null}
      <p className="lg-warn">
        <b>The gap here is not a leak — yet.</b> Most of these deposits carry
        the references of the <b>old</b> system, so they were never going to
        match a top-up in this one. What matters is the third column: money
        that arrived and was never credited to anybody is money standing still,
        and every one of those has to end up either matched to a customer or
        sent back.
      </p>
      <div className="lg-mi">
        {rows.map((r) => (
          <MoneyInCard key={r.currency} r={r} />
        ))}
      </div>
    </>
  );
}

function MoneyInCard({ r }: { r: MoneyInRow }) {
  const unmatched = Math.round((r.bank - r.matched) * 100) / 100;
  return (
    <div className="lg-mi-card">
      <div className="cur">{r.currency}</div>
      <div className="mi-row">
        <span>
          Arrived in the bank
          <i>{r.bankCount} deposits</i>
        </span>
        <b>{formatCurrency(r.bank, r.currency)}</b>
      </div>
      <div className="mi-row">
        <span>
          Matched to a top-up
          <i>{r.matchedCount} of them</i>
        </span>
        <b>{formatCurrency(r.matched, r.currency)}</b>
      </div>
      <div className="mi-row warn">
        <span>
          Arrived, not yet attributed
          <i>{r.bankCount - r.matchedCount} waiting on somebody</i>
        </span>
        <b>{formatCurrency(unmatched, r.currency)}</b>
      </div>
      <div className="mi-row total">
        <span>
          Credited to wallets
          <i>{r.creditedCount} completed top-ups</i>
        </span>
        <b>{formatCurrency(r.credited, r.currency)}</b>
      </div>
    </div>
  );
}

export function MarginPanel({ tenantId }: { tenantId: string | null }) {
  const q = useMargin(tenantId);
  const lines = q.data?.lines ?? [];

  if (q.isPending) return <p className="cap lg-pad">Working out what we keep…</p>;
  if (q.isError) {
    return (
      <p className="cap lg-pad">
        We could not read the figures. Reload — this is not a zero.
      </p>
    );
  }
  if (!lines.length) {
    return (
      <p className="cap lg-pad">
        Nothing earned and nothing owed yet — no fees, no paid invoices, no
        commissions.
      </p>
    );
  }

  const currencies = [...new Set(lines.map((l) => l.currency))].sort();

  return (
    <>
      {/* Zelfde regel als bij What came in: een afgekapte winst ziet er
          precies zo uit als de echte, en deze is te LAAG omdat top_ups
          aan de opbrengstkant staat. */}
      {q.data?.truncated ? (
        <p className="lg-warn">
          <b>Dit is een ondergrens, geen totaal.</b> Er zijn meer rijen dan
          we in een keer konden lezen, dus wat we overhouden telt te laag.
        </p>
      ) : null}
      <p className="lg-warn">
        <b>This is not turnover.</b> A customer&apos;s top-up passes through
        us — theirs coming in, theirs going out — and the ad spend goes
        on to the supplier. Both are listed in grey and add up to nothing
        here; what is ours is the <b>fee</b> on that spend, the
        subscriptions, and the DST. Everything below names the table it came
        from.
      </p>
      {currencies.map((cur) => (
        <MarginBlock
          key={cur}
          currency={cur}
          lines={lines.filter((l) => l.currency === cur)}
        />
      ))}
      {currencies.length > 1 ? (
        <p className="lg-foot">
          EUR and USD are kept apart on purpose. Adding them would need a rate,
          and a rate picked today makes last month&apos;s figure move.
        </p>
      ) : null}
    </>
  );
}

function MarginBlock({
  currency,
  lines,
}: {
  currency: string;
  lines: MarginLine[];
}) {
  const income = lines
    .filter((l) => !l.cost && !l.through)
    .reduce((t, l) => Math.round((t + l.amount) * 100) / 100, 0);
  const costs = lines
    .filter((l) => l.cost)
    .reduce((t, l) => Math.round((t + l.amount) * 100) / 100, 0);
  const kept = Math.round((income - costs) * 100) / 100;

  return (
    <div className="lg-card lg-mg">
      <div className="mg-head">{currency}</div>
      {lines.map((l) => (
        <div
          className={`mg-row${l.cost ? " cost" : ""}${l.through ? " through" : ""}`}
          key={l.label}
        >
          <span className="l">
            {l.label}
            <i>
              {l.count} × · {l.source}
              {l.through ? " · not ours, counts for nothing here" : ""}
            </i>
          </span>
          <b>
            {l.cost ? "−" : ""}
            {formatCurrency(l.amount, currency)}
          </b>
        </div>
      ))}
      <div className="mg-row sum">
        <span className="l">What we keep</span>
        <b className={kept < 0 ? "neg" : ""}>{formatCurrency(kept, currency)}</b>
      </div>
    </div>
  );
}

export const LEDGER_TABS_CSS = `
  .lg-pad{padding:4px 2px;margin:0}
  .lg-mi{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(min(280px,100%),1fr))}
  .lg-mi-card{background:var(--panel,#fff);border:1px solid var(--line,#e3e8f4);
    border-radius:16px;padding:16px}
  .lg-mi-card .cur{font-family:var(--hd,inherit);font-weight:800;font-size:1.1rem;
    margin-bottom:10px}
  .lg-mi-card .mi-row{display:flex;justify-content:space-between;align-items:flex-start;
    gap:12px;padding:8px 0;border-bottom:1px solid var(--line,#e3e8f4);font-size:.86rem}
  .lg-mi-card .mi-row:last-child{border-bottom:0}
  .lg-mi-card .mi-row span{display:flex;flex-direction:column;gap:2px;min-width:0}
  .lg-mi-card .mi-row i{font-style:normal;font-size:.74rem;color:var(--faint,#818ead)}
  .lg-mi-card .mi-row b{font-variant-numeric:tabular-nums;white-space:nowrap;font-weight:800}
  .lg-mi-card .mi-row.warn b{color:var(--warn,#b45309)}
  .lg-mi-card .mi-row.total{border-top:2px solid var(--line-2,#d3daec);margin-top:4px;
    padding-top:10px}

  .lg-mg{padding:16px}
  .lg-mg + .lg-mg{margin-top:12px}
  .mg-head{font-family:var(--hd,inherit);font-weight:800;font-size:1.05rem;
    margin-bottom:8px}
  .mg-row{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;
    padding:9px 0;border-bottom:1px solid var(--line,#e3e8f4);font-size:.86rem}
  .mg-row:last-child{border-bottom:0}
  .mg-row .l{display:flex;flex-direction:column;gap:2px;min-width:0}
  .mg-row .l i{font-style:normal;font-size:.73rem;color:var(--faint,#818ead)}
  .mg-row b{font-variant-numeric:tabular-nums;white-space:nowrap;font-weight:800;
    color:#0e8f66}
  .mg-row.cost b{color:#c0392b}
  .mg-row.through b{color:var(--faint,#818ead);text-decoration:line-through;
    text-decoration-thickness:1px}
  .mg-row.through .l{color:var(--txt-2,#535e78)}
  .mg-row.sum{border-top:2px solid var(--line-2,#d3daec);border-bottom:0;
    margin-top:4px;padding-top:12px;font-size:.98rem}
  .mg-row.sum .l{font-weight:800}
  .mg-row.sum b{font-family:var(--hd,inherit);font-size:1.15rem;color:var(--ink,#12162a)}
  .mg-row.sum b.neg{color:#c0392b}
`;
