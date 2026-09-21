"use client";

import CreateAdAccountFromRequestDialog from "@/components/ad-account-requests/create-ad-account-from-request-dialog";
import { Separator } from "@/components/ui/separator";
import { CheckCheck, Loader2, Settings2, Trash2 } from "lucide-react";
import NotificationPreferencesDialog from "@/components/notifications/notification-preferences-dialog";
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
  parseNotificationPayload,
} from "@/components/notifications/notification-utils";
import NotificationActionStatusDialog from "@/components/notifications/notification-action-status-dialog";
import ConfirmModal from "@/components/ui/confirm-modal";
import { SwipeToArchive } from "@/components/notifications/swipe-to-archive";
import { getNotificationCopy } from "@/components/notifications/notification-utils";
import { NOTIFICATIONS_CSS } from "@/components/notifications/notifications-css";

export default function NotificationsPage() {
  const router = useRouter();
  const { profile } = useAppContext();
  const [view, setView] = useState<"active" | "archived">("active");
  const {
    notifications,
    isLoading,
    isError,
    unreadCount,
    // A failed COUNT is not "nothing is unread". Both SPA shells already
    // read this flag; this page, which is the full list, did not -- so
    // "Mark all read" simply vanished over a visibly unread list.
    countError,
    markAsRead,
    markAllAsRead,
    deleteRead,
    setArchived,
    canArchive,
  } = useNotifications(view);
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
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [cleanupOpen, setCleanupOpen] = useState(false);

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

    // ── THE APPLICATION THAT COULD BE FILED AND NEVER ANSWERED ───────
    //
    // Walked on production. This notification says "Set their commission
    // and approve or refuse it" — and it was not in this handler, so it
    // fell through to the read-only sheet at the bottom, whose only
    // control is Close. /affiliates (Referral Links) has a search box and
    // nothing else. There was no approve and no refuse anywhere in the
    // app: the customer could file an application that could never be
    // answered.
    //
    // The terms live behind the Commission button on the advertiser's own
    // row, and /users takes ?q=. So this lands the owner on that row.
    if (notification.type === "affiliate_application") {
      const p = parseNotificationPayload(notification) as {
        client_code?: string | null;
      };
      const code = typeof p.client_code === "string" ? p.client_code.trim() : "";
      router.push(code ? `/users?q=${encodeURIComponent(code)}` : "/users");
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

  const handleWalletTopupApprove = () => {
    if (!walletTopupToApprove || !profile?.id) {
      toast.error("Unable to approve transaction right now.");
      return;
    }

    updateTransaction(
      { action: "approve" },
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
    <div className="space-y-6 px-4 py-6 sm:space-y-10 sm:px-10 sm:py-10">
      {/* THREE buttons and a two-line heading did not fit a phone: the
          heading wrapped, the actions were squeezed, and "Mark all read"
          came out as "Mar". The text column may shrink, the actions keep
          their size and wrap to their own line, and below sm each button is
          its icon with its words held in the title. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-2xl font-semibold tracking-tight">
            Notifications
          </h2>
          <p className="text-sm text-muted-foreground">
            Your latest alerts and updates.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isResolvingAction && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPreferencesOpen(true)}
            aria-label="Preferences"
            title="Choose which notifications ping your device"
          >
            <Settings2 className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Preferences</span>
          </Button>
          {(unreadCount > 0 || countError) && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleMarkAllAsRead}
              disabled={markAllAsRead.isPending}
              aria-label="Mark all read"
              title="Mark all read"
            >
              {markAllAsRead.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin mr-2" />
              ) : (
                <CheckCheck className="h-4 w-4 sm:mr-2" />
              )}
              <span className="hidden sm:inline">Mark all read</span>
            </Button>
          )}
          {/* ASK FIRST. This is a permanent delete sitting immediately
              beside the benign "Mark all read", and below sm it renders
              as the icon alone — so the only statement of what it does
              lived in a title attribute, which a phone never shows.
              Several of these rows are the customer's only record that a
              top-up was verified. It is not recoverable. */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCleanupOpen(true)}
            disabled={deleteRead.isPending}
            aria-label="Clean up"
            title="Delete notifications older than 30 days that you've already read"
          >
            {deleteRead.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin mr-2" />
            ) : (
              <Trash2 className="h-4 w-4 sm:mr-2" />
            )}
            <span className="hidden sm:inline">Clean up</span>
          </Button>
        </div>
      </div>

      <Separator />

      <style>{NOTIFICATIONS_CSS}</style>

      {/* ── THE LIST, AND WHAT YOU HAVE PUT ASIDE ──────────────────
          Only once a read has come back with archived_at in it. Before
          the migration is pasted there is no archive, and offering a tab
          that cannot work is worse than not offering one. */}
      {canArchive ? (
        <div className="nfview" role="group" aria-label="Which notifications">
          <button
            type="button"
            className={view === "active" ? "on" : ""}
            aria-pressed={view === "active"}
            onClick={() => setView("active")}
          >
            Inbox
          </button>
          <button
            type="button"
            className={view === "archived" ? "on" : ""}
            aria-pressed={view === "archived"}
            onClick={() => setView("archived")}
          >
            Archive
          </button>
        </div>
      ) : null}

      <div className="grid border rounded-lg overflow-hidden bg-card">
        {notifications.map((notification) => {
          const row = (
            <div
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
          );
          if (!canArchive) {
            return <div key={notification.id}>{row}</div>;
          }
          return (
            <SwipeToArchive
              key={notification.id}
              archived={view === "archived"}
              label={getNotificationCopy(notification).title}
              // mutateAsync, so the row only stays off screen while the
              // write is in flight and slides back if it is refused.
              onArchive={() =>
                setArchived.mutateAsync({
                  id: notification.id,
                  archived: view !== "archived",
                })
              }
            >
              {row}
            </SwipeToArchive>
          );
        })}

        {/* A failed read is not an empty inbox. These carry "your
            top-up was rejected", so "No notifications found" on a broken
            query is the one sentence that must not appear. */}
        {isError ? (
          <div className="py-20 text-center">
            <p className="text-sm font-medium text-destructive">
              We couldn&apos;t load your notifications — this is NOT an empty
              list.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => window.location.reload()}
            >
              Reload
            </Button>
          </div>
        ) : (
          notifications.length === 0 && (
            <div className="text-center py-20 text-muted-foreground italic">
              No notifications found.
            </div>
          )
        )}
      </div>

      <NotificationPreferencesDialog
        open={preferencesOpen}
        onOpenChange={setPreferencesOpen}
      />

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

      <ConfirmModal
        open={cleanupOpen}
        onOpenChange={(next) => !next && setCleanupOpen(false)}
        title="Delete your old read notifications?"
        lead="Everything you have already read and that is older than 30 days is removed permanently. Some of these are the only record you have that a top-up was verified — this cannot be undone."
        cta="Yes, delete them"
        busy={deleteRead.isPending}
        busyLabel="Deleting…"
        onConfirm={() => {
          setCleanupOpen(false);
          deleteRead.mutate(undefined, {
            // The count, not a claim. This said "cleaned" over a delete
            // that RLS silently matched no rows for, every single time.
            onSuccess: (gone) =>
              gone > 0
                ? toast.success(
                    `${gone} old read notification${gone === 1 ? "" : "s"} deleted`,
                  )
                : toast.success("Nothing older than 30 days to clear"),
            onError: (err) =>
              toast.error("Cleanup failed", { description: err.message }),
          });
        }}
      />
    </div>
  );
}
