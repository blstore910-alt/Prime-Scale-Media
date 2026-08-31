"use client";

import { createClient } from "@/lib/supabase/client";
import { useAppContext } from "@/context/app-provider";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
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
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  approveAdAccountWithdrawal,
  rejectAdAccountWithdrawal,
} from "@/actions/withdrawal-actions";
import type { AdAccountWithdrawal } from "@/lib/types/withdrawal";
import { formatCurrency } from "@/lib/utils";
import { useState } from "react";

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  approved: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  rejected: "bg-muted text-muted-foreground",
  cancelled: "bg-muted text-muted-foreground",
};

export default function WithdrawalsTable() {
  const { profile } = useAppContext();
  const tenantId = profile?.tenant_id ?? null;
  const queryClient = useQueryClient();
  const [actingId, setActingId] = useState<string | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["ad-account-withdrawals", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("ad_account_withdrawals")
        .select(
          "*, ad_account:ad_accounts(name, platform), advertiser:advertisers(tenant_client_code, profile:user_profiles(full_name, email))",
        )
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AdAccountWithdrawal[];
    },
  });

  const approve = useMutation({
    mutationFn: async (id: string) => {
      setActingId(id);
      const res = await approveAdAccountWithdrawal(id);
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success("Withdrawal approved — wallet credited");
      queryClient.invalidateQueries({ queryKey: ["ad-account-withdrawals"] });
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
    },
    onError: (e: Error) =>
      toast.error("Approve failed", { description: e.message }),
    onSettled: () => setActingId(null),
  });

  const reject = useMutation({
    mutationFn: async (id: string) => {
      setActingId(id);
      const res = await rejectAdAccountWithdrawal(id);
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success("Withdrawal rejected");
      queryClient.invalidateQueries({ queryKey: ["ad-account-withdrawals"] });
    },
    onError: (e: Error) =>
      toast.error("Reject failed", { description: e.message }),
    onSettled: () => setActingId(null),
  });

  const rows = data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">
          Ad-account withdrawals
        </h2>
        <p className="text-sm text-muted-foreground">
          Advertisers pull balance from an ad account back to their wallet.
          Approving credits their wallet immediately.
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-muted">
            <TableRow>
              <TableHead>Ref</TableHead>
              <TableHead>Advertiser</TableHead>
              <TableHead>Ad account</TableHead>
              <TableHead>Amount</TableHead>
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
            ) : isError ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-10 text-center text-destructive"
                >
                  {(error as Error)?.message ?? "Failed to load withdrawals."}
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-10 text-center text-muted-foreground"
                >
                  No withdrawal requests yet.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((w) => (
                <TableRow key={w.id}>
                  <TableCell className="font-mono text-xs">
                    {w.reference ?? "—"}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm font-medium">
                      {w.advertiser?.profile?.full_name ?? "—"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {w.advertiser?.tenant_client_code ?? ""}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{w.ad_account?.name ?? "—"}</div>
                    <div className="text-xs capitalize text-muted-foreground">
                      {w.ad_account?.platform ?? ""}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono font-semibold tabular-nums">
                    {formatCurrency(Number(w.amount), w.currency)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={`${STATUS_STYLES[w.status] ?? ""} border-transparent capitalize`}
                    >
                      {w.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {w.status === "pending" ? (
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={actingId === w.id}
                          onClick={() => reject.mutate(w.id)}
                        >
                          Reject
                        </Button>
                        <Button
                          size="sm"
                          disabled={actingId === w.id}
                          onClick={() => approve.mutate(w.id)}
                        >
                          {actingId === w.id ? "…" : "Approve"}
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {w.reviewed_at
                          ? new Date(w.reviewed_at).toLocaleDateString()
                          : "—"}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
