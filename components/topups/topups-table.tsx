"use client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";
import { Topup } from "@/lib/types/topup";
import { IconCashRegister } from "@tabler/icons-react";
import { Parser } from "json2csv";
import { FileDown, Loader2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import TablePagination from "../ui/table-pagination";
import { AdminTopupDialog } from "./admin-topup-dialogs";
import AdvertiserTopupCard from "./advertiser-topup-card";
import RequestTopupDialog from "./request-topup-dialog";
import RejectTopupDialog from "./reject-topup-dialog";
import TopupCard from "./topup-card";
import { TopupDetailsSheet } from "./topup-details-sheet";

import { useMediaQuery } from "usehooks-ts";
import TopupRow from "./topup-row";
import TopupsFilters from "./topups-filters";
import useRecentTopups from "./use-recent-topups";
import useTopups from "./use-topups";
import VerifyTopupDialog from "./verify-topup-dialog";

export default function TopupsTable() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { profile } = useAppContext();
  const isAdmin = profile?.role === "admin";
  const isAdvertiser = profile?.role === "advertiser";
  const initialType = searchParams?.get("type") ?? "all";
  const initialSource = searchParams?.get("source") ?? "all";
  const initialStatus = searchParams?.get("status") ?? "all";
  const initialSort = searchParams?.get("sort") ?? "newest";
  const initialQ = searchParams?.get("q") ?? "";
  const initialPage = parseInt(searchParams?.get("page") ?? "1", 10) || 1;
  const initialPerPage =
    parseInt(searchParams?.get("perPage") ?? "50", 10) || 10;
  const [downloadingCSV, setDownloadingCSV] = useState(false);
  const [type, setType] = useState(initialType);
  const [source, setSource] = useState(initialSource);
  const [status, setStatus] = useState(initialStatus);
  const [sort, setSort] = useState(initialSort);
  const [search, setSearch] = useState(initialQ);
  const [debouncedSearch, setDebouncedSearch] = useState(initialQ);
  const [page, setPage] = useState<number>(initialPage);
  const [perPage] = useState<number>(initialPerPage);
  const [openTopupDialog, setOpenTopupDialog] = useState(false);
  const [topupType, setTopupType] = useState("");
  const isTabletScreen = useMediaQuery("(min-width: 768px)");
  const { data: recentTopups } = useRecentTopups();
  const rateLimitStatus = useMemo(() => {
    if (isAdmin || !recentTopups) return null;

    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;

    const topupsInLastMinute = recentTopups.filter((t) => {
      const topupTime = new Date(t.created_at).getTime();
      return topupTime > oneMinuteAgo;
    }).length;

    const hasExceededMinuteLimit = topupsInLastMinute >= 2;
    const hasExceededHourlyLimit = recentTopups.length >= 20;

    if (hasExceededMinuteLimit)
      return "You have reached the limit of 2 top-ups per minute.";
    if (hasExceededHourlyLimit)
      return "You have reached your limit of 20 top-ups per hour.";

    return null;
  }, [recentTopups, isAdmin]);

  useEffect(() => {
    const params = new URLSearchParams(Array.from(searchParams ?? []));
    if (type && type !== "all") params.set("type", type);
    else params.delete("type");
    if (source && source !== "all") params.set("source", source);
    else params.delete("source");
    if (status && status !== "all") params.set("status", status);
    else params.delete("status");
    if (sort && sort !== "newest") params.set("sort", sort);
    else params.delete("sort");
    if (debouncedSearch && debouncedSearch.trim() !== "")
      params.set("q", debouncedSearch.trim());
    else params.delete("q");

    if (page && page > 1) params.set("page", String(page));
    else params.delete("page");

    if (perPage && perPage !== 50) params.set("perPage", String(perPage));
    else params.delete("perPage");

    const qs = params.toString();
    const url = qs ? `${pathname}?${qs}` : pathname;
    router.replace(url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, source, status, sort, debouncedSearch, page, perPage]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 500);
    return () => clearTimeout(t);
  }, [search]);

  const { topups, total, isLoading, isError, error } = useTopups({
    type: type === "all" ? undefined : type,
    source: source === "all" ? undefined : source,
    status: status === "all" ? undefined : status,
    sort,
    search: debouncedSearch,
    page,
    perPage,
  });

  const [selectedTopup, setSelectedTopup] = useState<string | null>(null);
  const [rejectTopupId, setRejectTopupId] = useState<string | null>(null);
  const [openedPanels, setOpenedPanels] = useState({
    verify: false,
    details: false,
  });

  const handleDownload = async () => {
    const fields = [
      { label: "Topup Number", value: "number" },
      { label: "Created At", value: "created_at" },
      { label: "Updated At", value: "updated_at" },
      { label: "Type", value: "type" },
      { label: "Currency", value: "currency" },
      { label: "Received Amount", value: "amount_received" },
      { label: "Amount USD", value: "amount_usd" },
      { label: "Topup Amount", value: "topup_amount" },
      { label: "Fee", value: "fee" },
      { label: "Status", value: "status" },
      { label: "Topup Currency", value: "topup_currency" },
      { label: "Source", value: "source" },
    ];

    const opts = { fields, withBOM: true };
    const supabase = createClient();
    try {
      setDownloadingCSV(true);
      const { data, error } = await supabase.from("top_ups").select("*");
      if (error) throw error;

      const parser = new Parser(opts);
      const csv = parser.parse(data);

      // BLOB for download

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "topups.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
    } finally {
      setDownloadingCSV(false);
    }
  };

  return (
    <>
      <div className="flex  justify-between items-start gap-4">
        {isTabletScreen && (
          <TopupsFilters
            type={type}
            setType={(v) => setType(v)}
            source={source}
            setSource={(v) => setSource(v)}
            status={status}
            setStatus={(v) => setStatus(v)}
            sort={sort}
            setSort={(v) => setSort(v)}
          />
        )}

        <div className="flex gap-2 items-center self-end">
          <Input
            placeholder="Search topup number..."
            value={search}
            className="h-8 flex-1"
            onChange={(e) => setSearch(e.target.value)}
          />
          {!isTabletScreen && (
            <TopupsFilters
              type={type}
              setType={(v) => setType(v)}
              source={source}
              setSource={(v) => setSource(v)}
              status={status}
              setStatus={(v) => setStatus(v)}
              sort={sort}
              setSort={(v) => setSort(v)}
            />
          )}
          {isAdmin ? (
            <div className="flex items-center gap-2">
              <Button
                size={"sm"}
                variant={"secondary"}
                onClick={handleDownload}
              >
                {downloadingCSV ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <FileDown />
                )}
                <span className="hidden sm:inline">Download CSV</span>
              </Button>
              <Button
                onClick={() => {
                  setOpenTopupDialog(true);
                  setTopupType("account");
                }}
                size={"sm"}
              >
                <IconCashRegister />
                New Topup
              </Button>
            </div>
          ) : (
            <RequestTopupDialog
              disabled={!!rateLimitStatus}
              message={rateLimitStatus ?? ""}
            />
          )}
        </div>
      </div>

      {isAdvertiser ? (
        <div className="flex flex-col gap-2">
          {isLoading ? (
            Array.from({ length: 6 }).map((_, idx) => (
              <div
                key={idx}
                className="h-24 bg-muted/50 rounded-lg animate-pulse"
              />
            ))
          ) : isError ? (
            <div className="flex flex-col items-center justify-center p-8 text-destructive border border-destructive/20 rounded-lg bg-destructive/5">
              <span className="font-medium">Failed to load topups</span>
              <span className="text-sm mt-1">{(error as Error)?.message}</span>
            </div>
          ) : topups?.length ? (
            topups.map((topup: Topup) => (
              <AdvertiserTopupCard key={topup.id} topup={topup} />
            ))
          ) : (
            <div className="flex flex-col items-center justify-center p-12 text-muted-foreground border border-dashed rounded-lg">
              <span>No topups found</span>
            </div>
          )}
        </div>
      ) : isTabletScreen ? (
        <div className=" rounded-md border overflow-x-auto relative">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-muted">
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Account Name</TableHead>
                {profile?.role !== "advertiser" && (
                  <>
                    <TableHead>Client Code</TableHead>
                    {/* <TableHead>Advertiser Name</TableHead> */}
                  </>
                )}
                <TableHead>Type</TableHead>
                <TableHead>Received Amount</TableHead>
                <TableHead>Topup</TableHead>
                <TableHead>Fee</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                {isAdmin && (
                  <TableHead className="text-center">Action</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, idx) => (
                  <TableRow key={idx} className="animate-pulse">
                    {Array.from({
                      length: profile?.role !== "advertiser" ? 12 : 10,
                    }).map((_, cellIdx) => (
                      <LoaderCell key={cellIdx} />
                    ))}
                  </TableRow>
                ))
              ) : isError ? (
                <TableRow>
                  <TableCell
                    colSpan={12}
                    className="text-center text-destructive py-8"
                  >
                    <div role="alert" aria-live="assertive">
                      <p className="font-medium">Failed to load users.</p>
                      <p className="mt-2 text-sm">
                        {(error as Error)?.message ?? String(error)}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : topups?.length ? (
                topups?.map((topup: Topup) => (
                  <TopupRow
                    key={topup.id}
                    topup={topup}
                    onViewDetails={() => {
                      if (!isAdmin) return;
                      setOpenedPanels((prev) => ({ ...prev, details: true }));
                      setSelectedTopup(topup.id);
                    }}
                    onVerifyPayment={() => {
                      setOpenedPanels((prev) => ({ ...prev, verify: true }));
                      setSelectedTopup(topup.id);
                    }}
                    onReject={() => {
                      setRejectTopupId(topup.id);
                    }}
                  />
                ))
              ) : (
                <TableRow className="text-muted-foreground text-center">
                  <TableCell
                    colSpan={11}
                    className="text-center py-6 text-sm text-muted-foreground"
                  >
                    No topups found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="">
          {!isLoading && !isError && topups?.length ? (
            <div className=" grid gap-4">
              {topups.map((topup: Topup) => (
                <TopupCard
                  key={topup.id}
                  topup={topup}
                  onViewDetails={() => {
                    setOpenedPanels((prev) => ({ ...prev, details: true }));
                    setSelectedTopup(topup.id);
                  }}
                  onVerifyPayment={() => {
                    setOpenedPanels((prev) => ({ ...prev, verify: true }));
                    setSelectedTopup(topup.id);
                  }}
                  onReject={() => {
                    setRejectTopupId(topup.id);
                  }}
                />
              ))}
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="animate-spin  h-6 w-6 text-muted-foreground" />
            </div>
          ) : isError ? (
            <div className="mt-4 flex items-center gap-2 text-destructive">
              <span>{error?.message}</span>
            </div>
          ) : (
            <div className="mt-4 text-center text-destructive">
              <span>No topups found</span>
            </div>
          )}
        </div>
      )}
      {!isLoading && !isError && topups?.length && total > perPage ? (
        <div className="my-4 px-4">
          <TablePagination
            page={page}
            total={total}
            perPage={perPage}
            onPageChange={(p) => setPage(p)}
          />
        </div>
      ) : null}
      <TopupDetailsSheet
        open={openedPanels.details}
        topupId={selectedTopup as string}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setSelectedTopup(null);
            setOpenedPanels((prev) => ({ ...prev, details: false }));
          }
        }}
      />
      <VerifyTopupDialog
        topupId={selectedTopup}
        open={openedPanels.verify}
        setOpen={() => {
          setSelectedTopup(null);
          setOpenedPanels((prev) => ({ ...prev, verify: false }));
        }}
      />
      <RejectTopupDialog
        topupId={rejectTopupId}
        open={!!rejectTopupId}
        onOpenChange={(open) => {
          if (!open) {
            setRejectTopupId(null);
          }
        }}
      />
      <AdminTopupDialog
        open={openTopupDialog}
        setOpen={setOpenTopupDialog}
        type={topupType}
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
