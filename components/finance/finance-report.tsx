"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  const [periodOpen, setPeriodOpen] = useState(false);
  const periodRef = useRef<HTMLDivElement | null>(null);
  // Close on a click outside and on Escape. A popover you can only shut
  // by choosing something is one people feel trapped by.
  useEffect(() => {
    if (!periodOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!periodRef.current?.contains(e.target as Node)) setPeriodOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPeriodOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [periodOpen]);
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
    // ── APPEND IT, CLICK IT, THEN LET GO ────────────────────────────
    //
    // The anchor was never added to the document, and the object URL was
    // revoked on the very next line. Firefox ignores a click on a
    // detached anchor outright, and revoking synchronously races the
    // download in every browser — so "Export CSV" did nothing at all,
    // silently, on the one control whose entire job is to hand the
    // customer their own figures.
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `financial-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    // A tick, not the next line: the browser needs the URL to survive
    // long enough to start reading from it.
    setTimeout(() => URL.revokeObjectURL(url), 2000);
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

      {/* ── ONE CONTROL FOR THE PERIOD ──────────────────────────────
          The chips were a horizontally scrolling strip whose last
          option sat half off the screen, above a heading that repeated
          whichever one was pressed — two rows saying the same thing,
          and neither of them telling you the actual days.

          A button that says what you are looking at, and a panel with
          both the common spans and a real pair of dates in it. */}
      <div className="fr-period" ref={periodRef}>
        <button
          type="button"
          className={`fr-period-btn${periodOpen ? " on" : ""}`}
          aria-expanded={periodOpen}
          aria-haspopup="dialog"
          onClick={() => setPeriodOpen((v) => !v)}
        >
          <svg viewBox="0 0 24 24" aria-hidden className="fr-cal">
            <rect x="3" y="5" width="18" height="16" rx="2.5" />
            <path d="M3 10h18M8 3v4M16 3v4" />
          </svg>
          <span className="fr-period-val">{describeRange(from, to)}</span>
          <svg viewBox="0 0 24 24" aria-hidden className="fr-caret">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>

        {periodOpen && (
          <div
            className="fr-period-pop"
            role="dialog"
            aria-label="Choose a period"
          >
            <div className="fr-period-list">
              {(["all", "7d", "30d", "mtd", "lastm"] as RangeKey[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  className={`fr-period-opt${range === k ? " on" : ""}`}
                  onClick={() => {
                    pickRange(k);
                    setPeriodOpen(false);
                  }}
                >
                  <span>{RANGE_LABELS[k]}</span>
                  {range === k && (
                    <svg viewBox="0 0 24 24" aria-hidden>
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
            <div className="fr-period-dates">
              <span className="fr-period-cap">Or pick your own</span>
              <div className="fr-custom">
                <input
                  type="date"
                  value={from}
                  max={to || undefined}
                  onChange={(e) => {
                    setRange("custom");
                    setFrom(e.target.value);
                  }}
                  aria-label="From"
                />
                <span className="fr-dash">–</span>
                <input
                  type="date"
                  value={to}
                  min={from || undefined}
                  onChange={(e) => {
                    setRange("custom");
                    setTo(e.target.value);
                  }}
                  aria-label="To"
                />
              </div>
              {(from || to) && (
                <button
                  type="button"
                  className="fr-period-clear"
                  onClick={() => {
                    pickRange("all");
                    setPeriodOpen(false);
                  }}
                >
                  Clear and show everything
                </button>
              )}
            </div>
          </div>
        )}
      </div>

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

/* ── The period picker ───────────────────────────────────────────────
   The button carries the answer — the actual days, not the name of a
   preset — because that is what you check before trusting a total. */
.fr-period{position:relative}
.fr-period-btn{display:flex;align-items:center;gap:10px;width:100%;
  font-family:var(--hd);font-weight:800;font-size:1.02rem;letter-spacing:-.01em;
  color:var(--ink);cursor:pointer;text-align:left;
  padding:12px 14px;border-radius:13px;border:1px solid var(--line-2);
  background:var(--panel);
  box-shadow:0 1px 0 rgba(255,255,255,.9) inset,0 1px 2px -1px rgba(20,30,80,.14);
  transition:border-color .13s,box-shadow .13s}
.fr-period-btn:hover{border-color:var(--primary)}
.fr-period-btn.on{border-color:var(--primary);box-shadow:0 0 0 3px var(--primary-tint)}
.fr-period-val{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fr-cal{width:18px;height:18px;flex:0 0 auto;fill:none;stroke:var(--primary-600);
  stroke-width:1.8;stroke-linecap:round}
.fr-caret{width:16px;height:16px;flex:0 0 auto;fill:none;stroke:var(--txt-2);
  stroke-width:2;stroke-linecap:round;stroke-linejoin:round;transition:transform .15s}
.fr-period-btn.on .fr-caret{transform:rotate(180deg)}
.fr-period-pop{position:absolute;z-index:40;top:calc(100% + 6px);left:0;right:0;
  border:1px solid var(--line-2);border-radius:14px;background:var(--panel);
  box-shadow:0 1px 3px -1px rgba(20,30,80,.26),0 24px 48px -24px rgba(20,30,80,.6);
  overflow:hidden}
@media(min-width:561px){.fr-period-pop{right:auto;width:320px}}
.fr-period-list{display:flex;flex-direction:column;padding:6px}
.fr-period-opt{display:flex;align-items:center;justify-content:space-between;gap:10px;
  width:100%;text-align:left;cursor:pointer;font-family:var(--bd);font-size:.88rem;
  font-weight:600;color:var(--ink);padding:10px 11px;border:0;border-radius:9px;background:none}
.fr-period-opt:hover{background:var(--panel-2)}
.fr-period-opt.on{color:var(--primary-600);background:var(--primary-tint)}
.fr-period-opt svg{width:15px;height:15px;flex:0 0 auto;fill:none;stroke:currentColor;
  stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}
.fr-period-dates{border-top:1px solid var(--line);padding:11px 12px 12px}
.fr-period-cap{display:block;font-size:.7rem;font-weight:700;letter-spacing:.06em;
  text-transform:uppercase;color:var(--txt-2);margin-bottom:7px}
.fr-period-clear{margin-top:9px;width:100%;cursor:pointer;font-family:var(--bd);
  font-size:.8rem;font-weight:600;color:var(--txt-2);padding:8px;border:0;
  border-radius:9px;background:var(--panel-2)}
.fr-period-clear:hover{color:var(--ink)}
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
  /* In / Out / Net stacked, not three columns of 106px. At 375px a
     figure like $1,234,567.89 does not fit and .fr-nums b ellipsises
     it — the three headline totals of a financial report, truncated,
     with nothing saying so. */
  .fr-nums{grid-template-columns:1fr;gap:4px}
  .fr-nums>div{display:flex;justify-content:space-between;align-items:baseline}
  .fr-nums small{margin:0}
  .fr-nums b{overflow:visible;text-overflow:clip}
  .fr-export{margin-left:0;width:100%;justify-content:center}
  .fr-row{grid-template-columns:1fr auto;row-gap:2px}
  .fr-when{grid-column:1/-1;order:-1}
}
`;
