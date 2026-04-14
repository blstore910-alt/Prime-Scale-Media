import { PLATFORMS } from "@/lib/constants";
import { AdAccount } from "@/lib/types/account";
import { cn } from "@/lib/utils";
import {
  ArrowUp,
  CheckCircle2,
  Eye,
  MinusCircle,
  PauseCircle,
  Plus,
} from "lucide-react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { useIsMobile } from "@/hooks/use-mobile";

export default function AdvertiserAccountCard({
  account,
  onView,
  onAddTopup,
}: {
  account: AdAccount;
  onView: (id: string) => void;
  onAddTopup: (account: AdAccount) => void;
}) {
  const isMobile = useIsMobile();
  const platformLabel =
    PLATFORMS.find((p) => p.value === account.platform)?.label ??
    account.platform;

  if (isMobile)
    return (
      <Card className="shadow-none transition-shadow py-2">
        <CardContent className="px-2">
          <div className="flex items-center justify-between">
            <h3
              className="font-medium text-foreground text-sm truncate"
              title={account.name}
            >
              {account.name}
            </h3>
            <Badge
              className={cn("capitalize whitespace-nowrap w-fit")}
              variant={"outline"}
            >
              {account.status === "active" ? (
                <CheckCircle2 color="green" />
              ) : account.status === "paused" ? (
                <PauseCircle color="orange" />
              ) : (
                <MinusCircle color="red" />
              )}
              {account.status}
            </Badge>
          </div>
          <div className="flex justify-between mt-3">
            <div className="flex  flex-col ">
              <span className="text-sm text-muted-foreground">Platform:</span>
              <span className="font-medium">
                {PLATFORMS.find((p) => p.value === account.platform)?.label}
              </span>
            </div>
            <div className="flex  flex-col ">
              <span className="text-sm text-muted-foreground">Fee:</span>
              <span className="font-medium">{account.fee}%</span>
            </div>
          </div>
          <div className="flex gap-2 mt-4 pt-4 border-t">
            <Button
              variant="outline"
              className="flex-1"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onView(account.id);
              }}
            >
              <Eye className="mr-2 h-4 w-4" />
              View
            </Button>

            <Button
              variant="outline"
              className="flex-1"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onAddTopup(account);
              }}
            >
              <Plus />
              Add Topup
            </Button>
          </div>
        </CardContent>
      </Card>
    );

  return (
    <Card className="shadow-none transition-shadow p-0">
      <CardContent className="p-3 grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
        {/* Left Section: Account Name & Platform */}
        <div className="md:col-span-4 flex flex-col gap-1">
          <h3
            className="font-medium text-foreground text-sm truncate"
            title={account.name}
          >
            {account.name}
          </h3>
          <span className="text-xs text-muted-foreground">{platformLabel}</span>
        </div>

        {/* Middle Section: Stats */}
        <div className="md:col-span-4 grid grid-cols-2 gap-4">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Fee
            </span>
            <span className="text-sm font-semibold truncate font-mono">
              {account.fee}%
            </span>
          </div>

          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Status
            </span>
            <Badge
              className={cn("capitalize whitespace-nowrap w-fit")}
              variant={"outline"}
            >
              {account.status === "active" ? (
                <CheckCircle2 color="green" />
              ) : account.status === "paused" ? (
                <PauseCircle color="orange" />
              ) : (
                <MinusCircle color="red" />
              )}
              {account.status}
            </Badge>
          </div>
        </div>

        {/* Right Section: Actions */}
        <div className="md:col-span-4 flex items-center justify-between md:justify-end gap-2 pt-2 md:pt-0 border-t md:border-t-0 border-border/50">
          <Button
            variant="ghost"
            size="sm"
            className="h-8"
            onClick={(e) => {
              e.stopPropagation();
              onView(account.id);
            }}
          >
            <Eye className="w-4 h-4 mr-1" />
            View
          </Button>
          <Button
            size="sm"
            className="h-8"
            onClick={(e) => {
              e.stopPropagation();
              onAddTopup(account);
            }}
          >
            <ArrowUp className="w-4 h-4 mr-1" />
            Topup
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
