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
  const [asking, setAsking] = useState<{ p: AffiliatePayout; action: "paid" | "reject" } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");

  const waiting = useMemo(
    () => payouts.rows.filter((p) => p.status === "requested"),
    [payouts.rows],
  );
  const settled = useMemo(
    () => payouts.rows.filter((p) => p.status !== "requested").slice(0, 8),
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
  if (!waiting.length && !settled.length) return null;

  const decide = async () => {
    if (!asking) return;
    setBusy(true);
    try {
      const { decideAffiliatePayout } = await import("@/actions/payout-actions");
      const res = await decideAffiliatePayout(asking.p.id, asking.action, {
        reason: reason.trim() || undefined,
        reference: reference.trim() || undefined,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(
        asking.action === "paid"
          ? `Marked paid: ${formatCurrency(Number(asking.p.amount), asking.p.currency)}`
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
                  <th className="r">Amount</th>
                  <th>Where it goes</th>
                  <th>Asked</th>
                  <th className="r">Decide</th>
                </tr>
              </thead>
              <tbody>
                {waiting.map((p) => {
                  const who = nameOf(p.affiliate_advertiser_id);
                  return (
                    <tr key={p.id}>
                      <td data-label="Who">
                        <div style={{ fontWeight: 700 }}>
                          {who.name || DASH}{" "}
                          <span className="mono muted" style={{ fontSize: ".78rem" }}>
                            {who.code}
                          </span>
                        </div>
                        <div className="muted" style={{ fontSize: ".8rem" }}>
                          {p.commission_count}{" "}
                          {p.commission_count === 1 ? "commission" : "commissions"}
                          {Number(p.clawback_amount) > 0
                            ? ` · ${formatCurrency(Number(p.clawback_amount), p.currency)} returned`
                            : ""}
                        </div>
                      </td>
                      <td className="r" data-label="Amount" style={{ fontWeight: 800 }}>
                        {formatCurrency(Number(p.amount), p.currency)}
                      </td>
                      <td data-label="Where it goes" style={{ fontSize: ".8rem" }}>
                        {detailLines(p).length ? (
                          detailLines(p).map((l) => <div key={l}>{l}</div>)
                        ) : (
                          <span className="muted">No details given</span>
                        )}
                      </td>
                      <td data-label="Asked">
                        {dayjs(p.requested_at).format("D MMM YYYY, HH:mm")}
                      </td>
                      <td className="r" data-label="Decide">
                        {canDecide ? (
                          <div
                            style={{ display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "wrap" }}
                          >
                            <Button
                              size="sm"
                              onClick={() => {
                                setReference("");
                                setAsking({ p, action: "paid" });
                              }}
                            >
                              Mark as paid
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setReason("");
                                setAsking({ p, action: "reject" });
                              }}
                            >
                              Send back
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
                {settled.map((p) => {
                  const who = nameOf(p.affiliate_advertiser_id);
                  return (
                    <tr key={p.id}>
                      <td data-label="Who">
                        <div style={{ fontWeight: 700 }}>
                          {who.name || DASH}{" "}
                          <span className="mono muted" style={{ fontSize: ".78rem" }}>
                            {who.code}
                          </span>
                        </div>
                      </td>
                      <td className="r" data-label="Amount" style={{ fontWeight: 800 }}>
                        {formatCurrency(Number(p.amount), p.currency)}
                      </td>
                      <td data-label="State">
                        <span
                          className={`badge ${
                            p.status === "paid" ? "ok" : p.status === "rejected" ? "due" : "muted"
                          }`}
                        >
                          {p.status === "paid"
                            ? "Paid"
                            : p.status === "rejected"
                              ? "Sent back"
                              : "Withdrawn"}
                        </span>
                      </td>
                      <td data-label="When">
                        {dayjs(p.paid_at ?? p.decided_at ?? p.requested_at).format("D MMM YYYY")}
                      </td>
                      <td data-label="Reference / reason" style={{ fontSize: ".8rem" }}>
                        {p.reference || p.reason || DASH}
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
              value={`${nameOf(asking.p.affiliate_advertiser_id).name} · ${nameOf(asking.p.affiliate_advertiser_id).code}`}
            />
            <ConfirmFact
              label="Amount"
              value={formatCurrency(Number(asking.p.amount), asking.p.currency)}
            />
            <ConfirmFact
              label="Commissions"
              value={`${asking.p.commission_count} row${asking.p.commission_count === 1 ? "" : "s"}`}
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
