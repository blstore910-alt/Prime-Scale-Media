"use client";

import ConfirmModal, { ConfirmFact } from "@/components/ui/confirm-modal";
import { CURRENCY_SYMBOLS } from "@/lib/constants";
import { WalletTopupWithAdvertiser } from "@/lib/types/wallet-topup";
import { useMatchedDeposits } from "@/hooks/use-matched-deposits";
import { useOutstandingPrecharges } from "@/hooks/use-outstanding-precharges";
import { formatPaymentReference } from "@/lib/payment-reference";
import { currencySymbol } from "@/lib/pure-invoice-currency";

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
  // IT LOOKS THIS UP ITSELF. These three arrived as props, and this dialog
  // is opened from three places — the verify queue, the notifications
  // popover and the notifications page. Only the first one passed them, so
  // from the other two the dialog stated "No bank deposit has been matched
  // to this yet" whether or not one had, immediately above the button that
  // credits real money. A fact this dialog asserts should not depend on
  // which screen opened it.
  const {
    byTopup,
    isError: depositsUnreadable,
    isLoading: depositsLoading,
  } = useMatchedDeposits([topup.id]);
  const deposit = byTopup[topup.id];
  // ── AND WHETHER IT HAS ALREADY BEEN ADVANCED ──────────────────────
  //
  // An advance credits the wallet BEFORE the payment clears, and
  // verifying settles it: +amount then -amount. Net movement, zero. This
  // dialog said "this credits exactly the figure below" and the button
  // said "Yes, credit EUR 1,000" either way — so an admin pressed it,
  // saw the balance not move, concluded it had failed and reached for a
  // manual adjustment. The customer ends up EUR 1,000 ahead on a EUR
  // 1,000 payment. The admin manual states the opposite in as many
  // words.
  const {
    precharges,
    isError: prechargeUnreadable,
    isLoading: prechargeLoading,
  } = useOutstandingPrecharges([topup.id]);
  const advance = precharges[topup.id];
  const requestedAmount = Number(topup.amount ?? 0);
  // ── NEVER AN EMPTY SYMBOL ON THE BUTTON THAT MOVES MONEY ────────
  //
  // `?? ""` meant a lowercase or null currency rendered "Yes, credit
  // 1000.00" with no currency at all, on the confirmation for a wallet
  // credit. Upper-cased first, and the code itself as the fallback, so
  // an unknown currency reads "Yes, credit XAF 1000.00" rather than
  // saying nothing.
  const curCode = String(topup.currency ?? "").toUpperCase();
  const symbol =
    CURRENCY_SYMBOLS[curCode as keyof typeof CURRENCY_SYMBOLS] ??
    (curCode ? `${curCode} ` : "");
  const advertiserCode = topup.advertiser?.tenant_client_code ?? "—";
  const advertiserName = topup.advertiser?.profile?.full_name ?? "";

  return (
    <ConfirmModal
      open={open}
      onOpenChange={onOpenChange}
      title="Credit this wallet?"
      /* The lead now leads with what we KNOW. "Check the amount against
         the slip" was the right instruction when the screen had nothing but
         the customer's claim on it; when a matching bank deposit exists, an
         admin should be told that first, and when one does NOT, that is the
         warning — not a generic reminder shown identically either way. */
      lead={
        advance
          ? "This top-up was already advanced to the wallet. Verifying settles that advance, so the balance will NOT go up again — it is already there. Do not top it up by hand afterwards."
          : prechargeUnreadable
            ? "We could not check whether this top-up was already advanced, so the balance may not move when you credit it. Check the advances screen first."
          : deposit
          ? "A bank deposit matching this claim has arrived. Check the figure below against it, then credit."
          : depositsUnreadable
            ? "We could not read the bank feed, so nothing here confirms the money arrived. Check the slip before you credit."
            : depositsLoading
              ? "Still checking the bank feed for a matching deposit. Check the slip before you credit."
              : "No bank deposit has been matched to this yet — so far this is only the customer's word. Check the slip first; this credits exactly the figure below."
      }
      cta={
        advance
          ? "Yes, settle the advance"
          : `Yes, credit ${symbol}${requestedAmount.toFixed(2)}`
      }
      busy={isPending}
      busyLabel="Crediting…"
      disabled={requestedAmount <= 0 || prechargeLoading}
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
      {advance && (
        <ConfirmFact
          label="Already advanced"
          value={`${symbol}${advance.outstanding.toFixed(2)} — settles now`}
        />
      )}
      {advance && (
        <ConfirmFact label="Wallet changes by" value={`${symbol}0.00`} strong />
      )}
      <ConfirmFact
        label="Reference"
        value={
          formatPaymentReference(
            topup.advertiser?.tenant_client_code,
            topup.reference_no,
          ) || "—"
        }
      />
      <ConfirmFact
        label="Filed"
        value={new Date(topup.created_at).toLocaleDateString()}
      />
      {/* The fact that decides it. */}
      <ConfirmFact
        label="Bank deposit"
        value={
          deposit
            ? `${currencySymbol(deposit.currency)}${(
                deposit.amountCents / 100
              ).toFixed(2)}${deposit.senderName ? " from " + deposit.senderName : ""}`
            : depositsUnreadable
              ? "could not be checked"
              : depositsLoading
                ? "still checking…"
                : "none matched yet"
        }
        strong={!!deposit}
      />
    </ConfirmModal>
  );
}
