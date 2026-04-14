"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAppContext } from "@/context/app-provider";
import { DATE_TIME_FORMAT } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

const formatAmount = (value: number | string | null | undefined) => {
  const num = Number(value ?? 0);
  if (Number.isNaN(num)) return "0.00";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
};

export default function WalletTopupDetailsSheet({
  open,
  onOpenChange,
  topupId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  topupId: string | null;
}) {
  const { profile } = useAppContext();
  const isAdmin = profile?.role === "admin";
  const queryClient = useQueryClient();

  const {
    data: topup,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["wallet-topup-details", topupId],
    enabled: !!topupId,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("wallet_topups")
        .select("*")
        .eq("id", topupId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { mutate: verify, isPending: isVerifying } = useMutation({
    mutationFn: async () => {
      const supabase = createClient();
      const { error } = await supabase
        .from("wallet_topups")
        .update({
          status: "completed",
          approved_by: profile?.id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", topupId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Topup verified successfully");
      queryClient.invalidateQueries({
        queryKey: ["wallet-topup-details", topupId],
      });
      queryClient.invalidateQueries({
        queryKey: ["wallet-topups"],
      });

      if (topup?.wallet_id) {
        queryClient.invalidateQueries({
          queryKey: ["wallet-details", topup.wallet_id],
        });
      }
    },
    onError: (err: Error) => {
      toast.error("Failed to verify topup", { description: err.message });
    },
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Topup Details</SheetTitle>
        </SheetHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {isError && (
          <div className="mt-4 flex items-center gap-2 text-destructive">
            <AlertCircle className="h-4 w-4" />
            <span>{(error as Error)?.message}</span>
          </div>
        )}

        {topup && (
          <div className="mt-6 space-y-6 p-4">
            <div className="grid gap-4">
              <DetailItem
                label="Status"
                value={
                  <Badge variant="outline" className="capitalize">
                    {topup.status}
                  </Badge>
                }
              />
              <DetailItem
                label="Amount"
                value={`${topup.currency?.toUpperCase()} ${formatAmount(
                  topup.amount,
                )}`}
              />
              <DetailItem
                label="Date"
                value={dayjs(topup.created_at).format(DATE_TIME_FORMAT)}
              />
            </div>

            {isAdmin && topup.status === "pending" && (
              <div className="pt-4 border-t">
                <Button
                  className="w-full"
                  onClick={() => verify()}
                  disabled={isVerifying}
                >
                  {isVerifying && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Verify & Complete Topup
                </Button>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}
