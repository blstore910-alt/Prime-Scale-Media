"use client";

import { COMMISSION_TYPE_LABELS } from "@/lib/constants";
import { Badge } from "../ui/badge";
import { TableCell, TableRow } from "../ui/table";
import { formatCurrency } from "@/lib/utils";

export type ReferralLinkRow = {
  id: string;
  created_at: string;
  tenant_id: string;
  referred_advertiser_id: string;
  affiliate_advertiser_id: string;
  commission_monthly: number | null;
  commission_pct: number | null;
  commission_onetime: number | null;
  commission_type: string | null;
  earnings_usd: number | null;
  earnings_eur: number | null;
  referred_advertiser_email: string | null;
  referred_advertiser_name: string | null;
  referred_advertiser_tenant_client_code: string | null;
  affiliate_advertiser_email: string | null;
  affiliate_advertiser_name: string | null;
  affiliate_advertiser_tenant_client_code: string | null;
};

const EMPTY_VALUE = "N/A";

interface AffiliateTableRowProps {
  referral: ReferralLinkRow;
  formatNumber: (value: number | null | undefined) => string;
  formatPercent: (value: number | null | undefined) => string;
}

export default function AffiliateTableRow({
  referral,
  formatNumber,
  formatPercent,
}: AffiliateTableRowProps) {
  return (
    <TableRow>
      <TableCell>
        <div className="space-y-1">
          <p className="text-sm font-medium">
            {referral.referred_advertiser_name || EMPTY_VALUE}{" "}
            <Badge variant={"outline"} className=" text-muted-foreground">
              {referral.referred_advertiser_tenant_client_code || EMPTY_VALUE}
            </Badge>
          </p>
          <p className="text-muted-foreground">
            {referral.referred_advertiser_email || EMPTY_VALUE}
          </p>
        </div>
      </TableCell>
      <TableCell>
        <div className="space-y-1">
          <p className="text-sm font-medium">
            {referral.affiliate_advertiser_name || EMPTY_VALUE}
            {"   "}
            <Badge variant={"outline"} className=" text-muted-foreground">
              {referral.affiliate_advertiser_tenant_client_code || EMPTY_VALUE}
            </Badge>
          </p>
          <p className="text-xs text-muted-foreground">
            {referral.affiliate_advertiser_email || EMPTY_VALUE}
          </p>
        </div>
      </TableCell>
      <TableCell className="capitalize">
        {COMMISSION_TYPE_LABELS[referral.commission_type as string] ||
          EMPTY_VALUE}
      </TableCell>
      <TableCell className="tabular-nums">
        {formatNumber(referral.commission_monthly)}
      </TableCell>
      <TableCell className="tabular-nums">
        {formatNumber(referral.commission_onetime)}
      </TableCell>
      <TableCell className="tabular-nums">
        {formatPercent(referral.commission_pct)}
      </TableCell>
      <TableCell className="tabular-nums">
        {formatCurrency(referral.earnings_usd as number, "USD")}
      </TableCell>
      <TableCell className="tabular-nums">
        {formatCurrency(referral.earnings_eur as number, "EUR")}
      </TableCell>
    </TableRow>
  );
}
