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

  const cols =
    "grid grid-cols-[1fr_90px_90px_70px_70px_52px] gap-2 items-center";

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
          <div className="grid gap-3">
            <div className={`${cols} text-xs text-muted-foreground border-b pb-1`}>
              <span>Name</span>
              <span>Kind</span>
              <span className="text-right">Monthly</span>
              <span className="text-right">Incl.</span>
              <span className="text-right">Fee %</span>
              <span className="text-right">On</span>
            </div>
            {rows.map((r, i) => (
              <div key={r.id} className={cols}>
                <Input
                  value={r.name}
                  onChange={(e) => patch(i, { name: e.target.value })}
                />
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
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={r.included}
                  className="text-right"
                  onChange={(e) => patch(i, { included: e.target.value })}
                />
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={r.pct}
                  className="text-right"
                  onChange={(e) => patch(i, { pct: e.target.value })}
                />
                <div className="flex justify-end pr-2">
                  <input
                    type="checkbox"
                    checked={r.is_active}
                    aria-label={`${r.name} active`}
                    className="h-4 w-4"
                    onChange={(e) => patch(i, { is_active: e.target.checked })}
                  />
                </div>
              </div>
            ))}

            <div className="mt-2 border-t pt-3 grid gap-2">
              <Label className="text-xs text-muted-foreground">Add a plan</Label>
              <div className="grid grid-cols-[1fr_90px_90px_70px_70px_auto] gap-2 items-center">
                <Input
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
                    placeholder="fee"
                    className="text-right"
                    onChange={(e) => setNMonthly(e.target.value)}
                  />
                </div>
                <Input
                  type="number"
                  min="0"
                  value={nIncluded}
                  placeholder="incl"
                  className="text-right"
                  onChange={(e) => setNIncluded(e.target.value)}
                />
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={nPct}
                  placeholder="%"
                  className="text-right"
                  onChange={(e) => setNPct(e.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
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
