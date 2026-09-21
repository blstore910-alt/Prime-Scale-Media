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
  /** For the confirmation, so it names the money rather than the status. */
  amount?: number | string | null;
  currency?: string | null;
  affiliate?: string | null;
};

export default function CommissionStatusAction({
  commissionId,
  status,
  buttonClassName,
  amount,
  currency,
  affiliate,
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
  // ── DO NOT OFFER A TRANSITION THE SERVER ALWAYS REFUSES ─────────────
  //
  // setCommissionStatus refuses paid -> unpaid, for a good reason:
  // nothing records that the payout already happened, so the next run
  // would pay it twice. The button went on rendering "Mark Unpaid" on
  // every paid row and walked the admin through a confirmation for a
  // transition that ends in an error toast.
  const alreadyPaid = currentStatus === "paid";
  const money =
    amount === null || amount === undefined
      ? null
      : `${(currency ?? "EUR").toUpperCase()} ${Number(amount).toFixed(2)}`;

  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      const result = await setCommissionStatus(commissionId, nextStatus);
      if (!result.ok) throw new Error(result.error);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["commissions"] });
      // The dashboard's "Commissions paid" card reads stats-batch, cached
      // for five minutes; it kept the old count after every Mark Paid.
      queryClient.invalidateQueries({ queryKey: ["stats-batch"], exact: false });
      queryClient.invalidateQueries({
        queryKey: ["referral-links-with-details"],
        exact: false,
      });
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
      {alreadyPaid ? (
        <span
          className="text-xs text-muted-foreground"
          title="A paid commission can't be set back to unpaid — nothing records that the payout happened, so the next run would pay it twice."
        >
          Paid
        </span>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className={buttonClassName}
          disabled={isPending}
          onClick={() => setOpen(true)}
        >
          {actionLabel}
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            {/* "Are you sure?" was the last generic confirmation left on
                a money control in this app, and it is on the one that
                CANNOT be undone: the server refuses paid -> unpaid, so a
                commission marked paid by mistake is recorded as settled
                and will never be paid. Name the money, the person, and
                the fact that there is no way back. */}
            <DialogTitle>Mark this commission as paid?</DialogTitle>
            <DialogDescription>
              {money ? `${money}` : "This commission"}
              {affiliate ? ` to ${affiliate}` : ""} will be recorded as
              settled. There is no way back from this in the app — a paid
              commission cannot be set to unpaid, because nothing records
              that the payout happened and the next run would pay it twice.
              Only do it once the money has actually left.
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

