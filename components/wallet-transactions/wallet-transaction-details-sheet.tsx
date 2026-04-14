"use client";

import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { DATE_TIME_FORMAT } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import { WalletTopupWithAdvertiser } from "@/lib/types/wallet-topup";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { AlertCircle, Loader2 } from "lucide-react";
import { useMediaQuery } from "usehooks-ts";

type UserProfileMini = {
  id: string;
  full_name?: string | null;
  email?: string | null;
};

type WalletTransactionDetails = WalletTopupWithAdvertiser & {
  created_by_profile?: UserProfileMini | null;
  approved_by_profile?: UserProfileMini | null;
};

const formatAmount = (value: number | string | null | undefined) => {
  const num = Number(value ?? 0);
  if (Number.isNaN(num)) return "0.00";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
};

const getCurrencySymbol = (currency?: string | null) => {
  if (!currency) return "";
  if (currency === "USD") return "$";
  if (currency === "EUR") return "\u20AC";
  return currency;
};

export default function WalletTransactionDetailsSheet({
  open,
  onOpenChange,
  topupId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  topupId: string | null;
}) {
  const {
    data: topup,
    isLoading,
    isError,
    error,
  } = useQuery<WalletTransactionDetails | null>({
    queryKey: ["wallet-transaction-details", topupId],
    enabled: !!topupId,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("wallet_topups")
        .select(
          "*, advertiser:advertisers(tenant_client_code, profile:user_profiles(full_name, email))",
        )
        .eq("id", topupId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;

      const profileIds = [data.created_by, data.approved_by].filter(
        Boolean,
      ) as string[];
      let profilesById: Record<string, UserProfileMini> = {};

      if (profileIds.length) {
        const { data: profiles, error: profilesError } = await supabase
          .from("user_profiles")
          .select("id, full_name, email")
          .in("id", profileIds);
        if (profilesError) throw profilesError;
        profilesById = Object.fromEntries(
          (profiles ?? []).map((profile) => [profile.id, profile]),
        );
      }

      return {
        ...(data as WalletTopupWithAdvertiser),
        created_by_profile: data.created_by
          ? (profilesById[data.created_by] ?? null)
          : null,
        approved_by_profile: data.approved_by
          ? (profilesById[data.approved_by] ?? null)
          : null,
      } as WalletTransactionDetails;
    },
  });

  const advertiserCode = topup?.advertiser?.tenant_client_code ?? "-";
  const advertiserName = topup?.advertiser?.profile?.full_name ?? "Unknown";
  const createdByName = topup?.created_by_profile?.full_name ?? "-";
  const createdByEmail = topup?.created_by_profile?.email ?? "-";
  const approvedByName = topup?.approved_by_profile?.full_name ?? "-";
  const approvedByEmail = topup?.approved_by_profile?.email ?? "-";
  const hasApprovedBy =
    Boolean(topup?.approved_by_profile) || Boolean(topup?.approved_by);
  const isTabletScreen = useMediaQuery("(min-width: 768px)");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isTabletScreen ? "right" : "bottom"}
        className={`sm:max-w-md overflow-y-auto ${isTabletScreen ? "h-full" : "max-h-[85vh]"}`}
      >
        <SheetHeader className="sticky top-0 z-10 bg-background border-b">
          <div className="flex items-baseline justify-between gap-3">
            <SheetTitle>Wallet Transaction</SheetTitle>
            <span className="text-xs font-mono text-muted-foreground">
              {topup?.reference_no ?? "-"}
            </span>
          </div>
        </SheetHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-10 min-h-96">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {isError && (
          <div className="mt-4 flex items-center gap-2 text-destructive">
            <AlertCircle className="h-4 w-4" />
            <span>{(error as Error)?.message ?? "Failed to load."}</span>
          </div>
        )}

        {topup && (
          <div className="mt-6 space-y-5 p-4">
            <div className="grid gap-4">
              <DetailItem
                label="Status"
                value={
                  <Badge variant="outline" className="capitalize">
                    {topup.status ?? "pending"}
                  </Badge>
                }
              />
              <DetailItem
                label="Amount"
                value={`${getCurrencySymbol(topup.currency)} ${formatAmount(
                  topup.amount,
                )}`}
              />
              <DetailItem
                label="Advertiser"
                value={
                  <div className="flex flex-col">
                    <span className="font-medium">{advertiserCode}</span>
                    <span className="text-xs text-muted-foreground">
                      {advertiserName}
                    </span>
                  </div>
                }
              />
              <DetailItem
                label="Created At"
                value={
                  topup.created_at
                    ? dayjs(topup.created_at).format(DATE_TIME_FORMAT)
                    : "-"
                }
              />
              <DetailItem
                label="Updated At"
                value={
                  topup.updated_at
                    ? dayjs(topup.updated_at).format(DATE_TIME_FORMAT)
                    : "-"
                }
              />
              <DetailItem
                label="Created By"
                value={
                  <div className="flex flex-col">
                    <span className="font-medium">{createdByName}</span>
                    <span className="text-xs text-muted-foreground">
                      {createdByEmail}
                    </span>
                  </div>
                }
              />
              {hasApprovedBy && (
                <DetailItem
                  label="Approved By"
                  value={
                    <div className="flex flex-col">
                      <span className="font-medium">{approvedByName}</span>
                      <span className="text-xs text-muted-foreground">
                        {approvedByEmail}
                      </span>
                    </div>
                  }
                />
              )}
              <DetailItem label="Notes" value={topup.notes ?? "-"} />
              {topup.rejection_reason && (
                <DetailItem
                  label="Rejection Reason"
                  value={topup.rejection_reason}
                />
              )}
            </div>
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
