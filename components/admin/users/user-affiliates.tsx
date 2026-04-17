"use client";

import SelectField from "@/components/form/select-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAppContext } from "@/context/app-provider";
import { COMMISSION_TYPE_LABELS, DATE_TIME_FORMAT } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import { Advertiser } from "@/lib/types/advertiser";
import { Commission } from "@/lib/types/commission";
import { formatCurrency } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { ExternalLink, Loader2, UserPlus } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import {
  getCommissionFieldVisibility,
  normalizeCommissionType,
} from "./commission-setup-utils";

const EMPTY_VALUE = "N/A";

type ReferralLinkDetails = {
  id: string;
  created_at: string;
  tenant_id: string;
  referred_advertiser_id: string;
  affiliate_advertiser_id: string;
  advertiser_user_id: string | null;
  affiliate_user_id: string | null;
  commission_currency: string | null;
  commission_monthly: number | null;
  commission_pct: number | null;
  commission_onetime: number | null;
  commission_type: string | null;
  affiliate_advertiser_email: string | null;
  affiliate_advertiser_name: string | null;
  affiliate_advertiser_tenant_client_code: string | null;
  referred_advertiser_email: string | null;
  referred_advertiser_name: string | null;
  referred_advertiser_tenant_client_code: string | null;
};

type AdvertiserProfile = {
  full_name: string | null;
  email: string | null;
  status: string | null;
};

type AdvertiserOption = Pick<
  Advertiser,
  | "id"
  | "tenant_id"
  | "user_id"
  | "tenant_client_code"
  | "commission_type"
  | "commission_monthly"
  | "commission_onetime"
  | "commission_pct"
  | "commission_currency"
> & {
  profile: AdvertiserProfile | AdvertiserProfile[] | null;
};

const assignAffiliateSchema = z.object({
  affiliateAdvertiserId: z.string().min(1, "Advertiser is required"),
});

type AssignAffiliateValues = z.infer<typeof assignAffiliateSchema>;

export default function UserAffiliates({
  advertiser,
  userName,
}: {
  advertiser: Advertiser;
  userName?: string | null;
}) {
  const { profile } = useAppContext();
  const isAdmin = profile?.role === "admin";

  const displayUserName = userName?.trim() || "this user";

  const referralLinkQuery = useQuery({
    queryKey: ["admin-user-referral-link", advertiser.id],
    enabled: isAdmin,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("referral_links_with_details")
        .select("*")
        .eq("referred_advertiser_id", advertiser.id)
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return (data ?? null) as ReferralLinkDetails | null;
    },
  });

  const referralLink = referralLinkQuery.data;

  const advertisersQuery = useQuery({
    queryKey: ["admin-affiliate-advertisers", advertiser.tenant_id],
    enabled: isAdmin,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("advertisers")
        .select(
          "id, tenant_id, user_id, tenant_client_code, commission_type, commission_monthly, commission_onetime, commission_pct, commission_currency, profile:user_profiles(full_name, email, status)",
        )
        .eq("tenant_id", advertiser.tenant_id)
        .order("tenant_client_code", { ascending: true });

      if (error) throw error;
      return (data ?? []) as AdvertiserOption[];
    },
  });

  const commissionsQuery = useQuery({
    queryKey: ["admin-user-referral-commissions", referralLink?.id],
    enabled: isAdmin && !!referralLink?.id,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("referral_commissions_with_details")
        .select("*")
        .eq("referral_link_id", referralLink!.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data ?? []) as Commission[];
    },
  });

  if (!isAdmin) {
    return null;
  }

  const availableAffiliates = (advertisersQuery.data ?? []).filter(
    (item) => item.id !== advertiser.id,
  );

  return (
    <section className="space-y-4">
      <div className="space-y-4">
        {referralLinkQuery.isLoading ? (
          <SectionLoader label="Loading affiliate assignment" />
        ) : referralLinkQuery.isError ? (
          <SectionMessage tone="destructive">
            {(referralLinkQuery.error as Error).message}
          </SectionMessage>
        ) : referralLink ? (
          <>
            <AssignedAffiliateCard referralLink={referralLink} />
            <ReferralCommissionsTable
              commissions={commissionsQuery.data ?? []}
              isLoading={commissionsQuery.isLoading}
              isError={commissionsQuery.isError}
              error={commissionsQuery.error as Error | null}
            />
          </>
        ) : (
          <EmptyAffiliateState
            userName={displayUserName}
            hasAffiliates={availableAffiliates.length > 0}
            isLoadingOptions={advertisersQuery.isLoading}
          />
        )}
        {!referralLink ? (
          <div className="shrink-0">
            <AssignAffiliateDialog
              advertiser={advertiser}
              userName={displayUserName}
              availableAffiliates={availableAffiliates}
              isLoadingOptions={advertisersQuery.isLoading}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}

function AssignAffiliateDialog({
  advertiser,
  userName,
  availableAffiliates,
  isLoadingOptions,
}: {
  advertiser: Advertiser;
  userName: string;
  availableAffiliates: AdvertiserOption[];
  isLoadingOptions: boolean;
}) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const form = useForm<AssignAffiliateValues>({
    defaultValues: {
      affiliateAdvertiserId: "",
    },
    resolver: zodResolver(assignAffiliateSchema),
  });

  const selectedAffiliateAdvertiser = availableAffiliates.find(
    (item) => item.id === form.watch("affiliateAdvertiserId"),
  );
  const selectedProfile = getAdvertiserProfile(
    selectedAffiliateAdvertiser?.profile,
  );

  const { mutate: assignAffiliate, isPending } = useMutation({
    mutationKey: ["assign-affiliate-to-advertiser", advertiser.id],
    mutationFn: async (values: AssignAffiliateValues) => {
      const selectedAdvertiser = availableAffiliates.find(
        (item) => item.id === values.affiliateAdvertiserId,
      );

      if (!selectedAdvertiser) {
        throw new Error("Selected advertiser could not be found.");
      }

      const supabase = createClient();
      const { data: existingLink, error: existingLinkError } = await supabase
        .from("referral_links")
        .select("id")
        .eq("referred_advertiser_id", advertiser.id)
        .limit(1)
        .maybeSingle();

      if (existingLinkError) throw existingLinkError;

      if (existingLink?.id) {
        throw new Error("An affiliate is already assigned to this advertiser.");
      }

      const payload = {
        tenant_id: advertiser.tenant_id,
        referred_advertiser_id: advertiser.id,
        affiliate_advertiser_id: selectedAdvertiser.id,
        commission_monthly: selectedAdvertiser.commission_monthly ?? null,
        commission_pct: selectedAdvertiser.commission_pct ?? null,
        commission_onetime: selectedAdvertiser.commission_onetime ?? null,
        commission_type: selectedAdvertiser.commission_type ?? null,
        commission_currency: selectedAdvertiser.commission_currency ?? null,
        advertiser_user_id: advertiser.user_id,
        affiliate_user_id: selectedAdvertiser.user_id,
      };

      const { error } = await supabase.from("referral_links").insert(payload);
      if (error) throw error;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["admin-user-referral-link", advertiser.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ["referral-links-with-details"],
        }),
      ]);
      toast.success("Affiliate assigned successfully.");
      form.reset();
      setOpen(false);
    },
    onError: (error) => {
      toast.error("Failed to assign affiliate.", {
        description: error.message,
      });
    },
  });

  const options = availableAffiliates.map((item) => {
    const advertiserProfile = getAdvertiserProfile(item.profile);
    return {
      value: item.id,
      label: (
        <span className="inline-flex w-full items-center justify-between gap-2">
          <span className="font-medium">{item.tenant_client_code}</span>
          <span className="truncate text-muted-foreground">
            {advertiserProfile?.full_name || EMPTY_VALUE}
          </span>
        </span>
      ),
    };
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          form.reset();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          disabled={isLoadingOptions || isPending || options.length === 0}
        >
          {isLoadingOptions ? (
            <Loader2 className="animate-spin" />
          ) : (
            <UserPlus />
          )}
          Assign Affiliate to {userName}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Assign Affiliate to {userName}</DialogTitle>
          <DialogDescription>
            Select an advertiser. The commission setup shown below is copied
            from that advertiser into the new referral link.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-5"
          onSubmit={form.handleSubmit((values) => assignAffiliate(values))}
        >
          <SelectField
            control={form.control}
            id="affiliate-advertiser-select"
            label="Affiliate Advertiser"
            name="affiliateAdvertiserId"
            options={options}
            placeholder={
              isLoadingOptions
                ? "Loading advertisers..."
                : options.length
                  ? "Select advertiser"
                  : "No advertisers available"
            }
            disabled={isLoadingOptions || options.length === 0 || isPending}
          />

          <div className="space-y-4 border-t pt-4">
            <div>
              <h4 className="font-semibold">Commission Setup</h4>
              <p className="text-sm text-muted-foreground">
                Only fields enabled by the selected advertiser&apos;s commission
                type are shown here.
              </p>
            </div>

            {selectedAffiliateAdvertiser ? (
              <div className="space-y-4">
                <div className="text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">
                      {selectedProfile?.full_name || EMPTY_VALUE}
                    </span>
                    <Badge variant="outline">
                      {selectedAffiliateAdvertiser.tenant_client_code}
                    </Badge>
                    {selectedProfile?.status ? (
                      <Badge variant="secondary" className="capitalize">
                        {selectedProfile.status}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {selectedProfile?.email || EMPTY_VALUE}
                  </p>
                </div>
                <CommissionSummary
                  commissionType={selectedAffiliateAdvertiser.commission_type}
                  commissionCurrency={
                    selectedAffiliateAdvertiser.commission_currency
                  }
                  commissionMonthly={
                    selectedAffiliateAdvertiser.commission_monthly
                  }
                  commissionOnetime={
                    selectedAffiliateAdvertiser.commission_onetime
                  }
                  commissionPct={selectedAffiliateAdvertiser.commission_pct}
                />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Select an advertiser to preview the commission setup that will
                be assigned.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="submit"
              disabled={isPending || isLoadingOptions || options.length === 0}
            >
              {isPending ? <Loader2 className="animate-spin" /> : null}
              Create Referral Link
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AssignedAffiliateCard({
  referralLink,
}: {
  referralLink: ReferralLinkDetails;
}) {
  return (
    <div className="space-y-4 border-t pt-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Assigned Affiliate
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h3 className="text-xl font-semibold">
              {referralLink.affiliate_advertiser_name || EMPTY_VALUE}
            </h3>
            <Badge variant="outline">
              {referralLink.affiliate_advertiser_tenant_client_code ||
                EMPTY_VALUE}
            </Badge>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {referralLink.affiliate_advertiser_email || EMPTY_VALUE}
          </p>
        </div>
        <div className="text-sm text-muted-foreground">
          Assigned on{" "}
          {referralLink.created_at
            ? dayjs(referralLink.created_at).format(DATE_TIME_FORMAT)
            : EMPTY_VALUE}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.25fr,1fr]">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <ExternalLink className="size-4 text-muted-foreground" />
            <h4 className="font-semibold">Referral Link Details</h4>
          </div>
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <DetailItem
              label="Referred Advertiser"
              value={referralLink.referred_advertiser_name || EMPTY_VALUE}
            />
            <DetailItem
              label="Referred Client Code"
              value={
                referralLink.referred_advertiser_tenant_client_code ||
                EMPTY_VALUE
              }
            />
            <DetailItem
              label="Affiliate Advertiser"
              value={referralLink.affiliate_advertiser_name || EMPTY_VALUE}
            />
            <DetailItem
              label="Affiliate Email"
              value={referralLink.affiliate_advertiser_email || EMPTY_VALUE}
            />
          </div>
        </div>

        <div className="space-y-3">
          <h4 className="font-semibold">Commission Setup</h4>
          <CommissionSummary
            commissionType={referralLink.commission_type}
            commissionCurrency={referralLink.commission_currency}
            commissionMonthly={referralLink.commission_monthly}
            commissionOnetime={referralLink.commission_onetime}
            commissionPct={referralLink.commission_pct}
          />
        </div>
      </div>
    </div>
  );
}

function ReferralCommissionsTable({
  commissions,
  isLoading,
  isError,
  error,
}: {
  commissions: Commission[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
}) {
  return (
    <div className="space-y-3 border-t pt-4">
      <div>
        <h4 className="font-semibold">Commissions Paid</h4>
        <p className="text-sm text-muted-foreground">
          Payments already recorded for this assigned affiliate.
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader className="bg-muted/30">
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={3}>
                  <SectionLoader label="Loading commissions" compact />
                </TableCell>
              </TableRow>
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={3} className="text-destructive">
                  {error?.message || "Failed to load commissions."}
                </TableCell>
              </TableRow>
            ) : commissions.length ? (
              commissions.map((commission) => (
                <TableRow key={commission.id}>
                  <TableCell className="capitalize">
                    {formatReadableType(commission.type)}
                  </TableCell>
                  <TableCell>
                    {formatAmountWithCurrency(
                      commission.amount,
                      commission.currency,
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">
                      {commission.status || EMPTY_VALUE}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={3}
                  className="text-center text-muted-foreground"
                >
                  No commissions yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function CommissionSummary({
  commissionType,
  commissionCurrency,
  commissionMonthly,
  commissionOnetime,
  commissionPct,
}: {
  commissionType?: string | null;
  commissionCurrency?: string | null;
  commissionMonthly?: number | null;
  commissionOnetime?: number | null;
  commissionPct?: number | null;
}) {
  const { showCurrency, showMonthly, showOnetime, showPct } =
    getCommissionFieldVisibility(commissionType);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <DetailItem
        label="Commission Type"
        value={getCommissionTypeLabel(commissionType)}
      />
      {showCurrency ? (
        <DetailItem
          label="Commission Currency"
          value={commissionCurrency || EMPTY_VALUE}
        />
      ) : null}
      {showMonthly ? (
        <DetailItem
          label="Commission Monthly"
          value={formatAmountWithCurrency(
            commissionMonthly,
            commissionCurrency,
          )}
        />
      ) : null}
      {showOnetime ? (
        <DetailItem
          label="Commission One Time"
          value={formatAmountWithCurrency(
            commissionOnetime,
            commissionCurrency,
          )}
        />
      ) : null}
      {showPct ? (
        <DetailItem
          label="Commission Percent"
          value={formatPercent(commissionPct)}
        />
      ) : null}
      {!showCurrency && !showMonthly && !showOnetime && !showPct ? (
        <p className="text-sm text-muted-foreground sm:col-span-2">
          No commission fields are enabled for this advertiser.
        </p>
      ) : null}
    </div>
  );
}

function EmptyAffiliateState({
  userName,
  hasAffiliates,
  isLoadingOptions,
}: {
  userName: string;
  hasAffiliates: boolean;
  isLoadingOptions: boolean;
}) {
  return (
    <div className="border-t pt-4">
      <h3 className="font-semibold">Assign Affiliate to {userName}</h3>
      {!isLoadingOptions && !hasAffiliates ? (
        <p className=" text-sm text-muted-foreground">
          No other advertisers are available to assign as the affiliate.
        </p>
      ) : null}
    </div>
  );
}

function SectionLoader({
  label,
  compact = false,
}: {
  label: string;
  compact?: boolean;
}) {
  return (
    <div
      className={
        compact
          ? "flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground"
          : "flex items-center gap-2 border-t py-4 text-sm text-muted-foreground"
      }
    >
      <Loader2 className="size-4 animate-spin" />
      <span>{label}</span>
    </div>
  );
}

function SectionMessage({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "destructive";
}) {
  return (
    <div
      className={
        tone === "destructive"
          ? "border-t py-4 text-sm text-destructive"
          : "border-t py-4 text-sm"
      }
    >
      {children}
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}

function getAdvertiserProfile(
  profile: AdvertiserProfile | AdvertiserProfile[] | null | undefined,
) {
  if (Array.isArray(profile)) {
    return profile[0] ?? null;
  }

  return profile ?? null;
}

function getCommissionTypeLabel(type?: string | null) {
  const normalizedType = normalizeCommissionType(type);

  if (normalizedType === "none") {
    return "None";
  }

  return COMMISSION_TYPE_LABELS[normalizedType] || normalizedType;
}

function formatAmountWithCurrency(
  amount?: number | null,
  currency?: string | null,
) {
  if (amount === null || amount === undefined || Number.isNaN(amount)) {
    return EMPTY_VALUE;
  }

  if (!currency) {
    return String(amount);
  }

  try {
    return formatCurrency(amount, currency);
  } catch {
    return `${currency} ${amount}`;
  }
}

function formatPercent(value?: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return EMPTY_VALUE;
  }

  return `${value}%`;
}

function formatReadableType(value: string) {
  switch (value) {
    case "onetime":
      return "One Time";
    case "monthly":
      return "Monthly";
    default:
      return value
        .replaceAll("_", " ")
        .replace(/\b\w/g, (char) => char.toUpperCase());
  }
}
