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

// ── A DASH, NOT "N/A" ────────────────────────────────────────────────
//
// A Topup-% link has no monthly and no one-time amount, and a link that
// has not accrued yet has no earnings — so four of the seven money cells
// on one card read "N/A", stacked. It is the right MEANING (we do not
// have a value, which is not the same as zero) in the noisiest possible
// spelling. An em dash says the same thing and disappears.
const EMPTY_VALUE = "—";

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
      <td data-label="Advertiser">
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
      <td data-label="Affiliate">
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
      <td data-label="Commission Type" style={{ textTransform: "capitalize" }}>
        {COMMISSION_TYPE_LABELS[referral.commission_type as string] ||
          EMPTY_VALUE}
      </td>
      {/* ── NOTHING ACCRUES THESE ─────────────────────────────────
          commission-setup-utils marks every monthly/one-time type
          `accrues: false` -- "Recorded on the referral. Paid by hand --
          nothing accrues it." The setup dialog warns; this screen, the
          one an owner reviews liabilities on, rendered them as plain
          money beside an Earnings column reading N/A. A link at
          EUR 200/mo live for seven months shows EUR 200.00 here,
          nothing on /commissions, and EUR 1,400 of real liability
          invisible on both. The title says it where it is read. */}
      <td
        data-label="Commission Monthly"
        className="r mono"
        title="Paid by hand — nothing accrues this, so it will never appear on /commissions or in Earnings."
      >
        {formatCommissionAmount(
          referral.commission_monthly,
          referral.commission_currency,
        )}
        {Number(referral.commission_monthly) > 0 ? (
          <span
            className="muted"
            style={{ display: "block", fontSize: ".72rem" }}
          >
            by hand
          </span>
        ) : null}
      </td>
      <td
        data-label="Commission One-time"
        className="r mono"
        title="Paid by hand — nothing accrues this, so it will never appear on /commissions or in Earnings."
      >
        {formatCommissionAmount(
          referral.commission_onetime,
          referral.commission_currency,
        )}
        {Number(referral.commission_onetime) > 0 ? (
          <span
            className="muted"
            style={{ display: "block", fontSize: ".72rem" }}
          >
            by hand
          </span>
        ) : null}
      </td>
      <td data-label="Commission Recurring" className="r mono">{formatPercent(referral.commission_pct)}</td>
      {/* N/A, not 0.00. Neither insert path writes earnings_* -- they
          are only ever incremented by the accrual trigger -- so a link
          that has never accrued carries NULL, and formatCurrency turns
          a null into a confident "$0.00" in a money column. Every other
          cell in this same row uses formatCommissionAmount, which
          prints N/A for a value we do not have. */}
      <td data-label="Earnings USD" className="r mono">
        {referral.earnings_usd == null
          ? EMPTY_VALUE
          : formatCurrency(referral.earnings_usd as number, "USD")}
      </td>
      <td data-label="Earnings EUR" className="r mono">
        {referral.earnings_eur == null
          ? EMPTY_VALUE
          : formatCurrency(referral.earnings_eur as number, "EUR")}
      </td>
      <td data-label="Status" className="r">
        <ReferralStatusAction
          referralLinkId={referral.id}
          status={referral.status}
          // Named in the confirmation. Approve and reject are both
          // one-way, and a dialog that does not say who it is about is a
          // dialog nobody reads.
          affiliateName={referral.affiliate_advertiser_tenant_client_code}
          referredName={referral.referred_advertiser_tenant_client_code}
        />
      </td>
    </tr>
  );
}
