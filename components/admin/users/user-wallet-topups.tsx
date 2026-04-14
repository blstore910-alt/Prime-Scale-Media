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
            <DialogContent className="max-w-2xl">
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
                      <TableCell>{topup.amount}</TableCell>
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
                      Total EUR: {totals.eur}
                    </TableCell>
                    <TableCell className="font-medium">
                      Total USD: {totals.usd}
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
