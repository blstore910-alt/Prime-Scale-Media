"use client";

import useUpdateAdvertiser from "@/components/advertiser/use-update-advertiser";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { DATE_FORMAT } from "@/lib/constants";
import dayjs from "dayjs";
import { CheckCircle2, MinusCircle, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import useUpdateUserProfile from "./use-update-user";
import { Profile } from "./user-table";
import { getCompletedWalletTopupTotals } from "./wallet-topup-totals";
import { formatCurrency } from "@/lib/utils";

export default function UserCard({
  profile,
  onViewDetails,
  onCreateSubscription,
}: {
  profile: Profile;
  onViewDetails: (id?: string) => void;
  onCreateSubscription: (advertiserId: string) => void;
}) {
  const { updateUserProfile, isPending: isUpdatingUser } =
    useUpdateUserProfile();

  const hasSubscription = profile.advertiser?.[0]?.subscriptions?.length;
  const subscriptionStatus = hasSubscription
    ? profile.advertiser[0].subscriptions?.[0]?.status
    : "N/A";

  const topupTotals = useMemo(
    () => getCompletedWalletTopupTotals(profile.advertiser?.[0]?.wallet_topups),
    [profile.advertiser],
  );

  const updateStatus = () => {
    updateUserProfile(
      {
        userId: profile.id,
        data: {
          status: profile.status === "active" ? "inactive" : "active",
        },
      },
      {
        onSuccess: () => {
          toast.success(
            `User has been ${
              profile.status === "active" ? "deactivated" : "activated"
            } successfully`,
          );
        },
      },
    );
  };

  const isPending = isUpdatingUser;
  return (
    <Card className="cursor-pointer hover:shadow-lg transition-shadow p-2">
      <CardContent className="p-2">
        <div className="flex justify-between items-start mb-2">
          <div className="flex-1">
            <div className="text-sm text-muted-foreground">
              <span className="text-muted-foreground">
                {profile.advertiser?.[0]?.tenant_client_code}
              </span>
            </div>
            <CardTitle className="text-sm mt-1">{profile?.full_name}</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {profile?.email}
            </p>
          </div>
          <div className="text-end">
            <Badge className="capitalize" variant={"outline"}>
              {profile.status === "active" ? (
                <CheckCircle2 color="green" />
              ) : (
                <MinusCircle color="gray" />
              )}
              {profile.status}
            </Badge>
            <p className="text-muted-foreground text-sm mt-1">
              {profile?.created_at
                ? dayjs(profile.created_at).format(DATE_FORMAT)
                : "—"}
            </p>
          </div>
        </div>
        <div className="mt-2 w-full flex items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">Wallet Topups:</span>
          <span className="text-sm text-right font-bold">
            {formatCurrency(topupTotals.eur, "EUR")} |
            {formatCurrency(topupTotals.usd, "USD")}
          </span>
        </div>
        <div className="mt-2 w-full flex items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">
            Subscription Status:
          </span>
          {hasSubscription ? (
            <Badge variant="outline" className="capitalize">
              {subscriptionStatus === "active" ? (
                <CheckCircle2 color="green" />
              ) : (
                <MinusCircle color="gray" />
              )}
              {subscriptionStatus}
            </Badge>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              onClick={(e) => {
                e.stopPropagation();
                onCreateSubscription(profile.advertiser[0].id);
              }}
            >
              <Plus className="w-4 h-4" />
              Create
            </Button>
          )}
        </div>

        <div className="flex gap-2 mt-4 pt-4 border-t [&_button]:w-full">
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onViewDetails(profile?.id);
            }}
          >
            View
          </Button>

          <Button
            variant={profile.status === "active" ? "destructive" : "default"}
            data-variant={
              profile.status === "active" ? "destructive" : "default"
            }
            size="sm"
            className="data-[variant=destructive]:text-white"
            onClick={(e) => {
              e.stopPropagation();
              updateStatus();
            }}
            disabled={isPending}
          >
            {profile.status === "active" ? "Deactivate" : "Activate"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
