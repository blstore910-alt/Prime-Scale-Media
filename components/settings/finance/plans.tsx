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
import { listPlans, upsertPlan } from "@/actions/plan-actions";
import type { Plan, PlanCurrency, PlanKind } from "@/lib/types/plan";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const KINDS: PlanKind[] = ["tier", "community"];
const CURRENCIES: PlanCurrency[] = ["EUR", "USD"];

type Row = {
  id: string;
  name: string;
  kind: PlanKind;
  monthly: string;
  currency: PlanCurrency;
  included: string;
  pct: string;
  is_active: boolean;
  updated_at: string;
  dirty: boolean;
};

export default function PlansCard() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["plans", "all"],
    queryFn: async () => {
      const res = await listPlans();
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
  });

  const initial = useMemo<Row[]>(
    () =>
      (data ?? []).map((p: Plan) => ({
        id: p.id,
        name: p.name,
        kind: p.kind,
        monthly: String(p.monthly_fee).replace(/\.00$/, ""),
        currency: p.currency,
        included: String(p.included_ad_accounts),
        pct: String(p.topup_fee_pct).replace(/\.00$/, ""),
        is_active: p.is_active,
        updated_at: p.updated_at,
        dirty: false,
      })),
    [data],
  );
  const [rows, setRows] = useState<Row[]>(initial);
  useEffect(() => setRows(initial), [initial]);

  const [nName, setNName] = useState("");
  const [nKind, setNKind] = useState<PlanKind>("community");
  const [nMonthly, setNMonthly] = useState("0");
  const [nCurrency, setNCurrency] = useState<PlanCurrency>("EUR");
  const [nIncluded, setNIncluded] = useState("1");
  const [nPct, setNPct] = useState("5");

  const patch = (i: number, p: Partial<Row>) =>
    setRows((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], ...p, dirty: true };
      return next;
    });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["plans"] });

  const { mutate: saveAll, isPending: saving } = useMutation({
    mutationFn: async () => {
      const dirty = rows.filter((r) => r.dirty);
      for (const r of dirty) {
        const res = await upsertPlan({
          id: r.id,
          name: r.name.trim(),
          kind: r.kind,
          monthly_fee: Number(r.monthly),
          currency: r.currency,
          included_ad_accounts: Number(r.included),
          topup_fee_pct: Number(r.pct),
          is_active: r.is_active,
          ifUpdatedAt: r.updated_at,
        });
        if (!res.ok) throw new Error(res.error);
      }
      return dirty.length;
    },
    onSuccess: (n) => {
      toast.success(n === 0 ? "No changes to save" : `Saved ${n} plan(s)`);
      invalidate();
    },
    onError: (e: Error) =>
      toast.error("Failed to save plans", { description: e.message }),
  });

  const { mutate: add, isPending: adding } = useMutation({
    mutationFn: async () => {
      const res = await upsertPlan({
        name: nName.trim(),
        kind: nKind,
        monthly_fee: Number(nMonthly),
        currency: nCurrency,
        included_ad_accounts: Number(nIncluded),
        topup_fee_pct: Number(nPct),
      });
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success("Plan added");
      setNName("");
      setNMonthly("0");
      setNIncluded("1");
      setNPct("5");
      invalidate();
    },
    onError: (e: Error) =>
      toast.error("Failed to add plan", { description: e.message }),
  });

  const anyDirty = rows.some((r) => r.dirty);
  const sym = (c: PlanCurrency) => (c === "USD" ? "$" : "€");

  // Six tracks plus gaps exceed a phone's width, and the horizontal scroller
  // that used to hold them meant dragging the grid left and right to read it
  // — with the column you were editing reliably off screen.
  //
  // Below sm each plan is a small card with its fields labelled; from sm up
  // it is the same six-column grid, with the floor that stops the name
  // column collapsing to 0px.
  const cols =
    "grid grid-cols-2 items-center gap-x-3 gap-y-2 rounded-lg border p-3 sm:grid-cols-[minmax(140px,1fr)_90px_90px_70px_70px_52px] sm:min-w-[560px] sm:gap-2 sm:rounded-none sm:border-0 sm:p-0";
  const lab = "text-xs text-muted-foreground sm:hidden";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Plans &amp; Communities</CardTitle>
        <CardDescription>
          Billing presets used to pre-fill an advertiser at invite time —
          monthly fee, included ad accounts, and default topup fee. Tiers
          (Launch/Prime/Flex) and communities (e.g. NSA = free). Editable;
          changing a preset never touches existing advertisers.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex h-24 items-center justify-center">
            <Loader2 className="animate-spin" />
          </div>
        ) : isError ? (
          <p className="text-destructive">{(error as Error)?.message}</p>
        ) : (
          <div className="grid gap-3 sm:overflow-x-auto">
            <div className="hidden sm:grid grid-cols-[minmax(140px,1fr)_90px_90px_70px_70px_52px] gap-2 items-center min-w-[560px] text-xs text-muted-foreground border-b pb-1">
              <span>Name</span>
              <span>Kind</span>
              <span className="text-right">Monthly</span>
              <span className="text-right">Incl.</span>
              <span className="text-right">Fee %</span>
              <span className="text-right">On</span>
            </div>
            {rows.map((r, i) => (
              <div key={r.id} className={cols}>
                <label className="col-span-2 grid gap-1 sm:col-span-1">
                  <span className={lab}>Name</span>
                  <Input
                    value={r.name}
                    onChange={(e) => patch(i, { name: e.target.value })}
                  />
                </label>
                <label className="grid gap-1">
                  <span className={lab}>Kind</span>
                <select
                  value={r.kind}
                  onChange={(e) => patch(i, { kind: e.target.value as PlanKind })}
                  className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                >
                  {KINDS.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
                </label>
                <label className="grid gap-1">
                  <span className={lab}>Monthly</span>
                  <div className="flex items-center justify-end gap-1">
                    <span className="text-xs text-muted-foreground">
                      {sym(r.currency)}
                    </span>
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      value={r.monthly}
                      className="text-right"
                      onChange={(e) => patch(i, { monthly: e.target.value })}
                    />
                  </div>
                </label>
                <label className="grid gap-1">
                  <span className={lab}>Included accounts</span>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={r.included}
                    className="text-right"
                    onChange={(e) => patch(i, { included: e.target.value })}
                  />
                </label>
                <label className="grid gap-1">
                  <span className={lab}>Topup fee %</span>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={r.pct}
                    className="text-right"
                    onChange={(e) => patch(i, { pct: e.target.value })}
                  />
                </label>
                <label className="flex items-center gap-2 sm:justify-end sm:pr-2">
                  <input
                    type="checkbox"
                    checked={r.is_active}
                    aria-label={`${r.name} active`}
                    className="h-4 w-4"
                    onChange={(e) => patch(i, { is_active: e.target.checked })}
                  />
                  <span className={lab}>Active</span>
                </label>
              </div>
            ))}

            <div className="mt-2 border-t pt-3 grid gap-2 sm:overflow-x-auto">
              <Label className="text-xs text-muted-foreground">Add a plan</Label>
              <div className="grid grid-cols-2 items-center gap-x-3 gap-y-2 sm:grid-cols-[minmax(140px,1fr)_90px_90px_70px_70px_auto] sm:min-w-[560px] sm:gap-2">
                <Input
                  className="col-span-2 sm:col-span-1"
                  value={nName}
                  placeholder="e.g. VIP"
                  onChange={(e) => setNName(e.target.value)}
                />
                <select
                  value={nKind}
                  onChange={(e) => setNKind(e.target.value as PlanKind)}
                  className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                >
                  {KINDS.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-1">
                  <select
                    value={nCurrency}
                    onChange={(e) =>
                      setNCurrency(e.target.value as PlanCurrency)
                    }
                    className="h-9 rounded-md border border-input bg-transparent px-1 text-xs"
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <Input
                    type="number"
                    min="0"
                    value={nMonthly}
                    placeholder="Monthly fee"
                    className="text-right"
                    onChange={(e) => setNMonthly(e.target.value)}
                  />
                </div>
                <Input
                  type="number"
                  min="0"
                  value={nIncluded}
                  placeholder="Included"
                  className="text-right"
                  onChange={(e) => setNIncluded(e.target.value)}
                />
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={nPct}
                  placeholder="Fee %"
                  className="text-right"
                  onChange={(e) => setNPct(e.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="col-span-2 sm:col-span-1"
                  disabled={adding}
                  onClick={() => add()}
                >
                  {adding ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  Add
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
      <CardFooter className="justify-end">
        <Button disabled={!anyDirty || saving} onClick={() => saveAll()}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save changes
        </Button>
      </CardFooter>
    </Card>
  );
}
