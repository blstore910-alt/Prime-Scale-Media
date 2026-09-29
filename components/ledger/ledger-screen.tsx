"use client";

import { useMemo, useState } from "react";
import dayjs from "dayjs";

import { useAppContext } from "@/context/app-provider";
import {
  useLedgerCheck,
  useLedgerLines,
  useLedgerPriorMoves,
} from "@/hooks/use-ledger";
import { formatCurrency } from "@/lib/utils";
import { useLedgerNames } from "@/hooks/use-ledger-detail";
import { describeSource } from "@/hooks/use-ledger-line";
import {
  LedgerLineDetail,
  LEDGER_DETAIL_CSS,
} from "@/components/ledger/ledger-line-detail";
import {
  MarginPanel,
  MoneyInPanel,
  LEDGER_TABS_CSS,
} from "@/components/ledger/ledger-tabs";
import type { LedgerLine } from "@/hooks/use-ledger";

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
  // ── THE CHIPS COME FROM THEIR OWN READ ────────────────────────────
  //
  // They were derived from `lines.data.rows`, which is the FILTERED,
  // 200-capped page. Two things followed. The number on each chip was
  // the count within those 200, printed as if it were the total. And
  // clicking a chip changed the query key, so `lines.data` went
  // undefined, so the list of chips went empty -- the whole bar
  // unmounted mid-load and came back holding only "All" and the one
  // you picked. Every other source vanished, with no way back except
  // "All".
  //
  // An unfiltered read of its own. The chips stay put while the list
  // reloads, and the counts are the real ones.
  const all = useLedgerLines(tenantId, { source: "" });
  const prior = useLedgerPriorMoves(tenantId);
  const [showPrior, setShowPrior] = useState(false);
  const names = useLedgerNames(tenantId);
  // The owner, 29-09: "click details click details". A movement is
  // not a row in a list, it is a record -- so the list is the index
  // and one click opens the entry.
  const [open, setOpen] = useState<LedgerLine | null>(null);
  const [tab, setTab] = useState<"moves" | "in" | "margin">("moves");

  const sources = useMemo(() => {
    const seen = new Map<string, number>();
    for (const l of all.data?.rows ?? []) {
      seen.set(l.source, (seen.get(l.source) ?? 0) + 1);
    }
    return [...seen.entries()].sort((a, b) => b[1] - a[1]);
  }, [all.data]);

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
  // ── NOTHING COMPARED IS NOT "IT ADDS UP" ──────────────────────────
  //
  // `off` is built by looping over the wallets that came back. Zero
  // wallets means the loop never ran, so `off` is empty, so the panel
  // went green with a green 0 and "The books add up" -- over a read
  // that returned nothing. And RLS does not raise on a refusal, it
  // returns zero rows with error null, so that is exactly what a
  // refused read looks like here.
  //
  // Worse, the one thing that would have given it away was suppressed:
  // `check.data?.wallets ? ...` treats 0 as falsy, so the sentence
  // dropped its "(0 wallets)" in precisely the case where it mattered.
  const walletsSeen = check.data?.wallets ?? 0;
  const comparedNothing = !check.isPending && !check.isError && walletsSeen === 0;
  // A wallet off in BOTH currencies is two rows here and one wallet.
  // "2 wallets do not add up" over one wallet is a figure that does not
  // survive being checked.
  const offWallets = new Set(
    off.filter((o) => !o.orphan).map((o) => o.advertiser_id ?? "?"),
  ).size;
  const orphans = off.filter((o) => o.orphan);
  // isPending, not isLoading: the query is gated on the tenant, so a
  // query that never ran reports isLoading false and this would say
  // "the books add up" over a read that did not happen.
  const checking = check.isPending;
  const checkFailed = check.isError;

  return (
    <div className="psmview lg">
      <style>{LEDGER_CSS + LEDGER_DETAIL_CSS + LEDGER_TABS_CSS}</style>

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
          checkFailed || checking || comparedNothing
            ? "unknown"
            : off.length
              ? "bad"
              : "good"
        }`}
      >
        <div className="v">
          {checkFailed || comparedNothing ? "—" : checking ? "…" : off.length}
        </div>
        <div className="t">
          <b>
            {checkFailed
              ? "We could not check the books just now"
              : checking
                ? "Checking the books…"
                : comparedNothing
                  ? "We compared nothing"
                  : off.length === 0
                    ? "The books add up"
                    : orphans.length && !offWallets
                      ? orphans.length === 1
                        ? "One set of movements has no wallet"
                        : `${orphans.length} sets of movements have no wallet`
                      : offWallets === 1
                        ? "One wallet does not add up"
                        : `${offWallets} wallets do not add up`}
          </b>
          <span>
            {/* ── THE HEADLINE AND THE LINE UNDER IT MUST AGREE ────
                `checking` was handled in the headline and forgotten
                here, so while the read was still in flight the page
                said "Checking the books…" in bold and, directly
                underneath, "Every wallet balance equals the sum of
                its own movements (0 wallets)" — a verdict, with the
                giveaway zero in it, over a read that had not come
                back. Seen on production 29-09 by opening the page. */}
            {checking
              ? "Holding every balance against its own movements."
              : checkFailed
              ? "Reload. This is not a zero — we did not get an answer."
              : comparedNothing
                ? "No wallets came back, so there was nothing to check. This is not a clean book — reload, and if it stays empty this account cannot see the wallets."
                : off.length === 0
                  ? `Every wallet balance equals the sum of its own movements (${walletsSeen} ${
                      walletsSeen === 1 ? "wallet" : "wallets"
                    }).`
                  : "Each one below is money that moved without the ledger seeing it, or the other way round."}
          </span>
        </div>
      </div>

      {off.length ? (
        <div className="lg-card">
          {off.map((o, i) => (
            <div className="lg-off" key={i}>
              <span className="mono">
                {o.orphan ? "no wallet" : (o.advertiser_id ?? "—")}
              </span>
              {o.orphan ? (
                <span>
                  {formatCurrency(o.fromLines, o.currency)} of movements whose
                  wallet has been deleted. <b>Nothing holds this money.</b>
                </span>
              ) : (
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
              )}
            </div>
          ))}
        </div>
      ) : null}

      {/* ── THREE QUESTIONS, THREE PANELS ──────────────────────
          The owner, 29-09: "wat erg belangrijk is dus de binnenkomsten
          op alle banken en dan de fees en profit die we overhouden,
          dat moet ook kloppen anders hebben we ergens een lek."

          Money can only go missing in three places, and each one needs
          its own arithmetic: between the bank and the wallet, inside
          the wallet, and between what we charged and what we kept. One
          list could never answer all three. */}
      <div className="lg-tabs">
        <button
          className={`lg-tab${tab === "moves" ? " on" : ""}`}
          onClick={() => setTab("moves")}
        >
          <span className="t-long">Every movement</span>
          <span className="t-short">Movements</span>
        </button>
        <button
          className={`lg-tab${tab === "in" ? " on" : ""}`}
          onClick={() => setTab("in")}
        >
          <span className="t-long">What came in</span>
          <span className="t-short">Came in</span>
        </button>
        <button
          className={`lg-tab${tab === "margin" ? " on" : ""}`}
          onClick={() => setTab("margin")}
        >
          <span className="t-long">What we keep</span>
          <span className="t-short">We keep</span>
        </button>
      </div>

      {tab === "in" ? <MoneyInPanel tenantId={tenantId} /> : null}
      {tab === "margin" ? <MarginPanel tenantId={tenantId} /> : null}

      {tab === "moves" ? (
        <>
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
            {(lines.data?.rows ?? []).map((l) => {
              const who = l.advertiser_id
                ? names.data?.customer.get(l.advertiser_id)
                : undefined;
              const by = l.actor_user_id
                ? names.data?.actor.get(l.actor_user_id)
                : undefined;
              return (
                <button
                  className={`lg-row${open?.id === l.id ? " on" : ""}`}
                  key={l.id}
                  onClick={() => setOpen(open?.id === l.id ? null : l)}
                  title="Open this movement in full"
                >
                  <span className="when">
                    {dayjs(l.occurred_at).format("D MMM, HH:mm")}
                  </span>
                  <span className={`delta ${l.delta < 0 ? "out" : "in"}`}>
                    {l.delta > 0 ? "+" : "−"}
                    {formatCurrency(Math.abs(l.delta), l.currency)}
                  </span>
                  {/* WHO. A movement without a name on it is a number,
                      and six rows of numbers is what the owner was
                      looking at when he said the page told him
                      nothing. */}
                  <span className="whom">
                    <b>{who?.label ?? "No customer on this line"}</b>
                    <i>
                      {describeSource(l.source)}
                      {by ? ` \u00b7 by ${by}` : ""}
                      {/* The opening lines carry a stored Dutch note
                          that says the same thing as the label above
                          and then gets cut off mid-word. The note is
                          still in the detail panel, in full. */}
                      {l.reason && l.source !== "opening"
                        ? ` \u00b7 ${l.reason}`
                        : ""}
                    </i>
                  </span>
                  <span className="bal mono">
                    {formatCurrency(l.balance_before, l.currency)} →{" "}
                    {formatCurrency(l.balance_after, l.currency)}
                  </span>
                  <span className="more">Details</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {(lines.data?.rows ?? []).length >= 200 ? (
        <p className="lg-foot">
          Showing the newest <b>200</b> movements. There are older ones this
          page does not reach — a count and a pager are still to come, and
          until they are here this list is not the whole ledger.
        </p>
      ) : null}

      {open ? (
        <LedgerLineDetail
          line={open}
          names={names.data}
          onClose={() => setOpen(null)}
        />
      ) : null}

      {/* ── BEFORE THE LEDGER EXISTED ──────────────────────────
          The owner, 28-09: "daarin kan ik ook dus alle geld lekken enz
          checken ofzo?" -- and for anything before 28-09 the answer
          was no, because the ledger starts there.

          It does not have to be. `audit_events` has carried the before
          and after of every write to `wallets` since 30-08, so the
          movements are reconstructable even though they were never
          recorded as movements. Measured 29-09: 66 audit rows, 50 real
          balance changes.

          Deliberately NOT written into the ledger. Every wallet
          already has an `opening` line equal to its CURRENT balance;
          adding reconstructed lines on top would make balance differ
          from sum-of-lines for every wallet touched, and the daily
          check would go red and stay red. The one thing that makes
          future money faults solvable is that check, so it is not
          traded for history.

          Folded shut by default, and labelled: this is not evidence,
          it is a reconstruction. */}
      <div className="lg-card">
        <button
          className="lg-chip"
          onClick={() => setShowPrior((v) => !v)}
          style={{ marginBottom: showPrior ? 12 : 0 }}
        >
          {showPrior ? "Hide" : "Show"} what moved before the ledger existed
          {prior.data?.rows.length ? (
            <span className="n"> {prior.data.rows.length}</span>
          ) : null}
        </button>
        {showPrior ? (
          prior.isPending ? (
            <p className="cap" style={{ margin: 0 }}>
              Reading the audit log…
            </p>
          ) : prior.isError || prior.data?.notSwitchedOn ? (
            <p className="cap" style={{ margin: 0 }}>
              We could not read the audit log. This is not &quot;nothing
              happened&quot; — reload.
            </p>
          ) : (prior.data?.rows ?? []).length === 0 ? (
            <p className="cap" style={{ margin: 0 }}>
              The audit log holds no wallet movements before the ledger.
            </p>
          ) : (
            <>
              <p className="lg-warn">
                <b>Reconstructed, not recorded.</b> These come from the audit
                log, which keeps what a row looked like before and after a
                write — not why it happened. Treat them as a trail to
                follow, not as proof. The ledger proper starts below.
              </p>
              <div className="lg-rows">
                {(prior.data?.rows ?? []).map((m, i) => (
                  <div className="lg-row" key={i}>
                    <span className="when">
                      {dayjs(m.occurred_at).format("D MMM, HH:mm")}
                    </span>
                    <span className={`delta ${m.delta < 0 ? "out" : "in"}`}>
                      {m.delta > 0 ? "+" : "−"}
                      {formatCurrency(Math.abs(m.delta), m.currency)}
                    </span>
                    <span className="bal mono">
                      {formatCurrency(m.balance_before, m.currency)} →{" "}
                      {formatCurrency(m.balance_after, m.currency)}
                    </span>
                    <span className="src todo">
                      {m.actor_user_id ? "audit" : "audit, no actor"}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )
        ) : null}
      </div>

        </>
      ) : null}

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

  /* THREE TABS FIT. They do not need to scroll.
     This was overflow-x:auto with min-width:max-content, so on a phone
     the third tab hung off the edge and the browser drew a grey
     scrollbar across the page -- under a rounded panel, at full width,
     the ugliest element on the screen. A grid of three equal columns
     always fits; the label shrinks instead of the row scrolling. */
  .lg-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;
    background:var(--panel-2,#f0f4fd);padding:4px;border-radius:12px}
  .lg-tab{padding:10px 8px;border:0;border-radius:9px;cursor:pointer;font:inherit;
    font-size:.86rem;font-weight:700;background:transparent;
    color:var(--txt-2,#535e78);white-space:nowrap;overflow:hidden;
    text-overflow:ellipsis;text-align:center}
  .lg-tab.on{background:var(--panel,#fff);color:var(--ink,#12162a);
    box-shadow:0 1px 3px rgba(20,30,80,.12)}
  .lg-tab .t-short{display:none}
  @media (max-width:520px){
    .lg-tab{font-size:.8rem;padding:10px 4px}
    .lg-tab .t-long{display:none}
    .lg-tab .t-short{display:inline}
  }

  .lg-chips{display:flex;flex-wrap:wrap;gap:7px}
  .lg-chip{padding:6px 12px;border-radius:99px;cursor:pointer;font:inherit;
    font-size:.8rem;font-weight:700;border:1px solid var(--line,#e3e8f4);
    background:var(--panel,#fff);color:var(--txt-2,#535e78)}
  .lg-chip.on{border-color:var(--primary,#3a6fff);color:var(--primary,#3a6fff);
    background:rgba(58,111,255,.06)}
  .lg-chip.todo{border-style:dashed}
  .lg-chip .n{opacity:.6;font-weight:600}

  .lg-rows{display:flex;flex-direction:column}
  .lg-row{display:grid;grid-template-columns:104px 108px minmax(0,1fr) auto auto;
    gap:12px;align-items:center;padding:10px 8px;text-align:left;width:100%;
    border:0;border-bottom:1px solid var(--line,#e3e8f4);background:transparent;
    font:inherit;font-size:.84rem;cursor:pointer;border-radius:8px;
    transition:background .12s}
  .lg-row:hover{background:var(--panel-2,#f0f4fd)}
  .lg-row.on{background:var(--primary-tint,rgba(58,111,255,.08))}
  .lg-row .whom{display:flex;flex-direction:column;gap:1px;min-width:0}
  .lg-row .whom b{font-weight:700;color:var(--ink,#12162a);overflow:hidden;
    text-overflow:ellipsis;white-space:nowrap}
  .lg-row .whom i{font-style:normal;font-size:.75rem;color:var(--faint,#818ead);
    overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .lg-row .more{font-size:.74rem;font-weight:700;color:var(--primary,#3a6fff);
    opacity:0;transition:opacity .12s}
  .lg-row:hover .more,.lg-row.on .more{opacity:1}
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
  .lg-warn{margin:0 0 12px;font-size:.8rem;line-height:1.5;padding:9px 12px;
    border-radius:10px;background:#fff6e5;border:1px solid #f0d9ab;
    color:#7a5510}

  @media (max-width:720px){
    .lg-row{grid-template-columns:1fr auto;row-gap:3px}
    .lg-row .whom{grid-column:1 / -1;order:-1}
    .lg-row .bal{grid-column:1 / -1}
    .lg-row .more{display:none}
    .lg-verdict{align-items:flex-start}
  }
`;
