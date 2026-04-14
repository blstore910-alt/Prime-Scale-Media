"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { DATE_TIME_FORMAT } from "@/lib/constants";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import {
  AlertCircle,
  Loader2,
  MoreHorizontal,
  Eye,
  CheckCircle2,
  MinusCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState } from "react";
import WalletTopupDetailsSheet from "./wallet-topup-details-sheet";

const formatAmount = (value: number | string | null | undefined) => {
  const num = Number(value ?? 0);
  if (Number.isNaN(num)) return "0.00";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
};

type WalletTopup = {
  id: string;
  created_at: string;
  currency: string | null;
  amount: number | string | null;
  payment_slip: string | null;
  status: string | null;
  reference_no: string | null;
};

export default function WalletTransactionsTable({
  walletId,
}: {
  walletId: string | null;
}) {
  const [selectedTopupId, setSelectedTopupId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const {
    data: topups,
    isLoading,
    isError,
    error,
  } = useQuery<WalletTopup[]>({
    queryKey: ["wallet-topups", walletId],
    enabled: !!walletId,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("wallet_topups")
        .select("*")
        .eq("wallet_id", walletId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data ?? []) as WalletTopup[];
    },
  });

  const handleViewDetails = (id: string) => {
    setSelectedTopupId(id);
    setDetailsOpen(true);
  };

  if (!walletId) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
        Create a wallet to view topups.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        <AlertCircle className="h-4 w-4" />
        <span>{(error as Error)?.message ?? "Failed to load topups"}</span>
      </div>
    );
  }

  if (!topups?.length) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
        No wallet topups yet.
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader className="bg-muted">
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Reference No</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {topups.map((topup) => (
              <TableRow key={topup.id}>
                <TableCell>
                  {dayjs(topup.created_at).format(DATE_TIME_FORMAT)}
                </TableCell>
                {/* Add currency symbol here */}
                <TableCell className="font-mono font-semibold">
                  {topup.currency === "USD" ? "$" : "€"}
                  {formatAmount(topup.amount)}
                </TableCell>
                <TableCell className="font-mono">
                  {topup.reference_no}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="capitalize">
                    {topup.status === "completed" ? (
                      <CheckCircle2 color="green" />
                    ) : (
                      <MinusCircle color="gray" />
                    )}
                    {topup.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="sr-only">Open menu</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => handleViewDetails(topup.id)}
                      >
                        <Eye className="mr-2 h-4 w-4" />
                        View Details
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <WalletTopupDetailsSheet
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        topupId={selectedTopupId}
      />
    </>
  );
}
