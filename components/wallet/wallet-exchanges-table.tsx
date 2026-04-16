"use client";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CURRENCY_SYMBOLS, DATE_TIME_FORMAT } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { AlertCircle, Loader2 } from "lucide-react";

const formatAmount = (value: number | string | null | undefined) => {
  const num = Number(value ?? 0);
  if (Number.isNaN(num)) return "0.00";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
};

type WalletExchange = {
  id: string;
  created_at: string;
  from_currency: string;
  to_currency: string;
  from_amount: number | string | null;
  to_amount: number | string | null;
  exchange_rate: number | string | null;
  fee_amount: number | string | null;
};

export default function WalletExchangesTable({
  walletId,
}: {
  walletId: string | null;
}) {
  const {
    data: exchanges,
    isLoading,
    isError,
    error,
  } = useQuery<WalletExchange[]>({
    queryKey: ["wallet-exchanges", walletId],
    enabled: !!walletId,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("wallet_exchanges")
        .select(
          "id, created_at, from_currency, to_currency, from_amount, to_amount, fee_amount, exchange_rate",
        )
        .eq("wallet_id", walletId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data ?? []) as WalletExchange[];
    },
  });

  if (!walletId) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
        Create a wallet to view exchanges.
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
        <span>{(error as Error)?.message ?? "Failed to load exchanges"}</span>
      </div>
    );
  }

  if (!exchanges?.length) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
        No exchanges yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader className="bg-muted">
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>From</TableHead>
            <TableHead>To</TableHead>
            <TableHead>Rate</TableHead>
            <TableHead>Amount In</TableHead>
            <TableHead>Amount Out</TableHead>
            <TableHead>Applied Fee</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {exchanges.map((exchange) => (
            <TableRow key={exchange.id}>
              <TableCell>
                {dayjs(exchange.created_at).format(DATE_TIME_FORMAT)}
              </TableCell>
              <TableCell className="uppercase">
                {exchange.from_currency ?? "-"}
              </TableCell>
              <TableCell className="uppercase">
                {exchange.to_currency ?? "-"}
              </TableCell>
              <TableCell>
                <Badge variant="outline">
                  {Number(exchange.exchange_rate ?? 0).toFixed(6)}
                </Badge>
              </TableCell>
              <TableCell>
                {CURRENCY_SYMBOLS[exchange.from_currency]}{" "}
                {formatAmount(exchange.from_amount)}
              </TableCell>
              <TableCell>
                {" "}
                {CURRENCY_SYMBOLS[exchange.to_currency]}
                {formatAmount(exchange.to_amount)}
              </TableCell>
              <TableCell>
                {" "}
                {CURRENCY_SYMBOLS[exchange.to_currency]}
                {formatAmount(exchange.fee_amount)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
