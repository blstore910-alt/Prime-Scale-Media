"use client";

import { setReferralLinkStatus } from "@/actions/referral-actions";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import ConfirmModal, { ConfirmFact } from "@/components/ui/confirm-modal";

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
}: {
  referralLinkId: string;
  status: string | null;
  /** For the confirmation, so it names who it is about. */
  affiliateName?: string | null;
  referredName?: string | null;
}) {
  const queryClient = useQueryClient();
  const [pendingAction, setPendingAction] = useState<
    "active" | "rejected" | null
  >(null);

  const { mutate, isPending } = useMutation({
    mutationFn: async (next: "active" | "rejected") => {
      setPendingAction(next);
      const res = await setReferralLinkStatus(referralLinkId, next);
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: (_data, next) => {
      // The affiliate table keys on "referral-links-with-details"; other
      // views key on "affiliates". Invalidate both so the row refetches.
      queryClient.invalidateQueries({ queryKey: ["referral-links-with-details"] });
      queryClient.invalidateQueries({ queryKey: ["affiliates"] });
      queryClient.invalidateQueries({ queryKey: ["affiliate-book"], exact: false });
      toast.success(
        next === "active" ? "Affiliate approved" : "Affiliate rejected",
      );
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
        {isPending && pendingAction === "rejected" ? "…" : "Reject"}
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
          asking === "rejected" ? "Reject this affiliate?" : "Approve this affiliate?"
        }
        lead={
          asking === "rejected"
            ? "They stop earning on every future top-up from this customer, and there is no way back to pending from inside the app."
            : "Commission starts accruing on this customer's top-ups from now on."
        }
        cta={asking === "rejected" ? "Yes, reject" : "Yes, approve"}
        tone={asking === "rejected" ? "danger" : undefined}
        busy={isPending}
        busyLabel="Saving…"
        onConfirm={() => {
          if (asking) mutate(asking);
          setAsking(null);
        }}
      >
        <ConfirmFact label="Affiliate" value={affiliateName ?? "—"} />
        <ConfirmFact label="Referred customer" value={referredName ?? "—"} />
      </ConfirmModal>
    </div>
  );
}
