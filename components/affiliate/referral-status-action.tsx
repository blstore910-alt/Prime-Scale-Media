"use client";

import { setReferralLinkStatus } from "@/actions/referral-actions";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

// Approve / reject control for a referral link. Only interactive
// while the link is pending; once active or rejected it just shows
// the state. Approving a link is what lets commission start accruing
// (the DB trigger only pays out on 'active' links). Mockup look —
// wiring unchanged.
export default function ReferralStatusAction({
  referralLinkId,
  status,
}: {
  referralLinkId: string;
  status: string | null;
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
      toast.success(
        next === "active" ? "Affiliate approved" : "Affiliate rejected",
      );
    },
    onError: (err: Error) => {
      toast.error("Couldn't update affiliate", { description: err.message });
    },
    onSettled: () => setPendingAction(null),
  });

  const current = (status ?? "active").toLowerCase();

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
        onClick={() => mutate("rejected")}
      >
        {isPending && pendingAction === "rejected" ? "…" : "Reject"}
      </button>
      <button
        className="btn sm"
        disabled={isPending}
        onClick={() => mutate("active")}
      >
        {isPending && pendingAction === "active" ? "…" : "Approve"}
      </button>
    </div>
  );
}
