"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  financeReportForMe,
  affiliateFinanceReportForMe,
} from "@/actions/finance-report-actions";
import {
  RANGE_LABELS,
  describeRange,
  rangeToDates,
  shortDate,
  type RangeKey,
} from "@/lib/pure-finance-range";
import {
  filterLines,
  summarise,
  toCsv,
  currenciesIn,
  accountsIn,
  KIND_LABELS,
  KIND_ORDER,
  type FinanceKind,
  type FinanceLine,
} from "@/lib/pure-finance-report";

/**
 * The financial report.
 *
 * ONE QUESTION AT A TIME. A customer opens this to answer something
 * specific — what did March cost me, what has this account taken, what
 * have you charged me in fees — so the filters sit on one row and the
 * totals recompute under them. Nothing is a separate page.
 *
 * TOTALS ARE PER CURRENCY, never combined. See lib/pure-finance-report.ts:
 * a single figure across a $1,000 and a €500 movement is not a number.
 *
 * AND IT SAYS WHAT IT COULD NOT READ. Every source is fetched
 * independently, so one unreadable table would otherwise show up as a
 * smaller total with nothing to indicate it. On a financial report that
 * is not a degraded experience, it is a wrong answer — so a failed source
 * is named at the top and the totals are marked as incomplete.
 */
export default function FinanceReport({
  audience = "advertiser",
}: {
  audience?: "advertiser" | "affiliate";
}) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["finance-report", audience],
    staleTime: 60_000,
    queryFn: async () => {
      const res =
        audience === "affiliate"
          ? await affiliateFinanceReportForMe()
          : await financeReportForMe();
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
  });

  const all = useMemo(() => data?.lines ?? [], [data]);

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [range, setRange] = useState<RangeKey>("all");
  const pickRange = (key: RangeKey) => {
    setRange(key);
    if (key === "custom") return; // keep whatever they already typed
    const r = rangeToDates(key);
    setFrom(r.from);
    setTo(r.to);
  };
  const [kind, setKind] = useState<"" | FinanceKind>("");
  const [currency, setCurrency] = useState("");
  const [account, setAccount] = useState("");
  const [search, setSearch] = useState("");

  const shown = useMemo(
    () =>
      filterLines(all, {
        from: from || null,
        to: to || null,
        kinds: kind ? [kind] : null,
        currencies: currency ? [currency] : null,
        account: account || null,
        search: search || null,
      }),
    [all, from, to, kind, currency, account, search],
  );

  const totals = useMemo(() => summarise(shown), [shown]);
  const allCurrencies = useMemo(() => currenciesIn(all), [all]);
  const allAccounts = useMemo(() => accountsIn(all), [all]);
  const filtered =
    !!from || !!to || !!kind || !!currency || !!account || !!search;

  const download = () => {
    // Built and handed over in the browser: the rows are already here, so
    // a round trip would only be a second chance to disagree with what is
    // on screen.
    const blob = new Blob([toCsv(shown)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `financial-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const money = (n: number, cur: string) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: cur === "USD" ? "USD" : "EUR",
      minimumFractionDigits: 2,
    }).format(n);

  return (
    <div className="fr">
      <style>{CSS}</style>

      {/* ── What we could not read ───────────────────────────────────── */}
      {data && data.failed.length > 0 ? (
        <div className="fr-warn">
          <b>These totals are incomplete.</b> We couldn&apos;t read{" "}
          {data.failed.join(", ")}. Everything else below is right; that
          part is missing rather than zero.
        </div>
      ) : null}
      {data?.truncated ? (
        <div className="fr-warn">
          <b>Showing the most recent movements.</b> There is more history
          than fits in one report — narrow the dates to see the rest.
        </div>
      ) : null}

      {/* ── Filters, one row ─────────────────────────────────────────── */}
      {/* The period, on its own line and above everything else: it is
          the filter that changes every figure under it, and the one
          people reach for first. */}
      <div className="fr-when-bar">
        <div className="fr-chips" role="group" aria-label="Period">
          {(
            ["all", "7d", "30d", "mtd", "lastm", "custom"] as RangeKey[]
          ).map((k) => (
            <button
              key={k}
              type="button"
              className={`fr-chip${range === k ? " on" : ""}`}
              aria-pressed={range === k}
              onClick={() => pickRange(k)}
            >
              {RANGE_LABELS[k]}
            </button>
          ))}
        </div>
        {/* What is actually being shown, in words. A row of chips tells
            you which button is pressed; it does not tell you which days
            you are looking at, and that is the thing you check before you
            trust a total. */}
        <span className="fr-when-says">{describeRange(from, to)}</span>
      </div>
      {range === "custom" ? (
        <div className="fr-custom">
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => setFrom(e.target.value)}
            aria-label="From"
          />
          <span className="fr-dash">–</span>
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
            aria-label="To"
          />
        </div>
      ) : null}

      <div className="fr-bar">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as "" | FinanceKind)}
          aria-label="Type"
        >
          <option value="">All types</option>
          {KIND_ORDER.filter((k) =>
            all.some((l) => l.kind === k),
          ).map((k) => (
            <option key={k} value={k}>
              {KIND_LABELS[k]}
            </option>
          ))}
        </select>
        {allCurrencies.length > 1 ? (
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            aria-label="Currency"
          >
            <option value="">Both currencies</option>
            {allCurrencies.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        ) : null}
        {allAccounts.length > 0 ? (
          <select
            value={account}
            onChange={(e) => setAccount(e.target.value)}
            aria-label="Ad account"
          >
            <option value="">All accounts</option>
            {allAccounts.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        ) : null}
        <input
          className="fr-search"
          type="search"
          placeholder="Search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search"
        />
        <button
          className="btn ghost sm fr-export"
          onClick={download}
          disabled={shown.length === 0}
          title={
            shown.length === 0
              ? "Nothing to export"
              : `Export ${shown.length} rows`
          }
        >
          Export CSV
        </button>
      </div>

      {/* ── Totals, per currency ─────────────────────────────────────── */}
      {totals.length > 0 ? (
        <div className="fr-tiles">
          {totals.map((t) => (
            <div className="fr-tile" key={t.currency}>
              <span className="fr-cur">{t.currency}</span>
              <div className="fr-nums">
                <div>
                  <small>In</small>
                  <b className="up">{money(t.in, t.currency)}</b>
                </div>
                <div>
                  <small>Out</small>
                  <b className="down">{money(t.out, t.currency)}</b>
                </div>
                <div>
                  <small>Net</small>
                  <b>{money(t.net, t.currency)}</b>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {/* ── The movements ────────────────────────────────────────────── */}
      {isLoading ? (
        <p className="cap fr-msg">Gathering your movements…</p>
      ) : isError ? (
        <div className="fr-msg fr-bad">
          <p>
            We couldn&apos;t build your report. This is not an empty
            history.
          </p>
          <button className="btn ghost sm" onClick={() => refetch()}>
            Try again
          </button>
        </div>
      ) : shown.length === 0 ? (
        <p className="cap fr-msg">
          {all.length === 0
            ? "Nothing has moved yet. Your first top-up will appear here."
            : filtered
              ? "No movements match those filters."
              : "Nothing to show."}
        </p>
      ) : (
        <div className="fr-list">
          {shown.map((l) => (
            <Line key={l.id} l={l} money={money} />
          ))}
        </div>
      )}
    </div>
  );
}

function Line({
  l,
  money,
}: {
  l: FinanceLine;
  money: (n: number, c: string) => string;
}) {
  const zero = l.amount === 0;
  return (
    <div className="fr-row">
      {/* Same three-letter months as the range above it. The locale
          formatter renders September as "Sept" and every other month in
          three, so one row in the column was a character wider than the
          rest — and which you get depends on the browser version. */}
      <div className="fr-when">{shortDate(l.at)}</div>
      <div className="fr-what">
        <b>{l.label}</b>
        <small>
          {[KIND_LABELS[l.kind], l.account, l.counterparty, l.reference]
            .filter(Boolean)
            .join(" · ")}
        </small>
      </div>
      <div
        className={
          "fr-amt" + (zero ? " nil" : l.amount > 0 ? " up" : " down")
        }
      >
        {/* A zero here is not nothing happening — it is a movement that
            has not settled, so it is shown as its status rather than as
            "0.00", which would read as a free transaction. */}
        {zero ? (
          <span className="fr-pending">{l.status ?? "pending"}</span>
        ) : (
          <>
            {l.amount > 0 ? "+" : "−"}
            {money(Math.abs(l.amount), l.currency)}
          </>
        )}
      </div>
    </div>
  );
}

const CSS = `
.fr{display:flex;flex-direction:column;gap:12px}

.fr-warn{padding:10px 13px;border-radius:12px;font-size:.82rem;line-height:1.5;
  background:var(--warn-tint,rgba(245,165,36,.12));
  border:1px solid rgba(245,165,36,.35)}

/* ── The period ───────────────────────────────────────────────────────
   Chips, then the range in words. On a phone the chips scroll sideways
   rather than wrapping to three lines: a filter bar that is taller than
   the first row of results pushes the answer off the screen. */
.fr-when-bar{display:flex;flex-direction:column;gap:7px}
.fr-chips{display:flex;gap:6px;overflow-x:auto;padding:2px 0 4px;
  scrollbar-width:none;-ms-overflow-style:none;scroll-snap-type:x proximity}
.fr-chips::-webkit-scrollbar{display:none}
.fr-chip{flex:0 0 auto;scroll-snap-align:start;font-family:var(--bd);
  font-size:.79rem;font-weight:650;white-space:nowrap;cursor:pointer;
  padding:7px 13px;border-radius:999px;border:1px solid var(--line-2);
  background:var(--panel);color:var(--txt-2);
  transition:background .12s,border-color .12s,color .12s,box-shadow .12s;
  -webkit-tap-highlight-color:transparent}
.fr-chip:hover{border-color:var(--primary);color:var(--ink)}
/* The selected one is filled, not merely outlined. At a glance across six
   chips, a heavier border is not a difference; a solid ground is. */
.fr-chip.on{background:var(--primary);border-color:var(--primary);color:#fff;
  box-shadow:0 6px 14px -8px rgba(58,111,255,.75)}
.fr-chip:focus-visible{outline:2px solid var(--primary);outline-offset:2px}
.fr-when-says{font-family:var(--hd);font-weight:800;font-size:1.02rem;
  letter-spacing:-.01em;color:var(--ink)}
.fr-custom{display:flex;align-items:center;gap:8px}
.fr-custom input{flex:1 1 0;min-width:0;font-family:var(--bd);font-size:.82rem;
  border:1px solid var(--line-2);border-radius:10px;padding:9px 10px;
  background:var(--panel);color:var(--ink)}

/* One row, wrapping only when it truly cannot fit. */
.fr-bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.fr-bar input,.fr-bar select{font-family:var(--bd);font-size:.82rem;
  border:1px solid var(--line-2);border-radius:10px;padding:8px 10px;
  background:var(--panel);color:var(--ink);min-width:0}
.fr-bar input[type=date]{flex:0 1 140px}
.fr-dash{color:var(--faint);font-size:.8rem}
.fr-search{flex:1 1 130px;min-width:110px}
.fr-export{margin-left:auto;flex:0 0 auto}

.fr-tiles{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}
.fr-tile{border:1px solid var(--line);border-radius:14px;padding:12px 14px;
  background:var(--panel)}
.fr-cur{display:block;font-size:.62rem;font-weight:800;letter-spacing:.1em;
  text-transform:uppercase;color:var(--faint)}
.fr-nums{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:8px}
.fr-nums small{display:block;font-size:.66rem;color:var(--faint)}
.fr-nums b{font-size:.95rem;font-variant-numeric:tabular-nums;
  overflow:hidden;text-overflow:ellipsis;display:block}
.fr-nums .up{color:var(--win,#0f9d66)}
.fr-nums .down{color:var(--danger)}

.fr-list{border:1px solid var(--line);border-radius:14px;overflow:hidden;
  background:var(--panel)}
.fr-row{display:grid;grid-template-columns:62px 1fr auto;align-items:center;
  gap:10px;padding:10px 13px;border-top:1px solid var(--line);min-width:0}
.fr-row:first-child{border-top:0}
.fr-when{font-size:.72rem;color:var(--faint);font-variant-numeric:tabular-nums}
.fr-what{min-width:0}
.fr-what b{display:block;font-size:.88rem;overflow:hidden;
  text-overflow:ellipsis;white-space:nowrap}
.fr-what small{display:block;font-size:.72rem;color:var(--txt-2);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fr-amt{font-weight:700;font-size:.88rem;font-variant-numeric:tabular-nums;
  white-space:nowrap}
.fr-amt.up{color:var(--win,#0f9d66)}
.fr-amt.down{color:var(--ink)}
.fr-amt.nil{font-weight:600}
.fr-pending{font-size:.7rem;font-weight:700;text-transform:uppercase;
  letter-spacing:.05em;color:var(--faint)}

.fr-msg{margin:0;padding:16px 4px}
.fr-bad{display:flex;flex-direction:column;align-items:flex-start;gap:10px}
.fr-bad p{margin:0;color:var(--danger);font-size:.86rem}

@media(max-width:560px){
  .fr-bar input[type=date]{flex:1 1 calc(50% - 14px)}
  /* Let the chips bleed to the edges so it reads as a scrolling strip
     rather than a row that happens to be cut off. */
  .fr-chips{margin:0 -14px;padding-left:14px;padding-right:14px}
  .fr-export{margin-left:0;width:100%;justify-content:center}
  .fr-row{grid-template-columns:1fr auto;row-gap:2px}
  .fr-when{grid-column:1/-1;order:-1}
}
`;
