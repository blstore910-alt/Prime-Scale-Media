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
 *
 * ON THE LAYOUT. The first version was a list with a border round it —
 * correct, and no more designed than a spreadsheet. A customer opens this
 * for ONE number: theirs. So theirs is a card, in the brand's own dark,
 * with the rate at a size you read from arm's length; the rest is the
 * reference table underneath it, and the catch-all row is separated
 * because "everywhere else" is not a country.
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

  // "Everywhere else" is the catch-all, not a country, so it sits under a
  // rule rather than in the alphabet with the rest.
  const countries = rows.filter((r) => r.country_code !== "**");
  const catchAll = rows.find((r) => r.country_code === "**");

  const pct = (v: number | string) => {
    const n = Number(v);
    return Number.isFinite(n) ? `${n % 1 === 0 ? n : n.toFixed(1)}%` : "—";
  };

  return (
    <div className="modal">
      <style>{CSS}</style>
      <div className="mback" onClick={onClose} />
      <div className="mcard tx-card" style={{ width: "min(430px,100%)" }}>
        <div className="mhead">
          <h2>Tax rates</h2>
          <button className="iconbtn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {/* THEIR RATE, the reason the dialog was opened. Dark, because
            that is the brand when it means something, and because the one
            number somebody came for should not look like row four. */}
        {yours ? (
          <div className="tx-hero">
            <span className="tx-hero-aur" aria-hidden="true" />
            <div className="tx-hero-body">
              <div className="tx-hero-left">
                <span className="tx-hero-tag">Your account advertises in</span>
                <b>{yours.country_name}</b>
              </div>
              <div className="tx-hero-rate">{pct(yours.rate_pct)}</div>
            </div>
          </div>
        ) : (
          <p className="cap tx-lead">
            The rate depends on the country your ad account advertises in.
          </p>
        )}

        <div className="tx-list">
          <div className="tx-head">
            <span>Country</span>
            <span>Rate</span>
          </div>

          {isLoading ? (
            <div className="tx-msg">Loading the rates…</div>
          ) : isError ? (
            /* Not an empty schedule. A rate of zero is a statement and
               this is not one. */
            <div className="tx-msg bad">
              We couldn&apos;t load the rates just now — this is not a list
              of zeroes. Reload to try again.
            </div>
          ) : rows.length === 0 ? (
            <div className="tx-msg">No rates published yet.</div>
          ) : (
            <>
              {countries.map((r) => (
                <div
                  key={r.country_code}
                  className={
                    "tx-row" +
                    (r.country_code.toUpperCase() === mine ? " on" : "")
                  }
                >
                  <span className="tx-flag">{r.country_code}</span>
                  <span className="tx-name">{r.country_name}</span>
                  <span className="tx-rate">{pct(r.rate_pct)}</span>
                </div>
              ))}
              {catchAll ? (
                <div className="tx-row rest">
                  <span className="tx-flag">··</span>
                  <span className="tx-name">{catchAll.country_name}</span>
                  <span className="tx-rate">{pct(catchAll.rate_pct)}</span>
                </div>
              ) : null}
            </>
          )}
        </div>

        <div className="tx-how">
          <p>
            {apiLinked
              ? "A reserve is held against your account balance for the country it advertises in. Released portions come back to your available balance."
              : "A reserve is held for the country this account advertises in. On accounts we fund by hand we show your top-up history rather than a live balance, so the reserve is not a figure we can show here."}
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
.tx-card .mhead{margin-bottom:12px}
.tx-lead{margin:0 0 12px}

/* ── Their own rate ─────────────────────────────────────────────────── */
.tx-hero{position:relative;overflow:hidden;isolation:isolate;
  border-radius:16px;margin:0 0 14px;
  background:linear-gradient(118deg,#141a3a,#1b1140 54%,#241348);
  color:#fff}
.tx-hero-aur{position:absolute;z-index:0;width:220px;height:220px;
  right:-90px;top:-110px;border-radius:50%;filter:blur(38px);
  background:radial-gradient(circle,rgba(124,92,255,.75),transparent 68%)}
.tx-hero-body{position:relative;z-index:1;display:flex;align-items:center;
  gap:12px;padding:15px 16px}
.tx-hero-left{min-width:0;flex:1 1 auto}
.tx-hero-tag{display:block;font-size:.6rem;font-weight:800;
  letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.52)}
.tx-hero-left b{display:block;margin-top:3px;font-family:var(--hd);
  font-weight:800;font-size:1.12rem;letter-spacing:-.01em;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tx-hero-rate{flex:0 0 auto;font-family:var(--hd);font-weight:800;
  font-size:2rem;line-height:1;letter-spacing:-.03em;
  font-variant-numeric:tabular-nums}

/* ── The schedule ───────────────────────────────────────────────────── */
.tx-list{border:1px solid var(--line);border-radius:14px;overflow:hidden}
.tx-head{display:flex;justify-content:space-between;
  padding:8px 13px;background:var(--panel-2);
  font-size:.64rem;font-weight:800;letter-spacing:.09em;
  text-transform:uppercase;color:var(--faint)}
.tx-row{display:flex;align-items:center;gap:11px;padding:9px 13px;
  border-top:1px solid var(--line);min-width:0;position:relative}
.tx-row.rest{border-top:2px solid var(--line-2);color:var(--txt-2)}
.tx-row.on{background:var(--primary-tint);font-weight:650}
.tx-row.on::before{content:"";position:absolute;left:0;top:0;bottom:0;
  width:3px;background:var(--primary)}
.tx-flag{flex:0 0 auto;min-width:24px;font-size:.64rem;font-weight:800;
  letter-spacing:.05em;color:var(--faint);text-transform:uppercase;
  font-variant-numeric:tabular-nums}
.tx-name{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;
  white-space:nowrap;font-size:.9rem}
.tx-rate{flex:0 0 auto;font-weight:700;font-size:.85rem;
  font-variant-numeric:tabular-nums}
.tx-msg{padding:14px 13px;font-size:.84rem;color:var(--txt-2)}
.tx-msg.bad{color:var(--danger)}

/* ── The note ───────────────────────────────────────────────────────── */
.tx-how{margin-top:12px;padding-left:11px;border-left:2px solid var(--line-2)}
.tx-how p{margin:0;font-size:.8rem;line-height:1.5;color:var(--txt-2)}
`;
