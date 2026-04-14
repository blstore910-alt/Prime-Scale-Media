import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { CURRENCY_SYMBOLS, DATE_FORMAT } from "@/lib/constants";
import { Affiliate } from "@/lib/types/affiliate";
import dayjs from "dayjs";
import { CheckCircle2, MinusCircle } from "lucide-react";
import useUpdateAffiliate from "./use-update-affiliate";
import { useState } from "react";
import { Switch } from "../ui/switch";
import { Label } from "../ui/label";

export default function AffiliateCard({ affiliate }: { affiliate: Affiliate }) {
  const { updateAffiliate, isPending } = useUpdateAffiliate();
  const [feeCommission, setFeeCommission] = useState(affiliate.fee_commission);
  return (
    <Card className="cursor-pointer hover:shadow-lg transition-shadow p-2">
      <CardContent className="p-3">
        <div className="flex justify-between items-start mb-2">
          <div className="flex-1">
            <p className="text-sm text-muted-foreground mt-1">
              {affiliate?.affiliate?.tenant_client_code}
            </p>
            <CardTitle className="text-sm">
              {affiliate?.affiliate?.profile?.full_name || "—"}
            </CardTitle>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge className="capitalize" variant="outline">
              {affiliate?.status === "active" ? (
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              ) : (
                <MinusCircle className="h-4 w-4 text-gray-400" />
              )}
              {affiliate?.status || "—"}
            </Badge>
            <p className="text-muted-foreground text-xs">
              {affiliate?.created_at
                ? dayjs(affiliate.created_at).format(DATE_FORMAT)
                : "—"}
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between mt-4">
          <Label>Enable Commission</Label>
          <Switch
            disabled={isPending}
            checked={!!feeCommission}
            onCheckedChange={(checked) => {
              setFeeCommission(checked);
              updateAffiliate({ id: affiliate.id, fee_commission: checked });
            }}
          />
        </div>
        <div className="flex justify-between text-sm">
          <div className="flex gap-2 mt-3 items-center">
            <div className="flex-1">
              <p className=" text-muted-foreground">Payout:</p>
              <div className="flex items-center gap-2">
                <p className="font-semibold">
                  {CURRENCY_SYMBOLS[affiliate?.currency ?? "USD"]}
                  {affiliate?.commission_amount ?? "—"}
                </p>
                <Badge
                  className="capitalize text-[10px] h-5 px-1.5"
                  variant="outline"
                >
                  {affiliate?.payment_status === "paid" ? (
                    <CheckCircle2 className="h-3 w-3 text-green-600" />
                  ) : (
                    <MinusCircle className="h-3 w-3 text-gray-400" />
                  )}
                  {affiliate?.payment_status || "unpaid"}
                </Badge>
              </div>
            </div>
          </div>
          <div className="flex gap-2 mt-3 items-center">
            <div className="flex-1">
              <p className=" text-muted-foreground">Advertiser:</p>
              <p className="font-semibold">
                {affiliate.advertiser.profile?.full_name || "—"} &middot;{" "}
                <span className=" text-muted-foreground">
                  {affiliate.advertiser.tenant_client_code}
                </span>
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
