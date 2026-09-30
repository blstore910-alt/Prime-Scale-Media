import { TableCell, TableRow } from "@/components/ui/table";
import { landedOnAccount } from "@/lib/pure-topup-landed";
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
      {/* ── DIT WAS HARDGECODEERD OP USD ──────────────────────────────
          De oude comment hier zei "topup_amount / topup_usd /
          fee_amount are USD, always". Dat geldt voor de ADMIN-route,
          waar calculateTopupAmount door de koers deelt. Op de
          KLANTroute niet: gemeten op productie staat bij EUR 200,00
          binnen `topup_amount` op 190,00 en `fee_amount` op 10,00, en
          dat zijn euro's.

          Dus printte deze kolom $190,00 naast een fee van EUR 10,00 op
          dezelfde regel, met eronder nog eens EUR 190,00 uit
          eur_topup: hetzelfde getal onder twee symbolen, precies wat
          die comment zei te voorkomen -- alleen andersom.

          landedOnAccount() weet het verschil al (een rij met topup_usd
          is een klantrij, en dan is topup_amount in row.currency), en
          de fee-cel acht regels lager gebruikt hem ook. Nu deze dus
          ook, zodat de twee niet meer uit elkaar kunnen lopen. */}
      <TableCell>
        <div className="flex flex-col">
          <span className=" font-mono font-semibold">
            {formatCurrency(
              landedOnAccount(topup).amount ?? 0,
              landedOnAccount(topup).currency,
            )}
          </span>
          {/* De euroregel alleen wanneer hij iets TOEVOEGT. Op een
              klantrij in euro's is hij hetzelfde getal nog een keer. */}
          {topup.eur_topup != null &&
            landedOnAccount(topup).currency !== "EUR" && (
              <span className="text-xs font-semibold text-muted-foreground font-mono">
                {formatCurrency(topup.eur_topup as number, "EUR")}
              </span>
            )}
        </div>
      </TableCell>

      {/* Fee */}
      <TableCell>
        <div className="flex flex-col">
          <span className="font-bold font-mono ">
            {/* The STORED fee, and in USD, which is what it is.
                This recomputed amount_received x fee / 100 in the
                CUSTOMER'S currency, so it confidently showed "€50" for a
                top-up whose fee_amount column was null and which therefore
                reported €0 of fee revenue on the dashboard — two screens,
                two answers, neither flagged. fee_amount is USD like every
                other amount column on top_ups. */}
            {/* ── THE FEE IS NOT ALWAYS DOLLARS ─────────────────
                The note above says "fee_amount is USD like every other
                amount column on top_ups". That is true of the rows an
                ADMIN wrote. The customer's own RPC computes the fee in
                the PAYMENT currency, and that is the whole reason
                landedOnAccount exists -- it reads `topup_usd` as the
                discriminator for `topup_amount`. The fee column never
                got the same treatment, so a customer-created EUR row
                rendered as "EUR 1,000 - $30.00 = EUR 970.00": three
                columns that do reconcile, printed as two currencies. */}
            {formatCurrency(
              Number(topup.fee_amount) || 0,
              landedOnAccount(topup).currency,
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
