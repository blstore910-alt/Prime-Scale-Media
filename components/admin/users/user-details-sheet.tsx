"use client";

import { createClient } from "@/lib/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { useEffect, useState } from "react";

import { Card } from "@/components/ui/card";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";

import useUpdateAdvertiser from "@/components/advertiser/use-update-advertiser";
import { DATE_TIME_FORMAT } from "@/lib/constants";
import { AlertCircle, Loader2, XIcon } from "lucide-react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../ui/select";
import { Separator } from "../../ui/separator";
import { Button } from "../../ui/button";
import { Textarea } from "../../ui/textarea";
import useUpdateUserProfile from "./use-update-user";
import UserAccounts from "./user-accounts";
import UserAffiliates from "./user-affiliates";

import UserSubscriptionDetails from "./user-subscription-details";
import UserWalletTopups from "./user-wallet-topups";

export default function UserDetailsSheet({
  open,
  profileId,
  onOpenChange,
}: {
  open: boolean;
  profileId: string | null;
  onOpenChange: () => void;
}) {
  const supabase = createClient();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["user", profileId],
    queryFn: async () => {
      if (!profileId) return null;
      const { data, error } = await supabase
        .from("user_profiles")
        .select(
          "*, advertiser:advertisers(*, subscriptions(amount, start_date, status),  wallet_topups:wallet_topups(amount, currency, status), companies(*))",
        )
        .eq("id", profileId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!profileId,
    staleTime: 1000 * 60 * 2,
  });

  const { isPending: isUpdatingAdvertiser, updateAdvertiser } =
    useUpdateAdvertiser();

  const advertiser =
    data?.advertiser && data.advertiser.length > 0 ? data.advertiser[0] : null;
  const company =
    advertiser?.companies && advertiser.companies.length > 0
      ? advertiser.companies[0]
      : null;

  const clientCode = advertiser?.tenant_client_code;

  const { updateUserProfile, isPending } = useUpdateUserProfile();
  const queryClient = useQueryClient();

  const [note, setNote] = useState<string>("");
  const initialNotes = advertiser?.note || "";

  useEffect(() => {
    if (advertiser?.note) {
      setNote(advertiser.note);
    }
  }, [advertiser?.note]);

  const updateAccountStatus = (value: string) => {
    if (!profileId) return;
    updateUserProfile(
      { userId: profileId, data: { status: value } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: ["user", profileId],
          });
          queryClient.invalidateQueries({
            queryKey: ["users"],
          });
          toast.success("Account status updated successfully");
        },
      },
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-2xl w-full overflow-auto">
        <SheetHeader className="sticky top-0 bg-background">
          <div className="flex items-center justify-between">
            <SheetTitle>User Details</SheetTitle>
            <SheetClose>
              <XIcon size={24} />
            </SheetClose>
          </div>
        </SheetHeader>

        {/* Content */}

        {/* Loading */}
        {isLoading && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-32 mt-2" />
              </div>
              <Skeleton className="h-10 w-24" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>

            <Skeleton className="h-48 w-full" />
          </div>
        )}

        {/* Error */}
        {isError && (
          <Card className="p-4 flex items-center gap-3 text-destructive">
            <AlertCircle />
            <div>
              <div className="font-medium">Failed to load user</div>
              <div className="text-sm text-muted-foreground">
                {error.message}
              </div>
            </div>
          </Card>
        )}

        {/* No data */}
        {!isLoading && !isError && !data && (
          <Card className="p-4 text-muted-foreground text-center">
            No user selected
          </Card>
        )}

        {/* Data */}
        {!isLoading && !isError && data && (
          <div className="space-y-4 p-4">
            {/* Header card */}
            <div className="text-end">
              {isUpdatingAdvertiser || isPending ? (
                <Loader2 className="animate-spin inline" />
              ) : null}
            </div>
            <div className="">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className=" gap-3">
                    <div>
                      <div className="text-lg font-semibold">
                        {clientCode}: {data.full_name || "—"}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {data.email || "—"}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 text-sm text-muted-foreground space-y-1">
                    <div>
                      <span className="font-medium text-foreground">
                        Created:{" "}
                      </span>
                      {data.created_at
                        ? dayjs(data.created_at).format(DATE_TIME_FORMAT)
                        : "—"}
                    </div>
                    <div>
                      <span className="font-medium text-foreground">
                        Updated:{" "}
                      </span>
                      {data.updated_at
                        ? dayjs(data.updated_at).format(DATE_TIME_FORMAT)
                        : "—"}
                    </div>
                    <div>
                      <span className="font-medium text-foreground">
                        Referred By:{" "}
                      </span>
                      {data.referral_status === "referred"
                        ? data.referred_by || "—"
                        : "Not Referred"}
                    </div>
                  </div>
                </div>
              </div>
              <Separator className="mt-4" />
              <div className="pt-4 gap-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-muted-foreground">
                    Status:
                  </span>{" "}
                  <Select
                    value={data.status}
                    onValueChange={updateAccountStatus}
                  >
                    <SelectTrigger className="capitalize" size="sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <Card className="p-4">
              <h3 className="font-semibold">Company Details</h3>
              {company ? (
                <div className="mt-2 grid sm:grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="font-medium text-muted-foreground">
                      Name:
                    </span>{" "}
                    {company.name || "—"}
                  </div>
                  <div>
                    <span className="font-medium text-muted-foreground">
                      Official Email:
                    </span>{" "}
                    {company.official_email || "—"}
                  </div>
                  <div>
                    <span className="font-medium text-muted-foreground">
                      Phone:
                    </span>{" "}
                    {company.phone || "—"}
                  </div>
                  <div>
                    <span className="font-medium text-muted-foreground">
                      Website:
                    </span>{" "}
                    {company.website_url || "—"}
                  </div>
                  <div>
                    <span className="font-medium text-muted-foreground">
                      VAT No:
                    </span>{" "}
                    {company.is_not_vat ? "Not Applicable" : company.vat_no || "—"}
                  </div>
                  <div>
                    <span className="font-medium text-muted-foreground">
                      Registration No:
                    </span>{" "}
                    {company.registration_no || "—"}
                  </div>
                  <div className="sm:col-span-2">
                    <span className="font-medium text-muted-foreground">
                      Address:
                    </span>{" "}
                    {company.address || "—"}
                  </div>
                  <div>
                    <span className="font-medium text-muted-foreground">
                      Country:
                    </span>{" "}
                    {company.country || "—"}
                  </div>
                  <div>
                    <span className="font-medium text-muted-foreground">
                      State:
                    </span>{" "}
                    {company.state || "—"}
                  </div>
                  <div>
                    <span className="font-medium text-muted-foreground">
                      Zip Code:
                    </span>{" "}
                    {company.zipcode || "—"}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground mt-2">
                  No company details found.
                </p>
              )}
            </Card>

            {advertiser ? (
              <>
                <UserAccounts advertiserId={advertiser.id} />
                <UserSubscriptionDetails
                  subscriptions={advertiser.subscriptions}
                />
                <UserWalletTopups walletTopups={advertiser.wallet_topups} />
                <UserAffiliates
                  advertiser={advertiser}
                  userName={data.full_name}
                />
              </>
            ) : null}

            <div className="space-y-4">
              <label htmlFor="notes" className="mb-2 block font-medium">
                Notes
              </label>
              <Textarea
                id="notes"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Enter notes here..."
                rows={4}
              />
              <div className="text-end">
                {note !== initialNotes && (
                  <Button
                    onClick={() => {
                      if (!advertiser) return;
                      updateAdvertiser(
                        { id: advertiser.id, payload: { note } },
                        {
                          onSuccess: () => {
                            queryClient.invalidateQueries({
                              queryKey: ["user", profileId],
                            });
                            toast.success("Notes updated successfully");
                          },
                        },
                      );
                    }}
                    disabled={isUpdatingAdvertiser}
                  >
                    {isUpdatingAdvertiser ? (
                      <Loader2 className="animate-spin mr-2" size={16} />
                    ) : null}
                    Save Changes
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
