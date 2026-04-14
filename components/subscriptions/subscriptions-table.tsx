"use client";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import TablePagination from "@/components/ui/table-pagination";
import { Plus } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import CreateSubscriptionDialog from "./create-subscription-dialog";
import { resolveStatusFromQuery } from "./subscription-utils";
import SubscriptionRow from "./subscription-row";
import SubscriptionsFilters from "./subscriptions-filters";
import { SubscriptionStatus } from "./types";
import useSubscriptions from "./use-subscriptions";
import useUpdateSubscriptionStatus from "./use-update-subscription-status";

const PER_PAGE = 20;

function parseInitialDate(value: string | null) {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : value;
}

export default function SubscriptionsTable() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [status, setStatus] = useState<SubscriptionStatus | "all">(
    resolveStatusFromQuery(searchParams?.get("status")),
  );
  const [date, setDate] = useState<string>(
    parseInitialDate(searchParams?.get("date")),
  );
  const [page, setPage] = useState<number>(
    Number.parseInt(searchParams?.get("page") ?? "1", 10) || 1,
  );
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  const handleStatusChange = (value: SubscriptionStatus | "all") => {
    setStatus(value);
    setPage(1);
  };

  const handleDateChange = (value: string) => {
    setDate(value);
    setPage(1);
  };

  useEffect(() => {
    const params = new URLSearchParams(Array.from(searchParams ?? []));

    if (status !== "all") {
      params.set("status", status);
    } else {
      params.delete("status");
    }

    if (date) {
      params.set("date", date);
    } else {
      params.delete("date");
    }

    if (page > 1) {
      params.set("page", String(page));
    } else {
      params.delete("page");
    }

    const queryString = params.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, date, page, pathname, router]);

  const { subscriptions, total, isLoading, isError, error } = useSubscriptions({
    status,
    date,
    page,
    perPage: PER_PAGE,
  });

  const {
    updateSubscriptionStatus,
    pendingSubscriptionId,
    isPending: isStatusUpdating,
  } = useUpdateSubscriptionStatus();

  const updateStatus = (
    subscriptionId: string,
    nextStatus: SubscriptionStatus,
    successMessage: string,
  ) => {
    updateSubscriptionStatus(
      {
        subscriptionId,
        status: nextStatus,
      },
      {
        onSuccess: () => {
          toast.success(successMessage);
        },
        onError: (updateError) => {
          toast.error("Failed to update subscription", {
            description: updateError.message,
          });
        },
      },
    );
  };

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <SubscriptionsFilters
            status={status}
            onStatusChange={handleStatusChange}
            date={date}
            onDateChange={handleDateChange}
            onClear={() => {
              setStatus("all");
              setDate("");
              setPage(1);
            }}
          />

          <div className="flex items-center justify-end">
            <Button size="sm" onClick={() => setIsCreateDialogOpen(true)}>
              <Plus />
              Create New Subscription
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-muted">
              <TableRow>
                <TableHead>Advertiser</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Start Date</TableHead>
                <TableHead>Next Payment On</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, index) => (
                  <TableRow key={`subscription-loader-${index}`}>
                    {Array.from({ length: 6 }).map((__, cellIndex) => (
                      <LoaderCell key={`subscription-loader-cell-${cellIndex}`} />
                    ))}
                  </TableRow>
                ))
              ) : isError ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-destructive">
                    <div role="alert" aria-live="assertive">
                      <p className="font-medium">Failed to load subscriptions.</p>
                      <p className="mt-2 text-sm">
                        {(error as Error)?.message ?? String(error)}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : subscriptions.length ? (
                subscriptions.map((subscription) => (
                  <SubscriptionRow
                    key={subscription.id}
                    subscription={subscription}
                    isPending={
                      isStatusUpdating &&
                      pendingSubscriptionId === subscription.id
                    }
                    onActivate={() =>
                      updateStatus(
                        subscription.id,
                        "active",
                        "Subscription activated successfully.",
                      )
                    }
                    onDisable={() =>
                      updateStatus(
                        subscription.id,
                        "inactive",
                        "Subscription disabled successfully.",
                      )
                    }
                    onPause={() =>
                      updateStatus(
                        subscription.id,
                        "paused",
                        "Subscription paused successfully.",
                      )
                    }
                    onUnpause={() =>
                      updateStatus(
                        subscription.id,
                        "active",
                        "Subscription resumed successfully.",
                      )
                    }
                  />
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    No subscriptions found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {total > PER_PAGE && (
          <div className="px-2">
            <TablePagination
              total={total}
              page={page}
              perPage={PER_PAGE}
              onPageChange={(nextPage) => setPage(nextPage)}
            />
          </div>
        )}
      </div>

      <CreateSubscriptionDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
      />
    </>
  );
}

function LoaderCell() {
  return (
    <TableCell>
      <div className="h-4 w-16 rounded bg-muted" />
    </TableCell>
  );
}
