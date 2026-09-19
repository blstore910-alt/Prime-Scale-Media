"use client";

import { userFacingErrorMessage } from "@/lib/pure-error";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAppContext } from "@/context/app-provider";
import { DATE_TIME_FORMAT } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { AlertCircle, Loader2, ScrollText } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { useState } from "react";
import ConfirmModal, { ConfirmFact } from "@/components/ui/confirm-modal";
import { useOutstandingPrecharges } from "@/hooks/use-outstanding-precharges";

const formatAmount = (value: number | string | null | undefined) => {
  const num = Number(value ?? 0);
  if (Number.isNaN(num)) return "0.00";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
};

export default function WalletTopupDetailsSheet({
  open,
  onOpenChange,
  topupId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  topupId: string | null;
}) {
  const { profile, isSuperAdmin } = useAppContext();
  const isAdmin = profile?.role === "admin";
  const queryClient = useQueryClient();

  const {
    data: topup,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["wallet-topup-details", topupId],
    enabled: !!topupId,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("wallet_topups")
        .select("*")
        .eq("id", topupId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [confirming, setConfirming] = useState(false);
  // Same reason as the verify queue's dialog: an advance already credited
  // this wallet, and verifying settles it rather than adding to it. This
  // sheet is the worse of the two — it shows neither a matched bank
  // deposit nor an advance — and it is reachable from /wallets without
  // going near the verify queue at all.
  // isLoading TOO. Its sibling dialog takes it and disables the confirm
  // on it; this one did not, so pressing Verify inside the first
  // round-trip showed the "Only do this once you have seen the money
  // arrive" copy over a top-up that WAS advanced, with a live "Yes,
  // credit it" underneath. Unknown read as no-advance, which is the one
  // thing this hook exists to prevent.
  const {
    precharges,
    isError: prechargeUnreadable,
    isLoading: prechargeLoading,
  } = useOutstandingPrecharges(topupId ? [topupId] : []);
  const advance = topupId ? precharges[topupId] : undefined;
  const { mutate: verify, isPending: isVerifying } = useMutation({
    mutationFn: async () => {
      const supabase = createClient();
      const { error } = await supabase.rpc("wallet_topup_admin_verify", {
        p_topup_id: topupId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Topup verified successfully");
      queryClient.invalidateQueries({
        queryKey: ["wallet-topup-details", topupId],
      });
      queryClient.invalidateQueries({
        queryKey: ["wallet-topups"],
      });

      if (topup?.wallet_id) {
        queryClient.invalidateQueries({
          queryKey: ["wallet-details", topup.wallet_id],
        });
      }
      // The same six keys use-update-transaction invalidates. Without
      // them, crediting from /wallets leaves /wallet-topups listing the
      // card as Pending with Verify, Reject and Precharge all armed —
      // and Precharge on a settled payment advances credit a second
      // time. The wallets table keeps the old balance too.
      queryClient.invalidateQueries({ queryKey: ["wallet-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["money-in-counts"] });
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
      queryClient.invalidateQueries({ queryKey: ["outstanding-precharges"] });
      queryClient.invalidateQueries({ queryKey: ["wise-incoming"] });
      queryClient.invalidateQueries({ queryKey: ["matched-deposits"] });
    },
    onError: (err: Error) => {
      toast.error("Failed to verify topup", {
        description: userFacingErrorMessage(
          err,
          "The deposit was not credited. Reload and try again.",
        ),
      });
    },
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* w-full. Without it the base gives a right-side sheet w-3/4 — a
          270px drawer with 90px of page showing beside it on a phone, and
          sm:max-w-md does not apply until 640px. Every other reachable
          sheet in the app passes it; this one is reached from the wallet
          details sheet via the transactions table. */}
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Topup Details</SheetTitle>
          {isSuperAdmin && topupId && (
            <Link
              href={`/audit?row=${topupId}`}
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              onClick={() => onOpenChange(false)}
            >
              <ScrollText className="h-3 w-3" />
              View audit history
            </Link>
          )}
        </SheetHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {isError && (
          <div className="mt-4 flex items-center gap-2 text-destructive">
            <AlertCircle className="h-4 w-4" />
            <span>
              {userFacingErrorMessage(
                error,
                "We couldn't load this deposit. Reload to try again.",
              )}
            </span>
          </div>
        )}

        {topup && (
          <div className="mt-6 space-y-6 p-4">
            <div className="grid gap-4">
              <DetailItem
                label="Status"
                value={
                  <Badge variant="outline" className="capitalize">
                    {topup.status}
                  </Badge>
                }
              />
              <DetailItem
                label="Amount"
                value={`${topup.currency?.toUpperCase()} ${formatAmount(
                  topup.amount,
                )}`}
              />
              <DetailItem
                label="Date"
                value={dayjs(topup.created_at).format(DATE_TIME_FORMAT)}
              />
            </div>

            {isAdmin && topup.status === "pending" && (
              <div className="pt-4 border-t">
                {/* ASK FIRST. This credits a customer's wallet with
                    wallet_topup_admin_verify on ONE click, and it was the
                    only money button in the app that did not ask — the
                    same action reached from /wallet-topups goes through
                    WalletTransactionApproveDialog. It is also reachable
                    by a route nobody would look for it on: /wallets → a
                    wallet → its transactions → this sheet.

                    Crediting a deposit that never arrived is not undone
                    by pressing it again; it needs an adjustment and an
                    explanation. One dialog is cheap by comparison. */}
                <Button
                  className="w-full"
                  onClick={() => setConfirming(true)}
                  disabled={isVerifying}
                >
                  {isVerifying && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Verify & Complete Topup
                </Button>
              </div>
            )}
          </div>
        )}
      </SheetContent>

      <ConfirmModal
        open={confirming}
        onOpenChange={(next) => !next && setConfirming(false)}
        title="Credit this deposit to the customer's wallet?"
        lead={
          advance
            ? "This top-up was already advanced to the wallet. Verifying settles that advance, so the balance will NOT go up again — it is already there."
            : prechargeUnreadable
              ? "We could not check whether this was already advanced, so the balance may not move. Check the advances screen first."
              : "Only do this once you have seen the money arrive on the bank statement. Crediting a deposit that never arrived is put right with an adjustment, not by pressing this again."
        }
        cta="Yes, credit it"
        busy={isVerifying}
        disabled={prechargeLoading}
        busyLabel="Crediting…"
        onConfirm={() => {
          setConfirming(false);
          verify();
        }}
      >
        <ConfirmFact
          label="Amount"
          value={`${topup?.currency?.toUpperCase() ?? ""} ${formatAmount(
            topup?.amount,
          )}`}
          strong
        />
        <ConfirmFact label="Reference" value={topup?.reference_no ?? "—"} />
        {advance && (
          <ConfirmFact
            label="Wallet changes by"
            value={`${topup?.currency?.toUpperCase() ?? ""} 0.00`}
            strong
          />
        )}
      </ConfirmModal>
    </Sheet>
  );
}

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}
