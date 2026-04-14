import { PLATFORMS } from "@/lib/constants";
import { AdAccount } from "@/lib/types/account";
import {
  CheckCircle2,
  Eye,
  MinusCircle,
  PauseCircle,
  Pencil,
} from "lucide-react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardTitle } from "../ui/card";

export default function AccountCard({
  account,
  onView,
  onEdit,
  onSetMinTopup,
}: {
  account: AdAccount;
  onView: (id: string) => void;
  onEdit?: (account: AdAccount) => void;
  onSetMinTopup?: (account: AdAccount) => void;
}) {
  return (
    <Card className="cursor-pointer hover:shadow-lg transition-shadow p-2">
      <CardContent className="p-2">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-muted-foreground text-xs">
              {`${account.advertiser?.tenant_client_code}`} &middot;{" "}
              {`${account.advertiser?.profile?.full_name}`}
            </p>
            <CardTitle className="text-sm">{account.name}</CardTitle>
          </div>
          <Badge className="capitalize" variant={"outline"}>
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
          {onEdit && (
            <Button
              variant="outline"
              className="flex-1"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(account);
              }}
            >
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Button>
          )}
          {onSetMinTopup && (
            <Button
              variant="outline"
              className="flex-1"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onSetMinTopup(account);
              }}
            >
              Set Topup Limit
            </Button>
          )}
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

          {/* <Button
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
          </Button> */}
        </div>
      </CardContent>
    </Card>
  );
}
