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
  listAdAccountTypes,
  upsertAdAccountType,
} from "@/actions/ad-account-type-actions";
import type {
  AdAccountPlatformGroup,
  AdAccountType,
} from "@/lib/types/ad-account-type";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const GROUP_LABELS: Record<AdAccountPlatformGroup, string> = {
  meta: "Meta",
  google: "Google",
  tiktok: "TikTok",
};
const GROUPS = Object.keys(GROUP_LABELS) as AdAccountPlatformGroup[];

type EditRow = {
  id: string;
  label: string;
  platform_group: AdAccountPlatformGroup;
  fee_str: string;
  api_topup_enabled: boolean;
  is_active: boolean;
  // Where an admin goes to fund an account of this type by hand. Only
  // one type tops up over the API, so this is the path for most of
  // them — and the review screen had no way to say which supplier.
  supplier_label: string;
  supplier_url: string;
  updated_at: string;
  dirty: boolean;
};

function parsePct(v: string): number | null {
  // ── AN EMPTY BOX IS NOT ZERO ────────────────────────────────────────
  //
  // Number("") is 0, so clearing the Fee % field and pressing Save wrote
  // 0% over "Saved 1 type(s)" — and a 0 there is read everywhere else as
  // "not set, use the plan rate", which is a third thing again. The same
  // bug was found and fixed for plans in plan-actions.ts with a
  // blankOrNumber helper and a comment saying exactly this; it was never
  // brought here. null means "leave it alone", which is what the caller
  // already does with null.
  if (v.trim() === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return n;
}

export default function AdAccountTypesCard() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["ad-account-types", "all"],
    queryFn: async () => {
      const res = await listAdAccountTypes();
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
  });

  const initial = useMemo<EditRow[]>(
    () =>
      (data ?? []).map((t: AdAccountType) => ({
        id: t.id,
        label: t.label,
        platform_group: t.platform_group,
        fee_str: String(t.default_fee_pct).replace(/\.00$/, ""),
        api_topup_enabled: t.api_topup_enabled,
        is_active: t.is_active,
        supplier_label: t.supplier_label ?? "",
        supplier_url: t.supplier_url ?? "",
        updated_at: t.updated_at,
        dirty: false,
      })),
    [data],
  );

  const [rows, setRows] = useState<EditRow[]>(initial);
  useEffect(() => setRows(initial), [initial]);

  // Add-type form
  const [newLabel, setNewLabel] = useState("");
  const [newGroup, setNewGroup] = useState<AdAccountPlatformGroup>("meta");
  const [newFee, setNewFee] = useState("5");
  const [newApi, setNewApi] = useState(false);

  const patchRow = (idx: number, patch: Partial<EditRow>) => {
    setRows((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch, dirty: true };
      return next;
    });
  };

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["ad-account-types"] });
  };

  const { mutate: saveAll, isPending: saving } = useMutation({
    mutationFn: async () => {
      const dirty = rows.filter((r) => r.dirty);
      const warnings: string[] = [];
      for (const row of dirty) {
        const fee = parsePct(row.fee_str);
        if (!row.label.trim()) throw new Error("A type name can't be empty.");
        if (fee == null) {
          throw new Error(`${row.label}: fee must be a percent 0–100.`);
        }
        const res = await upsertAdAccountType({
          id: row.id,
          label: row.label.trim(),
          platform_group: row.platform_group,
          default_fee_pct: fee,
          api_topup_enabled: row.api_topup_enabled,
          is_active: row.is_active,
          supplier_label: row.supplier_label.trim(),
          supplier_url: row.supplier_url.trim(),
          ifUpdatedAt: row.updated_at,
        });
        if (!res.ok) throw new Error(res.error);
        // The action can save the type and NOT the supplier link, when
        // the column is not on the database yet. Saying "Saved" over
        // that is the fake success this codebase keeps having to
        // remove, so it is surfaced.
        if (res.warning) warnings.push(`${row.label}: ${res.warning}`);
      }
      return { count: dirty.length, warnings };
    },
    onSuccess: ({ count, warnings }) => {
      toast.success(count === 0 ? "No changes to save" : `Saved ${count} type(s)`);
      if (warnings.length) {
        toast.warning("Not everything was saved", {
          description: warnings.join(" "),
          duration: 15000,
        });
      }
      invalidate();
    },
    onError: (err: Error) =>
      toast.error("Failed to save types", { description: err.message }),
  });

  const { mutate: addType, isPending: adding } = useMutation({
    mutationFn: async () => {
      const fee = parsePct(newFee);
      if (!newLabel.trim()) throw new Error("Enter a type name.");
      if (fee == null) throw new Error("Fee must be a percent 0–100.");
      const res = await upsertAdAccountType({
        label: newLabel.trim(),
        platform_group: newGroup,
        default_fee_pct: fee,
        api_topup_enabled: newApi,
      });
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success("Type added");
      setNewLabel("");
      setNewGroup("meta");
      setNewFee("5");
      setNewApi(false);
      invalidate();
    },
    onError: (err: Error) =>
      toast.error("Failed to add type", { description: err.message }),
  });

  const anyDirty = rows.some((r) => r.dirty);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ad-Account Types &amp; Fees</CardTitle>
        <CardDescription>
          Each type carries a default fee that auto-fills when an ad
          account of that type is created (still editable per account).
          Deactivate a type to hide it from the create form without
          losing history.
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
          /* No sideways scroll on a phone. A five-column grid with a 470px
             floor meant every settings table had to be dragged left and
             right to be read, one hand on the phone — and the column you
             were editing was never the one on screen. Below sm each row
             becomes a small card with its fields labelled; from sm up it is
             the same table it always was. */
          <div className="grid gap-3 sm:overflow-x-auto">
            <div className="hidden sm:grid grid-cols-[minmax(130px,1fr)_100px_78px_52px_52px] gap-2 min-w-[470px] text-xs text-muted-foreground pb-1 border-b">
              <span>Type name</span>
              <span>Platform</span>
              <span className="text-right">Fee %</span>
              <span className="text-right" title="Auto-topup via supplier API (Supplier 1)">API</span>
              <span className="text-right">Active</span>
            </div>
            {rows.map((row, idx) => (
              <div
                key={row.id}
                className="grid grid-cols-2 items-center gap-x-3 gap-y-2 rounded-lg border p-3 sm:grid-cols-[minmax(130px,1fr)_100px_78px_52px_52px] sm:min-w-[470px] sm:gap-2 sm:rounded-none sm:border-0 sm:p-0"
              >
                <label className="col-span-2 grid gap-1 sm:col-span-1">
                  <span className="text-xs text-muted-foreground sm:hidden">
                    Type name
                  </span>
                  <Input
                    value={row.label}
                    onChange={(e) => patchRow(idx, { label: e.target.value })}
                    className={row.is_active ? "" : "opacity-60"}
                  />
                </label>
                <label className="grid gap-1">
                  <span className="text-xs text-muted-foreground sm:hidden">
                    Platform
                  </span>
                <select
                  value={row.platform_group}
                  onChange={(e) =>
                    patchRow(idx, {
                      platform_group: e.target.value as AdAccountPlatformGroup,
                    })
                  }
                  className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                >
                  {GROUPS.map((g) => (
                    <option key={g} value={g}>
                      {GROUP_LABELS[g]}
                    </option>
                  ))}
                </select>
                </label>
                <label className="grid gap-1">
                  <span className="text-xs text-muted-foreground sm:hidden">
                    Fee %
                  </span>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={row.fee_str}
                    placeholder="5"
                    className="text-right"
                    onChange={(e) => patchRow(idx, { fee_str: e.target.value })}
                  />
                </label>
                <label className="flex items-center gap-2 sm:justify-end sm:pr-2">
                  <input
                    type="checkbox"
                    checked={row.api_topup_enabled}
                    aria-label={`${row.label} API auto-topup`}
                    onChange={(e) =>
                      patchRow(idx, { api_topup_enabled: e.target.checked })
                    }
                    className="h-4 w-4"
                  />
                  <span className="text-xs text-muted-foreground sm:hidden">
                    API auto-topup
                  </span>
                </label>
                <label className="flex items-center gap-2 sm:justify-end sm:pr-2">
                  <input
                    type="checkbox"
                    checked={row.is_active}
                    aria-label={`${row.label} active`}
                    onChange={(e) =>
                      patchRow(idx, { is_active: e.target.checked })
                    }
                    className="h-4 w-4"
                  />
                  <span className="text-xs text-muted-foreground sm:hidden">
                    Active
                  </span>
                </label>

                {/* ── WHERE THE TOP-UP IS ACTUALLY DONE ──────────────
                    Only the API type funds itself. Every other type
                    means an admin opens the supplier's own dashboard,
                    moves the money there and comes back to press
                    Verify — and the review screen could not say which
                    supplier, let alone link to it. With three or four
                    suppliers that is a guess made against a customer's
                    money.

                    ADMIN-ONLY. The supplier's name never appears on an
                    advertiser or affiliate surface, in the UI or in the
                    JSON behind it. */}
                <div className="col-span-2 grid gap-2 sm:col-span-5 sm:grid-cols-[minmax(130px,1fr)_2fr] sm:pb-2">
                  <label className="grid gap-1">
                    <span className="text-xs text-muted-foreground">
                      Supplier (admin only)
                    </span>
                    <Input
                      value={row.supplier_label}
                      placeholder={
                        row.api_topup_enabled ? "Funded over the API" : "Who we buy this from"
                      }
                      onChange={(e) =>
                        patchRow(idx, { supplier_label: e.target.value })
                      }
                    />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-xs text-muted-foreground">
                      Their dashboard (opens from the top-up review)
                    </span>
                    <Input
                      value={row.supplier_url}
                      placeholder="https://..."
                      inputMode="url"
                      onChange={(e) =>
                        patchRow(idx, { supplier_url: e.target.value })
                      }
                    />
                  </label>
                </div>
              </div>
            ))}

            {/* Add a new type */}
            <div className="mt-2 pt-3 border-t grid gap-2">
              <Label className="text-xs text-muted-foreground">
                Add a type
              </Label>
              <div className="grid grid-cols-2 items-center gap-x-3 gap-y-2 sm:grid-cols-[1fr_100px_78px_52px_auto] sm:gap-2">
                <Input
                  className="col-span-2 sm:col-span-1"
                  value={newLabel}
                  placeholder="e.g. Meta-EU-Advantage"
                  onChange={(e) => setNewLabel(e.target.value)}
                />
                <select
                  value={newGroup}
                  onChange={(e) =>
                    setNewGroup(e.target.value as AdAccountPlatformGroup)
                  }
                  className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                >
                  {GROUPS.map((g) => (
                    <option key={g} value={g}>
                      {GROUP_LABELS[g]}
                    </option>
                  ))}
                </select>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={newFee}
                  placeholder="5"
                  className="text-right"
                  onChange={(e) => setNewFee(e.target.value)}
                />
                <label
                  className="flex items-center gap-2 sm:justify-end sm:pr-2"
                  title="Auto-topup via supplier API (Supplier 1)"
                >
                  <input
                    type="checkbox"
                    checked={newApi}
                    aria-label="New type API auto-topup"
                    onChange={(e) => setNewApi(e.target.checked)}
                    className="h-4 w-4"
                  />
                  <span className="text-xs text-muted-foreground sm:hidden">
                    API auto-topup
                  </span>
                </label>
                <Button
                  type="button"
                  variant="outline"
                  className="col-span-2 sm:col-span-1"
                  disabled={adding}
                  onClick={() => addType()}
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
