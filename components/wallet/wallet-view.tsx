"use client";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";
import { Wallet } from "@/lib/types/wallet";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ArrowLeftRight, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import WalletExchangeDialog from "./wallet-exchange-dialog";
import WalletExchangesTable from "./wallet-exchanges-table";
import WalletTopupDialog from "./wallet-topup-dialog";
import WalletTransactionsTable from "./wallet-transactions-table";

const formatAmount = (value: number | string | null | undefined) => {
  const num = Number(value ?? 0);
  if (Number.isNaN(num)) return "0.00";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
};

export default function WalletView() {
  const { profile } = useAppContext();
  const queryClient = useQueryClient();

  const advertiserId = profile?.advertiser?.[0]?.id ?? null;
  const tenantId = profile?.tenant_id ?? null;
  const [topupDialogOpen, setTopupDialogOpen] = useState(false);
  const [exchangeDialogOpen, setExchangeDialogOpen] = useState(false);

  const {
    data: wallet,
    isLoading,
    isError,
    error,
  } = useQuery<Wallet | null>({
    queryKey: ["wallet"],
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

  const { mutate: createWallet, isPending: isCreating } = useMutation<
    Wallet,
    Error,
    void
  >({
    mutationKey: ["create-wallet", advertiserId],
    mutationFn: async () => {
      if (!advertiserId) throw new Error("Missing advertiser profile.");
      const supabase = createClient();
      const generatedRef = `${Date.now().toString().slice(-6)}${Math.floor(
        1000 + Math.random() * 9000,
      )}`;
      const { data, error } = await supabase
        .from("wallets")
        .insert({
          advertiser_id: advertiserId,
          tenant_id: tenantId,
          reference_no: generatedRef,
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

  const isAdvertiser = profile?.role === "advertiser";

  // Auto-create wallet if it doesn't exist
  useEffect(() => {
    if (isAdvertiser && advertiserId && tenantId && wallet === null) {
      createWallet();
    }
  }, [isAdvertiser, advertiserId, tenantId, wallet, createWallet]);

  const usdAmount = formatAmount(wallet?.usd_balance ?? 0);
  const eurAmount = formatAmount(wallet?.eur_balance ?? 0);
  const usdBalance = Number(wallet?.usd_balance ?? 0);
  const eurBalance = Number(wallet?.eur_balance ?? 0);
  const totals = { transactions: 0, exchanges: 0 };

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

  if (!isAdvertiser) return null;

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-6 md:px-6">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Wallet</h2>
            <p className="text-sm text-muted-foreground">
              Keep track of your USD and EUR wallet balances.
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="default"
              onClick={() => handleAddBalance()}
              disabled={!wallet || isCreating || isLoading}
            >
              <Plus className="h-4 w-4" />
              Add Balance
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() => setExchangeDialogOpen(true)}
              disabled={!wallet}
            >
              <ArrowLeftRight className="h-4 w-4" />
              Exchange balance
            </Button>
          </div>
        </div>

        {isLoading && <WalletSkeleton />}
        {isError && (
          <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4" />
            <span>{(error as Error)?.message ?? "Please try again."}</span>
          </div>
        )}

        {!isLoading && !isError && (
          <div className="grid gap-4 md:grid-cols-2">
            <BalancePanel
              title="USD balance"
              amount={usdAmount}
              currency="USD"
              totals={totals}
            />
            <BalancePanel
              title="EUR balance"
              amount={eurAmount}
              currency="EUR"
              totals={totals}
            />
          </div>
        )}

        <div className="mt-2">
          <Tabs defaultValue="transactions" className="w-full">
            <TabsList className="grid w-full grid-cols-4 sm:w-auto sm:inline-flex">
              <TabsTrigger value="transactions">Transactions</TabsTrigger>{" "}
              <TabsTrigger value="exchanges">Exchanges</TabsTrigger>
            </TabsList>
            <TabsContent value="transactions" className="mt-4">
              <WalletTransactionsTable walletId={wallet?.id ?? null} />
            </TabsContent>

            <TabsContent value="exchanges" className="mt-4">
              <WalletExchangesTable walletId={wallet?.id ?? null} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
      <WalletTopupDialog
        open={topupDialogOpen}
        onOpenChange={setTopupDialogOpen}
        walletId={wallet?.id ?? null}
        referenceNo={wallet?.reference_no ?? null}
        advertiserId={advertiserId}
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

function WalletSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {[0, 1].map((item) => (
        <div key={item} className="rounded-lg border p-4 sm:p-6">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 h-8 w-32" />
          <div className="mt-4 grid grid-cols-2 gap-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}

function BalancePanel({
  title,
  amount,
  currency,
  totals,
}: {
  title: string;
  amount: string;
  currency: string;
  totals: { transactions: number; exchanges: number };
}) {
  return (
    <div className="rounded-lg border p-4 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {title}
          </p>
          {/* TODO: implement currency sign here */}
          <p className="mt-2 text-3xl font-semibold">
            {currency === "USD" ? "$" : "€"} {amount}
          </p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-muted-foreground">Total transactions</p>
          <p className="font-medium">{totals.transactions}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Total exchanges</p>
          <p className="font-medium">{totals.exchanges}</p>
        </div>
      </div>
    </div>
  );
}
