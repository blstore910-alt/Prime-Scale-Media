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
  updated_at: string;
  dirty: boolean;
};

function parsePct(v: string): number | null {
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
          ifUpdatedAt: row.updated_at,
        });
        if (!res.ok) throw new Error(res.error);
      }
      return dirty.length;
    },
    onSuccess: (count) => {
      toast.success(count === 0 ? "No changes to save" : `Saved ${count} type(s)`);
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
          <div className="grid gap-3">
            <div className="grid grid-cols-[1fr_100px_78px_52px_52px] gap-2 text-xs text-muted-foreground pb-1 border-b">
              <span>Type name</span>
              <span>Platform</span>
              <span className="text-right">Fee %</span>
              <span className="text-right" title="Auto-topup via supplier API (SeamX)">API</span>
              <span className="text-right">Active</span>
            </div>
            {rows.map((row, idx) => (
              <div
                key={row.id}
                className="grid grid-cols-[1fr_100px_78px_52px_52px] gap-2 items-center"
              >
                <Input
                  value={row.label}
                  onChange={(e) => patchRow(idx, { label: e.target.value })}
                  className={row.is_active ? "" : "opacity-60"}
                />
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
                <div className="flex justify-end pr-2">
                  <input
                    type="checkbox"
                    checked={row.api_topup_enabled}
                    aria-label={`${row.label} API auto-topup`}
                    onChange={(e) =>
                      patchRow(idx, { api_topup_enabled: e.target.checked })
                    }
                    className="h-4 w-4"
                  />
                </div>
                <div className="flex justify-end pr-2">
                  <input
                    type="checkbox"
                    checked={row.is_active}
                    aria-label={`${row.label} active`}
                    onChange={(e) =>
                      patchRow(idx, { is_active: e.target.checked })
                    }
                    className="h-4 w-4"
                  />
                </div>
              </div>
            ))}

            {/* Add a new type */}
            <div className="mt-2 pt-3 border-t grid gap-2">
              <Label className="text-xs text-muted-foreground">
                Add a type
              </Label>
              <div className="grid grid-cols-[1fr_100px_78px_52px_auto] gap-2 items-center">
                <Input
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
                <div className="flex justify-end pr-2" title="Auto-topup via supplier API (SeamX)">
                  <input
                    type="checkbox"
                    checked={newApi}
                    aria-label="New type API auto-topup"
                    onChange={(e) => setNewApi(e.target.checked)}
                    className="h-4 w-4"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
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
