"use client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Topup } from "@/lib/types/topup";
import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Input } from "../ui/input";
import TablePagination from "../ui/table-pagination";
import ReadonlyTopupRow from "./readonly-topup-row";
import TopupsFilters from "./topups-filters";
import useTopups from "./use-topups";

export default function ReadonlyTopupsTable() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const initialType = searchParams?.get("type") ?? "all";
  const initialSource = searchParams?.get("source") ?? "all";
  const initialStatus = searchParams?.get("status") ?? "all";
  const initialSort = searchParams?.get("sort") ?? "newest";
  const initialQ = searchParams?.get("q") ?? "";
  const initialPage = parseInt(searchParams?.get("page") ?? "1", 10) || 1;
  const initialPerPage =
    parseInt(searchParams?.get("perPage") ?? "50", 10) || 50;

  const [type, setType] = useState(initialType);
  const [source, setSource] = useState(initialSource);
  const [status, setStatus] = useState(initialStatus);
  const [sort, setSort] = useState(initialSort);
  const [search, setSearch] = useState(initialQ);
  const [debouncedSearch, setDebouncedSearch] = useState(initialQ);
  const [page, setPage] = useState<number>(initialPage);
  const [perPage] = useState<number>(initialPerPage);

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
  }, [
    type,
    source,
    status,
    sort,
    debouncedSearch,
    page,
    perPage,
    pathname,
    router,
    searchParams,
  ]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 500);
    return () => clearTimeout(t);
  }, [search]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [type, source, status, sort, debouncedSearch]);

  const { topups, total, isLoading, isError, error } = useTopups({
    type: type === "all" ? undefined : type,
    source: source === "all" ? undefined : source,
    status: status === "all" ? undefined : status,
    sort,
    search: debouncedSearch,
    page,
    perPage,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <TopupsFilters
          type={type}
          setType={setType}
          source={source}
          setSource={setSource}
          status={status}
          setStatus={setStatus}
          sort={sort}
          setSort={setSort}
        />
        <div className="relative w-full md:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search topup number..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
      </div>

      <div className="rounded-md border overflow-x-auto relative bg-white/50 backdrop-blur-sm">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="w-20">#</TableHead>
              <TableHead>Account Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Received</TableHead>
              <TableHead>USD Value</TableHead>
              <TableHead>$ Top up</TableHead>
              <TableHead>EU Values</TableHead>
              <TableHead>Fee</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, idx) => (
                <TableRow key={idx} className="animate-pulse">
                  {Array.from({ length: 11 }).map((_, cellIdx) => (
                    <TableCell key={cellIdx}>
                      <div className="h-4 bg-muted rounded w-3/4" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : isError ? (
              <TableRow>
                <TableCell
                  colSpan={11}
                  className="text-center text-destructive py-8"
                >
                  <div role="alert" aria-live="assertive">
                    <p className="font-medium">Failed to load topups.</p>
                    <p className="mt-2 text-sm">
                      {(error as Error)?.message ?? String(error)}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : topups?.length ? (
              topups?.map((topup: Topup) => (
                <ReadonlyTopupRow key={topup.id} topup={topup} />
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={11}
                  className="text-center py-12 text-muted-foreground"
                >
                  No topup records found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {!isLoading && !isError && total > perPage && (
        <div className="p-4">
          <TablePagination
            page={page}
            total={total}
            perPage={perPage}
            onPageChange={setPage}
          />
        </div>
      )}
    </div>
  );
}
