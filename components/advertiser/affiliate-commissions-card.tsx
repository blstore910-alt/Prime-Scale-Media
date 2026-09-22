"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";

import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";
import PlatformMark from "@/components/psm/platform-mark";
import { Ic } from "@/components/advertiser/adv-icons";

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
  /** Meta / Google / TikTok for a top-up -- the network, never the
   *  account type (plak 40). Absent before that plak. */
  network?: string | null;
};

type Sort = "newest" | "oldest" | "largest";
type KindFilter = "all" | "topup" | "subscription" | "onetime";
type StatusFilter = "all" | "owed" | "paid";

const KIND_LABEL: Record<string, string> = {
  topup: "Top-up",
  subscription: "Subscription",
  onetime: "Welcome bonus",
};

// What the commission came from, as a mark: the network's own logo for a
// top-up (Meta, never the account type), a receipt for a plan invoice, a
// gift for the welcome bonus.
function kindMark(r: Row) {
  if (r.kind === "topup") {
    return (
      <span className="pfi">
        <PlatformMark slug={r.network ?? null} className="pmark" />
      </span>
    );
  }
  if (r.kind === "subscription") {
    return (
      <span className="pfi k-sub">
        <Ic name="i-receipt" />
      </span>
    );
  }
  return (
    <span className="pfi k-bonus">
      <Ic name="i-gift" />
    </span>
  );
}

function statusBadge(status: string) {
  if (status === "paid") return <span className="badge ok xs">Paid</span>;
  if (status === "owed") return <span className="badge pend xs">To be paid</span>;
  if (status === "processing") return <span className="badge muted xs">Processing</span>;
  if (status === "reversed") return <span className="badge muted xs">Reversed</span>;
  return <span className="badge muted xs">{status}</span>;
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
  from = null,
  to = null,
  periodLabel,
}: {
  enabled: boolean;
  /** A referral picked in the table above -- the list narrows to them. */
  focusCode: string | null;
  onClearFocus: () => void;
  /** The period picked above the stats (yyyy-mm-dd, inclusive); null = all time. */
  from?: string | null;
  to?: string | null;
  /** "1 – 22 Sep 2026" -- said beside the totals, so they are never read as all-time. */
  periodLabel?: string;
}) {
  const [sort, setSort] = useState<Sort>("newest");
  const [kind, setKind] = useState<KindFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");

  // The same widening as useAffiliateStats: a date is a whole local day.
  const fromIso = from ? new Date(`${from}T00:00:00`).toISOString() : null;
  const toIso = to ? new Date(`${to}T23:59:59.999`).toISOString() : null;

  const q = useQuery({
    queryKey: ["affiliate-commissions", fromIso ?? "", toIso ?? ""],
    enabled,
    refetchOnWindowFocus: true,
    // Keep the previous period on screen while the next one loads, so the
    // list does not blink empty between two pills.
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("affiliate_commission_list", {
        p_from: fromIso,
        p_to: toIso,
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

  const focused = useMemo(
    () => all.filter((r) => (focusCode ? r.referred_advertiser_code === focusCode : true)),
    [all, focusCode],
  );
  // Each chip's count is the number of rows it would show, given the OTHER
  // filter -- so pressing a chip never disagrees with its own number.
  const kindCount = (k: KindFilter) =>
    focused.filter((r) => (k === "all" || r.kind === k) && (status === "all" || r.status === status)).length;
  const statusCount = (st: StatusFilter) =>
    focused.filter((r) => (st === "all" || r.status === st) && (kind === "all" || r.kind === kind)).length;

  const rows = useMemo(() => {
    let list = focused;
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
  }, [focused, kind, status, sort]);

  // Totals of what is on screen, so a number is always the sum of the rows
  // under it. Reversed and still-processing rows are shown but not money.
  const earned = sumBy(rows, (r) => r.status === "paid" || r.status === "owed");
  const owed = sumBy(rows, (r) => r.status === "owed");
  const paid = sumBy(rows, (r) => r.status === "paid");

  const dash = q.isLoading || q.isError || q.data?.missing;

  return (
    <div className={`card xlist${q.isPlaceholderData ? " busy" : ""}`}>
      <div className="xl-head">
        <h2>
          <Ic name="i-wallet" /> Every commission
        </h2>
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
        <label className="xsel xl-sort">
          <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="largest">Largest</option>
          </select>
          <Ic name="i-chev" />
        </label>
        {!dash ? <span className="xl-count">{rows.length}</span> : null}
      </div>

      {/* Two segmented rows that always fit a 360px phone: nothing to
          scroll sideways for, every option and its count in view. */}
      <div className="xseg" role="group" aria-label="Kind">
        {(["all", "topup", "subscription", "onetime"] as KindFilter[]).map((k) => (
          <button
            key={k}
            type="button"
            className={kind === k ? "on" : ""}
            aria-pressed={kind === k}
            onClick={() => setKind(k)}
          >
            {k === "all" ? (
              <Ic name="i-grid" />
            ) : k === "topup" ? (
              <PlatformMark slug="meta" className="pmark" />
            ) : k === "subscription" ? (
              <Ic name="i-receipt" />
            ) : (
              <Ic name="i-gift" />
            )}
            {k === "all" ? "All" : k === "topup" ? "Top-ups" : k === "subscription" ? "Plans" : "Bonus"}
            {!dash ? <span className="n">{kindCount(k)}</span> : null}
          </button>
        ))}
      </div>
      <div className="xseg" role="group" aria-label="Status">
        {(["all", "owed", "paid"] as StatusFilter[]).map((st) => (
          <button
            key={st}
            type="button"
            className={status === st ? "on" : ""}
            aria-pressed={status === st}
            onClick={() => setStatus(st)}
          >
            {st === "all" ? "Any status" : st === "owed" ? "To be paid" : "Paid"}
            {!dash ? <span className="n">{statusCount(st)}</span> : null}
          </button>
        ))}
      </div>

      {/* Totals of what is on screen, so a number is always the sum of
          the rows under it. Reversed and still-processing rows are shown
          but are not money. */}
      <div className="xl-sum">
        {periodLabel ? <span style={{ color: "var(--faint)" }}>{periodLabel}</span> : null}
        <span>
          Earned <b>{dash ? "—" : money(earned)}</b>
        </span>
        <span>
          To be paid <b>{dash ? "—" : money(owed)}</b>
        </span>
        <span>
          Paid <b>{dash ? "—" : money(paid)}</b>
        </span>
      </div>

      {q.isLoading ? (
        <p className="xl-empty">Loading your commissions…</p>
      ) : q.isError ? (
        <p className="xl-empty">
          We couldn&apos;t read your commissions just now — this is not a zero. Reload to try again.
        </p>
      ) : q.data?.missing ? (
        <p className="xl-empty">The detailed list is being switched on. Your totals above are up to date.</p>
      ) : rows.length ? (
        rows.map((r) => {
          const reversed = r.status === "reversed";
          const n = Number(r.amount);
          return (
            <div className="xrow" key={r.commission_id}>
              {kindMark(r)}
              <span className="mid">
                <span className="nm">
                  <span className="t">{r.referred_advertiser_name || "Advertiser"}</span>
                </span>
                <span className="sm">
                  {[
                    dayjs(r.created_at).format("D MMM YYYY"),
                    KIND_LABEL[r.kind] ?? "Commission",
                    r.kind === "topup" && r.network ? r.network : null,
                    r.referred_advertiser_code,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              <span className="rt">
                <span className={`amt${reversed ? " rev" : ""}`}>
                  {r.amount === null || r.amount === undefined || !Number.isFinite(n)
                    ? "—"
                    : formatCurrency(n, String(r.currency || "EUR"))}
                </span>
                {statusBadge(r.status)}
              </span>
            </div>
          );
        })
      ) : (
        <p className="xl-empty">
          {all.length
            ? "Nothing matches these filters."
            : from || to
              ? "No commission in this period."
              : "No commission yet — it appears here the moment one is earned."}
        </p>
      )}
    </div>
  );
}
