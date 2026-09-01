"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  addLedgerEntry,
  getReconciliation,
  listLedgerEntries,
} from "@/actions/bank-ledger-actions";
import {
  DESTINATION_LABELS,
  type LedgerCurrency,
  type LedgerDestination,
  type LedgerDirection,
} from "@/lib/types/bank-ledger";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const DESTS: LedgerDestination[] = ["our_bank", "supplier"];
const CURRENCIES: LedgerCurrency[] = ["EUR", "USD"];
const SYMB: Record<LedgerCurrency, string> = { EUR: "€", USD: "$" };

function fmt(v: number, c: LedgerCurrency) {
  return `${SYMB[c]}${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v)}`;
}

export default function ReconciliationView() {
  const queryClient = useQueryClient();

  const reconQ = useQuery({
    queryKey: ["reconciliation"],
    queryFn: async () => {
      const res = await getReconciliation();
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
  });

  const entriesQ = useQuery({
    queryKey: ["bank-ledger-entries"],
    queryFn: async () => {
      const res = await listLedgerEntries();
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
  });

  const [destination, setDestination] =
    useState<LedgerDestination>("supplier");
  const [currency, setCurrency] = useState<LedgerCurrency>("EUR");
  const [direction, setDirection] = useState<LedgerDirection>("deposit");
  const [amount, setAmount] = useState("");
  const [occurredOn, setOccurredOn] = useState("");
  const [note, setNote] = useState("");

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["reconciliation"] });
    queryClient.invalidateQueries({ queryKey: ["bank-ledger-entries"] });
  };

  const { mutate: add, isPending: adding } = useMutation({
    mutationFn: async () => {
      const amt = Number(amount);
      if (!(amt > 0)) throw new Error("Enter a positive amount.");
      const res = await addLedgerEntry({
        destination,
        currency,
        direction,
        amount: amt,
        occurred_on: occurredOn || undefined,
        note: note || undefined,
      });
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success("Entry recorded");
      setAmount("");
      setNote("");
      setOccurredOn("");
      invalidate();
    },
    onError: (e: Error) =>
      toast.error("Failed to record entry", { description: e.message }),
  });

  return (
    <div className="space-y-6 px-4 lg:px-6 pb-16">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Bank Balances &amp; Reconciliation
        </h1>
        <p className="text-sm text-muted-foreground">
          Record the money actually received at each bank from the
          statements, then check it against what was credited to customer
          wallets. A gap means more was credited than received —
          investigate.
        </p>
      </div>

      {/* Reconciliation summary */}
      <Card>
        <CardHeader>
          <CardTitle>Reconciliation</CardTitle>
          <CardDescription>
            Credited to wallets (completed topups) vs actually received
            (ledger). Per currency.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {reconQ.isLoading ? (
            <div className="flex h-24 items-center justify-center">
              <Loader2 className="animate-spin" />
            </div>
          ) : reconQ.isError ? (
            <p className="text-destructive">
              {(reconQ.error as Error)?.message}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Currency</TableHead>
                  <TableHead className="text-right">Credited</TableHead>
                  <TableHead className="text-right">Received</TableHead>
                  <TableHead className="text-right">Gap</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(reconQ.data?.rows ?? []).map((r) => {
                  const ok = Math.abs(r.gap) < 0.01;
                  return (
                    <TableRow key={r.currency}>
                      <TableCell className="font-medium">
                        {r.currency}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {fmt(r.credited, r.currency)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {fmt(r.received, r.currency)}
                      </TableCell>
                      <TableCell
                        className={`text-right font-mono ${
                          ok ? "" : "text-destructive font-semibold"
                        }`}
                      >
                        {fmt(r.gap, r.currency)}
                      </TableCell>
                      <TableCell className="text-right">
                        {ok ? (
                          <span className="inline-flex items-center gap-1 text-green-600 text-xs">
                            <CheckCircle2 className="h-4 w-4" /> Balanced
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-destructive text-xs font-semibold">
                            <AlertTriangle className="h-4 w-4" /> Check
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}

          {/* Per-destination balances */}
          {!reconQ.isLoading && !reconQ.isError && (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(reconQ.data?.balances ?? []).map((b) => (
                <div
                  key={`${b.destination}-${b.currency}`}
                  className="rounded-md border p-3"
                >
                  <div className="text-xs text-muted-foreground">
                    {DESTINATION_LABELS[b.destination]} · {b.currency}
                  </div>
                  <div className="font-mono font-semibold">
                    {fmt(b.balance, b.currency)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Record an entry */}
      <Card>
        <CardHeader>
          <CardTitle>Record a bank entry</CardTitle>
          <CardDescription>
            From the actual bank/supplier statement.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-[1fr_100px_120px_120px_140px_auto] sm:items-end">
            <div className="grid gap-1">
              <Label className="text-xs">Destination</Label>
              <select
                value={destination}
                onChange={(e) =>
                  setDestination(e.target.value as LedgerDestination)
                }
                className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
              >
                {DESTS.map((d) => (
                  <option key={d} value={d}>
                    {DESTINATION_LABELS[d]}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Currency</Label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as LedgerCurrency)}
                className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Direction</Label>
              <select
                value={direction}
                onChange={(e) =>
                  setDirection(e.target.value as LedgerDirection)
                }
                className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
              >
                <option value="deposit">Deposit (in)</option>
                <option value="withdrawal">Withdrawal (out)</option>
              </select>
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Amount</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                placeholder="0.00"
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Date</Label>
              <Input
                type="date"
                value={occurredOn}
                onChange={(e) => setOccurredOn(e.target.value)}
              />
            </div>
            <Button type="button" disabled={adding} onClick={() => add()}>
              {adding ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Add
            </Button>
          </div>
          <div className="mt-3 grid gap-1">
            <Label className="text-xs">Note (optional)</Label>
            <Input
              value={note}
              placeholder="e.g. statement ref, sender name"
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Ledger */}
      <Card>
        <CardHeader>
          <CardTitle>Ledger</CardTitle>
          <CardDescription>Recorded bank/supplier entries.</CardDescription>
        </CardHeader>
        <CardContent>
          {entriesQ.isLoading ? (
            <div className="flex h-24 items-center justify-center">
              <Loader2 className="animate-spin" />
            </div>
          ) : (entriesQ.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No entries yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Destination</TableHead>
                    <TableHead>Dir</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Note</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(entriesQ.data ?? []).map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="whitespace-nowrap">
                        {e.occurred_on}
                      </TableCell>
                      <TableCell className="text-xs">
                        {DESTINATION_LABELS[e.destination]}
                      </TableCell>
                      <TableCell>
                        <span
                          className={
                            e.direction === "deposit"
                              ? "text-green-600"
                              : "text-amber-600"
                          }
                        >
                          {e.direction === "deposit" ? "in" : "out"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {fmt(e.amount, e.currency)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[16rem] truncate">
                        {e.note ?? "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
