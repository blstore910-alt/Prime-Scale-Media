"use client";

import { setReferralLinkStatus } from "@/actions/referral-actions";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import ConfirmModal, { ConfirmFact } from "@/components/ui/confirm-modal";
import { formatCurrency } from "@/lib/utils";

// Approve / reject control for a referral link. Only interactive
// while the link is pending; once active or rejected it just shows
// the state. Approving a link is what lets commission start accruing
// (the DB trigger only pays out on 'active' links). Mockup look —
// wiring unchanged.
export default function ReferralStatusAction({
  referralLinkId,
  status,
  affiliateName,
  referredName,
  commissionType,
  commissionPct,
}: {
  referralLinkId: string;
  status: string | null;
  /** For the confirmation, so it names who it is about. */
  affiliateName?: string | null;
  referredName?: string | null;
  /** The rate on THIS LINK. _accrue_referral_commission reads
   *  referral_links.commission_pct and stops at
   *  `coalesce(v_link.commission_pct, 0) <= 0` -- so a link with no rate
   *  earns nothing, no matter what the affiliate's settings say. */
  commissionType?: string | null;
  commissionPct?: number | null;
}) {
  const queryClient = useQueryClient();
  const [pendingAction, setPendingAction] = useState<
    "active" | "rejected" | null
  >(null);

  const [reason, setReason] = useState("");

  const { mutate, isPending } = useMutation({
    mutationFn: async (next: "active" | "rejected") => {
      setPendingAction(next);
      const res = await setReferralLinkStatus(
        referralLinkId,
        next,
        undefined,
        next === "rejected" ? reason : null,
      );
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    onSuccess: (decision, next) => {
      // The affiliate table keys on "referral-links-with-details"; other
      // views key on "affiliates". Invalidate both so the row refetches.
      queryClient.invalidateQueries({ queryKey: ["referral-links-with-details"] });
      queryClient.invalidateQueries({ queryKey: ["affiliates"] });
      queryClient.invalidateQueries({ queryKey: ["affiliate-book"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["commissions"], exact: false });
      setReason("");
      if (next === "rejected") {
        toast.success("Referral refused");
        return;
      }
      // Say what approving booked, so the number can be checked against
      // the Commissions list of this affiliate.
      const legs = [
        decision?.bookedEur ? formatCurrency(decision.bookedEur, "EUR") : null,
        decision?.bookedUsd ? formatCurrency(decision.bookedUsd, "USD") : null,
      ].filter(Boolean);
      toast.success("Referral approved", {
        description: legs.length
          ? `${legs.join(" + ")} booked for what this customer already did.`
          : "Nothing to book yet — commission starts with their next top-up or paid invoice.",
      });
    },
    onError: (err: Error) => {
      toast.error("Couldn't update affiliate", { description: err.message });
    },
    onSettled: () => setPendingAction(null),
  });

  // ── BOTH OF THESE ARE ONE-WAY, AND THEY SIT 8px APART ──────────────
  //
  // Reject flips the link to `rejected`, and on refetch the controls
  // disappear entirely — this component renders buttons only while the
  // status is pending, and setReferralLinkStatus is called from nowhere
  // else. There is no path back to pending or active anywhere in the
  // app. The commission trigger gates on `active`, so the affiliate
  // silently stops earning on every future top-up.
  //
  // Approve is the same shape in the other direction: it starts accrual
  // against real spend. Neither should happen on a mis-aimed click.
  const [asking, setAsking] = useState<"active" | "rejected" | null>(null);

  // A percentage arrangement with no percentage on it. The two live
  // links that carry a rate got it from the affiliate's settings; the
  // one created through the current RPC path did not, because nothing
  // copied it -- and nothing on this screen said so before approving.
  const noRate =
    !commissionType || !Number.isFinite(Number(commissionPct)) ||
    Number(commissionPct) <= 0;

  const current = (status ?? "active").toLowerCase();

  // ── "WE COULD NOT READ IT" IS NOT "ACTIVE" ────────────────────────
  //
  // `?? "active"` above is the right default for a database where the
  // column does not exist. It is the wrong answer for a read that
  // failed, and the two arrived here as the same undefined -- so a
  // pending affiliate got a green Active badge and no buttons, on the
  // only screen that can approve one.
  if (current === "unknown") {
    return (
      <span
        className="badge pend"
        title="We couldn't read this link's status. Reload before approving or rejecting anything."
      >
        Unknown
      </span>
    );
  }

  if (current === "active") {
    return <span className="badge ok">Active</span>;
  }
  if (current === "rejected") {
    return <span className="badge due">Rejected</span>;
  }

  // pending → show approve / reject
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: 8,
      }}
    >
      <button
        className="btn ghost sm"
        disabled={isPending}
        onClick={() => setAsking("rejected")}
      >
        {isPending && pendingAction === "rejected" ? "…" : "Refuse"}
      </button>
      <button
        className="btn sm"
        disabled={isPending}
        onClick={() => setAsking("active")}
      >
        {isPending && pendingAction === "active" ? "…" : "Approve"}
      </button>

      <ConfirmModal
        open={!!asking}
        onOpenChange={(next) => {
          if (!next && !isPending) setAsking(null);
        }}
        title={
          asking === "rejected" ? "Refuse this referral?" : "Approve this referral?"
        }
        lead={
          asking === "rejected"
            ? "The affiliate earns nothing from this customer. The customer stays yours; you can set a referrer for them later."
            : noRate
              ? "There is no commission rate on this referral, so approving it earns the affiliate NOTHING — not now and not on their next top-up. Set the rate on the affiliate first (Commission, on the customer row), then approve."
              : "The affiliate earns from this customer from now on — and everything the customer already did since they signed up is booked straight away, with the rules as they are now."
        }
        cta={asking === "rejected" ? "Yes, refuse" : "Yes, approve"}
        tone={asking === "rejected" ? "danger" : undefined}
        busy={isPending}
        busyLabel="Saving…"
        disabled={asking === "rejected" && !reason.trim()}
        onConfirm={() => {
          if (asking) mutate(asking);
          setAsking(null);
        }}
      >
        <ConfirmFact label="Affiliate" value={affiliateName ?? "—"} />
        <ConfirmFact label="Referred customer" value={referredName ?? "—"} />
        {asking === "active" ? (
          <ConfirmFact
            label="Rate on this referral"
            value={
              noRate
                ? "none — they earn nothing"
                : `${commissionPct}% (${commissionType})`
            }
            strong
          />
        ) : null}
        {asking === "rejected" ? (
          <label style={{ display: "grid", gap: 6, marginTop: 10, fontSize: ".86rem" }}>
            <span style={{ fontWeight: 600 }}>Why (kept on record)</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="e.g. they were already our customer"
              style={{
                border: "1px solid var(--line-2, #e5e7eb)",
                borderRadius: 10,
                padding: "8px 10px",
                font: "inherit",
                resize: "vertical",
              }}
            />
          </label>
        ) : null}
      </ConfirmModal>
    </div>
  );
}
