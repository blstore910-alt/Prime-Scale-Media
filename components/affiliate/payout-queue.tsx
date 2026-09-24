"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import ConfirmModal, { ConfirmFact } from "@/components/ui/confirm-modal";
import { formatCurrency } from "@/lib/utils";
import useAffiliatePayouts, { type AffiliatePayout } from "@/hooks/use-affiliate-payouts";

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
  const queryClient = useQueryClient();
  const payouts = useAffiliatePayouts(true, tenantId);
  const [asking, setAsking] = useState<{ g: AffiliatePayout[]; action: "paid" | "reject" } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
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
                  const who = nameOf(first.affiliate_advertiser_id);
                  const per = receives(g);
                  const commissions = g.reduce(
                    (n, p) => n + (Number(p.commission_count) || 0),
                    0,
                  );
                  return (
                    <tr key={String(first.group_id ?? first.id)}>
                      <td data-label="Who">
                        <div style={{ fontWeight: 700 }}>
                          {who.name || DASH}{" "}
                          <span className="mono muted" style={{ fontSize: ".78rem" }}>
                            {who.code}
                          </span>
                        </div>
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
                      <td className="r" data-label="Decide">
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
                  const who = nameOf(first.affiliate_advertiser_id);
                  return (
                    <tr key={String(first.group_id ?? first.id)}>
                      <td data-label="Who">
                        <div style={{ fontWeight: 700 }}>
                          {who.name || DASH}{" "}
                          <span className="mono muted" style={{ fontSize: ".78rem" }}>
                            {who.code}
                          </span>
                        </div>
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
        disabled={asking?.action === "reject" && !reason.trim()}
        disabledHint={
          asking?.action === "reject" && !reason.trim() ? "Write the reason first." : undefined
        }
        onConfirm={decide}
      >
        {asking ? (
          <>
            <ConfirmFact
              label="Affiliate"
              value={`${nameOf(asking.g[0].affiliate_advertiser_id).name} · ${nameOf(asking.g[0].affiliate_advertiser_id).code}`}
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
