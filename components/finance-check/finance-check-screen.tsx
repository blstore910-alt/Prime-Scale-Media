"use client";

import { useState } from "react";
import dayjs from "dayjs";

import { useAppContext } from "@/context/app-provider";
import { useFinanceQueue, type CheckItem } from "@/hooks/use-finance-check";
import { useRefundCeilings, type CustomerCeiling } from "@/hooks/use-refund-ceiling";
import { useLedgerNames } from "@/hooks/use-ledger-detail";
import { formatCurrency } from "@/lib/utils";

/**
 * THE FINANCE CHECK.
 *
 * The owner, 29-09: "ik wil ook dat er een finance check taak bestaat
 * voor alle transacties waarbij het niet auto approved is bij wise api
 * of slash api etc, dus 1 medewerker kan dan alle finances checken
 * zonder echte transactie approved."
 *
 * ── WHOEVER CHECKS DOES NOT DECIDE ────────────────────────────────
 *
 * There is not one button on this page that moves a cent. No approve,
 * no reject, no mark-as-paid. That is the whole design: a person who
 * reviews a payment and also approves it is reviewing themselves.
 * Approving stays on the queues where it already lives, done by the
 * people who already do it.
 *
 * What this gives the reviewer instead is everything they need to say
 * "this one is wrong" out loud: the item, the figures recomputed from
 * the source tables, and a written checklist of what to look at — an
 * instruction to "review this" with no list produces a tick and no
 * review.
 */
export default function FinanceCheckScreen() {
  const { profile } = useAppContext();
  const tenantId = profile?.tenant_id ?? null;

  const queue = useFinanceQueue(tenantId);
  const ceilings = useRefundCeilings(tenantId);
  const names = useLedgerNames(tenantId);

  const [tab, setTab] = useState<"queue" | "refunds">("queue");
  const [open, setOpen] = useState<string | null>(null);

  const items = queue.data?.items ?? [];
  const unreadable = [
    ...(queue.data?.unreadable ?? []),
    ...(ceilings.data?.unreadable ?? []),
  ];

  const total = items.reduce(
    (t, i) => Math.round((t + i.amount) * 100) / 100,
    0,
  );

  return (
    <div className="psmview fc">
      <style>{FC_CSS}</style>

      <div className="phead">
        <div>
          <h1>Finance check</h1>
          <p className="cap">
            Every decision about money that a machine did not settle on its
            own. Nothing here approves anything — this page is for finding
            what is wrong, not for signing it off.
          </p>
        </div>
      </div>

      {/* ── A SHORT QUEUE MIGHT BE A REFUSED READ ─────────────── */}
      {unreadable.length ? (
        <div className="fc-alarm">
          <b>This list is incomplete.</b> We could not read:{" "}
          {unreadable.join(", ")}. Whatever is in there is not below. Reload,
          and if it persists say so — an empty queue and a refused read look
          identical, and only one of them means there is nothing to do.
        </div>
      ) : null}

      <div className="fc-tabs">
        <button
          className={`fc-tab${tab === "queue" ? " on" : ""}`}
          onClick={() => setTab("queue")}
        >
          To check
          {items.length ? <span className="n">{items.length}</span> : null}
        </button>
        <button
          className={`fc-tab${tab === "refunds" ? " on" : ""}`}
          onClick={() => setTab("refunds")}
        >
          Refund ceilings
        </button>
      </div>

      {tab === "queue" ? (
        queue.isPending ? (
          <p className="cap">Gathering everything that needs a person…</p>
        ) : queue.isError ? (
          <p className="cap">
            We could not build the queue. Reload — this is not &quot;nothing to
            check&quot;.
          </p>
        ) : items.length === 0 ? (
          <div className="fc-clear">
            <b>Nothing is waiting on a person.</b>
            <span>
              Every top-up, funding, withdrawal, refund and adjustment has been
              dealt with, every deposit has a name, and no advance credit is
              outstanding.
            </span>
          </div>
        ) : (
          <>
            <div className="fc-sum">
              <span>
                <i>Waiting on a person</i>
                <b>{items.length}</b>
              </span>
              <span>
                <i>Money involved</i>
                <b>{formatCurrency(total, items[0]?.currency ?? "EUR")}</b>
              </span>
              <span>
                <i>A machine could have closed</i>
                <b>{items.filter((i) => i.autoPossible).length}</b>
              </span>
            </div>
            <div className="fc-list">
              {items.map((i) => (
                <Item
                  key={`${i.kind}-${i.id}`}
                  item={i}
                  who={
                    i.advertiser_id
                      ? names.data?.customer.get(i.advertiser_id)?.label
                      : undefined
                  }
                  open={open === `${i.kind}-${i.id}`}
                  onToggle={() =>
                    setOpen(open === `${i.kind}-${i.id}` ? null : `${i.kind}-${i.id}`)
                  }
                />
              ))}
            </div>
          </>
        )
      ) : (
        <Refunds q={ceilings} names={names.data} />
      )}
    </div>
  );
}

function Item({
  item,
  who,
  open,
  onToggle,
}: {
  item: CheckItem;
  who: string | undefined;
  open: boolean;
  onToggle: () => void;
}) {
  const days = dayjs().diff(dayjs(item.created_at), "day");
  return (
    <div className={`fc-item${open ? " on" : ""}`}>
      <button className="fc-head" onClick={onToggle}>
        <span className={`k k-${item.kind}`}>{item.what}</span>
        <span className="amt">
          {formatCurrency(item.amount, item.currency)}
          {item.fee ? (
            <i>+ {formatCurrency(item.fee, item.currency)} fee</i>
          ) : null}
        </span>
        <span className="who">
          <b>{who ?? "No customer on this"}</b>
          <i>
            {dayjs(item.created_at).format("D MMM, HH:mm")}
            {days >= 1 ? ` · ${days} day${days === 1 ? "" : "s"} waiting` : ""}
            {item.reference ? ` · ${item.reference}` : ""}
          </i>
        </span>
        <span className="more">{open ? "Hide" : "What to check"}</span>
      </button>
      {open ? (
        <div className="fc-body">
          {item.autoPossible ? (
            <p className="fc-auto">
              A machine could have closed this one and did not. That is itself
              worth a look: either the reference did not match, or the
              automatic path failed silently.
            </p>
          ) : null}
          <ol className="fc-cl">
            {item.checklist.map((c, n) => (
              <li key={n}>{c}</li>
            ))}
          </ol>
          <p className="fc-id">
            {item.kind} · {item.id}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function Refunds({
  q,
  names,
}: {
  q: ReturnType<typeof useRefundCeilings>;
  names: { customer: Map<string, { label: string; code: string | null }> } | undefined;
}) {
  const rows = q.data?.rows ?? [];
  if (q.isPending) return <p className="cap">Working out the ceilings…</p>;
  if (q.isError) {
    return (
      <p className="cap">
        We could not work these out. Reload — a missing ceiling is not a
        ceiling of zero.
      </p>
    );
  }
  if (!rows.length) {
    return <p className="cap">No customer has paid anything in yet.</p>;
  }

  return (
    <>
      <p className="fc-note">
        <b>The most we could give back, per customer.</b> It is what they paid
        in, less our fees, less what has gone to the supplier, less what has
        already been refunded, less any advance we fronted that never arrived.
        It is a <b>ceiling, not an instruction</b> — a refund still needs a
        person. It is here so that person can see at a glance whether the
        amount asked for is even possible.
      </p>
      <div className="fc-list">
        {rows.map((r) => (
          <Ceiling
            key={`${r.advertiser_id}-${r.currency}`}
            r={r}
            who={names?.customer.get(r.advertiser_id)?.label}
          />
        ))}
      </div>
    </>
  );
}

function Ceiling({ r, who }: { r: CustomerCeiling; who: string | undefined }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className={`fc-item${r.ceiling.warning ? " bad" : r.flag.level === "look" ? " look" : ""}`}
    >
      <button className="fc-head" onClick={() => setOpen(!open)}>
        <span className="k">{r.currency}</span>
        <span className="amt">{formatCurrency(r.ceiling.max, r.currency)}</span>
        <span className="who">
          <b>{who ?? r.advertiser_id}</b>
          <i>
            wallet holds {formatCurrency(r.walletBalance, r.currency)}
            {r.ceiling.warning
              ? " · needs a person"
              : r.flag.level === "look"
                ? " · more in the wallet than could be refunded"
                : ""}
          </i>
        </span>
        <span className="more">{open ? "Hide" : "Show the sum"}</span>
      </button>
      {open ? (
        <div className="fc-body">
          {r.ceiling.warning ? (
            <p className="fc-bad">{r.ceiling.warning}</p>
          ) : null}
          {r.flag.note ? <p className="fc-auto">{r.flag.note}</p> : null}
          <div className="fc-steps">
            {r.ceiling.steps.map((s) => (
              <div className="st" key={s.label}>
                <span>{s.label}</span>
                <b className={s.subtract ? "neg" : ""}>
                  {s.subtract ? "−" : ""}
                  {formatCurrency(s.amount, r.currency)}
                </b>
              </div>
            ))}
            <div className="st tot">
              <span>The most we could refund</span>
              <b>{formatCurrency(r.ceiling.max, r.currency)}</b>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const FC_CSS = `
  .fc{display:flex;flex-direction:column;gap:14px}
  .fc-alarm{padding:13px 15px;border-radius:13px;background:#fdecec;
    border:1px solid #f6c9c9;color:#7a1f1f;font-size:.86rem;line-height:1.5}

  .fc-tabs{display:grid;grid-template-columns:repeat(2,1fr);gap:4px;
    background:var(--panel-2,#f0f4fd);padding:4px;border-radius:12px}
  .fc-tab{padding:10px 8px;border:0;border-radius:9px;cursor:pointer;font:inherit;
    font-size:.86rem;font-weight:700;background:transparent;
    color:var(--txt-2,#535e78);display:inline-flex;align-items:center;
    justify-content:center;gap:7px}
  .fc-tab.on{background:var(--panel,#fff);color:var(--ink,#12162a);
    box-shadow:0 1px 3px rgba(20,30,80,.12)}
  .fc-tab .n{min-width:20px;height:20px;padding:0 6px;border-radius:99px;
    background:var(--primary,#3a6fff);color:#fff;font-size:.68rem;font-weight:800;
    display:grid;place-items:center;line-height:1;font-variant-numeric:tabular-nums}

  .fc-sum{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(150px,100%),1fr));
    gap:10px}
  .fc-sum span{display:flex;flex-direction:column;gap:3px;padding:13px 15px;
    border-radius:13px;background:var(--panel,#fff);
    border:1px solid var(--line,#e3e8f4)}
  .fc-sum i{font-style:normal;font-size:.74rem;color:var(--faint,#818ead)}
  .fc-sum b{font-family:var(--hd,inherit);font-weight:800;font-size:1.3rem;
    font-variant-numeric:tabular-nums}

  .fc-clear{display:flex;flex-direction:column;gap:4px;padding:20px;
    border-radius:14px;background:#e7f8f1;border:1px solid #bfe9d8}
  .fc-clear b{font-size:1rem}
  .fc-clear span{font-size:.86rem;line-height:1.5;color:var(--txt-2,#535e78)}

  .fc-note{margin:0;padding:13px 15px;border-radius:13px;font-size:.84rem;
    line-height:1.55;background:var(--panel-2,#f0f4fd);color:var(--txt-2,#535e78)}

  .fc-list{display:flex;flex-direction:column;gap:9px}
  .fc-item{border:1px solid var(--line,#e3e8f4);border-radius:14px;
    background:var(--panel,#fff);overflow:hidden}
  .fc-item.on{border-color:var(--primary,#3a6fff)}
  .fc-item.look{border-color:#f0d9ab;background:#fffdf7}
  .fc-item.bad{border-color:#f6c9c9;background:#fffafa}

  .fc-head{display:grid;grid-template-columns:minmax(0,1.1fr) auto minmax(0,1.3fr) auto;
    gap:14px;align-items:center;width:100%;padding:13px 15px;border:0;
    background:transparent;font:inherit;text-align:left;cursor:pointer}
  .fc-head:hover{background:var(--panel-2,#f0f4fd)}
  .fc-head .k{font-size:.8rem;font-weight:700;color:var(--txt-2,#535e78)}
  .fc-head .amt{font-family:var(--hd,inherit);font-weight:800;font-size:1.05rem;
    font-variant-numeric:tabular-nums;white-space:nowrap;display:flex;
    flex-direction:column;align-items:flex-end}
  .fc-head .amt i{font-style:normal;font-size:.7rem;font-weight:600;
    color:var(--faint,#818ead)}
  .fc-head .who{display:flex;flex-direction:column;gap:1px;min-width:0}
  .fc-head .who b{font-weight:700;overflow:hidden;text-overflow:ellipsis;
    white-space:nowrap}
  .fc-head .who i{font-style:normal;font-size:.75rem;color:var(--faint,#818ead);
    overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .fc-head .more{font-size:.76rem;font-weight:700;color:var(--primary,#3a6fff);
    white-space:nowrap}

  .fc-body{padding:0 15px 15px;border-top:1px solid var(--line,#e3e8f4)}
  .fc-auto{margin:12px 0 0;padding:10px 12px;border-radius:10px;font-size:.82rem;
    line-height:1.5;background:#fff6e5;border:1px solid #f0d9ab;color:#7a5510}
  .fc-bad{margin:12px 0 0;padding:10px 12px;border-radius:10px;font-size:.82rem;
    line-height:1.5;background:#fdecec;border:1px solid #f6c9c9;color:#7a1f1f}
  .fc-cl{margin:12px 0 0;padding-left:20px;display:flex;flex-direction:column;
    gap:7px;font-size:.86rem;line-height:1.5;color:var(--ink,#12162a)}
  .fc-id{margin:12px 0 0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
    font-size:.7rem;color:var(--faint,#818ead)}

  .fc-steps{margin-top:12px;display:flex;flex-direction:column}
  .fc-steps .st{display:flex;justify-content:space-between;gap:12px;padding:8px 0;
    border-bottom:1px solid var(--line,#e3e8f4);font-size:.85rem}
  .fc-steps .st:last-child{border-bottom:0}
  .fc-steps .st b{font-variant-numeric:tabular-nums;font-weight:700}
  .fc-steps .st b.neg{color:#c0392b}
  .fc-steps .st.tot{border-top:2px solid var(--line-2,#d3daec);margin-top:4px;
    padding-top:11px;font-weight:800}
  .fc-steps .st.tot b{font-family:var(--hd,inherit);font-size:1.1rem}

  @media (max-width:820px){
    .fc-head{grid-template-columns:1fr auto;row-gap:5px}
    .fc-head .who{grid-column:1 / -1;order:3}
    .fc-head .more{grid-column:1 / -1;order:4;text-align:left}
  }
`;
