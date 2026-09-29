"use client";

// ── SUPPLIER CREDIT, ON THE DASHBOARD ───────────────────────────────
//
// The owner, 29-09: "kunnen we in ons dashboard ook easy on balance
// zien wat we momenteel usd en eur hebben bij rockads en bij seamx."
//
// Until now this lived on two other people's websites. It is the figure
// that decides whether a verified top-up can actually be pushed today,
// and the admin verifying the queue could not see it.
//
// ADMIN AND OWNER ONLY. The route behind it is apiRequireAdmin and it
// names the suppliers — so this component must never be rendered on an
// advertiser or affiliate screen, whatever it is passed.
//
// THE THING THIS PANEL REFUSES TO DO is print a number it is not sure
// of. Four states come back per supplier and all four are shown as
// themselves: read, switched off, could not read, and MOCK. That last
// one matters most — SeamX answers from the mock adapter unless
// SUPPLIER1_MODE is exactly "live", the mock returns USD 5,000 with
// `ok: true`, and this panel is read by the person who decides whether
// to fund an account.

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AlertTriangle, ChevronDown, FlaskConical, Landmark, RefreshCw } from "lucide-react";
import { formatCurrency } from "@/lib/utils-pure";
import type { SupplierHolding } from "@/lib/pure-supplier-holdings";

type Payload = {
  suppliers: SupplierHolding[];
  total: { currency: string; total: number }[];
  totalComplete: boolean;
  readAt: string;
};

const CSS = `
.sc{border:1px solid var(--line);border-radius:14px;background:var(--panel);box-shadow:var(--shadow-sm);overflow:hidden}
.sc-head{display:flex;align-items:center;gap:11px;padding:12px 15px;border-bottom:1px solid var(--line)}
.sc-ic{width:32px;height:32px;border-radius:9px;background:var(--panel-2);color:var(--txt-2);display:grid;place-items:center;flex:0 0 auto}
.sc-ic svg{width:17px;height:17px}
.sc-head h3{margin:0;font-family:var(--hd);font-weight:800;font-size:1rem;color:var(--ink);flex:1 1 auto;min-width:0}
.sc-sub{color:var(--faint);font-size:.8rem;margin:0;padding:0 15px 11px;border-bottom:1px solid var(--line)}
.sc-when{padding:0 15px 9px;margin-top:-6px;color:var(--faint);font-size:.68rem;letter-spacing:.01em}
/* Onze eigen bank, niet krediet bij iemand anders: een streep ervoor
   en een label, zodat het niet als derde leverancier leest. */
.sc-row.bank{background:var(--panel-2)}
.sc-row.bank .sc-name::after{content:"our bank";margin-left:7px;font-family:var(--bd);font-weight:700;font-size:.66rem;letter-spacing:.04em;text-transform:uppercase;color:var(--faint)}
.sc-head .sc-re{margin-left:auto;flex:0 0 auto;display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);background:var(--panel);border-radius:9px;padding:6px 10px;font-size:.8rem;font-weight:700;color:var(--txt-2);cursor:pointer}
.sc-head .sc-re:hover{background:var(--panel-2)}
.sc-head .sc-re svg{width:14px;height:14px}
.sc-head .sc-re[disabled]{opacity:.55;cursor:default}

.sc-body{display:flex;flex-direction:column}
.sc-row{border-bottom:1px solid var(--line)}
.sc-row:last-child{border-bottom:0}
.sc-top{display:flex;align-items:center;gap:10px;padding:11px 15px;width:100%;background:none;border:0;text-align:left;cursor:pointer;font:inherit;color:inherit}
.sc-top:hover{background:var(--panel-2)}
.sc-top[disabled]{cursor:default}
.sc-top[disabled]:hover{background:none}
.sc-name{font-weight:800;font-family:var(--hd);font-size:.94rem;flex:0 0 auto}
.sc-tag{font-size:.7rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase;border-radius:999px;padding:2px 8px;flex:0 0 auto}
/* Tokens, niet drie lichte letterlijke kleuren: dit label zat vanmorgen
   zelf in de lijst van vlakken die in donkere modus licht bleven. */
.sc-tag.demo{background:var(--warn-soft);color:var(--warn);border:1px solid var(--line-2)}
.sc-tag.off{background:var(--panel-2);color:var(--faint);border:1px solid var(--line)}
.sc-tag.bad{background:var(--danger-soft);color:var(--danger);border:1px solid var(--line-2)}
.sc-figs{margin-left:auto;display:flex;align-items:baseline;gap:14px;flex-wrap:wrap;justify-content:flex-end}
.sc-fig{font-variant-numeric:tabular-nums;font-weight:800;font-size:.95rem;white-space:nowrap}
.sc-fig .cur{font-size:.72rem;font-weight:700;color:var(--faint);margin-right:5px}
.sc-none{color:var(--faint);font-size:.85rem;font-weight:600}
.sc-chev{width:15px;height:15px;color:var(--faint);flex:0 0 auto;transition:transform .15s}
.sc-row.open .sc-chev{transform:rotate(180deg)}

.sc-det{padding:0 15px 12px;display:flex;flex-direction:column;gap:9px}
.sc-part{display:flex;align-items:baseline;gap:10px;font-size:.85rem}
.sc-part .lbl{color:var(--txt-2)}
.sc-part .amt{margin-left:auto;font-variant-numeric:tabular-nums;font-weight:700}
.sc-sublist{border-top:1px dashed var(--line);padding-top:8px}
.sc-cap{font-size:.74rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--faint);margin-bottom:5px}
.sc-note{font-size:.82rem;color:var(--txt-2);background:var(--panel-2);border:1px solid var(--line);border-radius:10px;padding:8px 10px;display:flex;gap:8px;align-items:flex-start}
.sc-note svg{width:15px;height:15px;flex:0 0 auto;margin-top:1px}
.sc-note.warn{background:var(--warn-soft);border-color:var(--line-2);color:var(--warn)}
.sc-note.bad{background:var(--danger-soft);border-color:var(--line-2);color:var(--danger)}

.sc-foot{display:flex;align-items:center;gap:12px;padding:11px 15px;background:var(--panel-2);border-top:1px solid var(--line);flex-wrap:wrap}
.sc-foot .lbl{font-weight:800;font-family:var(--hd);font-size:.9rem}
.sc-foot .hint{color:var(--faint);font-size:.78rem}
.sc-skel{height:13px;border-radius:6px;background:var(--panel-2);width:84px;display:inline-block}

@media(max-width:560px){
  .sc-top{flex-wrap:wrap;row-gap:7px}
  .sc-figs{margin-left:0;width:100%;justify-content:flex-start;gap:16px}
  .sc-chev{margin-left:auto}
}
`;

/** EUR 1.234,56 with the code in front, so two currencies in a row can
 *  never be mistaken for one another at a glance. */
function money(amount: number, currency: string) {
  return (
    <span className="sc-fig">
      <span className="cur">{currency}</span>
      {formatCurrency(amount, currency).replace(/^[^\d-]+/, "")}
    </span>
  );
}

/** "just now" / "14:52" / "28 Sep 14:52" — short, and never a lie
 *  about precision it does not have. */
function whenShort(iso: string): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "";
  const mins = Math.round((Date.now() - t.getTime()) / 60000);
  if (mins < 1) return "synced just now";
  if (mins < 60) return `synced ${mins} min ago`;
  const sameDay = new Date().toDateString() === t.toDateString();
  const hhmm = t.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return sameDay
    ? `synced at ${hhmm}`
    : `synced ${t.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} ${hhmm}`;
}

function StatusTag({ status }: { status: SupplierHolding["status"] }) {
  if (status === "demo") return <span className="sc-tag demo">test data</span>;
  if (status === "off") return <span className="sc-tag off">not connected</span>;
  if (status === "error") return <span className="sc-tag bad">unreadable</span>;
  return null;
}

function SupplierRow({ s }: { s: SupplierHolding }) {
  const [open, setOpen] = useState(false);
  // Only a supplier with something behind the figure can be opened: a
  // chevron on a row that expands to nothing is the click that teaches
  // people to stop clicking.
  //
  // AND A BREAKDOWN THAT REPEATS THE HEADER IS EXPANDING TO NOTHING.
  // Walked on production, 29-09: RockAds holds one euro wallet and one
  // dollar wallet, and it has NAMED them "EUR" and "USD". So the
  // click-through read "EUR — 1 wallet / EUR / EUR 5,582.08" — the same
  // figure, three times, under a chevron that promised detail. A list
  // of parts is worth a click when there is more than one of them, or
  // when the one there is says something the currency heading does not.
  const informative = (l: SupplierHolding["lines"][number]) =>
    l.parts.length > 1 ||
    (l.parts.length === 1 &&
      l.parts[0].label.trim().toUpperCase() !== l.currency);
  const hasDetail =
    !!s.error || s.lines.some((l) => informative(l) || l.heldBack !== null);

  return (
    <div className={`sc-row${open ? " open" : ""}${s.kind === "bank" ? " bank" : ""}`}>
      <button
        type="button"
        className="sc-top"
        disabled={!hasDetail}
        aria-expanded={hasDetail ? open : undefined}
        onClick={() => hasDetail && setOpen((v) => !v)}
      >
        <span className="sc-name">{s.supplier}</span>
        <StatusTag status={s.status} />
        <span className="sc-figs">
          {s.lines.length ? (
            s.lines.map((l) => (
              <span key={l.currency}>{money(l.total, l.currency)}</span>
            ))
          ) : (
            <span className="sc-none">
              {/* Three different sentences, deliberately. "—" for all of
                  them would put a supplier that is down and a supplier
                  that holds nothing in the same visual place. */}
              {s.status === "off"
                ? "No credentials set"
                : s.status === "error"
                  ? "Could not read"
                  : "Nothing reported"}
            </span>
          )}
        </span>
        {hasDetail ? <ChevronDown className="sc-chev" /> : null}
      </button>
      {/* Wanneer DEZE leverancier antwoordde. Klein en grijs: het is
          geen cijfer waar je naar zoekt, het is het antwoord op "is
          dit van nu?" als je het je afvraagt. Per rij en niet een
          keer boven het paneel, want de drie worden los opgehaald en
          een ervan kan stil oud zijn. */}
      {s.readAt ? <div className="sc-when">{whenShort(s.readAt)}</div> : null}

      {open ? (
        <div className="sc-det">
          {s.status === "demo" ? (
            <div className="sc-note warn">
              <FlaskConical />
              <span>
                These are the mock adapter&apos;s figures, not SeamX&apos;s.
                They are the same numbers every time and they are not
                money. Set SUPPLIER1_MODE to &quot;live&quot; to read the
                real balance.
              </span>
            </div>
          ) : null}
          {s.status === "error" && s.error ? (
            <div className="sc-note bad">
              <AlertTriangle />
              <span>{s.error}</span>
            </div>
          ) : null}
          {s.status !== "error" && s.status !== "demo" && s.error ? (
            <div className="sc-note">
              <AlertTriangle />
              <span>{s.error}</span>
            </div>
          ) : null}

          {s.lines.map((l) => (
            <div key={l.currency}>
              {/* What the supplier is holding back. For SeamX this is the
                  DST reserve — the tax they take off our balance before
                  we can spend it. It is the only DST figure either
                  supplier reports, and it is worth seeing beside the
                  gross: a spendable figure well under the balance is
                  why an account cannot be funded for the full amount. */}
              {l.heldBack !== null ? (
                <div className="sc-sublist">
                  <div className="sc-cap">{l.currency}</div>
                  <div className="sc-part">
                    <span className="lbl">Balance</span>
                    <span className="amt">
                      {formatCurrency(l.total, l.currency)}
                    </span>
                  </div>
                  <div className="sc-part">
                    <span className="lbl">Held back (tax reserve / DST)</span>
                    <span className="amt">
                      −{formatCurrency(l.heldBack, l.currency)}
                    </span>
                  </div>
                  <div className="sc-part">
                    <span className="lbl">
                      <b>Spendable now</b>
                    </span>
                    <span className="amt">
                      <b>
                        {formatCurrency(l.available ?? l.total, l.currency)}
                      </b>
                    </span>
                  </div>
                </div>
              ) : null}

              {informative(l) ? (
                <div className="sc-sublist">
                  <div className="sc-cap">
                    {l.currency} — {l.parts.length}{" "}
                    {l.parts.length === 1 ? "wallet" : "wallets"}
                  </div>
                  {l.parts.map((p, i) => (
                    <div className="sc-part" key={`${p.label}-${i}`}>
                      <span className="lbl">{p.label}</span>
                      <span className="amt">
                        {formatCurrency(p.amount, l.currency)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function SupplierCredit() {
  const q = useQuery<Payload>({
    queryKey: ["supplier-balances"],
    queryFn: async () => {
      const res = await fetch("/api/supplier-balances", { cache: "no-store" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(body?.error || `The balances did not load (${res.status}).`);
      }
      return (await res.json()) as Payload;
    },
    // Two third-party calls per read, so it does not refetch on every
    // window focus — but a minute-old supplier balance is still worth
    // re-reading when somebody comes back to the tab.
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const suppliers = q.data?.suppliers ?? [];
  const total = q.data?.total ?? [];

  return (
    <div className="sc">
      <style>{CSS}</style>
      {/* ── KOP OP EEN REGEL ──────────────────────────────────────
          De eigenaar, 29-09: "minder tekst zodat refresh mooi naast
          titel kan." De ondertitel was drie regels lang en duwde de
          knop naar beneden. Titel en knop delen nu een rij; de uitleg
          staat eronder in een halve zin.

          En de titel heet niet meer naar de leveranciers alleen: Wise
          staat er sinds vandaag bij, en dat is ONS geld, geen krediet
          bij iemand anders. */}
      <div className="sc-head">
        <span className="sc-ic">
          <Landmark />
        </span>
        <h3>What we hold</h3>
        <button
          type="button"
          className="sc-re"
          onClick={() => q.refetch()}
          disabled={q.isFetching}
        >
          <RefreshCw />
          {q.isFetching ? "Reading…" : "Refresh"}
        </button>
      </div>
      <p className="sc-sub">What a top-up can be funded from today.</p>

      <div className="sc-body">
        {/* isPending, not isLoading — this query is not gated, but the
            house rule holds and it costs nothing to be right. */}
        {q.isPending ? (
          <div className="sc-row">
            <div className="sc-top">
              <span className="sc-skel" />
              <span className="sc-figs">
                <span className="sc-skel" />
              </span>
            </div>
          </div>
        ) : q.isError ? (
          <div className="sc-det" style={{ paddingTop: 12 }}>
            <div className="sc-note bad">
              <AlertTriangle />
              <span>
                {(q.error as Error)?.message ??
                  "The supplier balances could not be read."}
              </span>
            </div>
          </div>
        ) : (
          suppliers.map((s) => <SupplierRow key={s.supplier} s={s} />)
        )}
      </div>

      {!q.isPending && !q.isError ? (
        <div className="sc-foot">
          <span className="lbl">
            {/* "Total" is a promise. It is only made when every supplier
                actually answered; otherwise the same figure is labelled
                for what it is, which is a floor. */}
            {q.data?.totalComplete ? "Total" : "At least"}
          </span>
          <span className="sc-figs" style={{ marginLeft: "auto" }}>
            {total.length ? (
              total.map((t) => (
                <span key={t.currency}>{money(t.total, t.currency)}</span>
              ))
            ) : (
              <span className="sc-none">Nothing readable</span>
            )}
          </span>
          {!q.data?.totalComplete ? (
            <span className="hint" style={{ flexBasis: "100%" }}>
              One supplier did not give a real figure, so this is what we can
              see — not everything we hold.
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
