"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import useAffiliateStats, {
  AffiliateReferralStat,
} from "@/hooks/use-affiliate-stats";
import { formatCurrency } from "@/lib/utils";
import { Parser } from "json2csv";
import { FileDown, Users, TrendingUp, Wallet } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const EMPTY = "—";

function money(value: number | null | undefined, currency: "USD" | "EUR") {
  const n = Number(value) || 0;
  try {
    return formatCurrency(n, currency);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

export default function AffiliateDashboard() {
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  const { rows, totals, isLoading, isError, error } = useAffiliateStats({
    from: from || null,
    to: to || null,
  });

  const handleExport = () => {
    if (!rows.length) {
      toast.info("Nothing to export for this range.");
      return;
    }
    try {
      const flat = rows.map((r) => ({
        Advertiser: r.referred_advertiser_name ?? "",
        Code: r.referred_advertiser_code ?? "",
        Email: r.referred_advertiser_email ?? "",
        "Commission type": r.commission_type ?? "",
        "Commission %": r.commission_pct ?? "",
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
      const suffix = from || to ? `_${from || "start"}_${to || "now"}` : "";
      a.download = `affiliate_referrals${suffix}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error("Export failed", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  };

  const clearRange = () => {
    setFrom("");
    setTo("");
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Summary */}
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard
          icon={<Users className="h-4 w-4" />}
          label="Referred advertisers"
          value={String(rows.length)}
          loading={isLoading}
        />
        <SummaryCard
          icon={<Wallet className="h-4 w-4" />}
          label="Total spend"
          value={`${money(totals.spend_usd, "USD")} · ${money(totals.spend_eur, "EUR")}`}
          loading={isLoading}
        />
        <SummaryCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Your earnings"
          value={`${money(totals.earnings_usd, "USD")} · ${money(totals.earnings_eur, "EUR")}`}
          loading={isLoading}
          highlight
        />
      </div>

      {/* Controls */}
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
            <Button variant="ghost" size="sm" onClick={clearRange}>
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

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-muted">
            <TableRow>
              <TableHead>Advertiser</TableHead>
              <TableHead>Commission</TableHead>
              <TableHead className="text-right">Spend (USD)</TableHead>
              <TableHead className="text-right">Spend (EUR)</TableHead>
              <TableHead className="text-right">Top-ups</TableHead>
              <TableHead className="text-right">Earnings (USD)</TableHead>
              <TableHead className="text-right">Earnings (EUR)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i} className="animate-pulse">
                  {Array.from({ length: 7 }).map((__, j) => (
                    <TableCell key={j}>
                      <div className="h-4 w-16 rounded bg-muted" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-destructive">
                  {(error as Error)?.message ?? "Failed to load referrals."}
                </TableCell>
              </TableRow>
            ) : rows.length ? (
              rows.map((r) => <StatRow key={r.referral_link_id} r={r} />)
            ) : (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-10 text-center text-muted-foreground"
                >
                  No referred advertisers in this period yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function StatRow({ r }: { r: AffiliateReferralStat }) {
  return (
    <TableRow>
      <TableCell>
        <div className="flex flex-col">
          <span className="text-[11px] text-muted-foreground">
            {r.referred_advertiser_code || EMPTY}
          </span>
          <span className="font-medium">
            {r.referred_advertiser_name || "Unknown advertiser"}
          </span>
          {r.referred_advertiser_email && (
            <span className="text-xs text-muted-foreground">
              {r.referred_advertiser_email}
            </span>
          )}
        </div>
      </TableCell>
      <TableCell className="text-sm">
        {r.commission_type
          ? `${r.commission_type}${r.commission_pct ? ` · ${r.commission_pct}%` : ""}`
          : EMPTY}
      </TableCell>
      <TableCell className="text-right font-mono">
        {money(r.spend_usd, "USD")}
      </TableCell>
      <TableCell className="text-right font-mono">
        {money(r.spend_eur, "EUR")}
      </TableCell>
      <TableCell className="text-right font-mono">{r.topup_count}</TableCell>
      <TableCell className="text-right font-mono font-semibold">
        {money(r.earnings_usd, "USD")}
      </TableCell>
      <TableCell className="text-right font-mono font-semibold">
        {money(r.earnings_eur, "EUR")}
      </TableCell>
    </TableRow>
  );
}

function SummaryCard({
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
    <Card className={highlight ? "border-primary/40 bg-primary/5" : ""}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {icon}
          {label}
        </div>
        {loading ? (
          <div className="mt-2 h-6 w-24 animate-pulse rounded bg-muted" />
        ) : (
          <div className="mt-1 text-lg font-semibold tracking-tight">
            {value}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
