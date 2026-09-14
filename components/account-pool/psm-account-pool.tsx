"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
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

// A real dialog, not a styled div. Both modals on this screen allocate ad
// accounts to advertisers, which has money consequences, so a keyboard user
// must be able to see where they are and get out: role/aria-modal so the
// screen reader announces it, focus moved in and restored on close, Escape to
// dismiss, and Tab cycled inside. The admin shell had no such primitive — the
// sign-out modal in adm-shell.tsx hand-rolls only the Escape half.
function Modal({
  titleId,
  onClose,
  children,
}: {
  titleId: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const cardRef = useRef<HTMLDivElement>(null);

  // onClose is read through a ref, and the effect has an EMPTY dep list.
  // Callers pass an inline arrow (`onClose={() => setAddOpen(false)}`), which
  // is a new identity on every render — so depending on it re-ran this effect
  // on every keystroke: the cleanup threw focus back to the button behind the
  // modal and the effect then yanked it to the card, making the fields
  // impossible to type in. Mount once, unmount once.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    cardRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !cardRef.current) return;
      const focusable = cardRef.current.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
  }, []);

  return (
    <div className="modal">
      <div className="mback" onClick={onClose} />
      <div
        ref={cardRef}
        className="mcard"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        {children}
      </div>
    </div>
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
  const [nameInput, setNameInput] = useState("");
  const [supplierFeeInput, setSupplierFeeInput] = useState("");
  const uid = useId();
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
        supplierFeePct:
          supplierFeeInput.trim() === "" ? null : Number(supplierFeeInput),
        name: nameInput.trim() || undefined,
      });
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    onSuccess: () => {
      toast.success("Ad account allocated to the advertiser.");
      setAssigning(null);
      setAdvertiserId("");
      setFeeInput("");
      setNameInput("");
      setSupplierFeeInput("");
      queryClient.invalidateQueries({ queryKey: ["supplier-ad-account-pool"] });
      // The account now exists in three places. ["accounts"] alone refreshed
      // only the two top-up dropdowns, so the admin who just allocated it saw
      // nothing on the Ad Accounts screen for up to the 30s staleTime.
      queryClient.invalidateQueries({ queryKey: ["ad-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["adv-accounts"] });
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
    mutationFn: async (row: SupplierAdAccount) => {
      const res = await releaseSupplierAdAccount(row.id, row.updated_at);
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
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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
          aria-label="Allocation status"
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
          aria-label="Source"
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
                      <td data-label="Account">
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
                      <td
                        data-label="Balance"
                        className="r mono"
                        title={
                          r.balance_cents == null
                            ? r.provider === "manual"
                              ? "Manual account — we hold it ourselves, so there is no supplier balance to read."
                              : "Not reported by the supplier's account list. Balance lives on the per-account endpoint."
                            : undefined
                        }
                      >
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
                            {adv
                              ? advertiserLabel(adv)
                              : advertisers.isError
                                ? "Allocated (name unavailable)"
                                : "Allocated"}
                          </span>
                        ) : (
                          <span style={{ color: "var(--faint)" }}>
                            — in pool
                          </span>
                        )}
                      </td>
                      <td data-label="Action" className="r">
                        <div
                          style={{ display: "flex", justifyContent: "flex-end" }}
                        >
                          {r.advertiser_id ? (
                            <button
                              className="btn ghost sm"
                              disabled={release.isPending}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    "Return this ad account to the pool? The advertiser's own account row stays as-is — and if it's still active the release is refused, because it would silently stop that account's top-ups reaching the supplier.",
                                  )
                                )
                                  release.mutate(r);
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
                                setNameInput("");
                                setFeeInput(
                                  r.fee_percentage == null
                                    ? ""
                                    : String(r.fee_percentage),
                                );
                                // Seed our cost from what the supplier
                                // reports; the operator can correct it.
                                setSupplierFeeInput(
                                  r.fee_percentage == null
                                    ? ""
                                    : String(r.fee_percentage),
                                );
                              }}
                            >
                              <UserPlus /> Allocate
                            </button>
                          )}
                        </div>
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
        <Modal titleId={`${uid}-add-title`} onClose={() => setAddOpen(false)}>
          <div className="mhead">
            <h2 id={`${uid}-add-title`}>Add a manual ad account</h2>
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

          <label className="mlabel" htmlFor={`${uid}-m-name`}>
            Name
          </label>
          <input
            id={`${uid}-m-name`}
            value={manual.name}
            onChange={(e) => setManual({ ...manual, name: e.target.value })}
            placeholder="e.g. PSM Meta 014"
          />

          <label className="mlabel" htmlFor={`${uid}-m-ext`}>
            Account ID (optional — yours, for reference)
          </label>
          <input
            id={`${uid}-m-ext`}
            value={manual.externalId}
            onChange={(e) =>
              setManual({ ...manual, externalId: e.target.value })
            }
            placeholder="e.g. act_123456789"
          />

          <label className="mlabel" htmlFor={`${uid}-m-bm`}>
            BM ID (optional)
          </label>
          <input
            id={`${uid}-m-bm`}
            value={manual.bmId}
            onChange={(e) => setManual({ ...manual, bmId: e.target.value })}
            placeholder="e.g. 1234567890"
          />

          <div className="mrow">
            <div>
              <label className="mlabel" htmlFor={`${uid}-m-plat`}>
                Platform
              </label>
              <select
                id={`${uid}-m-plat`}
                value={manual.platform}
                onChange={(e) =>
                  setManual({ ...manual, platform: e.target.value })
                }
              >
                <option value="meta-ads">Meta</option>
                <option value="tiktok-ads">TikTok</option>
                <option value="google-ads">Google</option>
              </select>
            </div>
            <div>
              <label className="mlabel" htmlFor={`${uid}-m-cur`}>
                Currency
              </label>
              <select
                id={`${uid}-m-cur`}
                value={manual.currency}
                onChange={(e) =>
                  setManual({ ...manual, currency: e.target.value })
                }
              >
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
              </select>
            </div>
            <div>
              <label className="mlabel" htmlFor={`${uid}-m-fee`}>
                Fee %
              </label>
              <input
                id={`${uid}-m-fee`}
                type="number"
                min="0"
                max="100"
                step="0.01"
                placeholder="e.g. 2"
                value={manual.feePercentage}
                onChange={(e) =>
                  setManual({ ...manual, feePercentage: e.target.value })
                }
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
          <p className="mnote">
            Leave Fee % blank only if you&apos;ll set it when allocating — an
            account with no fee anywhere can&apos;t be allocated.
          </p>
        </Modal>
      )}

      {assigning && (
        <Modal
          titleId={`${uid}-alloc-title`}
          onClose={() => setAssigning(null)}
        >
          <div className="mhead">
            <h2 id={`${uid}-alloc-title`}>Allocate ad account</h2>
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

          <label className="mlabel" htmlFor={`${uid}-a-adv`}>
            Advertiser
          </label>
          <select
            id={`${uid}-a-adv`}
            value={advertiserId}
            onChange={(e) => setAdvertiserId(e.target.value)}
            disabled={advertisers.isLoading || advertisers.isError}
          >
            <option value="">
              {advertisers.isLoading
                ? "Loading advertisers…"
                : advertisers.isError
                  ? "Couldn't load advertisers"
                  : (advertisers.data ?? []).length === 0
                    ? "No advertisers in this tenant"
                    : "Select an advertiser…"}
            </option>
            {(advertisers.data ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {advertiserLabel(a)}
              </option>
            ))}
          </select>
          {advertisers.isError && (
            <p className="cap" style={{ color: "var(--danger)" }}>
              {(advertisers.error as Error)?.message ?? "Request failed."}{" "}
              <button
                className="btn ghost sm"
                onClick={() => advertisers.refetch()}
              >
                Retry
              </button>
            </p>
          )}

          {/* The advertiser sees this name in their dashboard. Defaulting to
              the supplier's own naming would put their internal codes — and
              potentially their brand — in front of a customer. */}
          <label className="mlabel" htmlFor={`${uid}-a-name`}>
            Account name (shown to the advertiser)
          </label>
          <input
            id={`${uid}-a-name`}
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder={
              assigning.name ??
              `PSM ${PLATFORM_LABEL[assigning.platform ?? ""] ?? "Ads"}`
            }
          />

          <label className="mlabel" htmlFor={`${uid}-a-fee`}>
            Fee %{" "}
            {assigning.fee_percentage == null
              ? "(required — this account has no supplier fee)"
              : `(defaults to ${assigning.fee_percentage}%)`}
          </label>
          <input
            id={`${uid}-a-fee`}
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={feeInput}
            onChange={(e) => setFeeInput(e.target.value)}
            placeholder="e.g. 2"
          />

          {/* What WE pay the supplier. Kept next to what we charge so the
              margin is a decision made once, at allocation, instead of being
              reconstructed later from two places. */}
          <label className="mlabel" htmlFor={`${uid}-a-sfee`}>
            Supplier fee % — what we pay
          </label>
          <input
            id={`${uid}-a-sfee`}
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={supplierFeeInput}
            onChange={(e) => setSupplierFeeInput(e.target.value)}
            placeholder="leave blank if unknown"
          />
          <p
            className="cap"
            style={{ margin: "8px 0 0" }}
            aria-live="polite"
          >
            {(() => {
              const charge = Number(feeInput);
              const cost = Number(supplierFeeInput);
              if (supplierFeeInput.trim() === "")
                return "Supplier fee not recorded — margin unknown for this account.";
              if (!Number.isFinite(charge) || feeInput.trim() === "")
                return "Set the customer fee to see the margin.";
              if (!Number.isFinite(cost)) return "Supplier fee is not a number.";
              const margin = charge - cost;
              return margin < 0
                ? `⚠ Margin ${margin.toFixed(2)}% — we would pay the supplier more than we charge.`
                : `Margin ${margin.toFixed(2)}% (we charge ${charge}%, we pay ${cost}%).`;
            })()}
          </p>

          <button
            className="btn block grad"
            style={{ marginTop: 14 }}
            disabled={
              assign.isPending ||
              !advertiserId ||
              (assigning.fee_percentage == null && feeInput.trim() === "")
            }
            onClick={() => assign.mutate()}
          >
            {assign.isPending && <Loader2 className="animate-spin" />}
            Allocate to advertiser
          </button>
          <p className="mnote">
            This creates the advertiser&apos;s ad account and links it to the
            supplier account.
          </p>
        </Modal>
      )}
    </div>
  );
}
