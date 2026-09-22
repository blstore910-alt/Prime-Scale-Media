"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";

import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";

// ── EVERY COMMISSION, AND NOTHING ABOUT OUR MARGIN ──────────────────────
//
// The owner: an advertiser who refers people "must be able to see all
// referrals in detail, per referral all his earnings and type, and sort
// -- nicely transparent". The summary table says what each customer
// brought in; this lists every single commission behind those totals, so
// every figure on the Referrals screen can be traced to its rows.
//
// It reads affiliate_commission_list (plak 39), which returns the date,
// the customer, the kind, the amount and the status -- and deliberately
// not the base or the percentage: amount / percentage is our profit.

type Row = {
  commission_id: string;
  created_at: string;
  referral_link_id: string;
  referred_advertiser_code: string | null;
  referred_advertiser_name: string | null;
  kind: string;
  amount: number | string | null;
  currency: string;
  status: string;
};

type Sort = "newest" | "oldest" | "largest";
type KindFilter = "all" | "topup" | "subscription" | "onetime";
type StatusFilter = "all" | "owed" | "paid";

const KIND_LABEL: Record<string, string> = {
  topup: "Top-up",
  subscription: "Subscription",
  onetime: "Welcome bonus",
};

function kindBadge(kind: string) {
  const cls = kind === "subscription" ? "info" : kind === "onetime" ? "pend" : "ok";
  return <span className={`badge ${cls}`}>{KIND_LABEL[kind] ?? "Commission"}</span>;
}

function statusBadge(status: string) {
  if (status === "paid") return <span className="badge ok">Paid</span>;
  if (status === "owed") return <span className="badge pend">To be paid</span>;
  if (status === "processing") return <span className="badge muted">Processing</span>;
  if (status === "reversed") return <span className="badge muted">Reversed</span>;
  return <span className="badge muted">{status}</span>;
}

function sumBy(rows: Row[], pick: (r: Row) => boolean): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    if (!pick(r)) continue;
    const n = Number(r.amount);
    if (!Number.isFinite(n)) continue;
    const c = String(r.currency || "EUR").toUpperCase();
    out[c] = Math.round(((out[c] ?? 0) + n) * 100) / 100;
  }
  return out;
}

function money(m: Record<string, number>): string {
  const legs = Object.entries(m).filter(([, v]) => Math.abs(v) >= 0.005);
  if (!legs.length) return formatCurrency(0, "EUR");
  return legs
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([c, v]) => formatCurrency(v, c))
    .join(" + ");
}

export default function AffiliateCommissionsCard({
  enabled,
  focusCode,
  onClearFocus,
}: {
  enabled: boolean;
  /** A referral picked in the table above -- the list narrows to them. */
  focusCode: string | null;
  onClearFocus: () => void;
}) {
  const [sort, setSort] = useState<Sort>("newest");
  const [kind, setKind] = useState<KindFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");

  const q = useQuery({
    queryKey: ["affiliate-commissions"],
    enabled,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("affiliate_commission_list", {
        p_from: null,
        p_to: null,
      });
      if (error) {
        if (/PGRST202|could not find the function|does not exist/i.test(String(error.message))) {
          return { missing: true as const, rows: [] as Row[] };
        }
        throw error;
      }
      return { missing: false as const, rows: (data ?? []) as Row[] };
    },
  });

  const all = useMemo(() => q.data?.rows ?? [], [q.data]);

  const rows = useMemo(() => {
    let list = all.filter((r) => (focusCode ? r.referred_advertiser_code === focusCode : true));
    if (kind !== "all") list = list.filter((r) => r.kind === kind);
    if (status !== "all") list = list.filter((r) => r.status === status);
    const byTime = (r: Row) => Date.parse(r.created_at) || 0;
    list = [...list].sort((a, b) =>
      sort === "oldest"
        ? byTime(a) - byTime(b)
        : sort === "largest"
          ? (Number(b.amount) || 0) - (Number(a.amount) || 0)
          : byTime(b) - byTime(a),
    );
    return list;
  }, [all, focusCode, kind, status, sort]);

  // Totals of what is on screen, so a number is always the sum of the rows
  // under it. Reversed and still-processing rows are shown but not money.
  const earned = sumBy(rows, (r) => r.status === "paid" || r.status === "owed");
  const owed = sumBy(rows, (r) => r.status === "owed");
  const paid = sumBy(rows, (r) => r.status === "paid");

  return (
    <div className="card" style={{ padding: "16px 8px 8px" }}>
      <div style={{ padding: "0 14px 8px" }}>
        <h2 style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          Every commission
          {focusCode ? (
            <button
              type="button"
              className="badge info"
              onClick={onClearFocus}
              style={{ border: 0, cursor: "pointer" }}
              title="Show every referral again"
            >
              {focusCode} ✕
            </button>
          ) : null}
        </h2>
        <p className="cap" style={{ margin: "4px 0 10px" }}>
          Each one, with what it came from and whether it has been paid.
        </p>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <div className="seg2" role="group" aria-label="Kind">
            {(["all", "topup", "subscription", "onetime"] as KindFilter[]).map((k) => (
              <button
                key={k}
                type="button"
                className={kind === k ? "on" : ""}
                onClick={() => setKind(k)}
                style={{ padding: "6px 10px", fontSize: ".8rem" }}
              >
                {k === "all" ? "All" : k === "topup" ? "Top-ups" : k === "subscription" ? "Subscriptions" : "Bonus"}
              </button>
            ))}
          </div>
          <select
            aria-label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
            style={{ border: "1px solid var(--line-2)", borderRadius: 10, padding: "7px 10px", background: "var(--panel)", font: "inherit", fontSize: ".82rem" }}
          >
            <option value="all">Any status</option>
            <option value="owed">To be paid</option>
            <option value="paid">Paid</option>
          </select>
          <select
            aria-label="Sort"
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            style={{ border: "1px solid var(--line-2)", borderRadius: 10, padding: "7px 10px", background: "var(--panel)", font: "inherit", fontSize: ".82rem" }}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="largest">Largest first</option>
          </select>
        </div>

        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 12, fontSize: ".86rem" }}>
          <span>
            Earned <b>{q.isLoading || q.isError ? "—" : money(earned)}</b>
          </span>
          <span>
            To be paid <b>{q.isLoading || q.isError ? "—" : money(owed)}</b>
          </span>
          <span>
            Paid <b>{q.isLoading || q.isError ? "—" : money(paid)}</b>
          </span>
        </div>
      </div>

      <div className="tblwrap">
        <table className="tbl wide">
          <thead>
            <tr>
              <th style={{ paddingLeft: 14 }}>Date</th>
              <th>Referral</th>
              <th>From</th>
              <th className="r">Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {q.isLoading ? (
              <tr>
                <td colSpan={5} style={{ textAlign: "center", padding: 24, color: "var(--faint)" }}>
                  Loading your commissions…
                </td>
              </tr>
            ) : q.isError ? (
              <tr>
                <td colSpan={5} style={{ textAlign: "center", padding: 24, color: "var(--faint)" }}>
                  We couldn&apos;t read your commissions just now — this is not a zero. Reload to try again.
                </td>
              </tr>
            ) : q.data?.missing ? (
              <tr>
                <td colSpan={5} style={{ textAlign: "center", padding: 24, color: "var(--faint)" }}>
                  The detailed list is being switched on. Your totals above are up to date.
                </td>
              </tr>
            ) : rows.length ? (
              rows.map((r) => (
                <tr key={r.commission_id}>
                  <td data-label="Date" style={{ whiteSpace: "nowrap", fontWeight: 600 }}>
                    {dayjs(r.created_at).format("D MMM YYYY")}
                  </td>
                  <td data-label="Referral">
                    {r.referred_advertiser_name || "Advertiser"}{" "}
                    <span className="mono" style={{ color: "var(--faint)", fontSize: ".78rem" }}>
                      {r.referred_advertiser_code}
                    </span>
                  </td>
                  <td data-label="From">{kindBadge(r.kind)}</td>
                  <td
                    data-label="Amount"
                    className="r mono"
                    style={{
                      fontWeight: 700,
                      color: r.status === "reversed" ? "var(--faint)" : "var(--win)",
                      textDecoration: r.status === "reversed" ? "line-through" : undefined,
                    }}
                  >
                    {r.amount === null || r.amount === undefined
                      ? "—"
                      : formatCurrency(Number(r.amount), String(r.currency || "EUR"))}
                  </td>
                  <td data-label="Status">{statusBadge(r.status)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} style={{ textAlign: "center", padding: 24, color: "var(--faint)" }}>
                  {all.length ? "Nothing matches these filters." : "No commission yet — it appears here the moment one is earned."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
