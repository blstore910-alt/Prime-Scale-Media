"use client";

import ConfirmModal, { ConfirmFact } from "@/components/ui/confirm-modal";
import { grantPerk, revokePerk } from "@/actions/perk-actions";
import PsmSortFilter from "@/components/psm/sort-filter";
import CustomerName from "@/components/psm/customer-name";
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
/**
 * Is this perk actually in force right now?
 *
 * The SQL that applies one and resolveEffectiveFeePct both require FOUR
 * things: active, started, not expired, and — for a perk with a count —
 * something left. The admin screen tested the first and printed green.
 */
type PerkLike = {
  active?: boolean | null;
  starts_at?: string | null;
  expires_at?: string | null;
  remaining?: number | null;
};

function perkWhyNot(p: PerkLike): string | null {
  const now = Date.now();
  if (p.starts_at && new Date(p.starts_at).getTime() > now) {
    return "Starts later";
  }
  if (p.expires_at && new Date(p.expires_at).getTime() <= now) {
    return "Expired";
  }
  if (p.remaining !== null && p.remaining !== undefined && Number(p.remaining) <= 0) {
    return "Used up";
  }
  return null;
}

function perkExhausted(p: PerkLike): boolean {
  return perkWhyNot(p) !== null;
}

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

  const {
    data: perks = [],
    isLoading: perksLoading,
    isError: perksError,
  } = useQuery<PerkRow[]>({
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
      // A discount perk with a blank amount used to fall through `|| 0` and
      // be granted as 0% off — then report "Perk granted." The advertiser
      // carries a live perk worth nothing, and the admin believes they gave
      // one. An empty field is a mistake, not a zero.
      if (isDiscount) {
        const parsed = Number(amount);
        if (!amount.trim() || !Number.isFinite(parsed) || parsed <= 0) {
          throw new Error("Enter a discount percentage above 0.");
        }
        if (parsed > 100) {
          throw new Error("A discount cannot exceed 100%.");
        }
      }
      // AN EMPTY FIELD IS A MISTAKE, NOT A ONE. Number("") and
      // Number("0") are both 0, and `|| 1` turned both into 1 — so
      // clearing the count, or typing 0, granted a free ad-account
      // request: 50 EUR given away that nobody decided to give, under
      // "Perk granted." A negative went through unvalidated and was
      // clamped by the RPC to 0, producing an Active perk reading "0
      // remaining" with the same success toast.
      //
      // The discount field four lines up is validated and its comment
      // states this rule. This one did not follow it.
      if (isCount) {
        const raw = String(count ?? "").trim();
        const n = Number(raw);
        if (raw === "" || !Number.isFinite(n) || n < 1) {
          throw new Error("Enter how many free requests this grants — at least 1.");
        }
      }

      const res = await grantPerk({
        advertiser_id: advertiserId,
        kind,
        amount: isDiscount ? Number(amount) : null,
        remaining: isCount ? Math.floor(Number(count)) : null,
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

  // A revoked perk is not editable back — it can only be re-granted by
  // typing its original terms in again from memory. And for a
  // subscription_waiver or a fee discount, revoking means the customer
  // starts paying full price from their next invoice with no notice.
  // The whole row, because the confirmation needs to name the customer
  // and the perk — `setRevoking(p)` already hands it over, and the type
  // was throwing most of it away.
  const [revoking, setRevoking] = useState<PerkRow | null>(null);

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
            Free requests and discounts.
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
        <PsmSortFilter
          filters={[
            {
              id: "status",
              label: "Status",
              value: statusFilter,
              onChange: setStatusFilter,
              options: [
                { value: "all", label: "All statuses" },
                { value: "active", label: "Active" },
                { value: "revoked", label: "Revoked" },
              ],
            },
            {
              id: "kind",
              label: "Perk type",
              value: kindFilter,
              onChange: setKindFilter,
              options: [
                { value: "all", label: "All perks" },
                ...KINDS.map((k) => ({ value: k, label: PERK_KIND_LABELS[k] })),
              ],
            },
          ]}
          searchActive={!!search.trim()}
          onReset={() => {
            setStatusFilter("all");
            setKindFilter("all");
            setSearch("");
          }}
        />
      </div>

      {/* Active & recent perks */}
      {perksLoading ? (
        <p className="muted">Loading…</p>
      ) : perksError ? (
        /* THIS SCREEN IS WHERE AN ADMIN CHECKS WHETHER A CUSTOMER ALREADY
           HOLDS A PERK before granting one. "No perks to show" over a
           failed read invites a second grant — a second discount against
           real invoices, or a second free ad account — and `data = []` is
           the default for both "none" and "could not ask". */
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            We couldn&apos;t read the perks just now — this is not an empty
            list. Reload before granting anything, or you may grant a second
            one on top of a discount that is already running.
          </p>
        </div>
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
                      {/* Code first, name beneath. */}
                      <CustomerName
                        clientCode={p.advertiser?.tenant_client_code}
                        name={name(p.advertiser?.profile ?? null)}
                        full
                      />
                    </td>
                    <td data-label="Detail">{perkDetail(p)}</td>
                    <td data-label="Expiry">
                      {p.expires_at
                        ? new Date(p.expires_at).toLocaleDateString()
                        : "No expiry"}
                    </td>
                    <td data-label="Status">
                      {/* ── "ACTIVE" IS A FOUR-PART TEST, NOT ONE COLUMN ──
                          Both enforcement paths — the SQL that applies a
                          perk and resolveEffectiveFeePct — require
                          active AND started AND not expired AND (for a
                          counted perk) remaining > 0. This printed a
                          green Active on the one column, so a
                          free-request perk that expired on 1 September
                          still read Active in October and the admin went
                          on believing that customer's next request was
                          free while they were charged EUR 50.

                          Same words the enforcement uses, so the screen
                          and the rule cannot drift again. */}
                      {p.active && !perkExhausted(p) ? (
                        <span className="badge ok">Active</span>
                      ) : p.active ? (
                        <span
                          className="badge"
                          style={{
                            background: "var(--warn-soft)",
                            color: "var(--warn)",
                          }}
                          title={perkWhyNot(p) ?? undefined}
                        >
                          {perkWhyNot(p) ?? "Not in force"}
                        </span>
                      ) : (
                        <span
                          className="badge"
                          style={{
                            background: "var(--panel-2)",
                            color: "var(--txt-2)",
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
                          onClick={() => setRevoking(p)}
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
      <ConfirmModal
        open={!!revoking}
        onOpenChange={(next) => {
          if (!next) setRevoking(null);
        }}
        title="Revoke this perk?"
        lead="It stops applying immediately, and it cannot be edited back — re-granting means entering the original terms again. For a waiver or a discount the customer starts paying full price on their next invoice, with no notice from us."
        cta="Yes, revoke it"
        tone="danger"
        busy={revoke.isPending}
        busyLabel="Revoking…"
        onConfirm={() => {
          const r = revoking;
          setRevoking(null);
          if (r) revoke.mutate(r.id);
        }}
      >
        {/* WHO, AS WELL AS WHAT. Revoking is irreversible — the RPC sets
            active = false and there is no path back — and the only fact
            in this dialog was the raw enum, `topup_discount`, not the
            label the table rendered two lines earlier, and never the
            customer. On a screen where several advertisers hold the same
            perk kind, nothing here said which row was about to go. */}
        <ConfirmFact
          label="Customer"
          value={
            revoking
              ? [
                  revoking.advertiser?.tenant_client_code,
                  name(revoking.advertiser?.profile ?? null),
                ]
                  .filter(Boolean)
                  .join(" · ") || "—"
              : "—"
          }
        />
        <ConfirmFact
          label="Perk"
          value={
            revoking
              ? PERK_KIND_LABELS[revoking.kind as PerkKind] ??
                String(revoking.kind ?? "—")
              : "—"
          }
        />
      </ConfirmModal>
    </div>
  );
}
