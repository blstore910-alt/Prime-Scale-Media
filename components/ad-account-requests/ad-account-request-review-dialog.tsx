"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DATE_TIME_FORMAT } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import { AdAccountRequest } from "@/lib/types/ad-account-request";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { AlertCircle, Loader2, PlusCircle, XCircle } from "lucide-react";

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

export default function AdAccountRequestReviewDialog({
  requestId,
  open,
  onOpenChange,
  onCreateInvoice,
  onCreateAdAccount,
  onReject,
}: {
  requestId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateInvoice: (request: AdAccountRequest) => void;
  onCreateAdAccount: (request: AdAccountRequest) => void;
  onReject: (request: AdAccountRequest) => void;
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

  const statusValue = (data?.status || "").toLowerCase();
  const metadata = (data?.metadata as Record<string, unknown> | null) ?? null;
  const metadataEntries = metadata ? Object.entries(metadata) : [];
  const hasAdvertiser = Boolean(data?.advertiser_id);
  // ── THEY MAY HAVE PAID ALREADY ──────────────────────────────────────
  //
  // A self-service request debits the 50 EUR from the wallet at
  // CREATION and stamps metadata.request_fee. The desk then saw a
  // `pending` row and an enabled "Create Invoice", raised a second 50
  // EUR as an ad_account_fee invoice, and the customer's billing table
  // renders that with a live Pay now — so 50 EUR service, 100 EUR taken,
  // and the rejection refund can only ever give back the first one.
  //
  // The only sign it had already been paid was `request_fee: 50` in the
  // dialog's raw metadata dump.
  // ── FREE IS NOT "NOT YET CHARGED" ──────────────────────────────────
  //
  // `request_fee > 0` catches a request whose fee was taken from the
  // wallet. It does NOT catch the one that must never be invoiced at
  // all: when the customer's plan covers this account, or a perk grants
  // it, the RPC sets v_fee := 0 and stamps request_fee: 0 with
  // request_fee_included: true. So `feeAlreadyTaken` was false for
  // exactly the requests that are free, Create Invoice stayed live, and
  // the "Fee already paid from their wallet" note was suppressed -- the
  // only signal left on screen was `Request Fee Included: true` in the
  // raw metadata dump at the bottom.
  //
  // An admin then raises EUR 50 for an account the plan includes, the
  // customer's billing page renders it with a live Pay now, and
  // rejecting the request refunds EUR 0 because nothing was ever taken.
  const feeAlreadyTaken = Number(metadata?.request_fee ?? 0) > 0;
  const feeIncludedInPlan =
    metadata?.request_fee_included === true ||
    String(metadata?.request_fee_included ?? "").toLowerCase() === "true";
  const showCreateInvoice =
    statusValue === "pending" && !feeAlreadyTaken && !feeIncludedInPlan;
  const showCreateAdAccount =
    statusValue === "pending" ||
    statusValue === "payment_pending" ||
    statusValue === "in_progress" ||
    statusValue === "payment_successful";
  const canReject =
    !!data && !["completed", "approved", "rejected"].includes(statusValue);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] w-[calc(100vw-1rem)] mx-auto flex-col overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Review Ad Account Request</DialogTitle>
          <DialogDescription>
            Review the request details and choose the next action.
          </DialogDescription>
        </DialogHeader>

        {/* flex-1 min-h-0, NOT min-h-[360px].
            This was a flex child that refused to shrink below 360px, in an
            overflow-hidden dialog, above a footer with no shrink-0. On a
            phone the footer holds a sentence plus Reject, Create Invoice
            and Create Ad Account, stacked full-width by DialogFooter — about
            180px. Header 90 + body 360 + footer 180 + padding is past 90dvh
            on a 390px screen, and because the parent is overflow-hidden the
            excess is CUT OFF rather than scrollable: Reject was gone, with
            no gesture that could reach it. The loading and not-found states
            keep their own min-height, which is what that 360 was for. */}
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {isLoading && (
            <div className="flex min-h-[360px] items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {isError && (
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-4 w-4" />
              <span>
                {(error as Error)?.message ?? "Failed to load request."}
              </span>
            </div>
          )}

          {!isLoading && !isError && !data && (
            <div className="flex min-h-[360px] items-center justify-center text-sm text-muted-foreground">
              Request not found.
            </div>
          )}

          {data && (
            <div className="space-y-4 text-sm">
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
                      {data.status?.split("_").join(" ") || "unknown"}
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
                {data.advertiser ? (
                  <>
                    <p>{`${data.advertiser.tenant_client_code || "-"}: ${
                      data.advertiser.profile?.full_name || "-"
                    }`}</p>
                    <span className="text-muted-foreground">
                      {data.advertiser.profile?.email || "-"}
                    </span>
                  </>
                ) : (
                  <p className="text-muted-foreground">
                    No advertiser attached.
                  </p>
                )}
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
                  <p className="text-muted-foreground">
                    No metadata provided.
                  </p>
                )}
              </Card>
            </div>
          )}
        </div>

        {data && (
          <DialogFooter className="shrink-0 gap-2 sm:gap-2 sm:space-x-0">
            {!hasAdvertiser && (showCreateInvoice || showCreateAdAccount) && (
              <p className="mr-auto self-center text-xs text-muted-foreground">
                Create actions are unavailable until an advertiser is attached.
              </p>
            )}
            {canReject && (
              <Button variant="outline" onClick={() => onReject(data)}>
                <XCircle className="mr-2 h-4 w-4" />
                Reject
              </Button>
            )}
            {/* Say it, rather than leaving a gap where a button was. An
                operator who finds no Create Invoice needs to know the
                fee is already in, not wonder whether the screen is
                broken. */}
            {feeAlreadyTaken && statusValue === "pending" ? (
              <span className="self-center text-sm text-muted-foreground">
                Fee already paid from their wallet
              </span>
            ) : null}
            {/* Said out loud, in the place the Create Invoice button
                used to be. Without it the admin sees a pending request
                with one button missing and no reason given, and the
                only clue is a raw column name further down. */}
            {feeIncludedInPlan && statusValue === "pending" ? (
              <span className="self-center text-sm text-muted-foreground">
                Included in their plan — no fee to invoice
              </span>
            ) : null}
            {showCreateInvoice && (
              <Button
                variant="outline"
                disabled={!hasAdvertiser}
                onClick={() => onCreateInvoice(data)}
              >
                <PlusCircle className="mr-2 h-4 w-4" />
                Create Invoice
              </Button>
            )}
            {showCreateAdAccount && (
              <Button
                disabled={!hasAdvertiser}
                onClick={() => onCreateAdAccount(data)}
              >
                <PlusCircle className="mr-2 h-4 w-4" />
                Create Ad Account
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
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
