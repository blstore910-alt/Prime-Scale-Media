"use client";

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
import { Ban, Gift, Loader2, Search } from "lucide-react";
import type { CSSProperties } from "react";
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
    profile:
      | { full_name: string | null }
      | { full_name: string | null }[]
      | null;
  } | null;
};

function name(
  profile: { full_name: string | null } | { full_name: string | null }[] | null,
) {
  if (Array.isArray(profile)) return profile[0]?.full_name ?? null;
  return profile?.full_name ?? null;
}

const KINDS = Object.keys(PERK_KIND_LABELS) as PerkKind[];

const lbl: CSSProperties = {
  display: "block",
  fontSize: ".72rem",
  fontWeight: 700,
  letterSpacing: ".04em",
  textTransform: "uppercase",
  color: "var(--faint)",
  marginBottom: 6,
};
const inp: CSSProperties = {
  width: "100%",
  fontFamily: "var(--bd)",
  fontSize: ".9rem",
  fontWeight: 600,
  border: "1px solid var(--line-2)",
  borderRadius: 11,
  padding: "10px 12px",
  background: "var(--panel-2)",
  color: "var(--ink)",
  outline: "none",
};

function perkDetail(p: PerkRow) {
  if (p.kind === "free_ad_account_requests") return `${p.remaining ?? 0} remaining`;
  if (p.kind === "subscription_discount" || p.kind === "topup_discount")
    return `${p.amount ?? 0}% off`;
  if (p.kind === "subscription_waiver") return "Subscription waived";
  if (p.kind === "topup_fee_waiver") return "Top-up fee waived";
  return "—";
}

// Admin promotions / perks manager, mockup look. Reuses the same data reads
// (advertisers + advertiser_perks) and the real grantPerk / revokePerk server
// actions (SECURITY DEFINER RPCs) — presentation only, no new mutations.
export default function PsmPromotions() {
  const { profile } = useAppContext();
  const queryClient = useQueryClient();
  const supabase = createClient();

  // grant-a-perk form state (mirrors the original inline create form)
  const [advertiserId, setAdvertiserId] = useState("");
  const [kind, setKind] = useState<PerkKind>("free_ad_account_requests");
  const [amount, setAmount] = useState("");
  const [count, setCount] = useState("1");
  const [expires, setExpires] = useState("");
  const [note, setNote] = useState("");

  // filter bar state (client-side over the fetched perks)
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [kindFilter, setKindFilter] = useState("all");

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

  const isDiscount =
    kind === "subscription_discount" || kind === "topup_discount";
  const isCount = kind === "free_ad_account_requests";

  const grant = useMutation({
    mutationFn: async () => {
      if (!advertiserId) throw new Error("Pick an advertiser.");
      const res = await grantPerk({
        advertiser_id: advertiserId,
        kind,
        amount: isDiscount ? Number(amount) || 0 : null,
        remaining: isCount ? Number(count) || 1 : null,
        expires_at: expires
          ? new Date(`${expires}T23:59:59`).toISOString()
          : null,
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

  const q = search.trim().toLowerCase();
  const rows = perks.filter((p) => {
    if (statusFilter === "active" && !p.active) return false;
    if (statusFilter === "revoked" && p.active) return false;
    if (kindFilter !== "all" && p.kind !== kindFilter) return false;
    if (!q) return true;
    const hay = [
      p.advertiser?.tenant_client_code ?? "",
      name(p.advertiser?.profile ?? null) ?? "",
      PERK_KIND_LABELS[p.kind],
      p.note ?? "",
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });

  return (
    <div
      className="psmview"
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
    >
      <div className="phead">
        <div>
          <h1>Promotions</h1>
          <p>
            Grant advertisers free ad-account requests, waive or discount their
            subscription, and manage active perks.
          </p>
        </div>
      </div>

      {/* Grant a perk (create + note) — reuses grantPerk RPC action */}
      <div className="card">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 16,
          }}
        >
          <span
            className="ci p"
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              display: "grid",
              placeItems: "center",
            }}
          >
            <Gift />
          </span>
          <div style={{ fontWeight: 700, fontSize: "1rem" }}>Grant a perk</div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
            gap: 14,
          }}
        >
          <div>
            <label style={lbl}>Advertiser</label>
            <select
              style={inp}
              value={advertiserId}
              onChange={(e) => setAdvertiserId(e.target.value)}
            >
              <option value="">Select advertiser</option>
              {advertisers.map((a) => (
                <option key={a.id} value={a.id}>
                  {(a.tenant_client_code ?? "-") +
                    " · " +
                    (name(a.profile) ?? "-")}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={lbl}>Perk</label>
            <select
              style={inp}
              value={kind}
              onChange={(e) => setKind(e.target.value as PerkKind)}
            >
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {PERK_KIND_LABELS[k]}
                  {!PERK_ENFORCED[k] ? " (coming soon)" : ""}
                </option>
              ))}
            </select>
            {!PERK_ENFORCED[kind] && (
              <p className="muted" style={{ fontSize: ".78rem", margin: "6px 0 0" }}>
                Stored now; enforced once top-up fees are plan-wired.
              </p>
            )}
          </div>

          {isCount && (
            <div>
              <label style={lbl}>Number of free requests</label>
              <input
                style={inp}
                type="number"
                min={1}
                value={count}
                onChange={(e) => setCount(e.target.value)}
              />
            </div>
          )}

          {isDiscount && (
            <div>
              <label style={lbl}>Discount (%)</label>
              <input
                style={inp}
                type="number"
                min={0}
                max={100}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
          )}

          <div>
            <label style={lbl}>Expires (optional)</label>
            <input
              style={inp}
              type="date"
              value={expires}
              onChange={(e) => setExpires(e.target.value)}
            />
            <p className="muted" style={{ fontSize: ".78rem", margin: "6px 0 0" }}>
              Leave empty for an open-ended perk.
            </p>
          </div>

          <div>
            <label style={lbl}>Note (optional)</label>
            <input
              style={inp}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. onboarding promo"
            />
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <button
            className="btn grad"
            onClick={() => grant.mutate()}
            disabled={grant.isPending || !advertiserId}
          >
            {grant.isPending ? <Loader2 className="animate-spin" /> : <Gift />}
            Grant perk
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="fbar">
        <label className="fsr">
          <Search />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search perks…"
          />
        </label>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="revoked">Revoked</option>
        </select>
        <select
          value={kindFilter}
          onChange={(e) => setKindFilter(e.target.value)}
        >
          <option value="all">All perks</option>
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {PERK_KIND_LABELS[k]}
            </option>
          ))}
        </select>
      </div>

      {/* Active & recent perks */}
      {perksLoading ? (
        <p className="muted">Loading…</p>
      ) : rows.length ? (
        <div className="card" style={{ padding: 0 }}>
          <div className="tblwrap">
            <table className="tbl wide">
              <thead>
                <tr>
                  <th>Perk</th>
                  <th>Advertiser</th>
                  <th>Detail</th>
                  <th>Expiry</th>
                  <th>Status</th>
                  <th className="r">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} style={p.active ? undefined : { opacity: 0.55 }}>
                    <td data-label="Perk">
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span
                          className="ci p"
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 10,
                            display: "grid",
                            placeItems: "center",
                          }}
                        >
                          <Gift />
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 700 }}>
                            {PERK_KIND_LABELS[p.kind]}
                          </div>
                          {p.note && (
                            <div
                              className="muted"
                              style={{ fontSize: ".78rem" }}
                            >
                              {p.note}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td data-label="Advertiser">
                      <div style={{ fontWeight: 600 }}>
                        {name(p.advertiser?.profile ?? null) ?? "-"}
                      </div>
                      <div
                        className="mono"
                        style={{ color: "var(--faint)", fontSize: ".78rem" }}
                      >
                        {p.advertiser?.tenant_client_code ?? "-"}
                      </div>
                    </td>
                    <td data-label="Detail">{perkDetail(p)}</td>
                    <td data-label="Expiry">
                      {p.expires_at
                        ? new Date(p.expires_at).toLocaleDateString()
                        : "No expiry"}
                    </td>
                    <td data-label="Status">
                      {p.active ? (
                        <span className="badge ok">Active</span>
                      ) : (
                        <span
                          className="badge"
                          style={{
                            background: "var(--panel-2)",
                            color: "var(--muted)",
                          }}
                        >
                          Revoked
                        </span>
                      )}
                    </td>
                    <td data-label="Action" className="r">
                      {p.active && (
                        <button
                          className="btn ghost sm"
                          onClick={() => revoke.mutate(p.id)}
                          disabled={revoke.isPending}
                          title="Revoke this perk"
                        >
                          <Ban /> Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            No perks to show.
          </p>
        </div>
      )}
    </div>
  );
}
