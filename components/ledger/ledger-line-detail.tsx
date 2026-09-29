"use client";

import dayjs from "dayjs";

import type { LedgerLine } from "@/hooks/use-ledger";
import type { LedgerNames } from "@/hooks/use-ledger-detail";
import { describeSource, useLedgerLineDetail } from "@/hooks/use-ledger-line";
import { formatCurrency } from "@/lib/utils";

/**
 * ONE MOVEMENT, IN FULL.
 *
 * The owner, 29-09: "named and detailed everything, max max details,
 * click details click details, anders hebben we niks aan ledger."
 *
 * The list is the index; this is the entry. Everything we hold about
 * one movement, with nothing inferred and nothing left blank: where a
 * fact is missing, it says which fact and why, because on a ledger
 * "we do not know" is information and an empty row is not.
 */
export function LedgerLineDetail({
  line,
  names,
  onClose,
}: {
  line: LedgerLine;
  names: LedgerNames | undefined;
  onClose: () => void;
}) {
  const detail = useLedgerLineDetail(line);
  const who = line.advertiser_id ? names?.customer.get(line.advertiser_id) : undefined;
  const actor = line.actor_user_id ? names?.actor.get(line.actor_user_id) : undefined;
  const inbound = line.delta > 0;

  return (
    <div className="lg-det">
      <div className="det-top">
        <div>
          <div className="det-what">{describeSource(line.source)}</div>
          <div className="det-when">
            {dayjs(line.occurred_at).format("dddd D MMMM YYYY, HH:mm:ss")}
          </div>
        </div>
        <button className="det-x" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      {/* ── THE MONEY, BIG ─────────────────────────────────────── */}
      <div className={`det-amt ${inbound ? "in" : "out"}`}>
        <span className="v">
          {inbound ? "+" : "−"}
          {formatCurrency(Math.abs(line.delta), line.currency)}
        </span>
        <span className="b">
          {formatCurrency(line.balance_before, line.currency)} →{" "}
          {formatCurrency(line.balance_after, line.currency)}
        </span>
      </div>

      <dl className="det-list">
        <Row
          k="Customer"
          v={who?.label}
          sub={who?.code ?? undefined}
          missing={
            line.advertiser_id
              ? "The movement names a customer we could not look up."
              : "This movement is not attached to a customer."
          }
        />
        <Row
          k="Done by"
          v={actor}
          missing={
            line.actor_user_id
              ? "A staff member we could not look up — the id is below."
              : "Nobody was recorded. Either the system did this on its own (the nightly billing run), or it happened before the audit actor was wired through on 28-09."
          }
        />
        <Row
          k="Reason given"
          v={reasonInEnglish(line.reason, line.source)}
          missing="None was given."
        />
        <Row k="Recorded as" v={line.source} mono />
        <Row k="Currency" v={line.currency} />
      </dl>

      {/* ── THE RECORD BEHIND IT ───────────────────────────────── */}
      <div className="det-src">
        <div className="det-h">The record behind this movement</div>
        {detail.isPending ? (
          <p className="cap">Looking it up…</p>
        ) : detail.isError ? (
          <p className="cap">
            We could not look it up. Reload — this is not &quot;there is
            none&quot;.
          </p>
        ) : detail.data?.record ? (
          <>
            <p className="cap det-tbl">
              from <b>{detail.data.table}</b>
            </p>
            <dl className="det-list">
              {Object.entries(detail.data.record).map(([k, v]) => (
                <Row key={k} k={pretty(k)} v={show(v)} mono={k === "id"} />
              ))}
            </dl>
          </>
        ) : (
          <p className="cap">{detail.data?.why}</p>
        )}
      </div>

      <dl className="det-list det-ids">
        <Row k="Wallet" v={line.wallet_id} mono />
        <Row k="Ledger line" v={line.id} mono />
        {line.source_id ? <Row k="Source record" v={line.source_id} mono /> : null}
      </dl>
    </div>
  );
}

function Row({
  k,
  v,
  sub,
  missing,
  mono,
}: {
  k: string;
  v?: string | null;
  sub?: string;
  missing?: string;
  mono?: boolean;
}) {
  const has = v !== undefined && v !== null && v !== "";
  if (!has && !missing) return null;
  return (
    <div className="det-r">
      <dt>{k}</dt>
      <dd className={mono && has ? "mono" : has ? "" : "none"}>
        {has ? v : missing}
        {has && sub ? <i>{sub}</i> : null}
      </dd>
    </div>
  );
}

/**
 * The app is in English and one stored note is not.
 *
 * Plak 125 wrote the opening lines with a Dutch reason, and it is on
 * every one of them. It cannot be edited out: the ledger is
 * append-only, by design and by trigger. So it is translated on the
 * way to the screen, and any other note is shown exactly as it was
 * written -- a reason somebody typed is evidence, and evidence is not
 * paraphrased.
 */
function reasonInEnglish(reason: string | null, source: string) {
  if (!reason) return undefined;
  if (source === "opening" && reason.startsWith("Stand bij het aanzetten")) {
    return "The balance this wallet held when the ledger was switched on. Not built up from movements \u2014 it is the starting point.";
  }
  return reason;
}

/** `reference_no` reads badly in a list of facts a person is scanning. */
function pretty(k: string) {
  return k
    .replace(/_/g, " ")
    .replace(/\bid\b/i, "ID")
    .replace(/^./, (c) => c.toUpperCase());
}

/** Never print `[object Object]` or a bare `null` at somebody. */
function show(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "object") return JSON.stringify(v);
  const s = String(v);
  // An ISO timestamp is unreadable and this is a page people read.
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return dayjs(s).format("D MMM YYYY, HH:mm");
  return s;
}

export const LEDGER_DETAIL_CSS = `
  .lg-det{background:var(--panel,#fff);border:1px solid var(--primary,#3a6fff);
    border-radius:16px;padding:18px;box-shadow:0 18px 40px -22px rgba(20,30,80,.45)}
  .det-top{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
  .det-what{font-family:var(--hd,inherit);font-weight:800;font-size:1.1rem}
  .det-when{font-size:.8rem;color:var(--faint,#818ead);margin-top:2px}
  .det-x{border:0;background:transparent;font-size:1.6rem;line-height:1;cursor:pointer;
    color:var(--faint,#818ead);padding:0 4px}
  .det-x:hover{color:var(--ink,#12162a)}

  .det-amt{display:flex;flex-direction:column;gap:3px;margin:14px 0;padding:14px;
    border-radius:12px;background:var(--panel-2,#f0f4fd)}
  .det-amt .v{font-family:var(--hd,inherit);font-weight:800;font-size:1.7rem;
    font-variant-numeric:tabular-nums;line-height:1}
  .det-amt.in .v{color:#0e8f66}
  .det-amt.out .v{color:#c0392b}
  .det-amt .b{font-size:.84rem;color:var(--txt-2,#535e78);
    font-variant-numeric:tabular-nums}

  .det-list{margin:0;display:flex;flex-direction:column}
  .det-r{display:grid;grid-template-columns:150px 1fr;gap:12px;padding:8px 0;
    border-bottom:1px solid var(--line,#e3e8f4);font-size:.86rem}
  .det-r:last-child{border-bottom:0}
  .det-r dt{color:var(--faint,#818ead);margin:0}
  .det-r dd{margin:0;min-width:0;overflow-wrap:anywhere;font-weight:600;
    color:var(--ink,#12162a)}
  .det-r dd.none{font-weight:400;color:var(--faint,#818ead);font-style:italic}
  .det-r dd.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
    font-size:.78rem;font-weight:400}
  .det-r dd i{display:block;font-style:normal;font-weight:400;font-size:.76rem;
    color:var(--faint,#818ead);margin-top:1px}

  .det-src{margin-top:14px;padding-top:14px;border-top:2px solid var(--line-2,#d3daec)}
  .det-h{font-weight:800;font-size:.9rem;margin-bottom:6px}
  .det-tbl{margin:0 0 4px;font-size:.78rem}
  .det-ids{margin-top:12px;padding-top:12px;border-top:1px dashed var(--line-2,#d3daec);
    opacity:.75}

  @media (max-width:640px){
    .det-r{grid-template-columns:1fr;gap:2px}
    .det-r dt{font-size:.78rem}
  }
`;
