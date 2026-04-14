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
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
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
        .select("*")
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
  const source = String(topup?.source || payload.source || "-");
  const topupCurrency = String(
    topup?.topup_currency || payload.topup_currency || topup?.currency || "-",
  );
  const topupAmount = toNumber(topup?.topup_amount ?? payload.topup_amount);
  const feeAmount = toNumber(topup?.fee_amount ?? payload.fee_amount);
  const amountReceived = toNumber(
    topup?.amount_received ?? payload.amount_received ?? topup?.topup_amount,
  );

  return (
    <Dialog open={open} onOpenChange={onCreateOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 mb-4">
            <CheckCircle2 className="h-6 w-6 text-green-600" />
          </div>
          <DialogTitle className="text-center text-xl">
            {notification.type === "topup_completed"
              ? "Top-up Successful"
              : "Notification"}
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
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Source</span>
                <span className="font-medium capitalize">{source}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Currency</span>
                <span className="font-medium">{topupCurrency}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-medium">
                  {new Intl.NumberFormat("en-US", {
                    style: "currency",
                    currency,
                  }).format(topupAmount)}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Fee</span>
                <span className="font-medium">
                  {new Intl.NumberFormat("en-US", {
                    style: "currency",
                    currency,
                  }).format(feeAmount)}
                </span>
              </div>

              <div className="border-t my-2" />

              <div className="flex justify-between items-center text-base font-semibold">
                <span>Total Received</span>
                <span>
                  {new Intl.NumberFormat("en-US", {
                    style: "currency",
                    currency,
                  }).format(amountReceived)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
