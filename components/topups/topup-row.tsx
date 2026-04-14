import { TableCell, TableRow } from "@/components/ui/table";
import { useAppContext } from "@/context/app-provider";
import { DATE_TIME_FORMAT, TOPUP_TYPES } from "@/lib/constants";
import { Topup } from "@/lib/types/topup";
import { cn, formatCurrency } from "@/lib/utils";
import dayjs from "dayjs";
import {
  CheckCircle2,
  Eye,
  Loader2,
  MinusCircle,
  MoreVerticalIcon,
  Trash,
  Undo,
  XCircle,
} from "lucide-react";
import React from "react";
import { toast } from "sonner";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import useUpdateTopup from "./use-update-topup";

export default function TopupRow({
  topup,
  onViewDetails,
  onVerifyPayment,
  onReject,
}: {
  topup: Topup & {
    tenant_client_code?: string;
    account_name?: string;
    platform?: string;
  };
  onViewDetails: () => void;
  onVerifyPayment: () => void;
  onReject: () => void;
}) {
  const { profile } = useAppContext();
  const isAdmin = profile?.role === "admin";
  const { isPending, updateTopup } = useUpdateTopup();

  const markPending = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    updateTopup({
      topupId: topup.id,
      payload: {
        status: "pending",
      },
    });
  };

  const markDeleted = (val: boolean) => {
    updateTopup(
      {
        topupId: topup.id,
        payload: {
          is_deleted: val,
        },
      },
      {
        onSuccess: () =>
          toast.success(`Topup ${val ? "deleted" : "restored"} successfully`),
      },
    );
  };

  return (
    <TableRow
      className={cn(
        topup.is_deleted && "bg-destructive/20 hover:bg-destructive/20",
        "cursor-pointer",
      )}
      onClick={onViewDetails}
    >
      <TableCell className="font-mono">
        {String(topup.number).padStart(6, "0")}
      </TableCell>
      <TableCell>{topup.account_name || "---"}</TableCell>
      {profile?.role !== "advertiser" && (
        <TableCell>
          <span className="font-medium">{topup.tenant_client_code || "—"}</span>
        </TableCell>
      )}
      <TableCell>
        {TOPUP_TYPES.find((t) => t.value === topup.type)?.label}
      </TableCell>

      {/* Received Amount */}
      <TableCell>
        <div className="flex flex-col">
          <span className="font-semibold font-mono">
            {formatCurrency(
              topup.amount_received as unknown as number,
              topup.currency,
            )}
          </span>
          <span className="text-xs  font-mono font-semibold text-muted-foreground">
            {topup.currency === "USD"
              ? formatCurrency(topup.eur_value as number, "EUR")
              : formatCurrency(topup.amount_usd as number, "USD")}
          </span>
        </div>
      </TableCell>

      {/* Topup Amount */}
      <TableCell>
        <div className="flex flex-col">
          <span className=" font-mono font-semibold">
            {formatCurrency(
              topup.topup_amount as number,
              topup.currency === "USD" ? "USD" : "EUR",
            )}
          </span>
          <span className="text-xs font-semibold text-muted-foreground font-mono">
            {topup.currency === "USD"
              ? formatCurrency(topup.eur_topup as number, "EUR")
              : formatCurrency(topup.topup_usd as number, "USD")}
          </span>
        </div>
      </TableCell>

      {/* Fee */}
      <TableCell>
        <div className="flex flex-col">
          <span className="font-bold font-mono ">
            {formatCurrency(
              (Number(topup.amount_received) * Number(topup.fee)) / 100,
              topup.currency,
            )}
          </span>
          <span className="text-xs text-muted-foreground font-semibold">
            {topup.fee}%
          </span>
        </div>
      </TableCell>

      <TableCell className="capitalize">
        <Badge
          variant={topup.status === "completed" ? "default" : "secondary"}
          className={cn(
            topup.status === "completed" && "bg-green-500 hover:bg-green-600",
            topup.status === "pending" && "bg-yellow-500 hover:bg-yellow-600",
            topup.status === "rejected" &&
              "bg-destructive hover:bg-destructive/90 text-white",
          )}
        >
          {topup.status === "completed" ? (
            <CheckCircle2 className="w-3 h-3 mr-1" />
          ) : (
            <MinusCircle className="w-3 h-3 mr-1" />
          )}
          {topup.status}
        </Badge>
      </TableCell>
      <TableCell>{dayjs(topup.created_at).format(DATE_TIME_FORMAT)}</TableCell>

      {isAdmin && (
        <TableCell className="min-w-24 text-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="inline-flex size-8 text-muted-foreground data-[state=open]:bg-muted"
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
                  onViewDetails();
                }}
              >
                <Eye className="w-4 h-4 mr-2" />
                <span>View Details</span>
              </DropdownMenuItem>
              {topup.status !== "completed" && topup.status !== "rejected" && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onVerifyPayment();
                  }}
                >
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  <span>Verify Payment</span>
                </DropdownMenuItem>
              )}
              {topup.status === "completed" && (
                <DropdownMenuItem onClick={markPending}>
                  <MinusCircle className="w-4 h-4 mr-2" />
                  <span>Mark Pending</span>
                </DropdownMenuItem>
              )}
              {topup.status !== "completed" && topup.status !== "rejected" && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onReject();
                  }}
                  variant="destructive"
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  <span>Reject</span>
                </DropdownMenuItem>
              )}
              {topup.is_deleted ? (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    markDeleted(false);
                  }}
                >
                  <Undo className="w-4 h-4 mr-2" />
                  <span>Restore</span>
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    markDeleted(true);
                  }}
                  variant="destructive"
                >
                  <Trash className="w-4 h-4 mr-2" />
                  <span>Delete</span>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      )}
    </TableRow>
  );
}
