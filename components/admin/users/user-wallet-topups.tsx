import React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { getCompletedWalletTopupTotals } from "./wallet-topup-totals";

import { formatCurrency } from "@/lib/utils";

interface WalletTopup {
  amount: number;
  currency: string;
  status: string;
}

interface UserWalletTopupsProps {
  walletTopups: WalletTopup[] | null;
}

export default function UserWalletTopups({
  walletTopups,
}: UserWalletTopupsProps) {
  const completedTopups = (walletTopups ?? []).filter(
    (topup) => (topup.status ?? "").toLowerCase() === "completed",
  );

  const totals = getCompletedWalletTopupTotals(walletTopups);

  return (
    <div className="">
      <div className="">
        <div className="flex justify-between items-center">
          <h3 className=" font-semibold">Wallet Topups</h3>
          <div className="font-semibold text-xl mt-1">
            {`${formatCurrency(totals.eur, "EUR")}`} |{" "}
            {`${formatCurrency(totals.usd, "USD")}`}
          </div>
        </div>
        {completedTopups.length > 0 && (
          <Dialog>
            <DialogTrigger className="mt-2" asChild>
              <Button variant="outline" size="sm">
                View Details
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>Wallet Topup Details</DialogTitle>
              </DialogHeader>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Amount</TableHead>
                    <TableHead>Currency</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {completedTopups.map((topup, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        {formatCurrency(
                          Number(topup.amount) || 0,
                          String(topup.currency ?? "EUR"),
                        )}
                      </TableCell>
                      <TableCell>{topup.currency}</TableCell>
                      <TableCell className="capitalize">
                        {topup.status}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={2} className="font-medium">
                      {/* The raw `+=` result. Six lines up the SAME two
                          values are formatted with formatCurrency, so
                          the dialog showed EUR 1,172.83 at the top and
                          "Total EUR: 1172.8300000000002" in its own
                          footer. An admin reconciling against a bank
                          statement cannot copy that into a ledger. */}
                      Total EUR: {formatCurrency(totals.eur, "EUR")}
                    </TableCell>
                    <TableCell className="font-medium">
                      Total USD: {formatCurrency(totals.usd, "USD")}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </div>
  );
}
