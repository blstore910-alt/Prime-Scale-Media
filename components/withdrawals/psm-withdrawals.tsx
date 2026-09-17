"use client";

import { createClient } from "@/lib/supabase/client";
import PsmSortFilter from "@/components/psm/sort-filter";
import CustomerName from "@/components/psm/customer-name";
import { useAppContext } from "@/context/app-provider";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowDownToLine,
  Loader2,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import { useMemo, useState } from "react";
import {
  approveAdAccountWithdrawal,
  rejectAdAccountWithdrawal,
} from "@/actions/withdrawal-actions";
import {
  requestWalletRefund,
  approveWalletRefund,
  rejectWalletRefund,
} from "@/actions/refund-actions";
import {
  requestWalletAdjustment,
  approveWalletAdjustment,
  rejectWalletAdjustment,
} from "@/actions/adjustment-actions";
import type { AdAccountWithdrawal } from "@/lib/types/withdrawal";
import { formatCurrency } from "@/lib/utils";

// Admin Withdrawals, ported to the PSM mockup look. Three sections behind a
// segmented control (Withdrawals / Refunds / Adjustments). Every
// list read uses the same Supabase select the original panels used (reads are
// RLS-covered); every mutation reuses the existing server actions
// (withdrawal-actions / refund-actions / adjustment-actions)
// with identical payloads, toasts and cache invalidations. The two
// create/request forms are the original panel dialogs copied verbatim — same
// shadcn Dialog, same server-action calls — so money behaviour is unchanged.

type AdvertiserOption = {
  id: string;
  tenant_client_code: string | null;
  profile: { full_name: string | null; email: string | null } | null;
};

type Tab = "withdrawals" | "refunds" | "adjustments";

const emptyRow = (colSpan: number, msg: string, danger = false) => (
  <tr>
    <td
      colSpan={colSpan}
      style={{
        textAlign: "center",
        padding: 28,
        color: danger ? "var(--danger)" : "var(--txt-2)",
      }}
    >
      {msg}
    </td>
  </tr>
);

const loadingRow = (colSpan: number) => (
  <tr>
    <td colSpan={colSpan} style={{ textAlign: "center", padding: 28 }}>
      <Loader2 className="animate-spin" style={{ display: "inline" }} />
    </td>
  </tr>
);

export default function PsmWithdrawals() {
  const [tab, setTab] = useState<Tab>("withdrawals");

  return (
    <div
      className="psmview"
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
    >
      <div className="phead">
        <div>
          <h1>Withdrawals</h1>
          <p>
            Approving moves money — verify.
          </p>
        </div>
      </div>

      <div
        role="tablist"
        style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
      >
        <SegBtn active={tab === "withdrawals"} onClick={() => setTab("withdrawals")}>
          <ArrowDownToLine /> Withdrawals
        </SegBtn>
        <SegBtn active={tab === "refunds"} onClick={() => setTab("refunds")}>
          <RotateCcw /> Refunds
        </SegBtn>
        <SegBtn
          active={tab === "adjustments"}
          onClick={() => setTab("adjustments")}
        >
          <SlidersHorizontal /> Adjustments
        </SegBtn>
      </div>

      {tab === "withdrawals" && <WithdrawalsSection />}
      {tab === "refunds" && <RefundsSection />}
      {tab === "adjustments" && <AdjustmentsSection />}
    </div>
  );
}

function SegBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      className={`btn sm${active ? "" : " ghost"}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

const badgeFor = (
  status: string,
  okSet: string[],
  pendSet: string[],
): "ok" | "pend" | "due" => {
  if (okSet.includes(status)) return "ok";
  if (pendSet.includes(status)) return "pend";
  return "due";
};

/* ------------------------------------------------------------------ */
/* Withdrawals — ad-account balance pulled back to the wallet.         */
/* ------------------------------------------------------------------ */

function WithdrawalsSection() {
  const { profile } = useAppContext();
  const tenantId = profile?.tenant_id ?? null;
  const queryClient = useQueryClient();
  const [actingId, setActingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["ad-account-withdrawals", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("ad_account_withdrawals")
        .select(
          "*, ad_account:ad_accounts(name, platform), advertiser:advertisers(tenant_client_code, profile:user_profiles(full_name, email))",
        )
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AdAccountWithdrawal[];
    },
  });

  const approve = useMutation({
    mutationFn: async (id: string) => {
      setActingId(id);
      const res = await approveAdAccountWithdrawal(id);
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success("Withdrawal approved — wallet credited");
      queryClient.invalidateQueries({ queryKey: ["ad-account-withdrawals"] });
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
    },
    onError: (e: Error) =>
      toast.error("Approve failed", { description: e.message }),
    onSettled: () => setActingId(null),
  });

  const reject = useMutation({
    mutationFn: async (id: string) => {
      setActingId(id);
      const res = await rejectAdAccountWithdrawal(id);
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success("Withdrawal rejected");
      queryClient.invalidateQueries({ queryKey: ["ad-account-withdrawals"] });
    },
    onError: (e: Error) =>
      toast.error("Reject failed", { description: e.message }),
    onSettled: () => setActingId(null),
  });

  const rows = useMemo(() => {
    let list = data ?? [];
    if (status !== "all") list = list.filter((w) => w.status === status);
    const q = search.trim().toLowerCase();
    if (q)
      list = list.filter(
        (w) =>
          (w.reference ?? "").toLowerCase().includes(q) ||
          (w.advertiser?.profile?.full_name ?? "").toLowerCase().includes(q) ||
          (w.advertiser?.tenant_client_code ?? "")
            .toLowerCase()
            .includes(q) ||
          (w.ad_account?.name ?? "").toLowerCase().includes(q),
      );
    return list;
  }, [data, status, search]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p className="muted" style={{ margin: 0, fontSize: ".9rem" }}>
        Advertisers pull balance from an ad account back to their wallet.
        Approving credits their wallet immediately.
      </p>

      <div className="fbar">
        <label className="fsr">
          <Search />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ref, advertiser, account…"
          />
        </label>
        <PsmSortFilter
          filters={[
            {
              id: "status",
              label: "Status",
              value: status,
              onChange: setStatus,
              options: [
                { value: "all", label: "All statuses" },
                { value: "pending", label: "Pending" },
                { value: "approved", label: "Approved" },
                { value: "rejected", label: "Rejected" },
                { value: "cancelled", label: "Cancelled" },
              ],
            },
          ]}
          searchActive={!!search.trim()}
          onReset={() => {
            setStatus("all");
            setSearch("");
          }}
        />
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="tblwrap">
          <table className="tbl wide">
            <thead>
              <tr>
                <th style={{ paddingLeft: 14 }}>Ref</th>
                <th>Advertiser</th>
                <th>Ad account</th>
                <th className="r">Amount</th>
                <th className="r">Status</th>
                <th className="r">Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? loadingRow(6)
                : isError
                  ? emptyRow(
                      6,
                      (error as Error)?.message ??
                        "Failed to load withdrawals.",
                      true,
                    )
                  : rows.length
                    ? rows.map((w) => (
                        <tr key={w.id}>
                          <td
                            className="mono"
                            style={{ fontSize: ".8rem" }}
                            data-label="Ref"
                          >
                            {w.reference ?? "—"}
                          </td>
                          <td data-label="Advertiser">
                            {/* Code first, name beneath. */}
                            <CustomerName
                              clientCode={w.advertiser?.tenant_client_code}
                              name={w.advertiser?.profile?.full_name}
                              full
                            />
                          </td>
                          <td data-label="Ad account">
                            <div>{w.ad_account?.name ?? "—"}</div>
                            <div
                              className="muted"
                              style={{
                                fontSize: ".78rem",
                                textTransform: "capitalize",
                              }}
                            >
                              {w.ad_account?.platform ?? ""}
                            </div>
                          </td>
                          <td
                            className="r mono"
                            style={{ fontWeight: 700 }}
                            data-label="Amount"
                          >
                            {formatCurrency(Number(w.amount), w.currency)}
                          </td>
                          <td className="r" data-label="Status">
                            <span
                              className={`badge ${badgeFor(
                                w.status,
                                ["approved"],
                                ["pending"],
                              )}`}
                              style={{ textTransform: "capitalize" }}
                            >
                              {w.status}
                            </span>
                          </td>
                          <td className="r" data-label="Action">
                            {w.status === "pending" ? (
                              <div
                                style={{
                                  display: "inline-flex",
                                  gap: 8,
                                  justifyContent: "flex-end",
                                }}
                              >
                                <button
                                  className="btn ghost sm"
                                  disabled={actingId === w.id}
                                  onClick={() => reject.mutate(w.id)}
                                >
                                  Reject
                                </button>
                                <button
                                  className="btn sm"
                                  disabled={actingId === w.id}
                                  onClick={() => {
                                    if (
                                      window.confirm(
                                        "Approve this withdrawal? It credits the advertiser's wallet immediately and can't be undone here.",
                                      )
                                    )
                                      approve.mutate(w.id);
                                  }}
                                >
                                  {actingId === w.id ? "…" : "Approve"}
                                </button>
                              </div>
                            ) : (
                              <span
                                className="muted"
                                style={{ fontSize: ".8rem" }}
                              >
                                {w.reviewed_at
                                  ? new Date(
                                      w.reviewed_at,
                                    ).toLocaleDateString()
                                  : "—"}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))
                    : emptyRow(6, "No withdrawal requests yet.")}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Refunds — admin requests, tenant owner approves.                    */
/* ------------------------------------------------------------------ */

type RefundRow = {
  id: string;
  reference: string | null;
  amount: number;
  currency: "USD" | "EUR";
  status: string;
  reason: string | null;
  payout_details: string | null;
  payout_business_name: string | null;
  payout_address: string | null;
  payout_bank_currency: string | null;
  created_at: string;
  advertiser: AdvertiserOption | null;
};

function RefundsSection() {
  const { profile, isSuperAdmin } = useAppContext();
  const tenantId = profile?.tenant_id ?? null;
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");

  const { data: rows, isLoading, isError } = useQuery({
    queryKey: ["wallet-refunds", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("wallet_refunds")
        .select(
          "id, reference, amount, currency, status, reason, payout_details, payout_business_name, payout_address, payout_bank_currency, created_at, advertiser:advertisers(id, tenant_client_code, profile:user_profiles(full_name, email))",
        )
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as RefundRow[];
    },
  });

  const approve = useMutation({
    mutationFn: async (id: string) => {
      setActingId(id);
      const res = await approveWalletRefund(id);
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success("Refund approved — wallet debited");
      queryClient.invalidateQueries({ queryKey: ["wallet-refunds"] });
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
    },
    onError: (e: Error) =>
      toast.error("Approve failed", { description: e.message }),
    onSettled: () => setActingId(null),
  });

  const reject = useMutation({
    mutationFn: async (id: string) => {
      setActingId(id);
      const res = await rejectWalletRefund(id);
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success("Refund rejected");
      queryClient.invalidateQueries({ queryKey: ["wallet-refunds"] });
    },
    onError: (e: Error) =>
      toast.error("Reject failed", { description: e.message }),
    onSettled: () => setActingId(null),
  });

  const list = rows ?? [];
  const pendingCount = list.filter((r) => r.status === "pending").length;

  const filtered = useMemo(() => {
    let l = rows ?? [];
    if (status !== "all") l = l.filter((r) => r.status === status);
    const q = search.trim().toLowerCase();
    if (q)
      l = l.filter(
        (r) =>
          (r.reference ?? "").toLowerCase().includes(q) ||
          (r.advertiser?.profile?.full_name ?? "").toLowerCase().includes(q) ||
          (r.advertiser?.tenant_client_code ?? "").toLowerCase().includes(q) ||
          (r.payout_business_name ?? "").toLowerCase().includes(q),
      );
    return l;
  }, [rows, status, search]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <p className="muted" style={{ margin: 0, fontSize: ".9rem", flex: 1 }}>
          When a customer leaves, refund their wallet balance to their bank. An
          admin requests it; the tenant owner approves.
        </p>
        {pendingCount > 0 && (
          <span className="badge pend">{pendingCount} pending</span>
        )}
        <button className="btn sm" onClick={() => setCreateOpen(true)}>
          <Plus /> Request refund
        </button>
      </div>

      <div className="fbar">
        <label className="fsr">
          <Search />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ref, advertiser, payee…"
          />
        </label>
        <PsmSortFilter
          filters={[
            {
              id: "status",
              label: "Status",
              value: status,
              onChange: setStatus,
              options: [
                { value: "all", label: "All statuses" },
                { value: "pending", label: "Pending" },
                { value: "approved", label: "Approved" },
                { value: "rejected", label: "Rejected" },
              ],
            },
          ]}
          searchActive={!!search.trim()}
          onReset={() => {
            setStatus("all");
            setSearch("");
          }}
        />
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="tblwrap">
          <table className="tbl wide">
            <thead>
              <tr>
                <th style={{ paddingLeft: 14 }}>Ref</th>
                <th>Advertiser</th>
                <th className="r">Amount</th>
                <th>Payout to</th>
                <th className="r">Status</th>
                <th className="r">Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? loadingRow(6)
                : filtered.length
                  ? filtered.map((r) => (
                      <tr key={r.id}>
                        <td
                          className="mono"
                          style={{ fontSize: ".8rem" }}
                          data-label="Ref"
                        >
                          {r.reference ?? "—"}
                        </td>
                        <td data-label="Advertiser">
                            {/* Code first, name beneath. */}
                            <CustomerName
                              clientCode={r.advertiser?.tenant_client_code}
                              name={r.advertiser?.profile?.full_name}
                              full
                            />
                          </td>
                        <td
                          className="r mono"
                          style={{ fontWeight: 700 }}
                          data-label="Amount"
                        >
                          {formatCurrency(Number(r.amount), r.currency)}
                        </td>
                        <td
                          style={{
                            maxWidth: 240,
                            fontSize: ".8rem",
                            color: "var(--txt-2)",
                          }}
                          data-label="Payout to"
                        >
                          {r.payout_business_name || r.payout_details ? (
                            <div>
                              {r.payout_business_name && (
                                <div
                                  style={{
                                    fontWeight: 600,
                                    color: "var(--ink)",
                                  }}
                                >
                                  {r.payout_business_name}
                                </div>
                              )}
                              {r.payout_address && (
                                <div
                                  style={{
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {r.payout_address}
                                </div>
                              )}
                              {r.payout_details && (
                                <div
                                  className="mono"
                                  style={{
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {r.payout_details}
                                  {r.payout_bank_currency
                                    ? ` · ${r.payout_bank_currency}`
                                    : ""}
                                </div>
                              )}
                            </div>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="r" data-label="Status">
                          <span
                            className={`badge ${badgeFor(
                              r.status,
                              ["approved"],
                              ["pending"],
                            )}`}
                            style={{ textTransform: "capitalize" }}
                          >
                            {r.status}
                          </span>
                        </td>
                        <td className="r" data-label="Action">
                          {r.status === "pending" && isSuperAdmin ? (
                            <div
                              style={{
                                display: "inline-flex",
                                gap: 8,
                                justifyContent: "flex-end",
                              }}
                            >
                              <button
                                className="btn ghost sm"
                                disabled={actingId === r.id}
                                onClick={() => reject.mutate(r.id)}
                              >
                                Reject
                              </button>
                              <button
                                className="btn sm"
                                disabled={actingId === r.id}
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      "Approve this refund? It debits the advertiser's wallet immediately and can't be undone here.",
                                    )
                                  )
                                    approve.mutate(r.id);
                                }}
                              >
                                {actingId === r.id ? "…" : "Approve"}
                              </button>
                            </div>
                          ) : r.status === "pending" ? (
                            <span className="muted" style={{ fontSize: ".8rem" }}>
                              awaiting owner
                            </span>
                          ) : (
                            <span
                              className="muted"
                              style={{
                                fontSize: ".8rem",
                                textTransform: "capitalize",
                              }}
                            >
                              {r.status}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  : emptyRow(
                      6,
                      // A failed read is not an empty queue. Saying "no
                      // refund requests yet" when the query errored tells an
                      // admin there is nothing waiting — which is the one
                      // thing it cannot know. The Withdrawals section in this
                      // same file already got this right; these two did not.
                      isError
                        ? "Couldn't load refund requests — this is NOT an empty queue. Reload to retry."
                        : "No refund requests yet.",
                    )}
            </tbody>
          </table>
        </div>
      </div>

      <RefundRequestDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        tenantId={tenantId}
      />
    </div>
  );
}

// Copied verbatim from components/withdrawals/refund-panel.tsx so the refund
// request flow (payload, validation, server action) is byte-identical.
function RefundRequestDialog({
  open,
  onOpenChange,
  tenantId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tenantId: string | null;
}) {
  const queryClient = useQueryClient();
  const [advertiserId, setAdvertiserId] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<"USD" | "EUR">("USD");
  const [reason, setReason] = useState("");
  const [payoutDetails, setPayoutDetails] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [address, setAddress] = useState("");
  const [bankCurrency, setBankCurrency] = useState<"USD" | "EUR" | "HKD">("EUR");

  const { data: advertisers } = useQuery({
    queryKey: ["refund-advertisers", tenantId],
    enabled: !!tenantId && open,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("advertisers")
        .select(
          "id, tenant_client_code, profile:user_profiles(full_name, email)",
        )
        .eq("tenant_id", tenantId)
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as AdvertiserOption[];
    },
  });

  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      const res = await requestWalletRefund({
        advertiser_id: advertiserId,
        amount: Number(amount),
        currency,
        reason: reason.trim() || undefined,
        payout_details: payoutDetails.trim() || undefined,
        business_name: businessName.trim() || undefined,
        address: address.trim() || undefined,
        bank_currency: bankCurrency,
      });
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success("Refund requested — awaiting owner approval");
      queryClient.invalidateQueries({ queryKey: ["wallet-refunds"] });
      setAdvertiserId("");
      setAmount("");
      setReason("");
      setPayoutDetails("");
      setBusinessName("");
      setAddress("");
      onOpenChange(false);
    },
    onError: (e: Error) =>
      toast.error("Couldn't request refund", { description: e.message }),
  });

  const numeric = Number(amount);
  const valid = !!advertiserId && Number.isFinite(numeric) && numeric > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Request refund</DialogTitle>
          <DialogDescription>
            Refund a leaving customer&apos;s wallet balance to their bank. The
            tenant owner approves before the wallet is debited.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Advertiser</Label>
            <Select value={advertiserId} onValueChange={setAdvertiserId}>
              <SelectTrigger>
                <SelectValue placeholder="Select advertiser" />
              </SelectTrigger>
              <SelectContent>
                {(advertisers ?? []).map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.profile?.full_name ?? a.profile?.email ?? a.id}
                    {a.tenant_client_code ? ` · ${a.tenant_client_code}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2 space-y-2">
              <Label htmlFor="rf-amount">Amount</Label>
              <Input
                id="rf-amount"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rf-cur">Currency</Label>
              <Select
                value={currency}
                onValueChange={(v: "USD" | "EUR") => setCurrency(v)}
              >
                <SelectTrigger id="rf-cur">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="rf-reason">Reason (optional)</Label>
            <Input
              id="rf-reason"
              placeholder="e.g. customer closing account"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Where to pay — the owner uses this to send the money
            </p>
            <div className="space-y-2">
              <Label htmlFor="rf-biz">Business name</Label>
              <Input
                id="rf-biz"
                placeholder="Account holder / company name"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rf-addr">Address</Label>
              <Input
                id="rf-addr"
                placeholder="Street, city, country"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2 space-y-2">
                <Label htmlFor="rf-payout">IBAN / bank account</Label>
                <Input
                  id="rf-payout"
                  placeholder="IBAN or account number"
                  value={payoutDetails}
                  onChange={(e) => setPayoutDetails(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rf-bankcur">Bank currency</Label>
                <Select
                  value={bankCurrency}
                  onValueChange={(v: "USD" | "EUR" | "HKD") =>
                    setBankCurrency(v)
                  }
                >
                  <SelectTrigger id="rf-bankcur">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="HKD">HKD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              The wallet is debited in {currency}; the customer&apos;s account
              can be a different currency (the owner converts on payout).
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button onClick={() => mutate()} disabled={!valid || isPending}>
            {isPending ? "Requesting…" : "Request refund"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Adjustments — admin requests a +/- correction, owner approves.      */
/* ------------------------------------------------------------------ */

type AdjRow = {
  id: string;
  reference: string | null;
  delta: number;
  currency: "USD" | "EUR";
  status: string;
  reason: string | null;
  created_at: string;
  advertiser: AdvertiserOption | null;
};

function AdjustmentsSection() {
  const { profile, isSuperAdmin } = useAppContext();
  const tenantId = profile?.tenant_id ?? null;
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");

  const { data: rows, isLoading, isError } = useQuery({
    queryKey: ["wallet-adjustments", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("wallet_adjustments")
        .select(
          "id, reference, delta, currency, status, reason, created_at, advertiser:advertisers(id, tenant_client_code, profile:user_profiles(full_name, email))",
        )
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as AdjRow[];
    },
  });

  const approve = useMutation({
    mutationFn: async (id: string) => {
      setActingId(id);
      const res = await approveWalletAdjustment(id);
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success("Adjustment approved — wallet updated");
      queryClient.invalidateQueries({ queryKey: ["wallet-adjustments"] });
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
    },
    onError: (e: Error) =>
      toast.error("Approve failed", { description: e.message }),
    onSettled: () => setActingId(null),
  });

  const reject = useMutation({
    mutationFn: async (id: string) => {
      setActingId(id);
      const res = await rejectWalletAdjustment(id);
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success("Adjustment rejected");
      queryClient.invalidateQueries({ queryKey: ["wallet-adjustments"] });
    },
    onError: (e: Error) =>
      toast.error("Reject failed", { description: e.message }),
    onSettled: () => setActingId(null),
  });

  const list = rows ?? [];
  const pendingCount = list.filter((r) => r.status === "pending").length;

  const filtered = useMemo(() => {
    let l = rows ?? [];
    if (status !== "all") l = l.filter((r) => r.status === status);
    const q = search.trim().toLowerCase();
    if (q)
      l = l.filter(
        (r) =>
          (r.reference ?? "").toLowerCase().includes(q) ||
          (r.advertiser?.profile?.full_name ?? "").toLowerCase().includes(q) ||
          (r.advertiser?.tenant_client_code ?? "").toLowerCase().includes(q) ||
          (r.reason ?? "").toLowerCase().includes(q),
      );
    return l;
  }, [rows, status, search]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <p className="muted" style={{ margin: 0, fontSize: ".9rem", flex: 1 }}>
          Request a correction to a customer&apos;s wallet balance. An admin
          raises it; the tenant owner approves before the balance changes.
        </p>
        {pendingCount > 0 && (
          <span className="badge pend">{pendingCount} pending</span>
        )}
        <button className="btn sm" onClick={() => setCreateOpen(true)}>
          <Plus /> Request adjustment
        </button>
      </div>

      <div className="fbar">
        <label className="fsr">
          <Search />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ref, advertiser, reason…"
          />
        </label>
        <PsmSortFilter
          filters={[
            {
              id: "status",
              label: "Status",
              value: status,
              onChange: setStatus,
              options: [
                { value: "all", label: "All statuses" },
                { value: "pending", label: "Pending" },
                { value: "approved", label: "Approved" },
                { value: "rejected", label: "Rejected" },
              ],
            },
          ]}
          searchActive={!!search.trim()}
          onReset={() => {
            setStatus("all");
            setSearch("");
          }}
        />
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="tblwrap">
          <table className="tbl wide">
            <thead>
              <tr>
                <th style={{ paddingLeft: 14 }}>Ref</th>
                <th>Advertiser</th>
                <th className="r">Change</th>
                <th>Reason</th>
                <th className="r">Status</th>
                <th className="r">Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? loadingRow(6)
                : filtered.length
                  ? filtered.map((r) => {
                      const positive = Number(r.delta) > 0;
                      return (
                        <tr key={r.id}>
                          <td
                            className="mono"
                            style={{ fontSize: ".8rem" }}
                            data-label="Ref"
                          >
                            {r.reference ?? "—"}
                          </td>
                          <td data-label="Advertiser">
                            {/* Code first, name beneath. */}
                            <CustomerName
                              clientCode={r.advertiser?.tenant_client_code}
                              name={r.advertiser?.profile?.full_name}
                              full
                            />
                          </td>
                          <td
                            className="r mono"
                            style={{
                              fontWeight: 700,
                              color: positive
                                ? "var(--win)"
                                : "var(--warn)",
                            }}
                            data-label="Change"
                          >
                            {positive ? "+" : "−"}
                            {formatCurrency(
                              Math.abs(Number(r.delta)),
                              r.currency,
                            )}
                          </td>
                          <td
                            className="muted"
                            style={{
                              maxWidth: 220,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                            data-label="Reason"
                          >
                            {r.reason ?? "—"}
                          </td>
                          <td className="r" data-label="Status">
                            <span
                              className={`badge ${badgeFor(
                                r.status,
                                ["approved"],
                                ["pending"],
                              )}`}
                              style={{ textTransform: "capitalize" }}
                            >
                              {r.status}
                            </span>
                          </td>
                          <td className="r" data-label="Action">
                            {r.status === "pending" && isSuperAdmin ? (
                              <div
                                style={{
                                  display: "inline-flex",
                                  gap: 8,
                                  justifyContent: "flex-end",
                                }}
                              >
                                <button
                                  className="btn ghost sm"
                                  disabled={actingId === r.id}
                                  onClick={() => reject.mutate(r.id)}
                                >
                                  Reject
                                </button>
                                <button
                                  className="btn sm"
                                  disabled={actingId === r.id}
                                  onClick={() => {
                                    if (
                                      window.confirm(
                                        "Approve this adjustment? It changes the advertiser's wallet balance immediately and can't be undone here.",
                                      )
                                    )
                                      approve.mutate(r.id);
                                  }}
                                >
                                  {actingId === r.id ? "…" : "Approve"}
                                </button>
                              </div>
                            ) : r.status === "pending" ? (
                              <span
                                className="muted"
                                style={{ fontSize: ".8rem" }}
                              >
                                awaiting owner
                              </span>
                            ) : (
                              <span
                                className="muted"
                                style={{
                                  fontSize: ".8rem",
                                  textTransform: "capitalize",
                                }}
                              >
                                {r.status}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  : emptyRow(
                      6,
                      isError
                        ? "Couldn't load adjustment requests — this is NOT an empty queue. Reload to retry."
                        : "No adjustment requests yet.",
                    )}
            </tbody>
          </table>
        </div>
      </div>

      <AdjustmentRequestDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        tenantId={tenantId}
      />
    </div>
  );
}

// Copied verbatim from components/withdrawals/adjustment-panel.tsx so the
// direction→delta computation, payload and server action are byte-identical.
function AdjustmentRequestDialog({
  open,
  onOpenChange,
  tenantId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tenantId: string | null;
}) {
  const queryClient = useQueryClient();
  const [advertiserId, setAdvertiserId] = useState("");
  const [direction, setDirection] = useState<"add" | "remove">("add");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<"USD" | "EUR">("USD");
  const [reason, setReason] = useState("");

  const { data: advertisers } = useQuery({
    queryKey: ["adjustment-advertisers", tenantId],
    enabled: !!tenantId && open,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("advertisers")
        .select(
          "id, tenant_client_code, profile:user_profiles(full_name, email)",
        )
        .eq("tenant_id", tenantId)
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as AdvertiserOption[];
    },
  });

  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      const magnitude = Number(amount);
      const delta = direction === "add" ? magnitude : -magnitude;
      const res = await requestWalletAdjustment({
        advertiser_id: advertiserId,
        delta,
        currency,
        reason: reason.trim() || undefined,
      });
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success("Adjustment requested — awaiting owner approval");
      queryClient.invalidateQueries({ queryKey: ["wallet-adjustments"] });
      setAdvertiserId("");
      setAmount("");
      setReason("");
      onOpenChange(false);
    },
    onError: (e: Error) =>
      toast.error("Couldn't request adjustment", { description: e.message }),
  });

  const numeric = Number(amount);
  const valid = !!advertiserId && Number.isFinite(numeric) && numeric > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Request balance adjustment</DialogTitle>
          <DialogDescription>
            Correct a customer&apos;s wallet balance. The tenant owner approves
            before the change is applied.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Advertiser</Label>
            <Select value={advertiserId} onValueChange={setAdvertiserId}>
              <SelectTrigger>
                <SelectValue placeholder="Select advertiser" />
              </SelectTrigger>
              <SelectContent>
                {(advertisers ?? []).map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.profile?.full_name ?? a.profile?.email ?? a.id}
                    {a.tenant_client_code ? ` · ${a.tenant_client_code}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <Label>Direction</Label>
              <Select
                value={direction}
                onValueChange={(v: "add" | "remove") => setDirection(v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="add">Add (+)</SelectItem>
                  <SelectItem value="remove">Remove (−)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="adj-cur">Currency</Label>
              <Select
                value={currency}
                onValueChange={(v: "USD" | "EUR") => setCurrency(v)}
              >
                <SelectTrigger id="adj-cur">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="adj-amount">Amount</Label>
            <Input
              id="adj-amount"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="adj-reason">Reason</Label>
            <Input
              id="adj-reason"
              placeholder="Why this correction is needed"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button onClick={() => mutate()} disabled={!valid || isPending}>
            {isPending ? "Requesting…" : "Request adjustment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
