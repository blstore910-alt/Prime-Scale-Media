"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAppContext } from "@/context/app-provider";
import { CURRENCY_SYMBOLS, PLATFORMS, TOPUP_TYPES } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import { Topup } from "@/lib/types/topup";
import { UserProfile } from "@/lib/types/user";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Fullscreen,
  Loader2,
  MinusCircle,
  XIcon,
} from "lucide-react";
import Image from "next/image";
import { useState, useEffect, useRef } from "react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Separator } from "../ui/separator";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "../ui/sheet";
import PaymentSlipPreview from "./payment-slip-preview";
import useGetTopup from "./use-get-topup";

export function TopupDetailsSheet({
  open,
  topupId,
  onOpenChange,
}: {
  open: boolean;
  topupId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { topup, isLoading, isError, error } = useGetTopup({ topupId });
  const [previewSlip, setPreviewSlip] = useState(false);
  const { profile } = useAppContext();
  const pushedRef = useRef(false);

  useEffect(() => {
    const handlePop = () => {
      if (pushedRef.current && open) {
        onOpenChange(false);
        pushedRef.current = false;
      }
    };

    if (open) {
      try {
        window.history.pushState({ sheet: "topup-details" }, "");
        pushedRef.current = true;
        window.addEventListener("popstate", handlePop);
      } catch (err) {
        console.log(err);
      }
    }

    return () => {
      window.removeEventListener("popstate", handlePop);
      if (pushedRef.current) {
        try {
          window.history.back();
        } catch (err) {
          console.log(err);
        }
        pushedRef.current = false;
      }
    };
  }, [open, onOpenChange]);

  const handleDownload = async () => {
    if (!topup?.payment_slip) return;
    const response = await fetch(topup.payment_slip);
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "payment-slip";
    a.click();

    window.URL.revokeObjectURL(url);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-xl w-full overflow-auto">
        <SheetHeader className="sticky top-0 bg-background">
          <div className="flex items-center justify-between">
            <SheetTitle>Top-up Details</SheetTitle>
            <SheetClose>
              <XIcon size={24} />
            </SheetClose>
          </div>
        </SheetHeader>
        <SheetDescription></SheetDescription>

        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="animate-spin h-6 w-6 text-muted-foreground" />
          </div>
        )}

        {/* Error state */}
        {isError && (
          <div className="mt-4 flex items-center gap-2 text-destructive">
            <AlertCircle className="h-4 w-4" />
            <span>{error?.message}</span>
          </div>
        )}

        {/* Data display */}

        {topup && (
          <div className="space-y-4 text-sm p-4">
            {/* --- Payment Slip --- */}
            {topup.payment_slip && (
              <section className="sm:max-w-none max-w-sm">
                <div className="flex justify-between mb-2">
                  <h3 className="font-semibold text-base ">Payment Slip</h3>
                  <div className="flex justify-center gap-3 mt-2">
                    <Button
                      variant={"outline"}
                      size={"icon"}
                      onClick={handleDownload}
                    >
                      <Download />
                    </Button>

                    <Button
                      variant={"outline"}
                      size={"icon"}
                      onClick={() => setPreviewSlip(true)}
                    >
                      <Fullscreen />
                    </Button>
                  </div>
                </div>

                <div className="rounded-md border bg-muted/30">
                  <Image
                    src={topup.payment_slip}
                    alt="Payment Slip"
                    width={600}
                    height={400}
                    className="object-contain sm:w-72 w-56 mx-auto h-auto"
                  />
                </div>
              </section>
            )}
            {/* --- Advertiser Info --- */}
            <section>
              <h3 className="font-semibold text-base">Advertiser</h3>
              <div className="mt-2 grid grid-cols-2 gap-2 text-muted-foreground">
                <div>
                  <span className="font-medium text-foreground">
                    {topup.advertiser?.tenant_client_code && (
                      <b>{topup.advertiser?.tenant_client_code}:</b>
                    )}
                    &nbsp;{topup.advertiser?.profile?.full_name}
                  </span>
                  <p>{topup.advertiser?.profile?.email}</p>
                </div>
                <div></div>
              </div>
            </section>
            <Separator />
            {/* --- Account Info --- */}
            {topup.account && (
              <section>
                <h3 className="font-semibold text-base">Ad Account</h3>
                <div className="mt-2 grid sm:grid-cols-2 gap-2 text-muted-foreground">
                  <div>
                    <p>
                      <span className="font-medium text-foreground">Name:</span>{" "}
                      {topup.account?.name}
                    </p>
                    <p>
                      <span className="font-medium text-foreground">
                        Platform:
                      </span>{" "}
                      {
                        PLATFORMS.find(
                          (p) => p.value === topup.account?.platform
                        )?.label
                      }
                    </p>
                  </div>
                  <div>
                    <p>
                      <span className="font-medium text-foreground">
                        BM ID:
                      </span>{" "}
                      {topup.account?.bm_id}
                    </p>
                  </div>
                </div>
              </section>
            )}
            <Separator />
            {/* --- Payment Info --- */}
            <section>
              <h3 className="font-semibold text-base">Payment Details</h3>
              <div className="mt-2 space-y-1 text-muted-foreground">
                <p>
                  <span className="font-medium text-foreground">Type:</span>{" "}
                  {TOPUP_TYPES.find((t) => t.value === topup.type)?.label}
                </p>

                <p>
                  <span className="font-medium text-foreground">
                    Amount Received:{" "}
                  </span>
                  {CURRENCY_SYMBOLS[topup.currency]}
                  {topup.amount_received}
                </p>
                <p>
                  <span className="font-medium text-foreground">
                    Converted (USD):
                  </span>{" "}
                  ${topup.amount_usd}
                </p>
                <p>
                  <span className="font-medium text-foreground">
                    Top-up Amount:{" "}
                  </span>
                  {CURRENCY_SYMBOLS["USD"]}
                  {topup.topup_amount}
                </p>
                <p>
                  <span className="font-medium text-foreground">Fee:</span>{" "}
                  {topup.fee}%
                </p>
                <p>
                  <span className="font-medium text-foreground">Status:</span>{" "}
                  <span className="capitalize">
                    <Badge variant={"outline"}>
                      {topup.status === "completed" ? (
                        <CheckCircle2 color="green" />
                      ) : (
                        <MinusCircle color="gray" />
                      )}
                      {topup.status}
                    </Badge>
                  </span>
                </p>
                <p>
                  <span className="font-medium text-foreground">Created:</span>{" "}
                  {new Date(topup.created_at).toLocaleString()}
                </p>
                <p>
                  <span className="font-medium text-foreground">Verified:</span>{" "}
                  {new Date(topup.verified_at).toLocaleString()}
                </p>
                {topup.author && (
                  <p>
                    <span className="font-medium text-foreground">
                      Author:{" "}
                    </span>
                    {topup.author?.id === profile?.id
                      ? "You"
                      : topup.author?.name}
                  </p>
                )}
              </div>
            </section>
            <Separator />
            {topupId && <TopupLogs topupId={topupId} />}
          </div>
        )}

        {topup?.payment_slip && (
          <PaymentSlipPreview
            src={topup?.payment_slip}
            alt="Payment Slip"
            open={previewSlip}
            onClose={() => setPreviewSlip(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

type TopupLog = {
  id: string;
  created_at: string;
  updated_by: Partial<UserProfile> | null;
  topup_id: string;
  action: string;
  author: { id: string; email: string; name: string };
  new_values: Partial<Topup>;
};

export default function TopupLogs({ topupId }: { topupId: string }) {
  const supabase = createClient();

  const {
    data: logs,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["topup-logs", topupId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("topup_logs")
        .select("*, updated_by:user_profiles(full_name)")
        .eq("topup_id", topupId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as TopupLog[];
    },
    enabled: !!topupId,
  });

  if (isLoading)
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="animate-spin h-5 w-5 text-muted-foreground" />
      </div>
    );

  if (isError)
    return (
      <div className="flex items-center gap-2 text-destructive text-sm py-4">
        <AlertCircle className="h-4 w-4" />
        <span>{(error as Error)?.message}</span>
      </div>
    );

  if (!logs || logs.length === 0)
    return (
      <div className="text-center text-muted-foreground text-sm py-4">
        No logs found.
      </div>
    );

  return (
    <div className="mt-4">
      <h3 className="font-semibold text-base mb-2">Top-up Logs</h3>
      <div className="rounded-md border ">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-muted">
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Author</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Fee</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Amount USD</TableHead>
              <TableHead>Topup</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.map((log) => {
              return (
                <TableRow key={log.id}>
                  <TableCell>
                    {new Date(log.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell>{log.author?.name || "System"}</TableCell>
                  <TableCell>
                    <Badge
                      variant={"outline"}
                      className={cn(
                        "uppercase",
                        log.action === "delete"
                          ? "border-destructive text-destructive"
                          : "",
                        log.action === "create"
                          ? "border-green-600 text-green-600"
                          : "",
                        log.action === "update"
                          ? "border-yellow-600 text-yellow-600"
                          : ""
                      )}
                    >
                      {log.action}
                    </Badge>
                  </TableCell>
                  <TableCell>{log.new_values.fee}</TableCell>
                  <TableCell>
                    {CURRENCY_SYMBOLS[log.new_values.currency as string]}
                    {log.new_values.amount_received}
                  </TableCell>
                  <TableCell>
                    {CURRENCY_SYMBOLS["USD"]}
                    {log.new_values.amount_usd}
                  </TableCell>
                  <TableCell>
                    {CURRENCY_SYMBOLS["USD"]}
                    {log.new_values.topup_amount}
                  </TableCell>
                  <TableCell className="capitalize">
                    <Badge variant={"outline"}>
                      {" "}
                      {log.new_values.status === "completed" ? (
                        <CheckCircle2 color="green" />
                      ) : (
                        <MinusCircle color="gray" />
                      )}
                      {log.new_values.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
