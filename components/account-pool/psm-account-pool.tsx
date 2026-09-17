"use client";

import ConfirmModal, { ConfirmFact } from "@/components/ui/confirm-modal";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import PsmSortFilter from "@/components/psm/sort-filter";
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

// en-US, like every other money figure in the app. This formatted with
// nl-NL, so a pool balance read "$12.500,00" while the same twelve and a
// half thousand dollars read "$12,500.00" two screens away — and
// "$12.500,00" can be read as twelve dollars fifty. One convention, or the
// numbers are not comparable by eye.
//
// An unknown currency code prints as a code rather than being guessed into
// a dollar sign; the old two-way test called everything that was not EUR a
// dollar amount.
function money(cents: number | null, currency: string | null) {
  if (cents == null) return "—";
  const code = (currency ?? "USD").toUpperCase();
  const amount = cents / 100;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${code} ${amount.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
}

function advertiserLabel(a: AdvertiserOption) {
  // CODE FIRST. A dropdown that reads "john doe / Henk AD / Test Advertiser"
  // is a list of names you have to recognise; the desk works in PSM numbers
  // — they are on the invoice, they prefix every payment reference, and two
  // customers can share a name while only one is PSM0002. Allocating an ad
  // account to the wrong advertiser is a money event, so the identifier you
  // can verify goes in front of the one you have to remember.
  //
  // Same order as components/psm/customer-name.tsx, for the same reason.
  const code = (a.tenant_client_code ?? "").trim();
  const name = (a.profile?.full_name || a.profile?.email || "").trim();
  if (code && name) return `${code} — ${name}`;
  return code || name || a.id.slice(0, 8);
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
  const { profile, isSuperAdmin } = useAppContext();
  const [filter, setFilter] = useState<SupplierAdAccountFilter>("unassigned");
  const [search, setSearch] = useState("");
  const [assigning, setAssigning] = useState<SupplierAdAccount | null>(null);
  // window.confirm was doing this, and on a queue screen that is a trap:
  // after a few dialogs the browser offers "prevent this page from
  // creating additional dialogs", and once ticked confirm() silently
  // returns false — the button looks dead. It also cannot show which
  // account and which advertiser, which is the whole point of asking.
  const [releasing, setReleasing] = useState<SupplierAdAccount | null>(null);
  const [advertiserId, setAdvertiserId] = useState("");
  // The fee THIS advertiser's plan or community says we charge. It is the
  // right default — an advertiser is on a plan or in a community, and that
  // is where their rate was agreed — where the account's own supplier fee is
  // just what WE pay, which is a different number about a different party.
  const { data: advertiserPlan } = useQuery<{ topup_fee_pct: number } | null>({
    queryKey: ["advertiser-plan", advertiserId],
    enabled: !!advertiserId,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("advertiser_plans")
        .select("topup_fee_pct")
        .eq("advertiser_id", advertiserId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as { topup_fee_pct: number } | null;
    },
  });
  const [feeInput, setFeeInput] = useState("");
  const [source, setSource] = useState<"all" | "supplier1" | "manual">("all");
  // The supplier's own status for the account: active, paused, or suspended
  // (what a ban looks like on their side). Worth filtering on, because a
  // suspended account in the pool is inventory you must NOT allocate.
  const [supplierStatus, setSupplierStatus] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [supplierFeeInput, setSupplierFeeInput] = useState("");
  const uid = useId();
  const planFee =
    advertiserPlan && Number.isFinite(Number(advertiserPlan.topup_fee_pct))
      ? Number(advertiserPlan.topup_fee_pct)
      : null;
  const [manual, setManual] = useState({
    name: "",
    externalId: "",
    platform: "meta-ads",
    currency: "EUR",
    bmId: "",
    feePercentage: "",
  });
  // Allocating straight from the Add form. Kept in its own state rather than
  // shared with the allocate dialog's, so picking an advertiser here and
  // cancelling cannot leave the other dialog pre-filled with someone.
  const [manualAdvId, setManualAdvId] = useState("");
  const [manualClientFee, setManualClientFee] = useState("");
  const { data: manualAdvPlan } = useQuery<{ topup_fee_pct: number } | null>({
    queryKey: ["advertiser-plan", manualAdvId],
    enabled: !!manualAdvId,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("advertiser_plans")
        .select("topup_fee_pct")
        .eq("advertiser_id", manualAdvId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as { topup_fee_pct: number } | null;
    },
  });
  const manualPlanFee =
    manualAdvPlan && Number.isFinite(Number(manualAdvPlan.topup_fee_pct))
      ? Number(manualAdvPlan.topup_fee_pct)
      : null;

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
      return { ...res.data, warning: res.warning };
    },
    onSuccess: (d) => {
      // A half-applied allocation must not read as a clean one.
      if (d?.warning) toast.warning(d.warning);
      else toast.success("Ad account allocated to the advertiser.");
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

      // Straight to an advertiser when one was picked. Two writes, and the
      // first one has already happened if the second fails — so the error
      // says the account exists and is sitting in the pool, rather than
      // leaving the admin to guess whether to retype the whole form.
      if (manualAdvId) {
        const fee =
          manualClientFee.trim() === ""
            ? manualPlanFee ?? undefined
            : Number(manualClientFee);
        const alloc = await assignSupplierAdAccount({
          poolId: res.data.id,
          advertiserId: manualAdvId,
          fee,
          supplierFeePct:
            manual.feePercentage.trim() === ""
              ? null
              : Number(manual.feePercentage),
        });
        if (!alloc.ok) {
          throw new Error(
            `The account was added to the pool, but allocating it failed: ${alloc.error} Allocate it from the list.`,
          );
        }
        return { ...res.data, allocated: true, warning: alloc.warning };
      }
      return { ...res.data, allocated: false, warning: undefined as string | undefined };
    },
    onSuccess: (d) => {
      if (d.allocated) {
        if (d.warning) toast.warning(d.warning);
        else toast.success("Added and allocated to the advertiser.");
      } else {
        toast.success("Added to the pool.");
      }
      setAddOpen(false);
      setManualAdvId("");
      setManualClientFee("");
      setManual({
        name: "",
        externalId: "",
        platform: "meta-ads",
        currency: "EUR",
        bmId: "",
        feePercentage: "",
      });
      queryClient.invalidateQueries({ queryKey: ["supplier-ad-account-pool"] });
      // Same three places the allocate path invalidates — an account that
      // was allocated on creation has to appear on the Ad Accounts screen
      // and in the top-up pickers too.
      queryClient.invalidateQueries({ queryKey: ["ad-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["adv-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
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
      if (supplierStatus !== "all") {
        const st = (r.status ?? "unknown").toLowerCase();
        if (supplierStatus === "unhealthy") {
          // Anything that is not plainly usable, in one click — which is what
          // you actually want to see before allocating anything.
          if (st === "active") return false;
        } else if (st !== supplierStatus) {
          return false;
        }
      }
      if (!term) return true;
      return (
        (r.name ?? "").toLowerCase().includes(term) ||
        r.external_id.toLowerCase().includes(term) ||
        (r.bm_id ?? "").toLowerCase().includes(term)
      );
    });
  }, [pool.data, filter, search, source, supplierStatus]);

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
      <div className="phead phead-actions">
        <div className="ptxt">
          <h1>Ad Account Pool</h1>
          <p>Unallocated inventory.</p>
        </div>
        {/* .pactions lets the two buttons share one row on a phone instead of
            stacking into ~90px of header. The long half of each label is in a
            .lbl-long span the shell hides under 560px — the icon plus the
            short word still says what it does. */}
        <div className="pacts">
          <button className="btn ghost" onClick={() => setAddOpen(true)}>
            <UserPlus /> Add <span className="lbl-long">manual account</span>
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
            {sync.isPending ? (
              "Syncing…"
            ) : (
              <>
                Sync <span className="lbl-long">from SeamX</span>
              </>
            )}
          </button>
        </div>
      </div>

      <div className="fbar">
        <label className="fsr">
          <Search />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search the pool…"
          />
        </label>
        <PsmSortFilter
          filters={[
            {
              id: "alloc",
              label: "Allocation status",
              value: filter,
              // "unassigned" is this screen's working default — the pool is
              // what you have LEFT to allocate — so the badge treats anything
              // else as narrowing, and Reset brings you back to it.
              allValue: "unassigned",
              onChange: (v) => setFilter(v as SupplierAdAccountFilter),
              options: [
                { value: "unassigned", label: `Unassigned (${counts.unassigned})` },
                { value: "assigned", label: `Allocated (${counts.assigned})` },
                { value: "all", label: `All (${counts.all})` },
              ],
            },
            {
              id: "supplierStatus",
              label: "Account status",
              value: supplierStatus,
              onChange: setSupplierStatus,
              options: [
                { value: "all", label: "Any status" },
                { value: "active", label: "Active" },
                { value: "paused", label: "Paused" },
                { value: "suspended", label: "Suspended / banned" },
                { value: "unhealthy", label: "Anything not active" },
              ],
            },
            {
              id: "source",
              label: "Source",
              value: source,
              onChange: (v) => setSource(v as "all" | "supplier1" | "manual"),
              options: [
                { value: "all", label: "All sources" },
                { value: "supplier1", label: "SeamX" },
                { value: "manual", label: "Manual (ours)" },
              ],
            },
          ]}
          searchActive={!!search.trim()}
          onReset={() => {
            setFilter("unassigned" as SupplierAdAccountFilter);
            setSource("all");
            setSupplierStatus("all");
            setSearch("");
          }}
        />
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
        <div className="card" style={{ padding: 0 }}>
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
                      {/* .fullcell: the button row spans the card and loses
                          its "ACTION" label, like every other admin list. */}
                      <td data-label="Action" className="r fullcell">
                        <div className="actrow">
                          {r.advertiser_id ? (
                            <button
                              className="btn ghost sm"
                              disabled={release.isPending}
                              onClick={() => setReleasing(r)}
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

          {/* Allocate without a second trip through the list. Optional: an
              account with nobody on it is still a perfectly good pool row,
              which is what this dialog was for. */}
          <label className="mlabel" htmlFor={`${uid}-m-adv`}>
            Allocate to (optional)
          </label>
          <select
            id={`${uid}-m-adv`}
            value={manualAdvId}
            onChange={(e) => setManualAdvId(e.target.value)}
            disabled={advertisers.isLoading || advertisers.isError}
          >
            <option value="">
              {advertisers.isLoading
                ? "Loading advertisers…"
                : advertisers.isError
                  ? "Couldn't load advertisers"
                  : "Leave in the pool"}
            </option>
            {(advertisers.data ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {advertiserLabel(a)}
              </option>
            ))}
          </select>

          {manualAdvId && (
            <>
              {/* Two different fees about two different parties, so they are
                  never next to each other unlabelled: Fee % above is what WE
                  PAY the supplier, this is what the ADVERTISER PAYS US. */}
              <label className="mlabel" htmlFor={`${uid}-m-cfee`}>
                Fee % to client
              </label>
              <input
                id={`${uid}-m-cfee`}
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={manualClientFee}
                onChange={(e) => setManualClientFee(e.target.value)}
                placeholder={
                  manualPlanFee != null
                    ? `${manualPlanFee} (their plan)`
                    : "e.g. 5"
                }
              />
              <p className="mnote" style={{ marginTop: 6 }}>
                {manualPlanFee != null
                  ? `Blank uses ${manualPlanFee}% — the rate this advertiser's plan or community already agreed.`
                  : "This advertiser has no plan rate on file, so enter the fee to charge on their top-ups."}
              </p>
            </>
          )}

          <button
            className="btn block grad"
            style={{ marginTop: 14 }}
            disabled={addManual.isPending || !manual.name.trim()}
            onClick={() => addManual.mutate()}
          >
            {addManual.isPending && <Loader2 className="animate-spin" />}
            {manualAdvId ? "Add and allocate" : "Add to pool"}
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

          {/* Two fees, two directions, side by side. They were stacked and
              identical, so the only thing telling "what the customer pays us"
              apart from "what we pay the supplier" was reading the label
              carefully — on the one screen where confusing them sets a margin
              the wrong way round. Money IN is the brand colour, money OUT is
              amber, and the margin under them is the sum of the two. */}
          <div className="feepair">
            <div className="feefield in">
              <label className="mlabel" htmlFor={`${uid}-a-fee`}>
                Fee % <span>we charge</span>
              </label>
              <input
                id={`${uid}-a-fee`}
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={feeInput}
                onChange={(e) => setFeeInput(e.target.value)}
                placeholder={planFee != null ? String(planFee) : "e.g. 2"}
              />
              <p className="feehint">
                {planFee != null
                  ? `Their plan rate: ${planFee}%`
                  : assigning.fee_percentage == null
                    ? "No plan rate — set one"
                    : `Account default: ${assigning.fee_percentage}%`}
              </p>
            </div>
            <div className="feefield out">
              <label className="mlabel" htmlFor={`${uid}-a-sfee`}>
                Fee % <span>we pay</span>
              </label>
              <input
                id={`${uid}-a-sfee`}
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={supplierFeeInput}
                onChange={(e) => setSupplierFeeInput(e.target.value)}
                placeholder={isSuperAdmin ? "unknown" : "owner only"}
                disabled={!isSuperAdmin}
              />
              <p className="feehint">
                {isSuperAdmin ? "To the supplier" : "Owner only"}
              </p>
            </div>
          </div>
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
              const base =
                margin < 0
                  ? `⚠ Top-up margin ${margin.toFixed(2)}% — we would pay the supplier more than we charge.`
                  : `Top-up margin ${margin.toFixed(2)}% (we charge ${charge}%, we pay ${cost}%).`;
              // DST is charged against OUR reserve as the advertiser spends,
              // at a rate that varies by country — it is not a fixed
              // percentage on the account and is NOT in this figure.
              return `${base} Excludes DST, which is charged on spend per country.`;
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
      <ConfirmModal
        open={!!releasing}
        onOpenChange={(next) => {
          if (!next) setReleasing(null);
        }}
        title="Return this account to the pool?"
        lead="The advertiser's own account row stays exactly as it is. If it is still running the release is refused outright, because it would quietly stop that account's top-ups reaching the supplier."
        cta="Yes, release it"
        busy={release.isPending}
        busyLabel="Releasing…"
        onConfirm={() => {
          const r = releasing;
          setReleasing(null);
          if (r) release.mutate(r);
        }}
      >
        <ConfirmFact label="Account" value={releasing?.name ?? "—"} />
        <ConfirmFact
          label="Provider id"
          value={releasing?.external_id ?? "—"}
        />
      </ConfirmModal>
    </div>
  );
}
