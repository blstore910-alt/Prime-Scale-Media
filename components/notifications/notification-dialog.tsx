import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { Notification } from "@/lib/types/notification";
import { Topup } from "@/lib/types/topup";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { AlertCircle, Bell, CheckCircle2, Loader2 } from "lucide-react";
import { getNotificationCopy } from "./notification-utils";
import {
  getTopupIdFromNotification,
  parseNotificationPayload,
} from "./notification-utils";

interface NotificationDialogProps {
  notification: Notification | null;
  open: boolean;
  onCreateOpen: (open: boolean) => void;
}

export default function NotificationDialog({
  notification,
  open,
  onCreateOpen,
}: NotificationDialogProps) {
  const supabase = createClient();
  const payload = parseNotificationPayload(notification);
  const topupId = getTopupIdFromNotification(notification);

  const shouldFetchTopup =
    notification?.type === "topup_completed" && !!topupId && open;

  const {
    data: topup,
    isLoading,
    isError,
    error,
  } = useQuery<Topup | null>({
    queryKey: ["notification-topup-details", topupId],
    enabled: shouldFetchTopup,
    queryFn: async () => {
      if (!topupId) return null;

      const { data, error } = await supabase
        .from("top_ups")
        // NOT "*". The render deliberately stopped showing `source`
        // because nothing stops that column carrying a supplier
        // identifier — but the column was still in the response body,
        // and this dialog opens for any advertiser from a
        // topup_completed notification. Not rendering is not the same
        // as not sending.
        .select(
          "id, number, status, currency, topup_currency, topup_amount, fee_amount, amount_received, created_at",
        )
        .eq("id", topupId)
        .maybeSingle();

      if (error) throw error;
      return (data as Topup | null) ?? null;
    },
  });

  if (!notification) return null;

  const toNumber = (value: unknown): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const currency = (topup?.currency || payload.currency || "USD") as string;
  const status = String(topup?.status || payload.status || "completed");
  const topupNumber =
    topup?.number !== undefined && topup?.number !== null
      ? String(topup.number).padStart(6, "0")
      : String(payload.topup_number || "-");
  const topupCurrency = String(
    topup?.topup_currency || payload.topup_currency || topup?.currency || "-",
  );
  // ── TWO CURRENCIES ON ONE RECEIPT, AND THEY ARE NOT THE SAME ────────
  //
  // topup_amount and fee_amount are ALWAYS USD — an ad-account balance is
  // dollars, so calculateTopupAmount converts first and takes the fee off
  // there. `currency` is what the customer physically transferred. This
  // formatted all three with `currency`, so a EUR 1,000 top-up at 5% and
  // a rate of 0.86 told the customer:
  //
  //     Amount EUR 1,104.65 · Fee EUR 58.14 · Total Received EUR 1,000.00
  //
  // i.e. they paid EUR 1,000 and received EUR 1,104.65. The truth is
  // EUR 950 credited and EUR 50 of fee: about 16% out, in our favour, on
  // the customer's own receipt. The same fault was found and fixed in
  // verify-topup-dialog.tsx and psm-verify-ad-topups.tsx; this screen was
  // missed, and it is the one the CUSTOMER reads.
  const USD = "USD";
  const topupAmountUsd = toNumber(topup?.topup_amount ?? payload.topup_amount);
  const feeAmountUsd = toNumber(topup?.fee_amount ?? payload.fee_amount);
  // What they actually transferred, in the currency they transferred it
  // in. The old fallback to topup_amount was a dollar figure wearing a
  // euro sign, which is the same fault one layer down.
  const amountReceivedRaw =
    topup?.amount_received ?? payload.amount_received ?? null;
  const amountReceived = toNumber(amountReceivedRaw);
  const amountReceivedKnown =
    amountReceivedRaw !== null && amountReceivedRaw !== undefined;
  const money = (v: number, cur: string) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: cur }).format(
      v,
    );

  // ── THIS DIALOG ONLY KNOWS HOW TO SHOW A TOP-UP ─────────────────────
  //
  // The notifications page falls through to it for ANY type it has no
  // special case for — and for a non-top-up it rendered a green success
  // tick, "Status: completed" in green (the default when the row carries
  // none) and "$0.00", because every figure it prints comes from a
  // top-up it never fetched. So a subscription-past-due notification
  // opened as a cheerful zero-dollar success. The page has no role guard
  // either, so a customer could reach it.
  //
  // Anything that is not a top-up now gets its own words, from the same
  // copy map the list itself uses.
  const isTopupNotification = notification?.type === "topup_completed";
  const copy = getNotificationCopy(notification);

  return (
    <Dialog open={open} onOpenChange={onCreateOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          {isTopupNotification ? (
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 mb-4">
              <CheckCircle2 className="h-6 w-6 text-green-600" />
            </div>
          ) : (
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-4">
              <Bell className="h-6 w-6 text-muted-foreground" />
            </div>
          )}
          <DialogTitle className="text-center text-xl">
            {isTopupNotification ? "Top-up Successful" : copy.title}
          </DialogTitle>
          <DialogDescription className="text-center">
            {format(new Date(notification.created_at), "PPP p")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {isLoading && shouldFetchTopup && (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {isError && shouldFetchTopup && (
            <div className="flex items-center gap-2 text-destructive p-4 bg-destructive/10 rounded-md">
              <AlertCircle className="h-4 w-4" />
              <span>{(error as Error)?.message ?? "Failed to load top-up."}</span>
            </div>
          )}

          {!isTopupNotification && (
            <p className="text-center text-sm text-muted-foreground px-2">
              {copy.description}
            </p>
          )}

          {isTopupNotification && (
          <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-4 space-y-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Status</span>
              <span className="font-medium capitalize text-green-600">
                {status}
              </span>
            </div>

            <div className="border-t my-2" />

            <div className="space-y-2">
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Top-up ID</span>
                <span className="font-mono text-xs">{topupNumber}</span>
              </div>
              {/* SOURCE removed. top_ups.source is provenance — how the
                  top-up got into the system — and this dialog is shown to
                  ADVERTISERS on /notifications. A customer has no use for it
                  and nothing stops that column carrying a supplier
                  identifier, which must never be visible to a customer under
                  any name. The field is still on the row for admins, who
                  read it on their own screens. */}
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Currency</span>
                <span className="font-medium">{topupCurrency}</span>
              </div>
              {/* Read top to bottom the way the money moved: what they
                  sent, what we took, what landed. "Amount / Fee / Total
                  Received" put the largest figure last and called the
                  smallest one the total. */}
              {amountReceivedKnown && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">You transferred</span>
                  <span className="font-medium">
                    {money(amountReceived, currency)}
                  </span>
                </div>
              )}
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Top-up fee</span>
                <span className="font-medium">
                  {money(feeAmountUsd, USD)}
                </span>
              </div>

              <div className="border-t my-2" />

              <div className="flex justify-between items-center text-base font-semibold">
                <span>Landed on the account</span>
                <span>{money(topupAmountUsd, USD)}</span>
              </div>
              {currency.toUpperCase() !== USD && (
                <p className="text-xs text-muted-foreground">
                  Ad accounts are funded in US dollars, so the fee and the
                  amount that landed are shown in dollars. You transferred{" "}
                  {currency.toUpperCase()}.
                </p>
              )}
            </div>
          </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
