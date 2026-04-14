"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { DATE_TIME_FORMAT } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import { AdAccountRequest } from "@/lib/types/ad-account-request";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { AlertCircle, Loader2, XIcon } from "lucide-react";

function getStatusClassName(status: string | null) {
  if (!status) return "border-slate-300 text-slate-700";

  switch (status.toLowerCase()) {
    case "approved":
    case "completed":
      return "border-green-200 text-green-700";
    case "rejected":
    case "failed":
      return "border-red-200 text-red-700";
    case "pending":
    default:
      return "border-amber-200 text-amber-700";
  }
}

function formatMetadataKey(key: string) {
  return key
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatMetadataValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export default function AdAccountRequestDetailsSheet({
  requestId,
  open,
  onOpenChange,
}: {
  requestId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data, isLoading, isError, error } = useQuery<AdAccountRequest | null>(
    {
      queryKey: ["ad-account-request-details", requestId],
      enabled: !!requestId && open,
      queryFn: async () => {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("ad_account_requests")
          .select(
            "*, advertiser:advertisers(id, tenant_client_code, profile:user_profiles(full_name, email))",
          )
          .eq("id", requestId)
          .maybeSingle();

        if (error) throw error;
        return (data as AdAccountRequest | null) ?? null;
      },
    },
  );

  const metadata = (data?.metadata as Record<string, unknown> | null) ?? null;
  const metadataEntries = metadata ? Object.entries(metadata) : [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-xl w-full overflow-auto">
        <SheetHeader className="sticky top-0 bg-background border-b">
          <div className="flex items-center justify-between">
            <SheetTitle>Ad Account Request</SheetTitle>
            <SheetClose>
              <XIcon size={24} />
            </SheetClose>
          </div>
        </SheetHeader>

        {isLoading && (
          <div className="flex items-center justify-center min-h-[400px]">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {isError && (
          <div className="mt-4 flex items-center gap-2 text-destructive">
            <AlertCircle className="h-4 w-4" />
            <span>
              {(error as Error)?.message ?? "Failed to load request."}
            </span>
          </div>
        )}

        {data && (
          <div className="space-y-4 p-4 text-sm">
            <Card className="p-4 gap-2">
              <h3 className="font-semibold mb-2">Request Overview</h3>
              <DetailRow label="Email" value={data.email || "-"} />
              <DetailRow label="Platform" value={data.platform || "-"} />
              <DetailRow
                label="Currency"
                value={(data.currency || "-").toUpperCase()}
              />
              <DetailRow label="Timezone" value={data.timezone || "-"} />
              <DetailRow
                label="Status"
                value={
                  <Badge
                    variant="outline"
                    className={`capitalize ${getStatusClassName(data.status)}`}
                  >
                    {data.status || "unknown"}
                  </Badge>
                }
              />
              <DetailRow
                label="Requested At"
                value={
                  data.created_at
                    ? dayjs(data.created_at).format(DATE_TIME_FORMAT)
                    : "-"
                }
              />
              <DetailRow
                label="Website URL"
                value={
                  data.website_url ? (
                    <a
                      href={data.website_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary underline break-all"
                    >
                      {data.website_url}
                    </a>
                  ) : (
                    "-"
                  )
                }
              />
              <DetailRow label="Notes" value={data.notes || "-"} />
              {data.rejection_reason && (
                <DetailRow
                  label="Rejection Reason"
                  value={data.rejection_reason}
                />
              )}
            </Card>

            <Card className="p-4 gap-1">
              <h3 className="font-semibold mb-2">Advertiser</h3>
              <p>{`${data.advertiser?.tenant_client_code}: ${data.advertiser?.profile?.full_name}`}</p>
              <span className="text-muted-foreground">
                {data.advertiser?.profile?.email || "-"}
              </span>
            </Card>

            <Card className="p-4 gap-2">
              <h3 className="font-semibold mb-2">Platform Details</h3>
              {metadataEntries.length ? (
                metadataEntries.map(([key, value]) => (
                  <DetailRow
                    key={key}
                    label={formatMetadataKey(key)}
                    value={formatMetadataValue(value)}
                  />
                ))
              ) : (
                <p className="text-muted-foreground">No metadata provided.</p>
              )}
            </Card>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground">{label}</span>
      <div className="font-medium wrap-break-words">{value}</div>
    </div>
  );
}
