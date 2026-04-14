"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import TablePagination from "@/components/ui/table-pagination";
import { useEffect, useState } from "react";
import { useMediaQuery } from "usehooks-ts";
import { MyReferral } from "./types";
import useAffiliateCommissions from "./use-affiliate-commissions";
import { COMMISSION_TYPE_LABELS } from "@/lib/constants";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  referral: MyReferral | null;
};

export default function AffiliateCommissionsDialog({
  open,
  onOpenChange,
  referral,
}: Props) {
  const [page, setPage] = useState(1);
  const perPage = 10;
  const isTabletScreen = useMediaQuery("(min-width: 768px)");

  useEffect(() => {
    setPage(1);
  }, [referral?.id, open]);

  const { commissions, total, isLoading, isError, error } =
    useAffiliateCommissions({
      referralLinkId: referral?.id,
      tenantId: referral?.tenant_id,
      page,
      perPage,
      enabled: open && !!referral,
    });

  const advertiserLabel = referral?.referred_advertiser_name || "Advertiser";
  const colCount = 4;

  const formatAmountWithCurrency = (
    amount: number | null | undefined,
    currency: string | null | undefined,
  ) => {
    if (amount == null) return "-";
    const value = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
    return `${currency || ""} ${value}`.trim();
  };

  const formatType = (type: string | null | undefined) => {
    if (!type) return "-";
    if (type === "onetime") return "One-time";
    if (type === "monthly") return "Monthly";
    return type;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>Commission earned from {advertiserLabel}</DialogTitle>
          <DialogDescription>Referral commission records.</DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto pr-1">
          {isTabletScreen ? (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-muted">
                  <TableRow>
                    <TableHead>Amount</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 4 }).map((_, idx) => (
                      <TableRow key={idx} className="animate-pulse">
                        {Array.from({ length: colCount }).map((__, cellIdx) => (
                          <LoaderCell key={cellIdx} />
                        ))}
                      </TableRow>
                    ))
                  ) : isError ? (
                    <TableRow>
                      <TableCell
                        colSpan={colCount}
                        className="py-8 text-center text-destructive"
                      >
                        {(error as Error)?.message ??
                          "Failed to load commissions."}
                      </TableCell>
                    </TableRow>
                  ) : commissions.length ? (
                    commissions.map((commission) => (
                      <TableRow key={commission.id}>
                        <TableCell className="font-medium font-mono">
                          {formatAmountWithCurrency(
                            commission.amount,
                            commission.currency,
                          )}
                        </TableCell>
                        <TableCell className="capitalize">
                          {
                            COMMISSION_TYPE_LABELS[
                              commission.type as keyof typeof COMMISSION_TYPE_LABELS
                            ]
                          }
                        </TableCell>
                        <TableCell className="capitalize">
                          {commission.status || "-"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(commission.created_at)}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={colCount}
                        className="py-8 text-center text-muted-foreground"
                      >
                        No commissions found for this advertiser yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          ) : isLoading ? (
            <div className="grid gap-3">
              {Array.from({ length: 4 }).map((_, idx) => (
                <div
                  key={idx}
                  className="h-20 rounded-lg border bg-muted/30 animate-pulse"
                />
              ))}
            </div>
          ) : isError ? (
            <div className="rounded-lg border p-6 text-center text-destructive">
              {(error as Error)?.message ?? "Failed to load commissions."}
            </div>
          ) : commissions.length ? (
            <div className="grid gap-3">
              {commissions.map((commission) => (
                <AffiliateCommissionCard
                  key={commission.id}
                  amount={formatAmountWithCurrency(
                    commission.amount,
                    commission.currency,
                  )}
                  type={formatType(commission.type)}
                  status={commission.status || "-"}
                  date={formatDate(commission.created_at)}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
              No commissions found for this advertiser yet.
            </div>
          )}

          {total > perPage ? (
            <div className=" p-4">
              <TablePagination
                total={total}
                page={page}
                perPage={perPage}
                onPageChange={(nextPage) => setPage(nextPage)}
              />
            </div>
          ) : null}
        </div>

        <div className="flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LoaderCell() {
  return (
    <TableCell>
      <div className="h-4 w-16 rounded bg-muted" />
    </TableCell>
  );
}

function AffiliateCommissionCard({
  amount,
  type,
  status,
  date,
}: {
  amount: string;
  type: string;
  status: string;
  date: string;
}) {
  return (
    <Card className="p-1.5 rounded-lg">
      <CardContent className="p-2.5">
        <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] leading-tight text-muted-foreground">
              Amount
            </span>
            <span className="font-mono font-semibold text-sm leading-tight">
              {amount}
            </span>
          </div>
          <div className="flex flex-col gap-0.5 col-span-2">
            <span className="text-[11px] leading-tight text-muted-foreground">
              Type
            </span>
            <span className="font-medium capitalize text-sm leading-tight">
              {type}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] leading-tight text-muted-foreground">
              Status
            </span>
            <span className="font-medium capitalize text-sm leading-tight">
              {status}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] leading-tight text-muted-foreground">
              Date
            </span>
            <span className="font-medium text-sm leading-tight">{date}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
