"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import useAffiliateStats, {
  AffiliateReferralStat,
} from "@/hooks/use-affiliate-stats";
import { formatCurrency } from "@/lib/utils";
import { Parser } from "json2csv";
import {
  FileDown,
  Users,
  Wallet,
  Sparkles,
  Trophy,
  TrendingUp,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

// Gamified affiliate "earnings" view. The numbers are real (from
// affiliate_referral_stats); the treatment is the casino/jackpot energy
// the product wants — a big count-up on total earnings, a medal tier, and
// each referral as a "winning ticket".

const TIERS = [
  { name: "Bronze", min: 0, next: 1000 },
  { name: "Silver", min: 1000, next: 5000 },
  { name: "Gold", min: 5000, next: 10000 },
  { name: "Platinum", min: 10000, next: null as number | null },
];

function money(v: number | null | undefined, currency: "USD" | "EUR") {
  const n = Number(v) || 0;
  try {
    return formatCurrency(n, currency);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

// Count-up animation (respects reduced motion).
function useCountUp(target: number, run: boolean) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!run) return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setVal(target);
      return;
    }
    let raf = 0;
    let start: number | null = null;
    const dur = 1200;
    const step = (ts: number) => {
      if (start === null) start = ts;
      const p = Math.min((ts - start) / dur, 1);
      setVal(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, run]);
  return val;
}

export default function AffiliateDashboard() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const { rows, totals, isLoading, isError, error } = useAffiliateStats({
    from: from || null,
    to: to || null,
  });

  // Combined earnings figure for the jackpot + tier (EUR + USD as-is —
  // a headline number, not an FX-exact total).
  const combinedEarn = (totals.earnings_eur || 0) + (totals.earnings_usd || 0);
  const jackpot = useCountUp(totals.earnings_eur || 0, !isLoading);

  const tierIdx = Math.max(
    0,
    TIERS.map((t) => combinedEarn >= t.min).lastIndexOf(true),
  );
  const tier = TIERS[tierIdx];
  const tierPct = tier.next
    ? Math.min(100, Math.round((combinedEarn / tier.next) * 100))
    : 100;

  const handleExport = () => {
    if (!rows.length) {
      toast.info("Nothing to export for this range.");
      return;
    }
    try {
      const flat = rows.map((r) => ({
        Advertiser: r.referred_advertiser_name ?? "",
        Code: r.referred_advertiser_code ?? "",
        "Spend USD": Number(r.spend_usd) || 0,
        "Spend EUR": Number(r.spend_eur) || 0,
        "Top-ups": r.topup_count,
        "Earnings USD": Number(r.earnings_usd) || 0,
        "Earnings EUR": Number(r.earnings_eur) || 0,
      }));
      const csv = new Parser().parse(flat);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "my_referrals.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error("Export failed", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {/* ---- Jackpot hero ---- */}
      <div className="relative overflow-hidden rounded-3xl border border-amber-300/40 p-8 text-center shadow-xl bg-[radial-gradient(120%_140%_at_50%_-10%,rgba(124,92,255,0.14),transparent_60%),radial-gradient(90%_120%_at_90%_0%,rgba(24,184,206,0.12),transparent_60%)] bg-card">
        <div className="pointer-events-none absolute inset-0 bg-[conic-gradient(from_0deg,transparent,rgba(24,184,206,0.08),transparent_30%,rgba(124,92,255,0.10),transparent_60%)] motion-safe:animate-[spin_22s_linear_infinite]" />
        <div className="relative">
          <div className="mb-3 flex items-center justify-center gap-2 font-mono text-[0.72rem] font-bold uppercase tracking-[0.22em] text-amber-600 dark:text-amber-400">
            <Sparkles className="h-3.5 w-3.5" /> Your total earnings
          </div>
          <div
            className="mx-auto font-bold leading-none tracking-tight"
            style={{
              fontFamily: '"Sora", system-ui, sans-serif',
              fontSize: "clamp(3rem, 11vw, 5.5rem)",
              background:
                "linear-gradient(180deg,#f6b83a 0%,#e39a12 45%,#b5730a 100%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
              textShadow: "0 8px 30px rgba(227,154,18,0.22)",
            }}
          >
            {money(jackpot, "EUR")}
          </div>
          {(totals.earnings_usd || 0) > 0 && (
            <div className="mt-1 font-mono text-sm text-muted-foreground">
              + {money(totals.earnings_usd, "USD")} in USD
            </div>
          )}
          <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
            {rows.length > 0
              ? `${rows.length} advertiser${rows.length === 1 ? "" : "s"} you referred are spending — and paying you.`
              : "Share your link below and start earning on every referral."}
          </p>
          <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-400/10 px-4 py-1.5 text-sm font-bold text-amber-600 dark:text-amber-400">
            <Trophy className="h-4 w-4" /> {tier.name} affiliate
          </div>
        </div>
      </div>

      {/* ---- Stat chips ---- */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          icon={<Users className="h-4 w-4" />}
          label="Referred advertisers"
          value={String(rows.length)}
          loading={isLoading}
        />
        <StatCard
          icon={<Wallet className="h-4 w-4" />}
          label="Spend you drove"
          value={`${money(totals.spend_eur, "EUR")} · ${money(totals.spend_usd, "USD")}`}
          loading={isLoading}
        />
        <StatCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Your earnings"
          value={`${money(totals.earnings_eur, "EUR")} · ${money(totals.earnings_usd, "USD")}`}
          loading={isLoading}
          highlight
        />
      </div>

      {/* ---- Tier progress ---- */}
      {tier.next && (
        <div className="rounded-2xl border bg-card p-5">
          <div className="flex items-baseline justify-between text-sm text-muted-foreground">
            <span>
              Next tier:{" "}
              <span className="font-semibold text-foreground">
                {TIERS[Math.min(tierIdx + 1, TIERS.length - 1)].name}
              </span>
            </span>
            <span className="font-mono">
              {money(combinedEarn, "EUR")} / {money(tier.next, "EUR")}
            </span>
          </div>
          <div className="mt-2 h-3 overflow-hidden rounded-full border bg-muted">
            <div
              className="h-full rounded-full transition-[width] duration-[1200ms] ease-out"
              style={{
                width: `${tierPct}%`,
                background: "linear-gradient(90deg,#e39a12,#f6b83a)",
                boxShadow: "0 0 14px rgba(227,154,18,0.45)",
              }}
            />
          </div>
        </div>
      )}

      {/* ---- Controls ---- */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="aff-from" className="text-xs text-muted-foreground">
              From
            </Label>
            <Input
              id="aff-from"
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="aff-to" className="text-xs text-muted-foreground">
              To
            </Label>
            <Input
              id="aff-to"
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
              className="w-40"
            />
          </div>
          {(from || to) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFrom("");
                setTo("");
              }}
            >
              Clear
            </Button>
          )}
        </div>
        <Button
          variant="outline"
          onClick={handleExport}
          disabled={isLoading || !rows.length}
        >
          <FileDown className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {/* ---- Referral tickets ---- */}
      {isLoading ? (
        <div className="grid gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-[74px] animate-pulse rounded-2xl border bg-muted/40"
            />
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-2xl border p-6 text-center text-destructive">
          {(error as Error)?.message ?? "Failed to load referrals."}
        </div>
      ) : rows.length ? (
        <div className="grid gap-3">
          {rows.map((r) => (
            <TicketRow key={r.referral_link_id} r={r} />
          ))}
        </div>
      ) : (
        <EmptyState />
      )}
    </div>
  );
}

function TicketRow({ r }: { r: AffiliateReferralStat }) {
  const name = r.referred_advertiser_name || "Unknown advertiser";
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className="relative grid grid-cols-[44px_1fr_auto] items-center gap-4 overflow-hidden rounded-2xl border bg-card px-4 py-4 transition-transform hover:translate-x-0.5">
      <span className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-violet-500 to-cyan-400" />
      <span
        className="grid h-11 w-11 place-items-center rounded-xl font-bold text-amber-900"
        style={{
          fontFamily: '"Sora", sans-serif',
          background: "linear-gradient(135deg,#fff3d6,#f7ce4b)",
        }}
      >
        {initials}
      </span>
      <div className="min-w-0">
        <div className="truncate font-semibold">{name}</div>
        <div className="font-mono text-[11px] text-muted-foreground">
          {r.referred_advertiser_code || "—"}
        </div>
        <div className="text-xs text-muted-foreground">
          Spent {money(r.spend_eur, "EUR")} · {money(r.spend_usd, "USD")} ·{" "}
          {r.topup_count} top-up{r.topup_count === 1 ? "" : "s"}
        </div>
      </div>
      <div className="text-right">
        <div
          className="font-bold text-emerald-600 dark:text-emerald-400"
          style={{ fontFamily: '"Sora", sans-serif', fontSize: "1.05rem" }}
        >
          {money(r.earnings_eur, "EUR")}
        </div>
        {(r.earnings_usd || 0) > 0 && (
          <div className="text-xs font-medium text-emerald-600/80 dark:text-emerald-400/80">
            {money(r.earnings_usd, "USD")}
          </div>
        )}
        <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          earned
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed p-10 text-center">
      <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-amber-400/15 text-amber-600 dark:text-amber-400">
        <Sparkles className="h-6 w-6" />
      </div>
      <h3
        className="text-lg font-semibold"
        style={{ fontFamily: '"Sora", sans-serif' }}
      >
        No referrals yet — your jackpot is waiting
      </h3>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
        Share your referral link above. Every advertiser who joins through it
        is linked to you, and you earn on their top-ups.
      </p>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  loading,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  loading?: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border bg-card p-4 ${highlight ? "border-emerald-500/40 bg-emerald-500/[0.04]" : ""}`}
    >
      <div className="flex items-center gap-2 font-mono text-[0.68rem] uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      {loading ? (
        <div className="mt-2 h-6 w-24 animate-pulse rounded bg-muted" />
      ) : (
        <div
          className={`mt-1.5 text-lg font-bold tracking-tight ${highlight ? "text-emerald-600 dark:text-emerald-400" : ""}`}
          style={{ fontFamily: '"Sora", sans-serif' }}
        >
          {value}
        </div>
      )}
    </div>
  );
}
