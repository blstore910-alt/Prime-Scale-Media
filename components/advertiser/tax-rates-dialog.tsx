"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

/**
 * The tax rate per country, for an advertiser.
 *
 * WHAT IT IS. A digital services tax applies on ad spend at a rate set by
 * the country the account advertises in. The reserve is held by our
 * infrastructure partner, not by this app — so nothing here computes,
 * holds or moves money. It publishes the schedule, which is the thing a
 * customer asks about when a figure on their account is lower than they
 * expected.
 *
 * WHAT IT MUST NOT SAY. No partner is named, no cost and no margin —
 * see the rule in lib/integrations/rockads-api.ts. "The tax rates we
 * apply" is the customer's truth: from where they stand, it is ours.
 *
 * API AND MANUAL ACCOUNTS DIFFER, and the dialog says which. On an
 * API-linked account we can see the balance and therefore the reserve; on
 * a manual one we cannot see a balance at all, only the top-up history,
 * so promising a live reserve figure there would be a promise we cannot
 * keep.
 */
export default function TaxRatesDialog({
  open,
  onClose,
  tenantId,
  /** The account's country, when the dialog is opened from one. */
  countryCode,
  /** True when this account is API-linked, so a reserve is visible. */
  apiLinked,
}: {
  open: boolean;
  onClose: () => void;
  tenantId: string | null;
  countryCode?: string | null;
  apiLinked?: boolean;
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["tax-rates", tenantId],
    enabled: open && !!tenantId,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("tax_rates")
        .select("country_code, country_name, rate_pct")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Array<{
        country_code: string;
        country_name: string;
        rate_pct: number | string;
      }>;
    },
  });

  if (!open) return null;

  const mine = (countryCode ?? "").trim().toUpperCase();
  const rows = data ?? [];
  const yours = rows.find((r) => r.country_code.toUpperCase() === mine);

  return (
    <div className="modal">
      <style>{CSS}</style>
      <div className="mback" onClick={onClose} />
      <div className="mcard" style={{ width: "min(440px,100%)" }}>
        <div className="mhead">
          <h2>Tax rates by country</h2>
          <button className="iconbtn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <p className="cap">
          The rate we apply depends on the country your ad account
          advertises in.
        </p>

        {/* Their own rate first, when the dialog knows which account. */}
        {yours ? (
          <div className="tx-yours">
            <span className="tx-flag">{yours.country_code}</span>
            <div style={{ minWidth: 0 }}>
              <b>{yours.country_name}</b>
              <div className="cap" style={{ margin: 0 }}>
                Your account&apos;s country
              </div>
            </div>
            <span className="tx-rate big">{Number(yours.rate_pct)}%</span>
          </div>
        ) : null}

        <div className="tx-list">
          {isLoading ? (
            <p className="cap" style={{ margin: 0 }}>
              Loading the rates…
            </p>
          ) : isError ? (
            /* Not an empty schedule. A rate of zero is a statement and
               this is not one. */
            <p className="cap" style={{ margin: 0, color: "var(--danger)" }}>
              We couldn&apos;t load the rates just now — this is not a list
              of zeroes. Reload to try again.
            </p>
          ) : rows.length === 0 ? (
            <p className="cap" style={{ margin: 0 }}>
              No rates published yet.
            </p>
          ) : (
            rows.map((r) => (
              <div
                key={r.country_code}
                className={
                  "tx-row" +
                  (r.country_code.toUpperCase() === mine ? " on" : "")
                }
              >
                <span className="tx-flag">
                  {r.country_code === "**" ? "··" : r.country_code}
                </span>
                <span className="tx-name">{r.country_name}</span>
                <span className="tx-rate">{Number(r.rate_pct)}%</span>
              </div>
            ))
          )}
        </div>

        <div className="tx-how">
          <b>How it works</b>
          <p>
            {apiLinked
              ? "A reserve is held against your account balance for the country it advertises in. Released portions come back to your available balance."
              : "A reserve is held for the country this account advertises in. On accounts we fund by hand we show your top-up history rather than a live balance, so the reserve is not shown as a figure here."}
          </p>
        </div>

        <div className="mfoot">
          <button className="btn ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

const CSS = `
.tx-yours{display:flex;align-items:center;gap:11px;margin:12px 0 4px;
  padding:11px 13px;border-radius:13px;background:var(--primary-tint)}
.tx-yours b{display:block;font-size:.95rem}
.tx-list{margin-top:10px;border:1px solid var(--line);border-radius:14px;
  padding:4px 10px}
.tx-row{display:flex;align-items:center;gap:11px;padding:9px 0;
  border-top:1px solid var(--line);min-width:0}
.tx-row:first-child{border-top:0}
.tx-row.on{font-weight:650}
.tx-flag{flex:0 0 auto;min-width:26px;font-size:.66rem;font-weight:800;
  letter-spacing:.04em;color:var(--faint);text-transform:uppercase}
.tx-name{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;
  white-space:nowrap;font-size:.9rem}
.tx-rate{flex:0 0 auto;font-weight:700;font-size:.82rem;
  background:var(--panel-2);border-radius:999px;padding:3px 9px}
.tx-rate.big{font-size:1rem;background:#fff}
.tx-how{margin-top:12px;padding:11px 13px;border-radius:13px;
  background:var(--panel-2)}
.tx-how b{font-size:.88rem}
.tx-how p{margin:5px 0 0;font-size:.82rem;line-height:1.5;color:var(--txt-2)}
`;
