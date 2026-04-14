"use client";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { createClient } from "@/lib/supabase/client";
import { WalletWithAdvertiser } from "@/lib/types/wallet";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Loader2, XIcon } from "lucide-react";
import { useMediaQuery } from "usehooks-ts";
import WalletTransactionsTable from "../wallet/wallet-transactions-table";

const formatAmount = (value: number | string | null | undefined) => {
  const num = Number(value ?? 0);
  if (Number.isNaN(num)) return "0.00";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
};

export default function WalletDetailsSheet({
  open,
  walletId,
  onOpenChange,
}: {
  open: boolean;
  walletId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const isTabletScreen = useMediaQuery("(min-width: 768px)");
  const {
    data: wallet,
    isLoading,
    isError,
    error,
  } = useQuery<WalletWithAdvertiser | null>({
    queryKey: ["wallet-details", walletId],
    enabled: !!walletId,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("wallets")
        .select(
          "id, created_at, updated_at, tenant_id, advertiser_id, usd_balance, eur_balance, advertiser:advertisers(tenant_client_code, profile:user_profiles(full_name, email))",
        )
        .eq("id", walletId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as WalletWithAdvertiser | null;
    },
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isTabletScreen ? "right" : "bottom"}
        className="sm:max-w-xl w-full overflow-auto"
      >
        <SheetHeader className="sticky top-0 bg-background">
          <div className="flex items-center justify-between gap-2">
            <SheetTitle>Wallet details</SheetTitle>
            <div className="flex items-center gap-2">
              <SheetClose>
                <XIcon size={20} />
              </SheetClose>
            </div>
          </div>
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

        {wallet && (
          <div className="space-y-4 px-2 py-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Balances</CardTitle>
                <CardDescription>
                  Current wallet balances across supported currencies.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">USD balance</span>
                  <span className="font-medium">
                    {formatAmount(wallet.usd_balance)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">EUR balance</span>
                  <span className="font-medium">
                    {formatAmount(wallet.eur_balance)}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 pt-2">
                  <Badge variant="outline">USD</Badge>
                  <Badge variant="outline">EUR</Badge>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Advertiser</CardTitle>
                <CardDescription>
                  Wallet owner and contact details.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex flex-col gap-1">
                  <span className="text-muted-foreground">Client code</span>
                  <span className="font-medium">
                    {wallet.advertiser?.tenant_client_code ?? "-"}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-muted-foreground">Name</span>
                  <span>{wallet.advertiser?.profile?.full_name ?? "-"}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-muted-foreground">Email</span>
                  <span>{wallet.advertiser?.profile?.email ?? "-"}</span>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <h3 className="text-sm font-semibold px-1">Topups History</h3>
              <WalletTransactionsTable walletId={wallet.id} />
            </div>
          </div>
        )}
        {!isLoading && !isError && !wallet && (
          <div className="py-10 text-center text-muted-foreground text-sm">
            Wallet details are unavailable.
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
