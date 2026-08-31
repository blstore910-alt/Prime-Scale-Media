"use client";

import { setReferralLinkStatus } from "@/actions/referral-actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

// Approve / reject control for a referral link. Only interactive
// while the link is pending; once active or rejected it just shows
// the state. Approving a link is what lets commission start accruing
// (the DB trigger only pays out on 'active' links).
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
    return (
      <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-transparent">
        Active
      </Badge>
    );
  }
  if (current === "rejected") {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        Rejected
      </Badge>
    );
  }

  // pending → show approve / reject
  return (
    <div className="flex items-center justify-end gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={() => mutate("rejected")}
      >
        {isPending && pendingAction === "rejected" ? "…" : "Reject"}
      </Button>
      <Button
        size="sm"
        disabled={isPending}
        onClick={() => mutate("active")}
      >
        {isPending && pendingAction === "active" ? "…" : "Approve"}
      </Button>
    </div>
  );
}
