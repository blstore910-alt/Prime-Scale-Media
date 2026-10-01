"use client";

// ── ANDER BEDRAG, TWEE ADMINS (plak 194) ────────────────────────────
//
// "Other amount" op een wachtende top-up: een admin vult in wat er echt
// binnenkwam, met een reden. Daarna staat er een gele balk op de kaart
// tot een ANDERE admin bevestigt (hoger dan opgegeven: alleen een super
// admin) of iemand het voorstel intrekt. De regels zitten in de database;
// dit scherm zegt ze alleen hardop.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Loader2, Scale, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  cancelWalletTopupAmount,
  confirmWalletTopupAmount,
  listWalletTopupProposals,
  proposeWalletTopupAmount,
  type TopupProposal,
} from "@/actions/wallet-topup-amount-actions";

const geld = (n: number, cur: string) =>
  `${String(cur).toUpperCase() === "USD" ? "$" : "€"}${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function useTopupProposals() {
  return useQuery({
    queryKey: ["topup-proposals"],
    queryFn: async () => {
      const r = await listWalletTopupProposals();
      if (!r.ok) throw new Error(r.error);
      return r.data;
    },
    staleTime: 15_000,
  });
}

function vernieuw(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ["topup-proposals"] });
  void qc.invalidateQueries({ queryKey: ["wallet-transactions"] });
  void qc.invalidateQueries({ queryKey: ["wallet_topups"] });
  void qc.invalidateQueries({ queryKey: ["pending-counts"] });
}

export function OtherAmountButton({
  topupId,
  claimed,
  currency,
  disabled,
}: {
  topupId: string;
  claimed: number;
  currency: string;
  disabled?: boolean;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const n = Number(amount);
  const hoger = n > claimed;
  const voorstel = useMutation({
    mutationFn: async () => {
      const r = await proposeWalletTopupAmount({ topupId, amount, reason });
      if (!r.ok) throw new Error(r.error);
    },
    onSuccess: () => {
      toast.success("Proposed — a second admin has to confirm it");
      setOpen(false);
      setAmount("");
      setReason("");
      vernieuw(qc);
    },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <>
      <button
        className="btn ghost sm"
        disabled={disabled}
        title="The bank shows a different amount than the customer gave"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <Scale /> Other amount
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Credit a different amount</DialogTitle>
            <DialogDescription>
              The customer gave {geld(claimed, currency)}. Enter what actually arrived on the bank. A second admin has to
              confirm it before anything is credited.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <label className="grid gap-1">
              <span className="text-xs font-semibold">Received on the bank ({String(currency).toUpperCase()})</span>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                placeholder="0.00"
                className="h-10 rounded-lg border bg-background px-3 text-sm"
              />
            </label>
            {amount && n > 0 ? (
              <p className={`rounded-lg px-3 py-2 text-xs font-semibold ${hoger ? "bg-amber-100 text-amber-900" : "bg-sky-50 text-sky-900"}`}>
                {hoger
                  ? `More than the customer gave (+${geld(n - claimed, currency)}): only a super admin can confirm this.`
                  : `${geld(claimed - n, currency)} less than the customer gave. The customer is credited ${geld(n, currency)}.`}
              </p>
            ) : null}
            <label className="grid gap-1">
              <span className="text-xs font-semibold">Why (the second admin and the customer read this)</span>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. bank shows €450 from the same sender, same reference"
                className="h-10 rounded-lg border bg-background px-3 text-sm"
              />
            </label>
            <button
              disabled={voorstel.isPending || !(n > 0) || reason.trim().length < 5}
              onClick={() => voorstel.mutate()}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-extrabold text-primary-foreground disabled:opacity-50"
            >
              {voorstel.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Propose for a second admin
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ProposalStrip({
  p,
  me,
  claimed,
  currency,
}: {
  p: TopupProposal;
  me: string;
  claimed: number;
  currency: string;
}) {
  const qc = useQueryClient();
  const eigen = p.byId === me;
  const bevestig = useMutation({
    mutationFn: async () => {
      const r = await confirmWalletTopupAmount(p.topupId);
      if (!r.ok) throw new Error(r.error);
      return r.data.notifyProblem;
    },
    onSuccess: (probleem) => {
      toast.success(`${geld(p.proposedAmount, currency)} credited`, probleem ? { description: `The customer was not notified: ${probleem}` } : undefined);
      vernieuw(qc);
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const intrekken = useMutation({
    mutationFn: async () => {
      const r = await cancelWalletTopupAmount(p.topupId);
      if (!r.ok) throw new Error(r.error);
    },
    onSuccess: () => {
      toast.success("Proposal cancelled");
      vernieuw(qc);
    },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{ flexBasis: "100%" }}
      className="mb-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950"
    >
      <div className="font-extrabold">
        Other amount proposed: {geld(p.proposedAmount, currency)} instead of {geld(claimed, currency)}
      </div>
      <div className="text-xs">
        by {eigen ? "you" : p.byName} — “{p.reason}”
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {eigen ? (
          <span className="text-xs font-semibold">Waiting for a second admin to confirm.</span>
        ) : (
          <button
            disabled={bevestig.isPending}
            onClick={() => bevestig.mutate()}
            className="inline-flex h-8 items-center gap-1 rounded-lg bg-emerald-600 px-3 text-xs font-bold text-white"
          >
            <Check className="h-3.5 w-3.5" /> Confirm {geld(p.proposedAmount, currency)}
          </button>
        )}
        <button
          disabled={intrekken.isPending}
          onClick={() => intrekken.mutate()}
          className="inline-flex h-8 items-center gap-1 rounded-lg border border-amber-400 bg-white px-3 text-xs font-bold"
        >
          <X className="h-3.5 w-3.5" /> Cancel proposal
        </button>
      </div>
    </div>
  );
}
