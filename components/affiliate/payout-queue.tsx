"use client";

import { Fragment, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import ConfirmModal, { ConfirmFact } from "@/components/ui/confirm-modal";
import { formatCurrency } from "@/lib/utils";
import useAffiliatePayouts, { type AffiliatePayout } from "@/hooks/use-affiliate-payouts";
import { usePayoutCommissions } from "@/hooks/use-payout-commissions";

// ── THE PAYOUT QUEUE ────────────────────────────────────────────────────
//
// One row per request, per affiliate, per currency — the owner's words:
// "hoef geen mark paid, dat moeten we in bulk doen". Marking it paid
// settles exactly the commissions the request was built from, with the
// date and the bank reference; rejecting hands them back to the queue
// with a reason the affiliate can read.
//
// Nothing here moves money. It records what the owner transferred.

const DASH = "—";

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Requests made together are one transfer, so they are one row here. */
function groupRows(rows: AffiliatePayout[]): AffiliatePayout[][] {
  const by = new Map<string, AffiliatePayout[]>();
  for (const p of rows) {
    const k = String(p.group_id ?? p.id);
    by.set(k, [...(by.get(k) ?? []), p]);
  }
  return [...by.values()];
}

/** What we actually transfer, per bank currency. */
function receives(g: AffiliatePayout[]): Record<string, number> {
  const per: Record<string, number> = {};
  for (const p of g) {
    const cur = String(p.payout_currency ?? p.currency).toUpperCase();
    per[cur] = round2((per[cur] ?? 0) + (Number(p.payout_amount ?? p.amount) || 0));
  }
  return per;
}

function moneyList(per: Record<string, number>): string {
  return Object.entries(per)
    .map(([c, a]) => formatCurrency(a, c))
    .join(" + ");
}

function detailLines(p: AffiliatePayout): string[] {
  const d = (p.details ?? {}) as Record<string, string>;
  const out: string[] = [];
  const add = (label: string, v?: string) => {
    if (v && v.trim()) out.push(`${label}: ${v.trim()}`);
  };
  add("Holder", d.holder);
  add("IBAN", d.iban);
  add("BIC", d.bic);
  add("Bank", d.bankName);
  add("Account", d.accountNumber);
  add("Routing", d.routing);
  add("Address", d.address);
  add("VAT / Tax", d.taxId);
  add("Note", d.note);
  return out;
}

/**
 * The shortest reason the server accepts. actions/payout-actions.ts and
 * affiliate_payout_decide both refuse under three.
 */
const PQ_CSS = `
/* De rij is klikbaar en dat moet je kunnen zien voordat je klikt. */
.pq-row{cursor:pointer}
.pq-row:hover{background:var(--panel-2)}
.pq-row.open{background:var(--primary-tint)}
.pq-detail>td{padding:0 !important;background:var(--panel-2);
  border-top:0 !important}
.pq-lines{padding:11px 16px 14px;font-size:.85rem}
.pq-lines.muted{color:var(--txt-2)}
.pq-grp + .pq-grp{margin-top:11px;border-top:1px dashed var(--line);
  padding-top:11px}
.pq-grp-head{display:flex;align-items:baseline;gap:10px;
  font-size:.76rem;font-weight:800;letter-spacing:.03em;
  text-transform:uppercase;color:var(--faint);margin-bottom:5px}
.pq-grp-head b{margin-left:auto;font-size:.9rem;letter-spacing:0;
  text-transform:none;color:var(--ink);font-variant-numeric:tabular-nums}
.pq-tbl{width:100%;border-collapse:collapse}
.pq-tbl td{padding:4px 0;vertical-align:top;border:0}
.pq-tbl td.d{width:96px;color:var(--txt-2);white-space:nowrap}
.pq-tbl td.c{font-weight:600}
.pq-tbl td.t{color:var(--txt-2)}
.pq-tbl td.a{text-align:right;font-weight:700;white-space:nowrap;
  font-variant-numeric:tabular-nums;padding-left:12px}
@media(max-width:700px){
  .pq-tbl td{display:block;padding:1px 0}
  .pq-tbl tr{display:block;padding:7px 0;border-bottom:1px solid var(--line)}
  .pq-tbl tr:last-child{border-bottom:0}
  .pq-tbl td.d{width:auto;font-size:.76rem}
  .pq-tbl td.a{text-align:left;padding-left:0;font-size:.95rem}
}
`;

/**
 * WAT ER IN EEN UITBETALING ZIT, regel voor regel.
 *
 * De eigenaar, 29-09: "als ik op 1 tile klik moet ik detailed zien
 * welke commissies etc, per commissie en per groep."
 *
 * Een uitbetaling toonde een bedrag en een aantal. Dat is genoeg om
 * hem te herkennen en te weinig om hem te controleren: vraagt een
 * affiliate waar zijn EUR 99,96 vandaan komt, dan is het antwoord
 * "twaalf commissies" en moet iemand in de database kijken.
 *
 * Per GROEP een subtotaal (dat is wat er in een overboeking gaat) en
 * daaronder per COMMISSIE de datum, de klant, waarover gerekend is en
 * het bedrag. Allebei, want hij vroeg allebei.
 */
function PayoutLines({ group }: { group: AffiliatePayout[] }) {
  const ids = group.map((p) => String(p.id));
  const q = usePayoutCommissions(ids);

  if (q.isPending) {
    return <div className="pq-lines muted">Reading the commissions…</div>;
  }
  if (q.isError) {
    return (
      <div className="pq-lines muted">
        We could not read the commissions behind this payout. Reload — this
        is not &quot;there are none&quot;.
      </div>
    );
  }
  if (q.data?.notSwitchedOn) {
    return (
      <div className="pq-lines muted">
        Commissions are not linked to payouts on this database yet (plak 50).
      </div>
    );
  }
  const rows = q.data?.rows ?? [];
  if (!rows.length) {
    return (
      <div className="pq-lines muted">
        No commissions are stamped with this payout. That is worth checking:
        the request should have pinned them.
      </div>
    );
  }

  // Per uitbetaling in de groep, want een groep kan meerdere valuta's
  // bevatten en die gaan als aparte overboekingen weg.
  const byPayout = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = r.payout_id;
    byPayout.set(k, [...(byPayout.get(k) ?? []), r]);
  }

  return (
    <div className="pq-lines">
      {group.map((p) => {
        const mine = byPayout.get(String(p.id)) ?? [];
        if (!mine.length) return null;
        const sub = mine.reduce((n, r) => n + r.amount, 0);
        return (
          <div className="pq-grp" key={String(p.id)}>
            <div className="pq-grp-head">
              <span>
                {p.payout_no ? `Payout #${p.payout_no}` : "Payout"} ·{" "}
                {mine.length} {mine.length === 1 ? "commission" : "commissions"}
              </span>
              <b>{formatCurrency(sub, mine[0].currency)}</b>
            </div>
            <table className="pq-tbl">
              <tbody>
                {mine.map((r) => (
                  <tr key={r.id}>
                    <td className="d">
                      {dayjs(r.created_at).format("D MMM YYYY")}
                    </td>
                    <td className="c">
                      {r.customer || "—"}
                      {r.customerCode ? (
                        <span className="mono muted"> {r.customerCode}</span>
                      ) : null}
                    </td>
                    <td className="t">
                      {r.type || r.source || "commission"}
                      {r.base_amount !== null && r.pct !== null ? (
                        <span className="muted">
                          {" "}
                          {r.pct}% of{" "}
                          {formatCurrency(r.base_amount, r.currency)}
                        </span>
                      ) : null}
                    </td>
                    <td className="a">{formatCurrency(r.amount, r.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

const REASON_MIN = 3;

export default function PayoutQueue({
  canDecide,
  nameOf,
  tenantId,
}: {
  canDecide: boolean;
  nameOf: (advertiserId: string) => { name: string; code: string };
  /** Cache scope: the owner's queue is per tenant. */
  tenantId?: string | null;
}) {
  // ── DE ONTVANGER STAAT OP DE RIJ, NIET ALLEEN IN DE LIJST ──────
  //
  // `nameOf` zoekt de affiliate op in een lijst die uit referral-links
  // wordt opgebouwd, en die links CASCADEren weg met de adverteerder.
  // Een uitbetaling overleeft dat (plak 158), de lijst niet -- dus op
  // het venster waar een eigenaar een overboeking bevestigt stond
  // "Affiliate · " met een lege code.
  //
  // Plak 158 zet code en naam op de uitbetaling zelf. Die gaan voor;
  // de lijst is de terugval voor rijen van voor die plak.
  const recipient = (p: AffiliatePayout) => {
    const looked = nameOf(p.affiliate_advertiser_id);
    const name = (p.affiliate_name ?? "").trim() || looked.name;
    const code = (p.affiliate_code ?? "").trim() || looked.code;
    return { name, code };
  };

  const queryClient = useQueryClient();
  const payouts = useAffiliatePayouts(true, tenantId);
  const [asking, setAsking] = useState<{ g: AffiliatePayout[]; action: "paid" | "reject" } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  // Welke groepen open staan. Een Set en geen enkele id: twee naast
  // elkaar openhouden om ze te vergelijken is precies wat iemand doet
  // die controleert.
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (k: string) =>
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");

  const waiting = useMemo(
    () => groupRows(payouts.rows.filter((p) => p.status === "requested")),
    [payouts.rows],
  );
  const settled = useMemo(
    () => groupRows(payouts.rows.filter((p) => p.status !== "requested")).slice(0, 8),
    [payouts.rows],
  );

  // Not switched on yet (plak 50) — say nothing rather than "no payouts",
  // which would be a statement about money we cannot make.
  if (payouts.missing) return null;
  if (payouts.isError) {
    return (
      <div className="card">
        <h2>Payouts</h2>
        <p className="cap" style={{ margin: "6px 0 0" }}>
          We couldn&apos;t read the payout requests just now — this is not
          &ldquo;none&rdquo;. Reload to try again.
        </p>
      </div>
    );
  }
  // ---- STILL ASKING IS NOT "NOTHING TO DO" ----------------------
  //
  // Rendering nothing while the read is in flight makes the owner's
  // queue indistinguishable from an empty one for the first moment, on
  // the screen where they decide whether anybody is waiting for money.
  if (payouts.isPending) {
    return (
      <div className="card">
        <h2>Payouts</h2>
        <p className="cap" style={{ margin: "6px 0 0" }}>
          Checking whether anybody is waiting to be paid&hellip;
        </p>
      </div>
    );
  }
  if (!waiting.length && !settled.length) return null;

  const decide = async () => {
    if (!asking) return;
    setBusy(true);
    try {
      const { decideAffiliatePayout } = await import("@/actions/payout-actions");
      const res = await decideAffiliatePayout(asking.g[0].id, asking.action, {
        reason: reason.trim() || undefined,
        reference: reference.trim() || undefined,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(
        asking.action === "paid"
          ? `Marked paid: ${moneyList(receives(asking.g))}`
          : "Sent back with your reason",
        {
          description:
            asking.action === "paid"
              ? `${res.data.commissions} ${res.data.commissions === 1 ? "commission" : "commissions"} settled.`
              : "The commissions are waiting to be paid again.",
        },
      );
      setAsking(null);
      setReason("");
      setReference("");
      await payouts.refetch();
      queryClient.invalidateQueries({ queryKey: ["affiliate-book"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["affiliates-waiting"], exact: false });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <style>{PQ_CSS}</style>
      {waiting.length ? (
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: "16px 18px 6px" }}>
            <h2>Payouts waiting ({waiting.length})</h2>
            <p className="cap" style={{ margin: "4px 0 8px" }}>
              One request covers everything that was owed in that currency at
              the moment it was asked for. Marking it paid settles exactly
              those commissions.
            </p>
          </div>
          <div className="tblwrap">
            <table className="tbl wide">
              <thead>
                <tr>
                  <th>Who</th>
                  <th className="r">Transfer</th>
                  <th>Where it goes</th>
                  <th>Asked</th>
                  <th className="r">Decide</th>
                </tr>
              </thead>
              <tbody>
                {waiting.map((g) => {
                  const first = g[0];
                  const who = recipient(first);
                  const per = receives(g);
                  const commissions = g.reduce(
                    (n, p) => n + (Number(p.commission_count) || 0),
                    0,
                  );
                  const gkey = String(first.group_id ?? first.id);
                  const isOpen = openGroups.has(gkey);
                  return (
                    <Fragment key={gkey}>
                    <tr
                      className={`pq-row${isOpen ? " open" : ""}`}
                      onClick={() => toggleGroup(gkey)}
                    >
                      {/* Code ONDER de naam, niet ernaast. De eigenaar,
                          29-09: "doe bij payouts card psm0008 boven of
                          onder de naam ipv rechts." Naast de naam
                          maakte hij de kolom breed en wikkelde hij bij
                          een lange naam als eerste weg -- en de code is
                          juist het stukje waarop je zoekt. Eronder
                          staat hij altijd, op elke breedte. */}
                      <td data-label="Who">
                        <div style={{ fontWeight: 700 }}>{who.name || DASH}</div>
                        {who.code ? (
                          <div
                            className="mono muted"
                            style={{ fontSize: ".76rem", marginTop: 1 }}
                          >
                            {who.code}
                          </div>
                        ) : null}
                        <div className="muted" style={{ fontSize: ".8rem" }}>
                          {first.payout_no ? `Payout #${first.payout_no} · ` : ""}
                          {commissions} {commissions === 1 ? "commission" : "commissions"}
                          {g.some((p) => Number(p.clawback_amount) > 0)
                            ? " · returned volume settled"
                            : ""}
                        </div>
                      </td>
                      <td className="r" data-label="Transfer" style={{ fontWeight: 800 }}>
                        {moneyList(per)}
                        <div className="muted" style={{ fontSize: ".76rem", fontWeight: 500 }}>
                          {g
                            .map((p) => {
                              const dst = String(p.payout_currency ?? p.currency).toUpperCase();
                              const src = formatCurrency(Number(p.amount) || 0, p.currency);
                              return dst === String(p.currency).toUpperCase()
                                ? `${src}`
                                : `${src} → ${dst} @ ${Number(p.fx_rate ?? 0).toFixed(4)} − ${Number(
                                    p.fx_fee_pct ?? 0,
                                  )}%`;
                            })
                            .join(" · ")}
                        </div>
                      </td>
                      <td data-label="Where it goes" style={{ fontSize: ".8rem" }}>
                        {detailLines(first).length ? (
                          detailLines(first).map((l) => <div key={l}>{l}</div>)
                        ) : (
                          <span className="muted">No details given</span>
                        )}
                      </td>
                      <td data-label="Asked">
                        {dayjs(first.requested_at).format("D MMM YYYY, HH:mm")}
                      </td>
                      {/* stopPropagation: de rij klapt open bij een
                          klik, en een klik op "Mark as paid" is geen
                          verzoek om de regels te zien. */}
                      <td
                        className="r"
                        data-label="Decide"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {canDecide ? (
                          <div
                            style={{
                              display: "flex",
                              gap: 6,
                              justifyContent: "flex-end",
                              flexWrap: "wrap",
                            }}
                          >
                            <Button
                              size="sm"
                              onClick={() => {
                                setReference("");
                                setAsking({ g, action: "paid" });
                              }}
                            >
                              Mark as paid
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setReason("");
                                setAsking({ g, action: "reject" });
                              }}
                            >
                              Send back
                            </Button>
                            <Button size="sm" variant="ghost" asChild>
                              <a
                                href={`/api/payouts/${first.id}/invoice`}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                Invoice
                              </a>
                            </Button>
                          </div>
                        ) : (
                          <span className="badge pend">Waiting for the owner</span>
                        )}
                      </td>
                    </tr>
                    {isOpen ? (
                      <tr className="pq-detail">
                        <td colSpan={5}>
                          <PayoutLines group={g} />
                        </td>
                      </tr>
                    ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {settled.length ? (
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: "16px 18px 6px" }}>
            <h2>Payouts</h2>
          </div>
          <div className="tblwrap">
            <table className="tbl wide">
              <thead>
                <tr>
                  <th>Who</th>
                  <th className="r">Amount</th>
                  <th>State</th>
                  <th>When</th>
                  <th>Reference / reason</th>
                </tr>
              </thead>
              <tbody>
                {settled.map((g) => {
                  const first = g[0];
                  const who = recipient(first);
                  return (
                    <tr key={String(first.group_id ?? first.id)}>
                      <td data-label="Who">
                        <div style={{ fontWeight: 700 }}>{who.name || DASH}</div>
                        {who.code ? (
                          <div
                            className="mono muted"
                            style={{ fontSize: ".76rem", marginTop: 1 }}
                          >
                            {who.code}
                          </div>
                        ) : null}
                        {first.payout_no ? (
                          <div className="muted" style={{ fontSize: ".78rem" }}>
                            Payout #{first.payout_no}
                          </div>
                        ) : null}
                      </td>
                      <td className="r" data-label="Amount" style={{ fontWeight: 800 }}>
                        {moneyList(receives(g))}
                      </td>
                      <td data-label="State">
                        <span
                          className={`badge ${
                            first.status === "paid"
                              ? "ok"
                              : first.status === "rejected"
                                ? "due"
                                : "muted"
                          }`}
                        >
                          {first.status === "paid"
                            ? "Paid"
                            : first.status === "rejected"
                              ? "Sent back"
                              : "Withdrawn"}
                        </span>
                      </td>
                      <td data-label="When">
                        {dayjs(first.paid_at ?? first.decided_at ?? first.requested_at).format(
                          "D MMM YYYY",
                        )}
                      </td>
                      <td data-label="Reference / reason" style={{ fontSize: ".8rem" }}>
                        {first.reference || first.reason || DASH}
                        {/* This table holds the finished rows, which
                            includes the ones that were sent back and
                            the ones the affiliate withdrew. There is no
                            invoice for those -- we raise it ourselves,
                            in the affiliate's name, and raising one for
                            a transfer we refused is a paper that should
                            not exist. The route says the same (409); the
                            link goes so nobody has to find that out.

                            And only the owner may read it -- the policy
                            on affiliate_payouts has no admin branch, so
                            for anyone else this link was a 404 with
                            their own bank details behind it. Same flag
                            that decides who may settle. */}
                        {canDecide &&
                        first.status !== "rejected" &&
                        first.status !== "cancelled" ? (
                          <div>
                            <a
                              href={`/api/payouts/${first.id}/invoice`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ fontSize: ".78rem" }}
                            >
                              Invoice
                            </a>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <ConfirmModal
        open={!!asking}
        onOpenChange={(o) => {
          if (!o) setAsking(null);
        }}
        title={asking?.action === "paid" ? "Mark this payout as paid" : "Send this request back"}
        lead={
          asking?.action === "paid"
            ? "Record what you transferred. This settles exactly the commissions in this request — it does not move any money."
            : "The commissions go back to the queue and they can ask again. Say why, so they know."
        }
        cta={asking?.action === "paid" ? "Yes, it is paid" : "Yes, send it back"}
        tone={asking?.action === "paid" ? "default" : "danger"}
        busy={busy}
        busyLabel={asking?.action === "paid" ? "Recording…" : "Sending…"}
        // The SERVER refuses under three characters (payout-actions and
      // affiliate_payout_decide both), so "ok" lit this up and came back
      // as a red toast over a box the owner had just written in.
      disabled={
        asking?.action === "reject" && reason.trim().length < REASON_MIN
      }
        disabledHint={
          asking?.action === "reject" && !reason.trim() ? "Write the reason first." : undefined
        }
        onConfirm={decide}
      >
        {asking ? (
          <>
            <ConfirmFact
              label="Affiliate"
              value={(() => {
                const w = recipient(asking.g[0]);
                return w.code ? `${w.name} · ${w.code}` : w.name;
              })()}
            />
            <ConfirmFact label="You transfer" value={moneyList(receives(asking.g))} />
            {asking.g.some(
              (p) =>
                String(p.payout_currency ?? p.currency).toUpperCase() !==
                String(p.currency).toUpperCase(),
            ) ? (
              <ConfirmFact
                label="Converted"
                value={asking.g
                  .filter(
                    (p) =>
                      String(p.payout_currency ?? p.currency).toUpperCase() !==
                      String(p.currency).toUpperCase(),
                  )
                  .map(
                    (p) =>
                      `${formatCurrency(Number(p.amount) || 0, p.currency)} at ${Number(
                        p.fx_rate ?? 0,
                      ).toFixed(4)} − ${Number(p.fx_fee_pct ?? 0)}%`,
                  )
                  .join(" · ")}
              />
            ) : null}
            <ConfirmFact
              label="Commissions"
              value={`${asking.g.reduce((n, p) => n + (Number(p.commission_count) || 0), 0)} rows`}
            />
            {asking.action === "paid" ? (
              <div style={{ marginTop: 10 }}>
                <label
                  htmlFor="pq-ref"
                  style={{ display: "block", fontSize: ".78rem", fontWeight: 600, marginBottom: 4 }}
                >
                  Your bank reference (optional)
                </label>
                <input
                  id="pq-ref"
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="e.g. SEPA 22-09 batch 4"
                />
              </div>
            ) : (
              <div style={{ marginTop: 10 }}>
                <label
                  htmlFor="pq-reason"
                  style={{ display: "block", fontSize: ".78rem", fontWeight: 600, marginBottom: 4 }}
                >
                  Why
                </label>
                <input
                  id="pq-reason"
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. the IBAN does not match the account holder"
                />
              </div>
            )}
          </>
        ) : null}
      </ConfirmModal>
    </>
  );
}
