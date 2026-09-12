"use client";

import { COMMISSION_TYPE_LABELS } from "@/lib/constants";
import { formatCurrency } from "@/lib/utils";
import ReferralStatusAction from "./referral-status-action";

export type ReferralLinkRow = {
  id: string;
  created_at: string;
  tenant_id: string;
  referred_advertiser_id: string;
  affiliate_advertiser_id: string;
  commission_currency: string | null;
  commission_monthly: number | null;
  commission_pct: number | null;
  commission_onetime: number | null;
  commission_type: string | null;
  status: string | null;
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
  formatCommissionAmount: (
    value: number | null | undefined,
    currency: string | null | undefined,
  ) => string;
  formatPercent: (value: number | null | undefined) => string;
}

// A single referral-link row in the super-admin Referral Links table,
// ported to the mockup look. Presentation only — the approve/reject
// control (ReferralStatusAction) keeps its exact wiring.
export default function AffiliateTableRow({
  referral,
  formatCommissionAmount,
  formatPercent,
}: AffiliateTableRowProps) {
  return (
    <tr>
      <td>
        <div style={{ fontWeight: 700, lineHeight: 1.2 }}>
          {referral.referred_advertiser_name || EMPTY_VALUE}
          <span
            className="mono"
            style={{
              color: "var(--faint)",
              fontSize: ".72rem",
              fontWeight: 600,
              marginLeft: 6,
            }}
          >
            {referral.referred_advertiser_tenant_client_code || EMPTY_VALUE}
          </span>
        </div>
        <div style={{ color: "var(--faint)", fontSize: ".8rem" }}>
          {referral.referred_advertiser_email || EMPTY_VALUE}
        </div>
      </td>
      <td>
        <div style={{ fontWeight: 700, lineHeight: 1.2 }}>
          {referral.affiliate_advertiser_name || EMPTY_VALUE}
          <span
            className="mono"
            style={{
              color: "var(--faint)",
              fontSize: ".72rem",
              fontWeight: 600,
              marginLeft: 6,
            }}
          >
            {referral.affiliate_advertiser_tenant_client_code || EMPTY_VALUE}
          </span>
        </div>
        <div style={{ color: "var(--faint)", fontSize: ".8rem" }}>
          {referral.affiliate_advertiser_email || EMPTY_VALUE}
        </div>
      </td>
      <td style={{ textTransform: "capitalize" }}>
        {COMMISSION_TYPE_LABELS[referral.commission_type as string] ||
          EMPTY_VALUE}
      </td>
      <td className="r mono">
        {formatCommissionAmount(
          referral.commission_monthly,
          referral.commission_currency,
        )}
      </td>
      <td className="r mono">
        {formatCommissionAmount(
          referral.commission_onetime,
          referral.commission_currency,
        )}
      </td>
      <td className="r mono">{formatPercent(referral.commission_pct)}</td>
      <td className="r mono">
        {formatCurrency(referral.earnings_usd as number, "USD")}
      </td>
      <td className="r mono">
        {formatCurrency(referral.earnings_eur as number, "EUR")}
      </td>
      <td className="r">
        <ReferralStatusAction
          referralLinkId={referral.id}
          status={referral.status}
        />
      </td>
    </tr>
  );
}
