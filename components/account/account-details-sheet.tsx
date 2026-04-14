"use client";

import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CURRENCY_SYMBOLS,
  DATE_FORMAT,
  DATE_TIME_FORMAT,
  PLATFORMS,
} from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import { AdAccount } from "@/lib/types/account";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { AlertCircle, CheckCircle2, Loader2, XIcon } from "lucide-react";

import { toast } from "sonner";
import { Badge } from "../ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Separator } from "../ui/separator";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "../ui/sheet";
import useUpdateAccount from "./use-update-account";

export function AccountDetailsSheet({
  accountId,
  open,
  setOpen,
}: {
  open: boolean;
  setOpen: () => void;
  accountId: string | null;
}) {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["account-details", accountId],
    enabled: !!accountId,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("ad_accounts")
        .select("*, advertiser:advertisers(*, profile:user_profiles(*))")
        .eq("id", accountId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { updateAccount, isPending } = useUpdateAccount();

  const updateAccountStatus = (value: string) => {
    if (!accountId) return;
    updateAccount(
      { id: accountId, payload: { status: value } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: ["account-details", accountId],
          });
          toast.success("Account status updated successfully");
        },
      },
    );
  };

  return (
    <div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="sm:max-w-xl w-full overflow-auto">
          <SheetHeader className="sticky top-0 bg-background">
            <div className="flex items-center justify-between">
              <SheetTitle>Account Details</SheetTitle>
              <SheetClose>
                <XIcon size={24} />
              </SheetClose>
            </div>
          </SheetHeader>

          {/* Loading state */}
          {isLoading && (
            <p className="mt-4 text-sm text-muted-foreground">Loading...</p>
          )}

          {/* Error state */}
          {isError && (
            <div className="mt-4 flex items-center gap-2 text-destructive">
              <AlertCircle className="h-4 w-4" />
              <span>{error.message}</span>
            </div>
          )}
          {data && (
            <div className=" sm:space-y-6 space-y-3 px-2">
              <div className="text-end">
                {isPending && <Loader2 className="animate-spin inline" />}
              </div>
              {/* --- Account Overview --- */}
              <Card className="p-4 sm:gap-6 gap-3">
                <h3 className=" font-semibold">Account Overview</h3>
                <div className="grid sm:grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium text-muted-foreground block">
                      Name:
                    </span>
                    {data.name}
                  </div>

                  <div>
                    <span className="font-medium text-muted-foreground block">
                      Created At:
                    </span>
                    {dayjs(data.start_date).format(DATE_TIME_FORMAT)}
                  </div>
                  <div>
                    <span className="font-medium text-muted-foreground block">
                      Fee:
                    </span>
                    {data.fee}%
                  </div>
                  <div>
                    <span className="font-medium text-muted-foreground block">
                      Website URL:
                    </span>
                    {data.website_url ? (
                      <a
                        href={data.website_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline truncate block"
                      >
                        {data.website_url}
                      </a>
                    ) : (
                      "—"
                    )}
                  </div>
                  <div>
                    <span className="font-medium text-muted-foreground block">
                      Timezone:
                    </span>
                    {data.timezone || "—"}
                  </div>
                </div>

                {data.notes && (
                  <div className="mt-2 text-sm">
                    <span className="font-medium text-muted-foreground block">
                      Notes:
                    </span>
                    <p className="whitespace-pre-wrap text-muted-foreground/90">
                      {data.notes}
                    </p>
                  </div>
                )}

                {/* Metadata Fields Section */}
                {(data.metadata as Record<string, string | string[]>) &&
                  Object.keys(data.metadata || {}).length > 0 &&
                  (() => {
                    const metadata = data.metadata as Record<
                      string,
                      string | string[]
                    >;
                    return (
                      <>
                        <Separator className="my-2" />
                        <div className="space-y-2">
                          <h4 className="font-medium text-sm">
                            Platform Details
                          </h4>
                          <div>
                            <span className="font-medium text-muted-foreground block">
                              Platform:
                            </span>
                            {PLATFORMS.find((p) => p.value === data.platform)
                              ?.label || "—"}
                          </div>
                          <div className="grid sm:grid-cols-2 gap-4 text-sm">
                            {data.platform === "google" &&
                              metadata.google_email && (
                                <div className="col-span-2">
                                  <span className="font-medium text-muted-foreground block">
                                    Google Email:
                                  </span>
                                  {metadata.google_email}
                                </div>
                              )}

                            {data.platform === "tiktok" && (
                              <>
                                <div>
                                  <span className="font-medium text-muted-foreground block">
                                    Business Center ID:
                                  </span>
                                  {metadata.tiktok_business_center_id || "—"}
                                </div>
                                <div>
                                  <span className="font-medium text-muted-foreground block">
                                    TikTok Email:
                                  </span>
                                  {metadata.tiktok_email || "—"}
                                </div>
                                <div className="col-span-2">
                                  <span className="font-medium text-muted-foreground block">
                                    Countries:
                                  </span>
                                  {Array.isArray(metadata.tiktok_countries)
                                    ? metadata.tiktok_countries.join(", ")
                                    : metadata.tiktok_countries || "—"}
                                </div>
                              </>
                            )}

                            {data.platform?.includes("meta") && (
                              <>
                                <div>
                                  <span className="font-medium text-muted-foreground block">
                                    FB Business Manager ID:
                                  </span>
                                  {metadata.facebook_business_manager_id || "—"}
                                </div>
                                <div className="col-span-2">
                                  <span className="font-medium text-muted-foreground block">
                                    FB Profile Link:
                                  </span>
                                  {metadata.personal_facebook_profile_link ? (
                                    <a
                                      href={
                                        metadata.personal_facebook_profile_link as string
                                      }
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-primary hover:underline truncate block"
                                    >
                                      {metadata.personal_facebook_profile_link}
                                    </a>
                                  ) : (
                                    "—"
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </>
                    );
                  })()}
                <Separator />
                <div className="grid grid-cols-2 gap-2 text-sm">
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
                        <SelectItem value="paused">Paused</SelectItem>
                        <SelectItem value="banned">Banned</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </Card>

              {/* --- Advertiser Information --- */}
              {data.advertiser && (
                <Card className="p-4">
                  <h3 className="font-semibold">Advertiser Information</h3>
                  <div className="grid sm:grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="font-medium text-muted-foreground">
                        Client Code:
                      </span>{" "}
                      {data.advertiser.tenant_client_code || "—"}
                    </div>
                    <div>
                      <span className="font-medium text-muted-foreground">
                        Full Name:
                      </span>{" "}
                      {data.advertiser.profile?.full_name || "—"}
                    </div>
                    <div>
                      <span className="font-medium text-muted-foreground">
                        Email:
                      </span>{" "}
                      {data.advertiser.profile?.email || "—"}
                    </div>
                    <div>
                      <span className="font-medium text-muted-foreground">
                        Active:
                      </span>{" "}
                      {data.advertiser.profile?.is_active ? "Yes" : "No"}
                    </div>
                  </div>
                </Card>
              )}

              <TopupHistory account={data} />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function TopupHistory({ account }: { account: AdAccount }) {
  const { data } = useQuery({
    queryKey: ["top-ups", account.id],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("top_ups")
        .select("*")
        .eq("account_id", account.id);
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="mb-4">
      <div className="flex justify-between items-center mb-3">
        <h3 className=" font-semibold">Top-up History</h3>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Amount Paid</TableHead>
              <TableHead>Topup Amount</TableHead>
              <TableHead>Fee</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!data?.length && (
              <TableRow>
                <TableCell
                  className="text-center text-muted-foreground"
                  colSpan={5}
                >
                  No Topups yet
                </TableCell>
              </TableRow>
            )}
            {data?.map((topup) => (
              <TableRow key={topup.id}>
                <TableCell>
                  {dayjs(topup.created_at).format(DATE_FORMAT)}
                </TableCell>
                <TableCell>
                  {CURRENCY_SYMBOLS[topup.currency]}&nbsp;
                  {topup.amount_received}
                </TableCell>
                <TableCell>
                  {CURRENCY_SYMBOLS["USD"]}&nbsp;
                  {topup.topup_amount}
                </TableCell>
                <TableCell>{topup.fee}%</TableCell>
                <TableCell className="capitalize">
                  <Badge variant={"outline"}>
                    {" "}
                    {topup.status === "completed" && (
                      <CheckCircle2 color="green" />
                    )}
                    {topup.status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
