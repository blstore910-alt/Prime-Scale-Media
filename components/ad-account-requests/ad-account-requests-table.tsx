"use client";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import TablePagination from "@/components/ui/table-pagination";
import { DATE_TIME_FORMAT } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import dayjs from "dayjs";
import { Eye } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useMediaQuery } from "usehooks-ts";
import AdAccountRequestCard from "./ad-account-request-card";
import AdAccountRequestReviewDialog from "./ad-account-request-review-dialog";
import AdAccountRequestRejectDialog from "./ad-account-request-reject-dialog";
import CreateAdAccountFromRequestDialog from "./create-ad-account-from-request-dialog";
import CreateAdAccountRequestInvoiceDialog from "./create-ad-account-request-invoice-dialog";
import useAdAccountRequests from "./use-ad-account-requests";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { AdAccountRequest } from "@/lib/types/ad-account-request";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

function getStatusClassName(status: string | null) {
  if (!status) return "border-slate-300 text-slate-700";

  switch (status.toLowerCase()) {
    case "approved":
    case "completed":
      return " bg-green-600";
    case "rejected":
    case "failed":
      return "bg-red-600";
    case "pending":
    default:
      return "bg-amber-600 ";
  }
}

export default function AdAccountRequestsTable() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const isTabletScreen = useMediaQuery("(min-width: 768px)");
  const queryClient = useQueryClient();

  const initialSort = searchParams?.get("sort") ?? "newest";
  const initialQ = searchParams?.get("q") ?? "";
  const initialPage = parseInt(searchParams?.get("page") ?? "1", 10) || 1;
  const initialPerPage =
    parseInt(searchParams?.get("perPage") ?? "10", 10) || 10;

  const [sort, setSort] = useState(initialSort);
  const [search, setSearch] = useState(initialQ);
  const [debouncedSearch, setDebouncedSearch] = useState(initialQ);
  const [page, setPage] = useState<number>(initialPage);
  const [perPage] = useState<number>(initialPerPage);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(
    null,
  );
  const [requestForAccountCreation, setRequestForAccountCreation] =
    useState<AdAccountRequest | null>(null);
  const [requestForInvoiceCreation, setRequestForInvoiceCreation] =
    useState<AdAccountRequest | null>(null);
  const [requestToReject, setRequestToReject] =
    useState<AdAccountRequest | null>(null);
  const [isRejecting, setIsRejecting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const params = new URLSearchParams(Array.from(searchParams ?? []));

    if (sort && sort !== "newest") params.set("sort", sort);
    else params.delete("sort");

    if (debouncedSearch && debouncedSearch.trim() !== "")
      params.set("q", debouncedSearch.trim());
    else params.delete("q");

    if (page && page > 1) params.set("page", String(page));
    else params.delete("page");

    if (perPage && perPage !== 10) params.set("perPage", String(perPage));
    else params.delete("perPage");

    const qs = params.toString();
    const url = qs ? `${pathname}?${qs}` : pathname;
    router.replace(url);
  }, [sort, debouncedSearch, page, perPage, pathname, router, searchParams]);

  const { requests, total, isLoading, isError, error, refetch } =
    useAdAccountRequests({
      search: debouncedSearch,
      sort,
      page,
      perPage,
    });

  const handleRejectRequest = async (reason: string) => {
    if (!requestToReject) return;

    setIsRejecting(true);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase
        .from("ad_account_requests")
        .update({
          status: "rejected",
          rejection_reason: reason,
        })
        .eq("id", requestToReject.id);

      if (updateError) throw updateError;

      toast.success("Ad account request rejected.");
      await queryClient.invalidateQueries({
        queryKey: ["ad-account-request-details", requestToReject.id],
      });
      setRequestToReject(null);
      await refetch();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to reject request.";
      toast.error("Unable to reject request", { description: message });
    } finally {
      setIsRejecting(false);
    }
  };

  const columnCount = 9;

  return (
    <>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-end">
        <div className="flex gap-2 items-center self-end w-full md:w-auto">
          <Input
            placeholder="Search by email..."
            value={search}
            className="h-8 flex-1 md:min-w-[280px]"
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />

          <Select
            value={sort}
            onValueChange={(value) => {
              setSort(value ?? "newest");
              setPage(1);
            }}
          >
            <SelectTrigger size="sm" className="w-[170px]">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="oldest">Oldest</SelectItem>
              <SelectItem value="email-asc">Email A - Z</SelectItem>
              <SelectItem value="email-desc">Email Z - A</SelectItem>
              <SelectItem value="status-asc">Status A - Z</SelectItem>
              <SelectItem value="status-desc">Status Z - A</SelectItem>
              <SelectItem value="platform-asc">Platform A - Z</SelectItem>
              <SelectItem value="platform-desc">Platform Z - A</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isTabletScreen ? (
        <div className="rounded-md border overflow-x-auto relative mt-4">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-muted">
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Client Code</TableHead>
                <TableHead>Advertiser Name</TableHead>
                <TableHead>Platform</TableHead>
                <TableHead>Currency</TableHead>
                <TableHead>Timezone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Requested At</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, idx) => (
                  <TableRow key={idx} className="animate-pulse">
                    {Array.from({ length: columnCount }).map((_, cellIdx) => (
                      <LoaderCell key={cellIdx} />
                    ))}
                  </TableRow>
                ))
              ) : isError ? (
                <TableRow>
                  <TableCell
                    colSpan={columnCount}
                    className="text-center text-destructive py-8"
                  >
                    <div role="alert" aria-live="assertive">
                      <p className="font-medium">
                        Failed to load ad account requests.
                      </p>
                      <p className="mt-2 text-sm">
                        {(error as Error)?.message ?? String(error)}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : requests.length ? (
                requests.map((request) => (
                  <TableRow key={request.id}>
                    <TableCell className="max-w-[260px] break-all">
                      {request.email || "-"}
                    </TableCell>
                    <TableCell>
                      {request.advertiser?.tenant_client_code || "-"}
                    </TableCell>
                    <TableCell>
                      {request.advertiser?.profile?.full_name || "-"}
                    </TableCell>
                    <TableCell>{request.platform || "-"}</TableCell>
                    <TableCell className="uppercase">
                      {request.currency || "-"}
                    </TableCell>
                    <TableCell>{request.timezone || "-"}</TableCell>
                    <TableCell>
                      <Badge
                        className={`capitalize text-white ${getStatusClassName(request.status)}`}
                      >
                        {request.status?.split("_").join(" ") || "N/A"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {request.created_at
                        ? dayjs(request.created_at).format(DATE_TIME_FORMAT)
                        : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedRequestId(request.id)}
                        >
                          <Eye className="mr-2 h-4 w-4" />
                          Review
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columnCount}
                    className="text-center py-6 text-sm text-muted-foreground"
                  >
                    No ad account requests found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="mt-4">
          {!isLoading && !isError && requests.length ? (
            <div className="grid gap-4">
              {requests.map((request) => (
                <AdAccountRequestCard
                  key={request.id}
                  request={request}
                  onReview={setSelectedRequestId}
                />
              ))}
            </div>
          ) : isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className="h-24 w-full bg-muted rounded-md animate-pulse"
                />
              ))}
            </div>
          ) : isError ? (
            <div className="mt-4 flex items-center gap-2 text-destructive">
              <span>{(error as Error)?.message ?? "Failed to load"}</span>
            </div>
          ) : (
            <div className="mt-4 text-center py-6 text-sm text-muted-foreground">
              No ad account requests found.
            </div>
          )}
        </div>
      )}

      {!isLoading && !isError && total > perPage ? (
        <div className="my-4 px-4">
          <TablePagination
            page={page}
            total={total}
            perPage={perPage}
            onPageChange={(p) => setPage(p)}
          />
        </div>
      ) : null}

      <AdAccountRequestReviewDialog
        requestId={selectedRequestId}
        open={selectedRequestId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedRequestId(null);
        }}
        onCreateInvoice={setRequestForInvoiceCreation}
        onCreateAdAccount={setRequestForAccountCreation}
        onReject={setRequestToReject}
      />
      <CreateAdAccountRequestInvoiceDialog
        request={requestForInvoiceCreation}
        open={requestForInvoiceCreation !== null}
        onOpenChange={(open) => {
          if (!open) setRequestForInvoiceCreation(null);
        }}
      />
      <CreateAdAccountFromRequestDialog
        request={requestForAccountCreation}
        open={requestForAccountCreation !== null}
        onOpenChange={(open) => {
          if (!open) setRequestForAccountCreation(null);
        }}
      />
      <AdAccountRequestRejectDialog
        open={requestToReject !== null}
        onOpenChange={(open) => {
          if (!open) setRequestToReject(null);
        }}
        isSubmitting={isRejecting}
        onSubmit={handleRejectRequest}
      />
    </>
  );
}

function LoaderCell() {
  return (
    <TableCell>
      <div className="h-4 bg-muted rounded w-8" />
    </TableCell>
  );
}
