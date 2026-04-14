"use client";

import { useAppContext } from "@/context/app-provider";
import { AdAccountRequest } from "@/lib/types/ad-account-request";
import { ClipboardList } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import useAdAccountRequests from "./use-ad-account-requests";
import { ScrollArea } from "../ui/scroll-area";

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

function AdvertiserRequestRowCard({ request }: { request: AdAccountRequest }) {
  const metadata = (request.metadata as Record<string, unknown> | null) ?? null;
  const metadataEntries = metadata ? Object.entries(metadata) : [];

  return (
    <Card className="shadow-none p-0">
      <CardContent className="p-3 md:p-4 grid grid-cols-1 md:grid-cols-12 gap-3 items-start">
        <div className="md:col-span-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
            Platform
          </p>
          <p className="text-sm font-medium">{request.platform || "-"}</p>
        </div>

        <div className="md:col-span-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
            Currency
          </p>
          <p className="text-sm font-medium uppercase">
            {request.currency || "-"}
          </p>
        </div>

        <div className="md:col-span-3">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
            Timezone
          </p>
          <p className="text-sm font-medium wrap-break-words">
            {request.timezone || "-"}
          </p>
        </div>

        <div className="md:col-span-5">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
            Website
          </p>
          {request.website_url ? (
            <a
              href={request.website_url}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-medium text-primary underline break-all"
            >
              {request.website_url}
            </a>
          ) : (
            <p className="text-sm font-medium">-</p>
          )}
        </div>

        <div className="md:col-span-12 border-t pt-3">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
            Notes
          </p>
          <p className="text-sm font-medium wrap-break-words">
            {request.notes || "-"}
          </p>
        </div>

        <div className="md:col-span-12 border-t pt-3">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-2">
            Platform Details
          </p>
          {metadataEntries.length ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {metadataEntries.map(([key, value]) => (
                <div key={key} className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">
                    {formatMetadataKey(key)}
                  </span>
                  <span className="text-sm font-medium wrap-break-words">
                    {formatMetadataValue(value)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm font-medium">-</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdvertiserAdAccountRequestsDialog({
  children,
}: {
  children?: React.ReactNode;
}) {
  const { profile } = useAppContext();
  const [open, setOpen] = useState(false);

  const advertiserId = profile?.advertiser?.[0]?.id;
  const requesterEmail = profile?.email;
  const tenantId = profile?.tenant_id;

  const { requests, isLoading, isError, error } = useAdAccountRequests({
    advertiserId,
    requesterEmail,
    tenantId,
    sort: "newest",
    page: 1,
    perPage: 100,
    enabled: open && !!profile,
  });

  const sortedRequests = useMemo(
    () =>
      [...requests].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
    [requests],
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children || (
          <Button variant="outline">
            <ClipboardList className="mr-2 h-4 w-4" />
            View Requests
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-5xl max-h-[85vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>My Ad Account Requests</DialogTitle>
          <DialogDescription>
            Review the request details you submitted.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-11/12">
          <div className="overflow-y-auto pr-1 space-y-3">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, idx) => (
                <div
                  key={idx}
                  className="h-24 bg-muted/50 rounded-lg animate-pulse"
                />
              ))
            ) : isError ? (
              <div className="text-destructive text-sm py-4">
                {(error as Error)?.message ?? "Failed to load requests."}
              </div>
            ) : sortedRequests.length ? (
              sortedRequests.map((request) => (
                <AdvertiserRequestRowCard key={request.id} request={request} />
              ))
            ) : (
              <div className="text-sm text-muted-foreground py-8 text-center border border-dashed rounded-lg">
                No ad account requests found.
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
