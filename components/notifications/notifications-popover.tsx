"use client";

import CreateAdAccountFromRequestDialog from "@/components/ad-account-requests/create-ad-account-from-request-dialog";
import VerifyTopupDialog from "@/components/topups/verify-topup-dialog";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import WalletTransactionApproveDialog from "@/components/wallet-transactions/wallet-transaction-approve-dialog";
import { useAppContext } from "@/context/app-provider";
import { useUpdateTransaction } from "@/hooks/use-update-transaction";
import { createClient } from "@/lib/supabase/client";
import { AdAccountRequest } from "@/lib/types/ad-account-request";
import { Notification } from "@/lib/types/notification";
import { WalletTopupWithAdvertiser } from "@/lib/types/wallet-topup";
import { Bell, CheckCheck, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import NotificationActionStatusDialog from "./notification-action-status-dialog";
import NotificationDialog from "./notification-dialog";
import NotificationItem from "./notification-item";
import {
  getAdAccountRequestIdFromNotification,
  getTopupIdFromNotification,
  getWalletTopupIdFromNotification,
} from "./notification-utils";
import useNotifications from "./use-notifications";

export function NotificationsPopover() {
  const [open, setOpen] = useState(false);
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
  const router = useRouter();
  const { profile } = useAppContext();

  const { notifications, isLoading, unreadCount, markAsRead, markAllAsRead } =
    useNotifications();

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

    setOpen(false);

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

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="icon" className="relative">
            <Bell className="h-4 w-4 text-muted-foreground" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
              </span>
            )}
            <span className="sr-only">Notifications</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="end">
          <div className="flex items-center justify-between p-4 border-b">
            <h4 className="font-semibold leading-none">Notifications</h4>
            <div className="flex items-center gap-2">
              {isResolvingAction && (
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
              )}
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto px-2 text-xs text-muted-foreground hover:text-foreground"
                  onClick={handleMarkAllAsRead}
                  disabled={markAllAsRead.isPending}
                >
                  {markAllAsRead.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  ) : (
                    <CheckCheck className="h-3 w-3 mr-1" />
                  )}
                  Mark all read
                </Button>
              )}
            </div>
          </div>
          <ScrollArea className="h-[300px]">
            {isLoading ? (
              <div className="flex h-[300px] items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
                No notifications
              </div>
            ) : (
              <div className="grid">
                {notifications.map((notification) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    onClick={handleNotificationClick}
                  />
                ))}
              </div>
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>
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
    </>
  );
}
