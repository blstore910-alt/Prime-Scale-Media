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
import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { useMediaQuery } from "usehooks-ts";
import useWalletTransactions from "./use-wallet-transactions";
import WalletTransactionCard from "./wallet-transaction-card";
import WalletTransactionDetailsSheet from "./wallet-transaction-details-sheet";
import WalletTransactionRow from "./wallet-transaction-row";
import WalletTransactionApproveDialog from "./wallet-transaction-approve-dialog";
import { useUpdateTransaction } from "@/hooks/use-update-transaction";
import { useAppContext } from "@/context/app-provider";
import { WalletTopupWithAdvertiser } from "@/lib/types/wallet-topup";

const statusOptions = [
  { label: "All Status", value: "all" },
  { label: "Completed", value: "completed" },
  { label: "Pending", value: "pending" },
  { label: "Rejected", value: "rejected" },
];

const currencyOptions = [
  { label: "All Currencies", value: "all" },
  { label: "USD", value: "USD" },
  { label: "EUR", value: "EUR" },
];

export default function WalletTransactionsTable() {
  const { profile } = useAppContext();
  const [status, setStatus] = useState("all");
  const [currency, setCurrency] = useState("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 10;
  const [selectedTopupId, setSelectedTopupId] = useState<string | null>(null);
  const [topupToApprove, setTopupToApprove] =
    useState<WalletTopupWithAdvertiser | null>(null);
  const isTabletScreen = useMediaQuery("(min-width: 768px)");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [status, currency, debouncedSearch]);

  const { transactions, total, isLoading, isError, error } =
    useWalletTransactions({
      status,
      currency,
      search: debouncedSearch,
      page,
      perPage,
    });

  const { mutate: updateTransaction, isPending: isApproving } =
    useUpdateTransaction(topupToApprove ?? ({} as WalletTopupWithAdvertiser));

  const handleApproveClick = (topup: WalletTopupWithAdvertiser) => {
    setTopupToApprove(topup);
  };

  const confirmApprove = (amount: number) => {
    if (!profile?.id || !topupToApprove) {
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
          setTopupToApprove(null);
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            Wallet Transactions
          </h2>
          <p className="text-sm text-muted-foreground">
            Review wallet topups and approve pending payments.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search reference no..."
              className="pl-8"
            />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder="Currency" />
            </SelectTrigger>
            <SelectContent>
              {currencyOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isTabletScreen ? (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-muted">
              <TableRow>
                <TableHead>Reference No</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Advertiser</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, idx) => (
                  <TableRow key={idx} className="animate-pulse">
                    {Array.from({ length: 6 }).map((__, cellIdx) => (
                      <LoaderCell key={cellIdx} />
                    ))}
                  </TableRow>
                ))
              ) : isError ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center text-destructive py-8"
                  >
                    <div role="alert" aria-live="assertive">
                      <p className="font-medium">
                        Failed to load wallet transactions.
                      </p>
                      <p className="mt-2 text-sm">
                        {(error as Error)?.message ?? String(error)}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : transactions.length ? (
                transactions.map((tx) => (
                  <WalletTransactionRow
                    key={tx.id}
                    topup={tx}
                    onViewDetails={() => setSelectedTopupId(tx.id)}
                    onApproveClick={() => handleApproveClick(tx)}
                  />
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center py-8 text-muted-foreground"
                  >
                    No wallet transactions found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="grid gap-4">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, idx) => (
              <div
                key={idx}
                className="h-28 rounded-md bg-muted animate-pulse"
              />
            ))
          ) : isError ? (
            <div className="text-center text-destructive py-8">
              <p className="font-medium">Failed to load wallet transactions.</p>
              <p className="mt-2 text-sm">
                {(error as Error)?.message ?? String(error)}
              </p>
            </div>
          ) : transactions.length ? (
            transactions.map((tx) => (
              <WalletTransactionCard
                key={tx.id}
                topup={tx}
                onViewDetails={() => setSelectedTopupId(tx.id)}
                onApproveClick={() => handleApproveClick(tx)}
              />
            ))
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No wallet transactions found.
            </div>
          )}
        </div>
      )}

      <div className="p-4">
        <TablePagination
          total={total}
          page={page}
          perPage={perPage}
          onPageChange={(p) => setPage(p)}
        />
      </div>

      <WalletTransactionDetailsSheet
        open={selectedTopupId !== null}
        topupId={selectedTopupId}
        onOpenChange={(open) => {
          if (!open) setSelectedTopupId(null);
        }}
      />

      {topupToApprove && (
        <WalletTransactionApproveDialog
          open={topupToApprove !== null}
          onOpenChange={(open) => {
            if (!open) setTopupToApprove(null);
          }}
          topup={topupToApprove}
          onConfirm={confirmApprove}
          isPending={isApproving}
        />
      )}
    </div>
  );
}

function LoaderCell() {
  return (
    <TableCell>
      <div className="h-4 bg-muted rounded w-8" />
    </TableCell>
  );
}
