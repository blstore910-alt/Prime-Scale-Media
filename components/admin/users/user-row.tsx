"use client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TableCell, TableRow } from "@/components/ui/table";

import { formatCurrency } from "@/lib/utils";
import {
  CheckCircle2,
  Eye,
  HandCoins,
  Loader2,
  MinusCircle,
  MoreVerticalIcon,
  Plus,
  UserCheck,
  UserX,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import CommissionSetupDialog from "./commission-setup-dialog";
import useUpdateUserProfile from "./use-update-user";
import { Profile } from "./user-table";
import { getCompletedWalletTopupTotals } from "./wallet-topup-totals";

export default function UserRow({
  profile,
  onView,
  onCreateSubscription,
}: {
  profile: Profile;
  onView: (profile: Profile) => void;
  onCreateSubscription: (advertiserId: string) => void;
}) {
  const { updateUserProfile, isPending } = useUpdateUserProfile();
  const [commissionDialogOpen, setCommissionDialogOpen] = useState(false);

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
              profile.is_active ? "deactivated" : "activated"
            } successfully`,
          );
        },
      },
    );
  };

  return (
    <TableRow
      className="group cursor-pointer"
      key={profile.id}
      onClick={() => onView(profile)}
    >
      <TableCell>{profile.advertiser[0]?.tenant_client_code ?? "-"}</TableCell>
      <TableCell className="group-hover:underline underline-offset-2">
        {profile.full_name ?? "-"}
      </TableCell>
      <TableCell>{profile.email ?? "-"}</TableCell>

      <TableCell>
        <Badge className="capitalize" variant={"outline"}>
          {profile.status === "active" ? (
            <CheckCircle2 color="green" />
          ) : (
            <MinusCircle color="gray" />
          )}
          {profile.status}
        </Badge>
      </TableCell>

      <TableCell>
        <div className="text-sm leading-5">
          <div>{formatCurrency(topupTotals.eur, "EUR")}</div>
          <div>{formatCurrency(topupTotals.usd, "USD")}</div>
        </div>
      </TableCell>
      <TableCell>
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
            <Plus />
            Create New Subscription
          </Button>
        )}
      </TableCell>

      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="flex size-8 text-muted-foreground data-[state=open]:bg-muted"
              size="icon"
            >
              {isPending ? (
                <Loader2 className="animate-spin" />
              ) : (
                <MoreVerticalIcon />
              )}
              <span className="sr-only">Open menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-32">
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onView(profile);
              }}
            >
              <Eye />
              <span>View Details</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                setCommissionDialogOpen(true);
              }}
            >
              <HandCoins />
              <span>Commission Setup</span>
            </DropdownMenuItem>

            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant={profile.is_active ? "destructive" : "default"}
              onClick={(e) => {
                e.stopPropagation();
                updateStatus();
              }}
            >
              {profile.status === "active" ? (
                <>
                  <UserX />
                  Deactivate User
                </>
              ) : (
                <>
                  <UserCheck />
                  Activate User
                </>
              )}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <CommissionSetupDialog
          open={commissionDialogOpen}
          onOpenChange={setCommissionDialogOpen}
          advertiser={profile.advertiser?.[0] ?? null}
        />
      </TableCell>
    </TableRow>
  );
}
