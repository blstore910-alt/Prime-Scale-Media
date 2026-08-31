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
import { useState } from "react";
import { confirmWiseSuggestion } from "@/actions/wise-actions";

type WiseRow = {
  id: string;
  external_id: string;
  amount_cents: number;
  currency: string;
  reference: string | null;
  status: string;
  note: string | null;
  suggested_topup_id: string | null;
  created_at: string;
};

const STATUS_STYLES: Record<string, string> = {
  suggested: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  matched: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  confirmed: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  unmatched: "bg-muted text-muted-foreground",
  ambiguous: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  received: "bg-muted text-muted-foreground",
};

export default function WiseReviewPanel() {
  const { profile } = useAppContext();
  const tenantId = profile?.tenant_id ?? null;
  const queryClient = useQueryClient();
  const [actingId, setActingId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["wise-incoming", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("wise_incoming_transfers")
        .select(
          "id, external_id, amount_cents, currency, reference, status, note, suggested_topup_id, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as WiseRow[];
    },
  });

  const confirm = useMutation({
    mutationFn: async (id: string) => {
      setActingId(id);
      const res = await confirmWiseSuggestion(id);
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success("Deposit confirmed — topup completed, wallet credited");
      queryClient.invalidateQueries({ queryKey: ["wise-incoming"] });
      queryClient.invalidateQueries({ queryKey: ["wallet-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
    },
    onError: (e: Error) =>
      toast.error("Confirm failed", { description: e.message }),
    onSettled: () => setActingId(null),
  });

  const rows = data ?? [];
  const suggestedCount = rows.filter((r) => r.status === "suggested").length;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">
          Bank deposits (Wise)
          {suggestedCount > 0 && (
            <Badge className="ml-2 bg-amber-500/15 text-amber-600 dark:text-amber-400 border-transparent align-middle">
              {suggestedCount} to confirm
            </Badge>
          )}
        </h2>
        <p className="text-sm text-muted-foreground">
          Incoming bank payments detected via Wise. During the safe-start
          phase nothing completes on its own — confirm each suggested match
          and the matching topup is credited.
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-muted">
            <TableRow>
              <TableHead>Amount</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead>Result</TableHead>
              <TableHead>Note</TableHead>
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
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-10 text-center text-muted-foreground"
                >
                  No bank deposits detected yet.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono font-semibold tabular-nums">
                    {r.currency} {(r.amount_cents / 100).toFixed(2)}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {r.reference ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={`${STATUS_STYLES[r.status] ?? ""} border-transparent capitalize`}
                    >
                      {r.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[240px] truncate text-xs text-muted-foreground">
                    {r.note ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {r.status === "suggested" && r.suggested_topup_id ? (
                      <Button
                        size="sm"
                        disabled={actingId === r.id}
                        onClick={() => confirm.mutate(r.id)}
                      >
                        {actingId === r.id ? "…" : "Confirm & complete"}
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground capitalize">
                        {r.status === "confirmed" || r.status === "matched"
                          ? "done"
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
