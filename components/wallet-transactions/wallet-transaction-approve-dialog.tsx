"use client";

import ConfirmModal, { ConfirmFact } from "@/components/ui/confirm-modal";
import { CURRENCY_SYMBOLS } from "@/lib/constants";
import { WalletTopupWithAdvertiser } from "@/lib/types/wallet-topup";

interface WalletTransactionApproveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  topup: WalletTopupWithAdvertiser;
  onConfirm: () => void;
  isPending: boolean;
}

/**
 * Crediting a customer's wallet, asked the way every other money action in
 * the app is asked.
 *
 * This was its own hand-rolled dialog and it showed: "Confirm Transaction
 * Approval" over "You are about to approve the following wallet
 * transaction. Please review the details carefully before confirming" —
 * two sentences that say nothing the title had not — then the facts, then
 * a paragraph of shouting orange, then the app's only green button. Four
 * different registers in one 400px box, and the one line that actually
 * mattered (if the amount on the slip differs, reject it) was buried in
 * the orange.
 *
 * Now it is the shared ConfirmModal: same shape, same tone and same
 * button as Pay now, Precharge, Approve withdrawal and the rest, so a
 * desk learns one confirmation instead of six. The warning is the lead
 * sentence, because it is the point. The facts are facts.
 */
export default function WalletTransactionApproveDialog({
  open,
  onOpenChange,
  topup,
  onConfirm,
  isPending,
}: WalletTransactionApproveDialogProps) {
  const requestedAmount = Number(topup.amount ?? 0);
  const symbol =
    CURRENCY_SYMBOLS[topup.currency as keyof typeof CURRENCY_SYMBOLS] ?? "";
  const advertiserCode = topup.advertiser?.tenant_client_code ?? "—";
  const advertiserName = topup.advertiser?.profile?.full_name ?? "";

  return (
    <ConfirmModal
      open={open}
      onOpenChange={onOpenChange}
      title="Credit this wallet?"
      lead="Check the amount against the slip first. This credits exactly the figure below — if the bank shows something else, reject it and ask them to send it again."
      cta={`Yes, credit ${symbol}${requestedAmount.toFixed(2)}`}
      busy={isPending}
      busyLabel="Crediting…"
      disabled={requestedAmount <= 0}
      onConfirm={onConfirm}
    >
      <ConfirmFact
        label="Customer"
        value={
          advertiserName ? `${advertiserCode} · ${advertiserName}` : advertiserCode
        }
      />
      <ConfirmFact
        label="Amount"
        value={`${symbol}${requestedAmount.toFixed(2)}`}
        strong
      />
      <ConfirmFact label="Reference" value={topup.reference_no ?? "—"} />
      <ConfirmFact
        label="Filed"
        value={new Date(topup.created_at).toLocaleDateString()}
      />
    </ConfirmModal>
  );
}
