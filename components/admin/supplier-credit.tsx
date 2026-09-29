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
import { visibleLines } from "@/lib/pure-supplier-holdings";
import type { SupplierHolding } from "@/lib/pure-supplier-holdings";

type Payload = {
  suppliers: SupplierHolding[];
  total: { currency: string; total: number }[];
  totalComplete: boolean;
  readAt: string;
};

const CSS = `
/* EEN kaart, EEN marge. De eigenaar, 29-09: "mobiel view erg
   rommelig ... teksten niet goed lined up met lines." Er waren drie
   verschillende linkermarges (kop 15px, ondertitel 15px met een eigen
   rand eronder, synctijd 15px met een negatieve marge erboven) en de
   synctijd stond op een eigen regel onder elke rij. Alles deelt nu
   --sc-pad, en de synctijd staat rechts OP de naamregel -- dat scheelt
   een regel per leverancier en zet hem waar je hem pas zoekt als je
   je afvraagt of dit van nu is. */
.sc{--sc-pad:16px;border:1px solid var(--line);border-radius:16px;background:var(--panel);box-shadow:var(--shadow-sm);overflow:hidden}

.sc-head{display:flex;align-items:center;gap:10px;padding:var(--sc-pad) var(--sc-pad) 0}
.sc-ic{width:30px;height:30px;border-radius:9px;background:var(--panel-2);color:var(--txt-2);display:grid;place-items:center;flex:0 0 auto}
.sc-ic svg{width:16px;height:16px}
.sc-head h3{margin:0;font-family:var(--hd);font-weight:800;font-size:1.02rem;color:var(--ink);flex:1 1 auto;min-width:0}
.sc-re{flex:0 0 auto;display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);background:var(--panel);border-radius:9px;padding:6px 11px;font-size:.78rem;font-weight:700;color:var(--txt-2);cursor:pointer}
.sc-re:hover{background:var(--panel-2)}
.sc-re svg{width:13px;height:13px}
.sc-re[disabled]{opacity:.55;cursor:default}
/* Uitgelijnd op de TITEL, niet op de kaartrand: het hoort bij de kop,
   niet bij de cijfers eronder. 30px icoon + 10px gat. */
.sc-sub{margin:3px 0 0;padding:0 var(--sc-pad) 14px calc(var(--sc-pad) + 40px);color:var(--faint);font-size:.8rem}

.sc-body{display:flex;flex-direction:column}
.sc-row{border-top:1px solid var(--line)}
.sc-row.bank{background:var(--panel-2)}

.sc-top{display:block;width:100%;padding:13px var(--sc-pad);background:none;border:0;text-align:left;cursor:pointer;font:inherit;color:inherit}
.sc-top:hover{background:var(--panel-2)}
.sc-row.bank .sc-top:hover{background:var(--line)}
.sc-top[disabled]{cursor:default}
.sc-top[disabled]:hover{background:none}
.sc-row.bank .sc-top[disabled]:hover{background:none}

.sc-l1{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.sc-name{font-weight:800;font-family:var(--hd);font-size:.95rem}
.sc-bank{font-family:var(--bd);font-weight:700;font-size:.64rem;letter-spacing:.05em;text-transform:uppercase;color:var(--faint)}
.sc-when{margin-left:auto;color:var(--faint);font-size:.68rem;white-space:nowrap}
.sc-chev{width:15px;height:15px;color:var(--faint);flex:0 0 auto;transition:transform .15s}
.sc-row.open .sc-chev{transform:rotate(180deg)}

/* De cijfers: een rij die netjes afbreekt, elk bedrag een blok zodat
   code en getal nooit los van elkaar wikkelen. */
.sc-figs{display:flex;flex-wrap:wrap;gap:6px 20px;margin-top:7px}
.sc-fig{display:inline-flex;align-items:baseline;gap:6px;font-variant-numeric:tabular-nums;font-weight:800;font-size:1.02rem;white-space:nowrap}
.sc-fig .cur{font-size:.68rem;font-weight:700;color:var(--faint);letter-spacing:.03em}
.sc-none{color:var(--faint);font-size:.84rem;font-weight:600;margin-top:6px;display:block}

.sc-tag{font-size:.64rem;font-weight:800;letter-spacing:.05em;text-transform:uppercase;border-radius:999px;padding:2px 7px;flex:0 0 auto}
.sc-tag.demo{background:var(--warn-soft);color:var(--warn);border:1px solid var(--line-2)}
.sc-tag.off{background:var(--panel-2);color:var(--faint);border:1px solid var(--line)}
.sc-tag.bad{background:var(--danger-soft);color:var(--danger);border:1px solid var(--line-2)}

.sc-det{padding:0 var(--sc-pad) 14px;display:flex;flex-direction:column;gap:9px}
.sc-part{display:flex;align-items:baseline;gap:10px;font-size:.84rem}
.sc-part .lbl{color:var(--txt-2)}
.sc-part .amt{margin-left:auto;font-variant-numeric:tabular-nums;font-weight:700}
.sc-sublist{border-top:1px dashed var(--line);padding-top:9px}
.sc-cap{font-size:.68rem;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--faint);margin-bottom:5px}
.sc-note{font-size:.8rem;color:var(--txt-2);background:var(--panel-2);border:1px solid var(--line);border-radius:10px;padding:8px 10px;display:flex;gap:8px;align-items:flex-start}
.sc-note svg{width:15px;height:15px;flex:0 0 auto;margin-top:1px}
.sc-note.warn{background:var(--warn-soft);border-color:var(--line-2);color:var(--warn)}
.sc-note.bad{background:var(--danger-soft);border-color:var(--line-2);color:var(--danger)}
.sc-skel{height:13px;border-radius:6px;background:var(--panel-2);width:110px;display:inline-block}

@media(max-width:420px){
  .sc{--sc-pad:13px}
  .sc-sub{padding-left:var(--sc-pad)}
  .sc-figs{gap:5px 16px}
  .sc-fig{font-size:.97rem}
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
  // Nul verbergen zolang er iets anders staat -- zie visibleLines.
  const shown = visibleLines(s.lines);

  return (
    <div className={`sc-row${open ? " open" : ""}${s.kind === "bank" ? " bank" : ""}`}>
      <button
        type="button"
        className="sc-top"
        disabled={!hasDetail}
        aria-expanded={hasDetail ? open : undefined}
        onClick={() => hasDetail && setOpen((v) => !v)}
      >
        {/* REGEL EEN: wie, in welke staat, en hoe vers. De synctijd
            staat rechts OP deze regel in plaats van op een eigen
            regel eronder -- dat scheelt een regel per leverancier en
            zet hem waar je hem pas zoekt als je je afvraagt of dit
            van nu is. */}
        <span className="sc-l1">
          <span className="sc-name">{s.supplier}</span>
          {s.kind === "bank" ? (
            <span className="sc-bank">our bank</span>
          ) : null}
          <StatusTag status={s.status} />
          {s.readAt ? (
            <span className="sc-when">{whenShort(s.readAt)}</span>
          ) : null}
          {hasDetail ? <ChevronDown className="sc-chev" /> : null}
        </span>

        {/* REGEL TWEE: de bedragen, en niets anders. */}
        {shown.length ? (
          <span className="sc-figs">
            {shown.map((l) => (
              <span key={l.currency}>{money(l.total, l.currency)}</span>
            ))}
          </span>
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
      </button>

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

      {/* ── GEEN TOTAALREGEL MEER ──────────────────────────────────
          De eigenaar, 29-09: "at least mag weg." Terecht. Hij stond er
          omdat ik een totaal niet wilde beloven als een leverancier
          niet had geantwoord, dus heette hij dan "At least" met drie
          regels uitleg eronder.

          Maar het totaal beantwoordde geen vraag die iemand heeft. Je
          kunt niet EEN bedrag uitgeven over twee leveranciers heen --
          krediet bij RockAds koopt niets bij SeamX. Wat je wilt weten
          staat per rij, en dat stond er al. Een som die je niet kunt
          besteden, met een voorbehoud eronder, is twee keer ruis.

          De staat per leverancier blijft: "test data", "unreadable",
          "not connected". Daar zit alles in wat het voorbehoud zei, en
          het staat naast het cijfer waar het over gaat. */}
    </div>
  );
}
