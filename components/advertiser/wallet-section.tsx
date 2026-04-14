"use client";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";
import { Wallet } from "@/lib/types/wallet";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import {
  AlertCircle,
  ArrowLeftRight,
  ArrowRight,
  CheckCircle2,
  Clock,
  DollarSign,
  Euro,
  Loader2,
  MinusCircle,
  Plus,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import WalletExchangeDialog from "@/components/wallet/wallet-exchange-dialog";
import WalletTopupDialog from "@/components/wallet/wallet-topup-dialog";

dayjs.extend(relativeTime);

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
  status: string | null;
  reference_no: string | null;
  description: string | null;
};

export default function WalletSection() {
  const { profile } = useAppContext();
  const queryClient = useQueryClient();

  const advertiserId = profile?.advertiser?.[0]?.id ?? null;
  const tenantId = profile?.tenant_id ?? null;
  const [topupDialogOpen, setTopupDialogOpen] = useState(false);
  const [exchangeDialogOpen, setExchangeDialogOpen] = useState(false);

  const {
    data: wallet,
    isLoading: walletLoading,
    isError: walletError,
    error: walletErrorMsg,
  } = useQuery<Wallet | null>({
    queryKey: ["wallet", advertiserId],
    enabled: !!advertiserId,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("wallets")
        .select("*")
        .eq("advertiser_id", advertiserId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as Wallet | null;
    },
  });

  const { data: transactions, isLoading: transactionsLoading } = useQuery<
    WalletTopup[]
  >({
    queryKey: ["wallet-transactions-recent", wallet?.id],
    enabled: !!wallet?.id,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("wallet_topups")
        .select()
        .eq("wallet_id", wallet!.id)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data ?? []) as WalletTopup[];
    },
  });

  const { mutate: createWallet, isPending: isCreating } = useMutation<
    Wallet,
    Error,
    void
  >({
    mutationKey: ["create-wallet", advertiserId],
    mutationFn: async () => {
      if (!advertiserId) throw new Error("Missing advertiser profile.");
      const supabase = createClient();
      const { data, error } = await supabase
        .from("wallets")
        .insert({
          advertiser_id: advertiserId,
          tenant_id: tenantId,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as Wallet;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["wallet", advertiserId], data);
      queryClient.invalidateQueries({ queryKey: ["wallet", advertiserId] });
      toast.success("Wallet created", {
        description: "Your wallet is ready for balances and exchanges.",
      });
    },
    onError: (err) => {
      toast.error("Unable to create wallet", {
        description: err.message,
      });
    },
  });

  const handleAddBalance = () => {
    if (!advertiserId) {
      toast.error("Missing advertiser profile.");
      return;
    }
    if (!wallet) {
      createWallet(undefined, {
        onSuccess: () => {
          setTopupDialogOpen(true);
        },
      });
      return;
    }
    setTopupDialogOpen(true);
  };

  const usdAmount = formatAmount(wallet?.usd_balance ?? 0);
  const eurAmount = formatAmount(wallet?.eur_balance ?? 0);
  const usdBalance = Number(wallet?.usd_balance ?? 0);
  const eurBalance = Number(wallet?.eur_balance ?? 0);

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Wallet Card */}
      <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
        <div className="flex items-center justify-between p-6 pb-2">
          <h3 className="font-semibold leading-none tracking-tight">Wallet</h3>
          <Link
            href="/wallet"
            className="text-sm text-primary hover:underline flex items-center"
          >
            View <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </div>

        <div className="p-6 pt-2 space-y-4">
          {walletLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : walletError ? (
            <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4" />
              <span>
                {(walletErrorMsg as Error)?.message ?? "Please try again."}
              </span>
            </div>
          ) : (
            <>
              {/* USD Balance */}
              <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50 border">
                <div className="flex h-10 w-10 items-center justify-center rounded-full">
                  <DollarSign className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">
                    Balance (USD)
                  </p>
                  <p className="text-2xl font-bold">{usdAmount}</p>
                </div>
              </div>

              {/* EUR Balance */}
              <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50 border">
                <div className="flex h-10 w-10 items-center justify-center rounded-full">
                  <Euro className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">
                    Balance (EUR)
                  </p>
                  <p className="text-2xl font-bold">{eurAmount}</p>
                </div>
              </div>
            </>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col gap-2 pt-2">
            <Button
              onClick={handleAddBalance}
              disabled={isCreating || walletLoading}
              className="w-full"
            >
              {isCreating ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Add Balance
            </Button>

            <Button
              variant="outline"
              onClick={() => setExchangeDialogOpen(true)}
              disabled={!wallet}
              className="w-full"
            >
              <ArrowLeftRight className="h-4 w-4 mr-2" />
              Exchange
            </Button>
          </div>
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="rounded-xl border bg-card text-card-foreground shadow-sm flex-1">
        <div className="p-6 pb-4">
          <h3 className="font-semibold leading-none tracking-tight">
            Latest Transactions
          </h3>
        </div>

        <div className="px-6 pb-6 space-y-3">
          {transactionsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : !wallet ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No wallet created yet.
            </p>
          ) : transactions?.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No transactions yet.
            </p>
          ) : (
            transactions?.map((tx) => (
              <TransactionCard key={tx.id} transaction={tx} />
            ))
          )}
        </div>
      </div>

      {/* Dialogs */}
      <WalletTopupDialog
        open={topupDialogOpen}
        onOpenChange={setTopupDialogOpen}
        walletId={wallet?.id ?? null}
        advertiserId={advertiserId}
        referenceNo={wallet?.reference_no ?? null}
        tenantId={tenantId}
        createdBy={profile?.id ?? null}
        minTopup={wallet?.min_topup as number}
      />
      <WalletExchangeDialog
        open={exchangeDialogOpen}
        onOpenChange={setExchangeDialogOpen}
        walletId={wallet?.id ?? null}
        createdBy={profile?.id ?? null}
        usdBalance={usdBalance}
        eurBalance={eurBalance}
      />
    </div>
  );
}

function TransactionCard({ transaction }: { transaction: WalletTopup }) {
  const statusConfig = {
    completed: {
      icon: CheckCircle2,
      color: "text-green-600",
      bgColor: "bg-green-100 dark:bg-green-900/30",
      badgeVariant: "default" as const,
    },
    pending: {
      icon: Clock,
      color: "text-orange-600",
      bgColor: "bg-orange-100 dark:bg-orange-900/30",
      badgeVariant: "secondary" as const,
    },
    processing: {
      icon: Loader2,
      color: "text-blue-600",
      bgColor: "bg-blue-100 dark:bg-blue-900/30",
      badgeVariant: "secondary" as const,
    },
    failed: {
      icon: MinusCircle,
      color: "text-red-600",
      bgColor: "bg-red-100 dark:bg-red-900/30",
      badgeVariant: "destructive" as const,
    },
  };

  const config =
    statusConfig[transaction.status as keyof typeof statusConfig] ||
    statusConfig.pending;
  const StatusIcon = config.icon;

  return (
    <div className="flex items-start gap-3 p-4 rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors">
      <div
        className={`flex h-10 w-10 items-center justify-center rounded-full ${config.bgColor} shrink-0`}
      >
        <StatusIcon className={`h-5 w-5 ${config.color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-mono text-sm font-medium">
              {transaction.reference_no || "N/A"}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {transaction.description || "Wallet Topup"}
            </p>
          </div>
          <Badge variant={config.badgeVariant} className="capitalize shrink-0">
            {transaction.status}
          </Badge>
        </div>
        <div className="flex items-center justify-between mt-2">
          <p className="text-lg font-semibold">
            {transaction.currency === "USD" ? "$" : "€"}
            {formatAmount(transaction.amount)}
          </p>
          <p className="text-xs text-muted-foreground">
            {dayjs(transaction.created_at).fromNow()}
          </p>
        </div>
      </div>
    </div>
  );
}
