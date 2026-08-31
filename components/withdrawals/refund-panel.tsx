"use client";

import { createClient } from "@/lib/supabase/client";
import { useAppContext } from "@/context/app-provider";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import {
  requestWalletRefund,
  approveWalletRefund,
  rejectWalletRefund,
} from "@/actions/refund-actions";
import { formatCurrency } from "@/lib/utils";

type AdvertiserOption = {
  id: string;
  tenant_client_code: string | null;
  profile: { full_name: string | null; email: string | null } | null;
};

type RefundRow = {
  id: string;
  reference: string | null;
  amount: number;
  currency: "USD" | "EUR";
  status: string;
  reason: string | null;
  created_at: string;
  advertiser: AdvertiserOption | null;
};

export default function RefundPanel() {
  const { profile, isSuperAdmin } = useAppContext();
  const tenantId = profile?.tenant_id ?? null;
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["wallet-refunds", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("wallet_refunds")
        .select(
          "id, reference, amount, currency, status, reason, created_at, advertiser:advertisers(id, tenant_client_code, profile:user_profiles(full_name, email))",
        )
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as RefundRow[];
    },
  });

  const approve = useMutation({
    mutationFn: async (id: string) => {
      setActingId(id);
      const res = await approveWalletRefund(id);
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success("Refund approved — wallet debited");
      queryClient.invalidateQueries({ queryKey: ["wallet-refunds"] });
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
    },
    onError: (e: Error) =>
      toast.error("Approve failed", { description: e.message }),
    onSettled: () => setActingId(null),
  });

  const reject = useMutation({
    mutationFn: async (id: string) => {
      setActingId(id);
      const res = await rejectWalletRefund(id);
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success("Refund rejected");
      queryClient.invalidateQueries({ queryKey: ["wallet-refunds"] });
    },
    onError: (e: Error) =>
      toast.error("Reject failed", { description: e.message }),
    onSettled: () => setActingId(null),
  });

  const list = rows ?? [];
  const pendingCount = list.filter((r) => r.status === "pending").length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            Refunds
            {pendingCount > 0 && (
              <Badge className="ml-2 bg-amber-500/15 text-amber-600 dark:text-amber-400 border-transparent align-middle">
                {pendingCount} pending
              </Badge>
            )}
          </h2>
          <p className="text-sm text-muted-foreground">
            When a customer leaves, refund their wallet balance to their bank.
            An admin requests it; the tenant owner approves.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>Request refund</Button>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-muted">
            <TableRow>
              <TableHead>Ref</TableHead>
              <TableHead>Advertiser</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : list.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-10 text-center text-muted-foreground"
                >
                  No refund requests yet.
                </TableCell>
              </TableRow>
            ) : (
              list.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">
                    {r.reference ?? "—"}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm font-medium">
                      {r.advertiser?.profile?.full_name ?? "—"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {r.advertiser?.tenant_client_code ?? ""}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono font-semibold tabular-nums">
                    {formatCurrency(Number(r.amount), r.currency)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={`border-transparent capitalize ${
                        r.status === "pending"
                          ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                          : r.status === "approved"
                            ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {r.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {r.status === "pending" && isSuperAdmin ? (
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={actingId === r.id}
                          onClick={() => reject.mutate(r.id)}
                        >
                          Reject
                        </Button>
                        <Button
                          size="sm"
                          disabled={actingId === r.id}
                          onClick={() => approve.mutate(r.id)}
                        >
                          {actingId === r.id ? "…" : "Approve"}
                        </Button>
                      </div>
                    ) : r.status === "pending" ? (
                      <span className="text-xs text-muted-foreground">
                        awaiting owner
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground capitalize">
                        {r.status}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <RefundRequestDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        tenantId={tenantId}
      />
    </div>
  );
}

function RefundRequestDialog({
  open,
  onOpenChange,
  tenantId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tenantId: string | null;
}) {
  const queryClient = useQueryClient();
  const [advertiserId, setAdvertiserId] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<"USD" | "EUR">("USD");
  const [reason, setReason] = useState("");

  const { data: advertisers } = useQuery({
    queryKey: ["refund-advertisers", tenantId],
    enabled: !!tenantId && open,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("advertisers")
        .select(
          "id, tenant_client_code, profile:user_profiles(full_name, email)",
        )
        .eq("tenant_id", tenantId)
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as AdvertiserOption[];
    },
  });

  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      const res = await requestWalletRefund({
        advertiser_id: advertiserId,
        amount: Number(amount),
        currency,
        reason: reason.trim() || undefined,
      });
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success("Refund requested — awaiting owner approval");
      queryClient.invalidateQueries({ queryKey: ["wallet-refunds"] });
      setAdvertiserId("");
      setAmount("");
      setReason("");
      onOpenChange(false);
    },
    onError: (e: Error) =>
      toast.error("Couldn't request refund", { description: e.message }),
  });

  const numeric = Number(amount);
  const valid = !!advertiserId && Number.isFinite(numeric) && numeric > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Request refund</DialogTitle>
          <DialogDescription>
            Refund a leaving customer&apos;s wallet balance to their bank. The
            tenant owner approves before the wallet is debited.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Advertiser</Label>
            <Select value={advertiserId} onValueChange={setAdvertiserId}>
              <SelectTrigger>
                <SelectValue placeholder="Select advertiser" />
              </SelectTrigger>
              <SelectContent>
                {(advertisers ?? []).map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.profile?.full_name ?? a.profile?.email ?? a.id}
                    {a.tenant_client_code ? ` · ${a.tenant_client_code}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2 space-y-2">
              <Label htmlFor="rf-amount">Amount</Label>
              <Input
                id="rf-amount"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rf-cur">Currency</Label>
              <Select
                value={currency}
                onValueChange={(v: "USD" | "EUR") => setCurrency(v)}
              >
                <SelectTrigger id="rf-cur">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="rf-reason">Reason (optional)</Label>
            <Input
              id="rf-reason"
              placeholder="e.g. customer closing account"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button onClick={() => mutate()} disabled={!valid || isPending}>
            {isPending ? "Requesting…" : "Request refund"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
