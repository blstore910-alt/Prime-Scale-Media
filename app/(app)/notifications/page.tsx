"use client";

import CreateAdAccountFromRequestDialog from "@/components/ad-account-requests/create-ad-account-from-request-dialog";
import { Separator } from "@/components/ui/separator";
import { CheckCheck, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import useNotifications from "@/components/notifications/use-notifications";
import NotificationItem from "@/components/notifications/notification-item";
import { Notification } from "@/lib/types/notification";
import { useState } from "react";
import NotificationDialog from "@/components/notifications/notification-dialog";
import { Button } from "@/components/ui/button";
import VerifyTopupDialog from "@/components/topups/verify-topup-dialog";
import WalletTransactionApproveDialog from "@/components/wallet-transactions/wallet-transaction-approve-dialog";
import { useAppContext } from "@/context/app-provider";
import { useUpdateTransaction } from "@/hooks/use-update-transaction";
import { createClient } from "@/lib/supabase/client";
import { AdAccountRequest } from "@/lib/types/ad-account-request";
import { WalletTopupWithAdvertiser } from "@/lib/types/wallet-topup";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  getAdAccountRequestIdFromNotification,
  getTopupIdFromNotification,
  getWalletTopupIdFromNotification,
} from "@/components/notifications/notification-utils";
import NotificationActionStatusDialog from "@/components/notifications/notification-action-status-dialog";

export default function NotificationsPage() {
  const router = useRouter();
  const { profile } = useAppContext();
  const { notifications, isLoading, unreadCount, markAsRead, markAllAsRead } =
    useNotifications();
  const [selectedNotification, setSelectedNotification] =
    useState<Notification | null>(null);
  const [topupCompletedDialogOpen, setTopupCompletedDialogOpen] =
    useState(false);
  const [verifyTopupId, setVerifyTopupId] = useState<string | null>(null);
  const [isCreateAdAccountDialogOpen, setIsCreateAdAccountDialogOpen] =
    useState(false);
  const [requestToProcess, setRequestToProcess] =
    useState<AdAccountRequest | null>(null);
  const [walletTopupToApprove, setWalletTopupToApprove] =
    useState<WalletTopupWithAdvertiser | null>(null);
  const [actionStatusDialog, setActionStatusDialog] = useState<{
    title: string;
    description: string;
  } | null>(null);
  const [isResolvingAction, setIsResolvingAction] = useState(false);

  const { mutate: updateTransaction, isPending: isApprovingWalletTopup } =
    useUpdateTransaction(walletTopupToApprove ?? ({} as WalletTopupWithAdvertiser));

  const closeActionDialogs = () => {
    setTopupCompletedDialogOpen(false);
    setVerifyTopupId(null);
    setIsCreateAdAccountDialogOpen(false);
    setRequestToProcess(null);
    setWalletTopupToApprove(null);
    setActionStatusDialog(null);
  };

  const fetchTopupStatus = async (topupId: string) => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("top_ups")
      .select("id, status")
      .eq("id", topupId)
      .maybeSingle();

    if (error) throw error;
    return (data as { id: string; status: string | null } | null) ?? null;
  };

  const fetchAdAccountRequest = async (requestId: string) => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("ad_account_requests")
      .select(
        "*, advertiser:advertisers(id, tenant_client_code, profile:user_profiles(full_name, email))",
      )
      .eq("id", requestId)
      .maybeSingle();

    if (error) throw error;
    return (data as AdAccountRequest | null) ?? null;
  };

  const fetchWalletTopup = async (topupId: string) => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("wallet_topups")
      .select(
        "*, advertiser:advertisers(tenant_client_code, profile:user_profiles(full_name, email))",
      )
      .eq("id", topupId)
      .maybeSingle();

    if (error) throw error;
    return (data as WalletTopupWithAdvertiser | null) ?? null;
  };

  const handleNotificationClick = async (notification: Notification) => {
    closeActionDialogs();

    if (!notification.is_read) {
      markAsRead.mutate(notification.id);
    }

    if (notification.type === "user_profile_created") {
      router.push("/users");
      return;
    }

    if (notification.type === "topup_completed") {
      setSelectedNotification(notification);
      setTopupCompletedDialogOpen(true);
      return;
    }

    if (notification.type === "topup_created") {
      const topupId = getTopupIdFromNotification(notification);
      if (!topupId) {
        toast.error("Top-up ID is missing in this notification.");
        return;
      }

      setIsResolvingAction(true);
      try {
        const topup = await fetchTopupStatus(topupId);
        if (!topup) {
          toast.error("Top-up request not found.");
          return;
        }

        if ((topup.status || "").toLowerCase() === "completed") {
          setActionStatusDialog({
            title: "Top-up Already Verified",
            description:
              "This top-up is already completed. No further action is required.",
          });
          return;
        }

        setVerifyTopupId(topupId);
      } catch (error) {
        toast.error((error as Error)?.message || "Failed to load top-up.");
      } finally {
        setIsResolvingAction(false);
      }

      return;
    }

    if (notification.type === "ad_account_request_created") {
      const requestId = getAdAccountRequestIdFromNotification(notification);
      if (!requestId) {
        toast.error("Ad account request ID is missing in this notification.");
        return;
      }

      setIsResolvingAction(true);
      try {
        const request = await fetchAdAccountRequest(requestId);
        if (!request) {
          toast.error("Ad account request not found.");
          return;
        }

        if ((request.status || "").toLowerCase() === "completed") {
          setActionStatusDialog({
            title: "Request Already Completed",
            description:
              "This ad account request is already completed. No further action is required.",
          });
          return;
        }

        setRequestToProcess(request);
        setIsCreateAdAccountDialogOpen(true);
      } catch (error) {
        toast.error((error as Error)?.message || "Failed to load request.");
      } finally {
        setIsResolvingAction(false);
      }

      return;
    }

    if (notification.type === "wallet_topup_created") {
      const walletTopupId = getWalletTopupIdFromNotification(notification);
      if (!walletTopupId) {
        toast.error("Wallet top-up ID is missing in this notification.");
        return;
      }

      setIsResolvingAction(true);
      try {
        const walletTopup = await fetchWalletTopup(walletTopupId);
        if (!walletTopup) {
          toast.error("Wallet top-up request not found.");
          return;
        }

        if ((walletTopup.status || "").toLowerCase() === "completed") {
          setActionStatusDialog({
            title: "Transaction Already Approved",
            description:
              "This wallet top-up is already completed. No further action is required.",
          });
          return;
        }

        setWalletTopupToApprove(walletTopup);
      } catch (error) {
        toast.error((error as Error)?.message || "Failed to load wallet top-up.");
      } finally {
        setIsResolvingAction(false);
      }

      return;
    }

    setSelectedNotification(notification);
    setTopupCompletedDialogOpen(true);
  };

  const handleMarkAllAsRead = () => {
    markAllAsRead.mutate();
  };

  const handleWalletTopupApprove = (amount: number) => {
    if (!walletTopupToApprove || !profile?.id) {
      toast.error("Unable to approve transaction right now.");
      return;
    }

    updateTransaction(
      {
        action: "approve",
        data: {
          status: "completed",
          approved_by: profile.id,
          amount,
        },
        approverId: profile.id,
      },
      {
        onSuccess: () => {
          setWalletTopupToApprove(null);
        },
      },
    );
  };

  if (isLoading) {
    return (
      <div className="flex h-[400px] w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="py-10 px-6 sm:px-10 space-y-10">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            Notifications
          </h2>
          <p className="text-sm text-muted-foreground">
            View your latest alerts and updates.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isResolvingAction && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleMarkAllAsRead}
              disabled={markAllAsRead.isPending}
            >
              {markAllAsRead.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin mr-2" />
              ) : (
                <CheckCheck className="h-4 w-4 mr-2" />
              )}
              Mark all read
            </Button>
          )}
        </div>
      </div>

      <Separator />

      <div className="grid border rounded-lg overflow-hidden bg-card">
        {notifications.map((notification) => (
          <div
            key={notification.id}
            className={cn(
              "border-b last:border-0",
              !notification.is_read && "bg-muted/30",
            )}
          >
            <NotificationItem
              notification={notification}
              onClick={handleNotificationClick}
            />
          </div>
        ))}

        {notifications.length === 0 && (
          <div className="text-center py-20 text-muted-foreground italic">
            No notifications found.
          </div>
        )}
      </div>

      <NotificationDialog
        notification={selectedNotification}
        open={topupCompletedDialogOpen}
        onCreateOpen={(value) => {
          setTopupCompletedDialogOpen(value);
          if (!value) {
            setSelectedNotification(null);
          }
        }}
      />
      <NotificationActionStatusDialog
        open={!!actionStatusDialog}
        title={actionStatusDialog?.title || ""}
        description={actionStatusDialog?.description || ""}
        onOpenChange={(value) => {
          if (!value) {
            setActionStatusDialog(null);
          }
        }}
      />
      <VerifyTopupDialog
        topupId={verifyTopupId}
        open={!!verifyTopupId}
        setOpen={(value) => {
          if (!value) {
            setVerifyTopupId(null);
          }
        }}
      />
      <CreateAdAccountFromRequestDialog
        request={requestToProcess}
        open={isCreateAdAccountDialogOpen}
        onOpenChange={(value) => {
          setIsCreateAdAccountDialogOpen(value);
          if (!value) {
            setRequestToProcess(null);
          }
        }}
      />
      {walletTopupToApprove && (
        <WalletTransactionApproveDialog
          open={walletTopupToApprove !== null}
          onOpenChange={(value) => {
            if (!value) {
              setWalletTopupToApprove(null);
            }
          }}
          topup={walletTopupToApprove}
          onConfirm={handleWalletTopupApprove}
          isPending={isApprovingWalletTopup}
        />
      )}
    </div>
  );
}
