"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { grantPerk, revokePerk } from "@/actions/perk-actions";
import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";
import {
  AdvertiserPerk,
  PERK_ENFORCED,
  PERK_KIND_LABELS,
  PerkKind,
} from "@/lib/types/perk";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Gift, Ban } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type AdvertiserRow = {
  id: string;
  tenant_client_code: string | null;
  profile: { full_name: string | null } | { full_name: string | null }[] | null;
};

type PerkRow = AdvertiserPerk & {
  advertiser: {
    tenant_client_code: string | null;
    profile: { full_name: string | null } | { full_name: string | null }[] | null;
  } | null;
};

function name(
  profile: { full_name: string | null } | { full_name: string | null }[] | null,
) {
  if (Array.isArray(profile)) return profile[0]?.full_name ?? null;
  return profile?.full_name ?? null;
}

const KINDS = Object.keys(PERK_KIND_LABELS) as PerkKind[];

export default function PromotionsManager() {
  const { profile } = useAppContext();
  const queryClient = useQueryClient();
  const supabase = createClient();

  const [advertiserId, setAdvertiserId] = useState("");
  const [kind, setKind] = useState<PerkKind>("free_ad_account_requests");
  const [amount, setAmount] = useState("");
  const [count, setCount] = useState("1");
  const [expires, setExpires] = useState("");
  const [note, setNote] = useState("");

  const { data: advertisers = [] } = useQuery<AdvertiserRow[]>({
    queryKey: ["advertisers", profile?.tenant_id, "promotions"],
    enabled: profile?.role === "admin" && !!profile?.tenant_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("advertisers")
        .select("id, tenant_client_code, profile:user_profiles(full_name)")
        .eq("tenant_id", profile?.tenant_id)
        .order("tenant_client_code", { ascending: true });
      if (error) throw error;
      return (data ?? []) as AdvertiserRow[];
    },
  });

  const { data: perks = [], isLoading: perksLoading } = useQuery<PerkRow[]>({
    queryKey: ["advertiser-perks", profile?.tenant_id],
    enabled: profile?.role === "admin" && !!profile?.tenant_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("advertiser_perks")
        .select(
          "*, advertiser:advertisers(tenant_client_code, profile:user_profiles(full_name))",
        )
        .eq("tenant_id", profile?.tenant_id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PerkRow[];
    },
  });

  const isDiscount = kind === "subscription_discount" || kind === "topup_discount";
  const isCount = kind === "free_ad_account_requests";

  const grant = useMutation({
    mutationFn: async () => {
      if (!advertiserId) throw new Error("Pick an advertiser.");
      const res = await grantPerk({
        advertiser_id: advertiserId,
        kind,
        amount: isDiscount ? Number(amount) || 0 : null,
        remaining: isCount ? Number(count) || 1 : null,
        expires_at: expires ? new Date(`${expires}T23:59:59`).toISOString() : null,
        note: note || null,
      });
      if (!res.ok) throw new Error(res.error);
      return res;
    },
    onSuccess: () => {
      toast.success("Perk granted.");
      setAmount("");
      setCount("1");
      setExpires("");
      setNote("");
      queryClient.invalidateQueries({ queryKey: ["advertiser-perks"] });
    },
    onError: (e) =>
      toast.error("Couldn't grant perk", {
        description: e instanceof Error ? e.message : undefined,
      }),
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const res = await revokePerk(id);
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success("Perk revoked.");
      queryClient.invalidateQueries({ queryKey: ["advertiser-perks"] });
    },
    onError: (e) =>
      toast.error("Couldn't revoke perk", {
        description: e instanceof Error ? e.message : undefined,
      }),
  });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Gift className="h-4 w-4" />
            Grant a perk
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label>Advertiser</Label>
            <Select value={advertiserId} onValueChange={setAdvertiserId}>
              <SelectTrigger>
                <SelectValue placeholder="Select advertiser" />
              </SelectTrigger>
              <SelectContent>
                {advertisers.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {(a.tenant_client_code ?? "-") + " · " + (name(a.profile) ?? "-")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Perk</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as PerkKind)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {PERK_KIND_LABELS[k]}
                    {!PERK_ENFORCED[k] ? " (coming soon)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!PERK_ENFORCED[kind] && (
              <p className="text-xs text-muted-foreground">
                Stored now; enforced once top-up fees are plan-wired.
              </p>
            )}
          </div>

          {isCount && (
            <div className="space-y-1">
              <Label>Number of free requests</Label>
              <Input
                type="number"
                min={1}
                value={count}
                onChange={(e) => setCount(e.target.value)}
              />
            </div>
          )}

          {isDiscount && (
            <div className="space-y-1">
              <Label>Discount (%)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
          )}

          <div className="space-y-1">
            <Label>Expires (optional)</Label>
            <Input
              type="date"
              value={expires}
              onChange={(e) => setExpires(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Leave empty for an open-ended perk.
            </p>
          </div>

          <div className="space-y-1">
            <Label>Note (optional)</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. onboarding promo"
            />
          </div>

          <Button
            onClick={() => grant.mutate()}
            disabled={grant.isPending || !advertiserId}
            className="w-full"
          >
            {grant.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Grant perk
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Active &amp; recent perks</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {perksLoading ? (
            <div className="flex h-24 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : perks.length ? (
            perks.map((p) => (
              <div
                key={p.id}
                className={`flex items-start justify-between gap-3 rounded-md border p-3 ${
                  p.active ? "" : "opacity-50"
                }`}
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      {PERK_KIND_LABELS[p.kind]}
                    </span>
                    {!p.active && <Badge variant="outline">revoked</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {(p.advertiser?.tenant_client_code ?? "-") +
                      " · " +
                      (name(p.advertiser?.profile ?? null) ?? "-")}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {p.kind === "free_ad_account_requests" &&
                      `${p.remaining ?? 0} remaining`}
                    {(p.kind === "subscription_discount" ||
                      p.kind === "topup_discount") &&
                      `${p.amount ?? 0}% off`}
                    {p.expires_at
                      ? ` · until ${new Date(p.expires_at).toLocaleDateString()}`
                      : " · no expiry"}
                    {p.note ? ` · ${p.note}` : ""}
                  </div>
                </div>
                {p.active && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => revoke.mutate(p.id)}
                    disabled={revoke.isPending}
                    title="Revoke this perk"
                  >
                    <Ban className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))
          ) : (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              No perks granted yet.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
