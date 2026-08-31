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
  createWalletPrecharge,
  settleWalletPrecharge,
} from "@/actions/precharge-actions";
import { formatCurrency } from "@/lib/utils";

type AdvertiserOption = {
  id: string;
  tenant_client_code: string | null;
  profile: { full_name: string | null; email: string | null } | null;
};

type PrechargeRow = {
  id: string;
  reference: string | null;
  amount: number;
  outstanding: number;
  currency: "USD" | "EUR";
  status: string;
  reason: string | null;
  created_at: string;
  advertiser: AdvertiserOption | null;
};

export default function PrechargePanel() {
  const { profile } = useAppContext();
  const tenantId = profile?.tenant_id ?? null;
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [settlingId, setSettlingId] = useState<string | null>(null);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["wallet-precharges", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("wallet_precharges")
        .select(
          "id, reference, amount, outstanding, currency, status, reason, created_at, advertiser:advertisers(id, tenant_client_code, profile:user_profiles(full_name, email))",
        )
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as PrechargeRow[];
    },
  });

  const settle = useMutation({
    mutationFn: async (id: string) => {
      setSettlingId(id);
      const res = await settleWalletPrecharge(id);
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success("Precharge settled");
      queryClient.invalidateQueries({ queryKey: ["wallet-precharges"] });
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
    },
    onError: (e: Error) =>
      toast.error("Settle failed", { description: e.message }),
    onSettled: () => setSettlingId(null),
  });

  const list = rows ?? [];
  const outstandingTotal = list
    .filter((r) => r.status === "outstanding")
    .reduce((acc, r) => acc + Number(r.outstanding), 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Precharge</h2>
          <p className="text-sm text-muted-foreground">
            Advance wallet credit to a customer before their payment clears.
            Settle it once the money arrives.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>New precharge</Button>
      </div>

      {outstandingTotal > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">
          Outstanding advances across all customers:{" "}
          <span className="font-semibold tabular-nums">
            {outstandingTotal.toFixed(2)}
          </span>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-muted">
            <TableRow>
              <TableHead>Ref</TableHead>
              <TableHead>Advertiser</TableHead>
              <TableHead>Advanced</TableHead>
              <TableHead>Outstanding</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : list.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-10 text-center text-muted-foreground"
                >
                  No precharges yet.
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
                  <TableCell className="font-mono tabular-nums">
                    {formatCurrency(Number(r.amount), r.currency)}
                  </TableCell>
                  <TableCell className="font-mono font-semibold tabular-nums">
                    {formatCurrency(Number(r.outstanding), r.currency)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={`border-transparent capitalize ${
                        r.status === "outstanding"
                          ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                          : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                      }`}
                    >
                      {r.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {r.status === "outstanding" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={settlingId === r.id}
                        onClick={() => settle.mutate(r.id)}
                      >
                        {settlingId === r.id ? "…" : "Settle"}
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        settled
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <PrechargeCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        tenantId={tenantId}
      />
    </div>
  );
}

function PrechargeCreateDialog({
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
    queryKey: ["precharge-advertisers", tenantId],
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
      const res = await createWalletPrecharge({
        advertiser_id: advertiserId,
        amount: Number(amount),
        currency,
        reason: reason.trim() || undefined,
      });
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success("Precharge created — wallet credited");
      queryClient.invalidateQueries({ queryKey: ["wallet-precharges"] });
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
      setAdvertiserId("");
      setAmount("");
      setReason("");
      onOpenChange(false);
    },
    onError: (e: Error) =>
      toast.error("Couldn't create precharge", { description: e.message }),
  });

  const numeric = Number(amount);
  const valid = !!advertiserId && Number.isFinite(numeric) && numeric > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New precharge</DialogTitle>
          <DialogDescription>
            Advance credit to a customer before their payment clears. Their
            wallet is credited immediately; settle it when the money arrives.
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
              <Label htmlFor="pc-amount">Amount</Label>
              <Input
                id="pc-amount"
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
              <Label htmlFor="pc-cur">Currency</Label>
              <Select
                value={currency}
                onValueChange={(v: "USD" | "EUR") => setCurrency(v)}
              >
                <SelectTrigger id="pc-cur">
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
            <Label htmlFor="pc-reason">Note (optional)</Label>
            <Input
              id="pc-reason"
              placeholder="e.g. transfer in progress"
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
            {isPending ? "Creating…" : "Credit wallet"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
