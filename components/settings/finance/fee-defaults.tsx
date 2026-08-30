"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  listFeeDefaults,
  upsertFeeDefault,
} from "@/actions/fee-default-actions";
import type {
  FeeDefault,
  FeeDefaultCurrency,
  FeeDefaultPlatform,
} from "@/lib/types/fee-default";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const PLATFORM_LABELS: Record<FeeDefaultPlatform, string> = {
  "meta-ads": "Meta Ads",
  "tiktok-ads": "TikTok Ads",
  "google-ads": "Google Ads",
};

const CURRENCIES: FeeDefaultCurrency[] = ["USD", "EUR"];

type EditableRow = {
  platform: FeeDefaultPlatform;
  currency: FeeDefaultCurrency;
  fee_pct_str: string;
  is_active: boolean;
  dirty: boolean;
};

// Percentage input works in whole percent (5 = 5%) while the DB and
// resolver work in fractions (0.05). Convert at the boundary.
function pctToFraction(pctStr: string): number | null {
  const v = Number(pctStr);
  if (!Number.isFinite(v) || v < 0 || v > 100) return null;
  return v / 100;
}

function fractionToPct(fraction: number): string {
  return (fraction * 100).toFixed(2).replace(/\.00$/, "");
}

export default function FeeDefaultsCard() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["fee-defaults"],
    queryFn: async () => {
      const res = await listFeeDefaults();
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
  });

  // Materialise rows for the full matrix (platform × currency). Any
  // pair missing from the DB starts empty and inserts on save.
  const initialRows = useMemo<EditableRow[]>(() => {
    const byKey = new Map<string, FeeDefault>();
    for (const r of data ?? []) {
      byKey.set(`${r.platform}|${r.currency}`, r);
    }
    const rows: EditableRow[] = [];
    for (const platform of Object.keys(PLATFORM_LABELS) as FeeDefaultPlatform[]) {
      for (const currency of CURRENCIES) {
        const existing = byKey.get(`${platform}|${currency}`);
        rows.push({
          platform,
          currency,
          fee_pct_str: existing ? fractionToPct(existing.fee_pct) : "",
          is_active: existing?.is_active ?? true,
          dirty: false,
        });
      }
    }
    return rows;
  }, [data]);

  const [rows, setRows] = useState<EditableRow[]>(initialRows);
  useEffect(() => setRows(initialRows), [initialRows]);

  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      const dirty = rows.filter((r) => r.dirty && r.fee_pct_str !== "");
      for (const row of dirty) {
        const fraction = pctToFraction(row.fee_pct_str);
        if (fraction == null) {
          throw new Error(
            `${PLATFORM_LABELS[row.platform]} ${row.currency}: enter a percent between 0 and 100.`,
          );
        }
        const res = await upsertFeeDefault({
          platform: row.platform,
          currency: row.currency,
          fee_pct: fraction,
          is_active: row.is_active,
        });
        if (!res.ok) throw new Error(res.error);
      }
      return dirty.length;
    },
    onSuccess: (count) => {
      toast.success(
        count === 0 ? "No changes to save" : `Saved ${count} fee update(s)`,
      );
      queryClient.invalidateQueries({ queryKey: ["fee-defaults"] });
    },
    onError: (err: Error) => {
      toast.error("Failed to save fees", { description: err.message });
    },
  });

  const anyDirty = rows.some((r) => r.dirty);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Topup Fees</CardTitle>
        <CardDescription>
          Default fee percentage charged on wallet top-ups, per ad
          platform and currency. Applies to new topups only; existing
          topups keep their historic fee.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="p-6 flex items-center justify-center h-40">
            <Loader2 className="animate-spin" />
          </div>
        ) : isError ? (
          <div className="p-6 flex items-center justify-center h-40">
            <p className="text-destructive">{error?.message}</p>
          </div>
        ) : (
          <div className="grid gap-3">
            <div className="grid grid-cols-[1fr_1fr_120px] text-xs text-muted-foreground pb-1 border-b">
              <span>Platform</span>
              <span>Currency</span>
              <span className="text-right">Fee %</span>
            </div>
            {rows.map((row, idx) => (
              <div
                key={`${row.platform}-${row.currency}`}
                className="grid grid-cols-[1fr_1fr_120px] items-center"
              >
                <Label className="text-sm">
                  {PLATFORM_LABELS[row.platform]}
                </Label>
                <span className="text-sm text-muted-foreground">
                  {row.currency}
                </span>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={row.fee_pct_str}
                  placeholder="5"
                  className="text-right"
                  onChange={(e) => {
                    const next = [...rows];
                    next[idx] = {
                      ...next[idx],
                      fee_pct_str: e.target.value,
                      dirty: true,
                    };
                    setRows(next);
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </CardContent>
      <CardFooter className="justify-end">
        <Button
          disabled={!anyDirty || isPending}
          onClick={() => mutate()}
        >
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save fees
        </Button>
      </CardFooter>
    </Card>
  );
}
