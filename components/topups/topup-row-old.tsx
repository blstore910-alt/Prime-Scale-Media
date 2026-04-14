import { TableCell, TableRow } from "@/components/ui/table";
import { useAppContext } from "@/context/app-provider";
import { CURRENCY_SYMBOLS, TOPUP_TYPES } from "@/lib/constants";
import {
  Check,
  CheckCircle2,
  Eye,
  Loader2,
  MinusCircle,
  MoreVerticalIcon,
  Trash,
  Undo,
  X,
} from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Input } from "../ui/input";
import useUpdateTopup from "./use-update-topup";

import { Topup } from "@/lib/types/topup";
import { calculateTopupAmount, cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import useExchangeRates from "../settings/finance/use-exchange-rates";
export default function TopupRow({
  topup,
  onViewDetails,
  onVerifyPayment,
}: {
  topup: Topup & {
    tenant_client_code?: string;
    account_name?: string;
    platform?: string;
  };
  onViewDetails: () => void;
  onVerifyPayment: () => void;
}) {
  const { profile } = useAppContext();
  const isAdmin = profile?.role === "admin";
  const [topupState, setTopupState] = useState({
    values: {
      fee: topup.fee,
      amountUSD: topup.amount_usd,
      topupAmount: topup.topup_amount,
      receivedAmount: topup.amount_received,
      source: topup.source,
    },
    editing: {
      fee: false,
      amountUSD: false,
      topupAmount: false,
      receivedAmount: false,
      source: false,
    },
    isDirty: false,
  });

  const { isPending, updateTopup } = useUpdateTopup();
  const { exchangeRates } = useExchangeRates({ activeOnly: true });
  const queryClient = useQueryClient();

  const initialValues = useMemo(
    () => ({
      fee: topup.fee,
      amountUSD: topup.amount_usd,
      topupAmount: topup.topup_amount,
      receivedAmount: topup.amount_received,
      source: topup.source,
    }),
    [topup],
  );

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

  const updateFee = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setTopupState({ ...topupState, isDirty: false });

    let payload = {
      fee: topupState.values.fee,
      topup_amount: topupState.values.topupAmount,
      amount_usd: topupState.values.amountUSD,
      amount_received: topupState.values.receivedAmount,
      source: topupState.values.source,
    };

    if (payload.fee !== initialValues.fee) {
      const { topupAmount, amountUSD } = calculateTopupAmount(
        +payload.amount_received,
        exchangeRates,
        topup.currency,
        +payload.fee,
      );
      payload = {
        ...payload,
        topup_amount: topupAmount.toFixed(2),
        amount_usd: amountUSD.toFixed(2),
      };
    }

    updateTopup(
      {
        topupId: topup.id,
        payload,
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["top-ups"] });
          setTopupState((prev) => ({
            ...prev,
            editing: resetEditing(),
            isDirty: false,
          }));

          toast.success("Topup updated successfully");
        },
      },
    );
  };

  const resetEditing = () => ({
    fee: false,
    amountUSD: false,
    topupAmount: false,
    receivedAmount: false,
    source: false,
  });

  const handleEnableEdit = (
    key: "fee" | "amountUSD" | "topupAmount" | "receivedAmount" | "source",
  ) => {
    if (!isAdmin) return;
    setTopupState({
      ...topupState,
      editing: { ...topupState.editing, [key]: true },
    });
  };

  useEffect(() => {
    setTopupState((prev) => ({
      ...prev,
      values: initialValues,
    }));
  }, [initialValues]);

  return (
    <TableRow
      className={cn(
        topup.is_deleted && "bg-destructive/20 hover:bg-destructive/20",
      )}
      onClick={onViewDetails}
      key={topup.id}
    >
      <TableCell>{String(topup.number).padStart(6, "0")}</TableCell>
      <TableCell>{topup.account_name || "---"}</TableCell>
      {profile?.role !== "advertiser" && (
        <>
          <TableCell>
            <span className="font-medium">
              {topup.tenant_client_code || "—"}
            </span>
          </TableCell>
        </>
      )}
      <TableCell>
        {TOPUP_TYPES.find((t) => t.value === topup.type)?.label}
      </TableCell>
      <TableCell
        onClick={(e) => {
          e.stopPropagation();
          handleEnableEdit("receivedAmount");
        }}
      >
        <div className="flex flex-col">
          <span className="font-medium">
            {CURRENCY_SYMBOLS[topup.currency]}
            {topupState.editing.receivedAmount ? (
              <Input
                name="amount_received"
                value={topupState.values.receivedAmount}
                autoFocus
                onChange={(e) =>
                  setTopupState({
                    ...topupState,
                    values: {
                      ...topupState.values,
                      receivedAmount: e.target.value,
                    },
                    isDirty: true,
                  })
                }
                onClick={(e) => e.stopPropagation()}
                className="inline-flex w-20 h-6 px-1 rounded ml-1"
                type="number"
                onBlur={() =>
                  setTopupState({
                    ...topupState,
                    editing: { ...topupState.editing, receivedAmount: false },
                  })
                }
              />
            ) : (
              topupState.values.receivedAmount
            )}
          </span>
          <span className="text-xs text-muted-foreground">
            {topup.currency === "USD" ? "€" : "$"}
            {topup.currency === "USD" ? topup.eur_value : topup.amount_usd}
          </span>
        </div>
      </TableCell>
      <TableCell
        onClick={(e) => {
          e.stopPropagation();
          handleEnableEdit("topupAmount");
        }}
      >
        <div className="flex flex-col">
          <span className="font-medium">
            {CURRENCY_SYMBOLS[topup.currency === "USD" ? "USD" : "EUR"]}
            {topupState.editing.topupAmount ? (
              <Input
                name="topup_amount"
                value={topupState.values.topupAmount}
                autoFocus
                onChange={(e) =>
                  setTopupState({
                    ...topupState,
                    values: {
                      ...topupState.values,
                      topupAmount: e.target.value,
                    },
                    isDirty: true,
                  })
                }
                onClick={(e) => e.stopPropagation()}
                onBlur={() =>
                  setTopupState({
                    ...topupState,
                    editing: { ...topupState.editing, topupAmount: false },
                  })
                }
                className="inline-flex w-20 h-6 px-1 rounded ml-1"
                type="number"
              />
            ) : (
              topupState.values.topupAmount
            )}
          </span>
          <span className="text-xs text-muted-foreground">
            {topup.currency === "USD" ? "€" : "$"}
            {topup.currency === "USD" ? topup.eur_topup : topup.topup_usd}
          </span>
        </div>
      </TableCell>
      <TableCell
        onClick={(e) => {
          e.stopPropagation();
          handleEnableEdit("fee");
        }}
      >
        <div className="flex flex-col">
          <span className="font-medium">
            {CURRENCY_SYMBOLS[topup.currency]}
            {(
              (Number(topupState.values.receivedAmount) *
                Number(topupState.values.fee)) /
              100
            ).toFixed(2)}
          </span>
          <span className="text-xs text-muted-foreground">
            {topupState.editing.fee ? (
              <Input
                name="fee"
                value={topupState.values.fee}
                autoFocus
                onChange={(e) =>
                  setTopupState({
                    ...topupState,
                    values: { ...topupState.values, fee: e.target.value },
                    isDirty: true,
                  })
                }
                disabled={["extra-ad-account", "subscription"].includes(
                  topup.type,
                )}
                onClick={(e) => e.stopPropagation()}
                onBlur={() =>
                  setTopupState({
                    ...topupState,
                    editing: { ...topupState.editing, fee: false },
                  })
                }
                className="inline-flex w-12 h-5 px-1 rounded ml-1 text-xs"
                type="number"
              />
            ) : (
              `${topupState.values.fee}%`
            )}
          </span>
        </div>
      </TableCell>
      <TableCell className="capitalize">
        <Badge variant={"outline"}>
          {" "}
          {topup.status === "completed" ? (
            <CheckCircle2 color="green" />
          ) : (
            <MinusCircle color="gray" />
          )}
          {topup.status}
        </Badge>
      </TableCell>
      {isAdmin && (
        <TableCell className="min-w-24 text-center">
          {topupState.isDirty ? (
            <div className="inline-flex gap-2">
              <Button
                size={"icon"}
                variant={"outline"}
                className="size-8"
                onClick={updateFee}
              >
                <Check />
              </Button>
              <Button
                size={"icon"}
                variant={"outline"}
                className="size-8"
                onClick={(e) => {
                  e.stopPropagation();
                  setTopupState({
                    ...topupState,
                    values: initialValues,
                    editing: resetEditing(),
                    isDirty: false,
                  });
                }}
              >
                <X />
              </Button>
            </div>
          ) : (
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
                  <Eye />
                  <span>View Details</span>
                </DropdownMenuItem>
                {topup.status !== "completed" && (
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      onVerifyPayment();
                    }}
                  >
                    <CheckCircle2 />
                    <span>Verify Payment</span>
                  </DropdownMenuItem>
                )}
                {topup.status === "completed" && (
                  <DropdownMenuItem onClick={markPending}>
                    <MinusCircle />
                    <span>Mark Pending</span>
                  </DropdownMenuItem>
                )}
                {topup.is_deleted ? (
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      markDeleted(false);
                    }}
                  >
                    <Undo />
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
                    <Trash />
                    <span>Delete</span>
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </TableCell>
      )}
    </TableRow>
  );
}
