"use client";

import ConfirmModal, { ConfirmFact } from "@/components/ui/confirm-modal";
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
  // ── THE COLUMN HOLDS TWO DECIMALS OF A PERCENT ──────────────────
  //
  // fee_defaults.fee_pct is numeric(6,4) and stores a FRACTION, so four
  // decimals of a fraction is two decimals of a percent. The validator
  // accepted 5.125; the column rounded it to 0.0513 and the screen read
  // back "5.13". On a EUR 10,000 top-up that is 513.00 charged where
  // 512.50 was typed, with nothing saying the figure moved.
  //
  // Refusing is better than silently storing something else: the admin
  // retypes one digit instead of discovering it on an invoice.
  if (Math.abs(v * 100 - Math.round(v * 100)) > 1e-9) return null;
  return Math.round(v * 100) / 10_000;
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
  const [ask, setAsk] = useState(false);
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
        <Button disabled={!anyDirty || isPending} onClick={() => setAsk(true)}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save fees
        </Button>
      </CardFooter>

      {/* A diff, and a confirmation. These percentages are what every future
          top-up is charged — our own margin — and the Save button is gated
          only on a row being dirty, which a scroll wheel over a focused
          number input does silently. The Banks card next door already
          double-confirms with a changed-field list; the card that sets the
          margin did not. */}
      <ConfirmModal
        open={ask}
        onOpenChange={setAsk}
        title="Change the top-up fees?"
        lead="This is what every new top-up is charged from now on. Existing top-ups keep the fee they were charged."
        cta="Yes, save these fees"
        busy={isPending}
        busyLabel="Saving…"
        onConfirm={() => {
          setAsk(false);
          mutate();
        }}
      >
        {rows
          .filter((r) => r.dirty && r.fee_pct_str !== "")
          .map((r) => {
            const before = initialRows.find(
              (i) => i.platform === r.platform && i.currency === r.currency,
            )?.fee_pct_str;
            return (
              <ConfirmFact
                key={`${r.platform}-${r.currency}`}
                label={`${PLATFORM_LABELS[r.platform]} · ${r.currency}`}
                value={`${before || "—"}% → ${r.fee_pct_str}%`}
                strong
              />
            );
          })}
      </ConfirmModal>
    </Card>
  );
}
