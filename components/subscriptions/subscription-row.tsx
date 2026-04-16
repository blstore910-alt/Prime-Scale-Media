import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { Loader2, MinusCircle, PauseCircle, PlayCircle } from "lucide-react";
import {
  formatSubscriptionDate,
  getStatusBadgeClassName,
} from "./subscription-utils";
import { Subscription } from "./types";
import dayjs from "dayjs";
import { DATE_FORMAT } from "@/lib/constants";
import { formatCurrency } from "@/lib/utils";

type SubscriptionRowProps = {
  subscription: Subscription;
  isPending: boolean;
  onActivate: () => void;
  onDisable: () => void;
  onPause: () => void;
  onUnpause: () => void;
};

function getAdvertiserName(subscription: Subscription) {
  return subscription.advertiser?.profile?.full_name ?? "-";
}

function getClientCode(subscription: Subscription) {
  return subscription.advertiser?.tenant_client_code ?? "-";
}

export default function SubscriptionRow({
  subscription,
  isPending,
  onActivate,
  onDisable,
  onPause,
  onUnpause,
}: SubscriptionRowProps) {
  return (
    <TableRow>
      <TableCell>
        <div className="flex flex-col">
          <span className="font-medium">{getAdvertiserName(subscription)}</span>
          <span className="text-xs text-muted-foreground">
            {getClientCode(subscription)}
          </span>
        </div>
      </TableCell>
      <TableCell className="font-mono">
        {formatCurrency(
          subscription.amount as number,
          subscription.currency || "EUR",
        )}
      </TableCell>
      <TableCell>{formatSubscriptionDate(subscription.start_date)}</TableCell>
      <TableCell>
        {dayjs(subscription.next_payment_date).format(DATE_FORMAT) || "-"}
      </TableCell>
      <TableCell>
        <Badge
          className={getStatusBadgeClassName(subscription.status)}
          variant="secondary"
        >
          {subscription.status}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-2 justify-end">
          {subscription.status === "inactive" && (
            <Button
              size="sm"
              onClick={onActivate}
              disabled={isPending}
              variant="outline"
            >
              {isPending ? (
                <Loader2 className="animate-spin" />
              ) : (
                <PlayCircle />
              )}
              Activate
            </Button>
          )}

          {subscription.status === "active" && (
            <>
              <Button
                size="sm"
                onClick={onPause}
                disabled={isPending}
                variant="outline"
              >
                {isPending ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <PauseCircle />
                )}
                Pause
              </Button>
              <Button
                size="sm"
                onClick={onDisable}
                disabled={isPending}
                variant="destructive"
                className="text-white"
              >
                {isPending ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <MinusCircle />
                )}
                Disable
              </Button>
            </>
          )}

          {subscription.status === "paused" && (
            <Button
              size="sm"
              onClick={onUnpause}
              disabled={isPending}
              variant="outline"
            >
              {isPending ? (
                <Loader2 className="animate-spin" />
              ) : (
                <PlayCircle />
              )}
              Unpause
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
