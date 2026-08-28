"use client";

import { setCommissionStatus } from "@/actions/referral-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";

type Props = {
  commissionId: string;
  status: string | null;
  buttonClassName?: string;
};

export default function CommissionStatusAction({
  commissionId,
  status,
  buttonClassName,
}: Props) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const currentStatus = (status ?? "unpaid").toLowerCase() === "paid"
    ? "paid"
    : "unpaid";
  const nextStatus = useMemo<"paid" | "unpaid">(
    () => (currentStatus === "paid" ? "unpaid" : "paid"),
    [currentStatus],
  );
  const actionLabel = nextStatus === "paid" ? "Mark Paid" : "Mark Unpaid";

  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      const result = await setCommissionStatus(commissionId, nextStatus);
      if (!result.ok) throw new Error(result.error);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["commissions"] });
      toast.success(`Commission marked as ${nextStatus}.`);
      setOpen(false);
    },
    onError: (error) => {
      toast.error("Failed to update commission status", {
        description:
          error instanceof Error ? error.message : "Unknown error occurred.",
      });
    },
  });

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className={buttonClassName}
        disabled={isPending}
        onClick={() => setOpen(true)}
      >
        {actionLabel}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Status Update</DialogTitle>
            <DialogDescription>
              This will change commission status from {currentStatus} to{" "}
              {nextStatus}. Are you sure?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button onClick={() => mutate()} disabled={isPending}>
              {isPending ? "Updating..." : actionLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

