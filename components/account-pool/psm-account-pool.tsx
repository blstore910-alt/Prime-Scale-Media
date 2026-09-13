"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, RefreshCw, Search, UserPlus, Undo2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAppContext } from "@/context/app-provider";
import {
  addManualPoolAccount,
  assignSupplierAdAccount,
  listSupplierAdAccounts,
  releaseSupplierAdAccount,
  syncSupplierAdAccounts,
} from "@/actions/supplier-pool-actions";
import type {
  SupplierAdAccount,
  SupplierAdAccountFilter,
} from "@/lib/types/supplier-ad-account";

type AdvertiserOption = {
  id: string;
  tenant_client_code: string | null;
  profile?: { full_name: string | null; email: string | null } | null;
};

const PLATFORM_LABEL: Record<string, string> = {
  "meta-ads": "Meta",
  "tiktok-ads": "TikTok",
  "google-ads": "Google",
};

function money(cents: number | null, currency: string | null) {
  if (cents == null) return "—";
  const sym = (currency ?? "").toUpperCase() === "EUR" ? "€" : "$";
  return `${sym}${(cents / 100).toLocaleString("nl-NL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function advertiserLabel(a: AdvertiserOption) {
  return (
    a.profile?.full_name ||
    a.profile?.email ||
    a.tenant_client_code ||
    a.id.slice(0, 8)
  );
}

export default function PsmAccountPool() {
  const queryClient = useQueryClient();
  const { profile } = useAppContext();
  const [filter, setFilter] = useState<SupplierAdAccountFilter>("unassigned");
  const [search, setSearch] = useState("");
  const [assigning, setAssigning] = useState<SupplierAdAccount | null>(null);
  const [advertiserId, setAdvertiserId] = useState("");
  const [feeInput, setFeeInput] = useState("");
  const [source, setSource] = useState<"all" | "supplier1" | "manual">("all");
  const [addOpen, setAddOpen] = useState(false);
  const [manual, setManual] = useState({
    name: "",
    externalId: "",
    platform: "meta-ads",
    currency: "EUR",
    bmId: "",
    feePercentage: "",
  });

  const pool = useQuery({
    queryKey: ["supplier-ad-account-pool"],
    queryFn: async () => {
      const res = await listSupplierAdAccounts();
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
  });

  // Advertisers for the allocate picker. RLS scopes reads to the tenant; the
  // explicit filter keeps it honest.
  const advertisers = useQuery({
    queryKey: ["pool-advertisers", profile?.tenant_id],
    enabled: !!profile?.tenant_id,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("advertisers")
        .select("id, tenant_client_code, profile:user_profiles(full_name, email)")
        .eq("tenant_id", profile?.tenant_id);
      if (error) throw error;
      return (data ?? []) as unknown as AdvertiserOption[];
    },
  });

  const sync = useMutation({
    mutationFn: async () => {
      const res = await syncSupplierAdAccounts();
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    onSuccess: (d) => {
      toast.success(`Synced ${d.fetched} ad account(s) from the supplier.`);
      queryClient.invalidateQueries({ queryKey: ["supplier-ad-account-pool"] });
    },
    onError: (e: Error) =>
      toast.error("Sync failed", { description: e.message }),
  });

  const assign = useMutation({
    mutationFn: async () => {
      if (!assigning) throw new Error("No account selected");
      if (!advertiserId) throw new Error("Pick an advertiser");
      const res = await assignSupplierAdAccount({
        poolId: assigning.id,
        advertiserId,
        fee: feeInput.trim() === "" ? undefined : Number(feeInput),
      });
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    onSuccess: () => {
      toast.success("Ad account allocated to the advertiser.");
      setAssigning(null);
      setAdvertiserId("");
      setFeeInput("");
      queryClient.invalidateQueries({ queryKey: ["supplier-ad-account-pool"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
    onError: (e: Error) =>
      toast.error("Allocation failed", { description: e.message }),
  });

  const addManual = useMutation({
    mutationFn: async () => {
      const res = await addManualPoolAccount({
        name: manual.name,
        externalId: manual.externalId,
        platform: manual.platform,
        currency: manual.currency,
        bmId: manual.bmId,
        feePercentage:
          manual.feePercentage.trim() === ""
            ? undefined
            : Number(manual.feePercentage),
      });
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    onSuccess: () => {
      toast.success("Added to the pool.");
      setAddOpen(false);
      setManual({
        name: "",
        externalId: "",
        platform: "meta-ads",
        currency: "EUR",
        bmId: "",
        feePercentage: "",
      });
      queryClient.invalidateQueries({ queryKey: ["supplier-ad-account-pool"] });
    },
    onError: (e: Error) =>
      toast.error("Could not add account", { description: e.message }),
  });

  const release = useMutation({
    mutationFn: async (poolId: string) => {
      const res = await releaseSupplierAdAccount(poolId);
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success("Returned to the pool.");
      queryClient.invalidateQueries({ queryKey: ["supplier-ad-account-pool"] });
    },
    onError: (e: Error) =>
      toast.error("Could not release", { description: e.message }),
  });

  const advertiserById = useMemo(() => {
    const m = new Map<string, AdvertiserOption>();
    for (const a of advertisers.data ?? []) m.set(a.id, a);
    return m;
  }, [advertisers.data]);

  const rows = useMemo(() => {
    const all = pool.data ?? [];
    const term = search.trim().toLowerCase();
    return all.filter((r) => {
      if (filter === "unassigned" && r.advertiser_id) return false;
      if (filter === "assigned" && !r.advertiser_id) return false;
      if (source !== "all" && (r.provider ?? "supplier1") !== source) return false;
      if (!term) return true;
      return (
        (r.name ?? "").toLowerCase().includes(term) ||
        r.external_id.toLowerCase().includes(term) ||
        (r.bm_id ?? "").toLowerCase().includes(term)
      );
    });
  }, [pool.data, filter, search, source]);

  const counts = useMemo(() => {
    const all = pool.data ?? [];
    return {
      all: all.length,
      unassigned: all.filter((r) => !r.advertiser_id).length,
      assigned: all.filter((r) => r.advertiser_id).length,
    };
  }, [pool.data]);

  return (
    <div
      className="psmview"
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
    >
      <div className="phead">
        <div>
          <h1>Ad Account Pool</h1>
          <p>
            Every ad account the supplier has provisioned to us. Unassigned ones
            are free inventory — allocate them to an advertiser.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn ghost" onClick={() => setAddOpen(true)}>
            <UserPlus /> Add manual account
          </button>
          <button
            className="btn"
            onClick={() => sync.mutate()}
            disabled={sync.isPending}
          >
            {sync.isPending ? (
              <Loader2 className="animate-spin" />
            ) : (
              <RefreshCw />
            )}
            {sync.isPending ? "Syncing…" : "Sync from SeamX"}
          </button>
        </div>
      </div>

      <div className="fbar">
        <label className="fsr">
          <Search />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, supplier ID, BM ID…"
          />
        </label>
        <select
          value={filter}
          onChange={(e) =>
            setFilter(e.target.value as SupplierAdAccountFilter)
          }
        >
          <option value="unassigned">
            Unassigned ({counts.unassigned})
          </option>
          <option value="assigned">Allocated ({counts.assigned})</option>
          <option value="all">All ({counts.all})</option>
        </select>
        <select
          value={source}
          onChange={(e) =>
            setSource(e.target.value as "all" | "supplier1" | "manual")
          }
        >
          <option value="all">All sources</option>
          <option value="supplier1">SeamX</option>
          <option value="manual">Manual (ours)</option>
        </select>
      </div>

      {pool.isLoading ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            Loading the pool…
          </p>
        </div>
      ) : pool.isError ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            Couldn&apos;t load the pool:{" "}
            {(pool.error as Error)?.message ?? "unknown error"}
          </p>
        </div>
      ) : rows.length ? (
        <div className="card" style={{ padding: "16px 8px 8px" }}>
          <div className="tblwrap">
            <table className="tbl wide">
              <thead>
                <tr>
                  <th style={{ paddingLeft: 14 }}>Account</th>
                  <th>Source</th>
                  <th>Platform</th>
                  <th>Currency</th>
                  <th className="r">Balance</th>
                  <th className="r">Fee</th>
                  <th>Status</th>
                  <th>Allocated to</th>
                  <th className="r">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const adv = r.advertiser_id
                    ? advertiserById.get(r.advertiser_id)
                    : null;
                  return (
                    <tr key={r.id}>
                      <td data-label="Account" style={{ paddingLeft: 14 }}>
                        <div style={{ fontWeight: 700 }}>
                          {r.name ?? "Unnamed account"}
                        </div>
                        <div
                          className="mono"
                          style={{ color: "var(--faint)", fontSize: ".78rem" }}
                        >
                          {r.external_id}
                          {r.bm_id ? ` · BM ${r.bm_id}` : ""}
                        </div>
                      </td>
                      <td data-label="Source">
                        <span
                          className={`badge ${
                            r.provider === "manual" ? "info" : "pend"
                          }`}
                        >
                          {r.provider === "manual" ? "Manual" : "SeamX"}
                        </span>
                      </td>
                      <td data-label="Platform">
                        {PLATFORM_LABEL[r.platform ?? ""] ?? r.platform ?? "—"}
                      </td>
                      <td data-label="Currency">
                        {(r.currency ?? "—").toUpperCase()}
                      </td>
                      <td data-label="Balance" className="r mono">
                        {money(r.balance_cents, r.currency)}
                      </td>
                      <td data-label="Fee" className="r mono">
                        {r.fee_percentage == null ? "—" : `${r.fee_percentage}%`}
                      </td>
                      <td data-label="Status">
                        <span
                          className={`badge ${
                            r.status === "active" ? "ok" : "pend"
                          }`}
                        >
                          {r.status ?? "unknown"}
                        </span>
                      </td>
                      <td data-label="Allocated to">
                        {r.advertiser_id ? (
                          <span className="badge info">
                            {adv ? advertiserLabel(adv) : "Allocated"}
                          </span>
                        ) : (
                          <span style={{ color: "var(--faint)" }}>
                            — in pool
                          </span>
                        )}
                      </td>
                      <td data-label="Action" className="r">
                        {r.advertiser_id ? (
                          <button
                            className="btn ghost sm"
                            disabled={release.isPending}
                            onClick={() => {
                              if (
                                window.confirm(
                                  "Return this ad account to the pool? The advertiser's existing account row is left as-is.",
                                )
                              )
                                release.mutate(r.id);
                            }}
                          >
                            <Undo2 /> Release
                          </button>
                        ) : (
                          <button
                            className="btn sm"
                            onClick={() => {
                              setAssigning(r);
                              setAdvertiserId("");
                              setFeeInput(
                                r.fee_percentage == null
                                  ? ""
                                  : String(r.fee_percentage),
                              );
                            }}
                          >
                            <UserPlus /> Allocate
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            {counts.all === 0
              ? "The pool is empty — hit “Sync from supplier” to pull in the ad accounts they've provisioned."
              : "No ad accounts match this filter."}
          </p>
        </div>
      )}

      {addOpen && (
        <div className="modal">
          <div className="mback" onClick={() => setAddOpen(false)} />
          <div className="mcard">
            <div className="mhead">
              <h2>Add a manual ad account</h2>
              <button
                className="iconbtn"
                onClick={() => setAddOpen(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <p className="cap">
              An account you hold yourself (not from SeamX). It joins the same
              pool and is allocated the same way. Syncing never touches it.
            </p>

            <div className="mlabel">Name</div>
            <input
              value={manual.name}
              onChange={(e) => setManual({ ...manual, name: e.target.value })}
              placeholder="e.g. PSM Meta 014"
              style={{ width: "100%" }}
            />

            <div className="mlabel" style={{ marginTop: 12 }}>
              Account ID (optional — yours, for reference)
            </div>
            <input
              value={manual.externalId}
              onChange={(e) =>
                setManual({ ...manual, externalId: e.target.value })
              }
              placeholder="e.g. act_123456789"
              style={{ width: "100%" }}
            />

            <div className="mlabel" style={{ marginTop: 12 }}>
              BM ID (optional)
            </div>
            <input
              value={manual.bmId}
              onChange={(e) => setManual({ ...manual, bmId: e.target.value })}
              style={{ width: "100%" }}
            />

            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <div style={{ flex: 1 }}>
                <div className="mlabel">Platform</div>
                <select
                  value={manual.platform}
                  onChange={(e) =>
                    setManual({ ...manual, platform: e.target.value })
                  }
                  style={{ width: "100%" }}
                >
                  <option value="meta-ads">Meta</option>
                  <option value="tiktok-ads">TikTok</option>
                  <option value="google-ads">Google</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <div className="mlabel">Currency</div>
                <select
                  value={manual.currency}
                  onChange={(e) =>
                    setManual({ ...manual, currency: e.target.value })
                  }
                  style={{ width: "100%" }}
                >
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <div className="mlabel">Fee %</div>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={manual.feePercentage}
                  onChange={(e) =>
                    setManual({ ...manual, feePercentage: e.target.value })
                  }
                  style={{ width: "100%" }}
                />
              </div>
            </div>

            <button
              className="btn block grad"
              style={{ marginTop: 14 }}
              disabled={addManual.isPending || !manual.name.trim()}
              onClick={() => addManual.mutate()}
            >
              {addManual.isPending && <Loader2 className="animate-spin" />}
              Add to pool
            </button>
          </div>
        </div>
      )}

      {assigning && (
        <div className="modal">
          <div className="mback" onClick={() => setAssigning(null)} />
          <div className="mcard">
            <div className="mhead">
              <h2>Allocate ad account</h2>
              <button
                className="iconbtn"
                onClick={() => setAssigning(null)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <p className="cap">
              <b>{assigning.name ?? assigning.external_id}</b> ·{" "}
              {PLATFORM_LABEL[assigning.platform ?? ""] ??
                assigning.platform ??
                "—"}{" "}
              · {(assigning.currency ?? "").toUpperCase()}
            </p>

            <div className="mlabel">Advertiser</div>
            <select
              value={advertiserId}
              onChange={(e) => setAdvertiserId(e.target.value)}
              style={{ width: "100%" }}
            >
              <option value="">Select an advertiser…</option>
              {(advertisers.data ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {advertiserLabel(a)}
                </option>
              ))}
            </select>

            <div className="mlabel" style={{ marginTop: 12 }}>
              Fee % (defaults to the supplier&apos;s)
            </div>
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={feeInput}
              onChange={(e) => setFeeInput(e.target.value)}
              placeholder="e.g. 2"
              style={{ width: "100%" }}
            />

            <button
              className="btn block grad"
              style={{ marginTop: 14 }}
              disabled={assign.isPending || !advertiserId}
              onClick={() => assign.mutate()}
            >
              {assign.isPending && <Loader2 className="animate-spin" />}
              Allocate to advertiser
            </button>
            <p className="mnote">
              This creates the advertiser&apos;s ad account and links it to the
              supplier account.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
