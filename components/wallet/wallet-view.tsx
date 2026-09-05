"use client";

import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";
import { Wallet } from "@/lib/types/wallet";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { Clock, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import WalletExchangeDialog from "./wallet-exchange-dialog";
import WalletTopupDialog from "./wallet-topup-dialog";

const fmt = (v: number | string | null | undefined, currency: "EUR" | "USD") =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(v ?? 0));

const fmt2 = (v: number | string | null | undefined) =>
  new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(v ?? 0));

type Topup = {
  id: string;
  created_at: string;
  currency: string | null;
  amount: number | string | null;
  status: string | null;
  reference_no: string | null;
  description: string | null;
};

const statusBadge = (s: string | null) => {
  if (s === "completed") return { cls: "ok", label: "Credited" };
  if (s === "processing") return { cls: "info", label: "Processing" };
  if (s === "failed") return { cls: "due", label: "Failed" };
  return { cls: "pend", label: "Verifying" };
};

export default function WalletView() {
  const { profile } = useAppContext();
  const queryClient = useQueryClient();
  const advertiserId = profile?.advertiser?.[0]?.id ?? null;
  const tenantId = profile?.tenant_id ?? null;
  const isAdvertiser = profile?.role === "advertiser";

  const [topupOpen, setTopupOpen] = useState(false);
  const [exchangeOpen, setExchangeOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("newest");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: wallet } = useQuery<Wallet | null>({
    queryKey: ["wallet"],
    enabled: !!advertiserId,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("wallets")
        .select("*")
        .eq("advertiser_id", advertiserId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as Wallet | null;
    },
  });

  const { mutate: createWallet } = useMutation<Wallet, Error, void>({
    mutationKey: ["create-wallet", advertiserId],
    mutationFn: async () => {
      if (!advertiserId) throw new Error("Missing advertiser profile.");
      const supabase = createClient();
      const { data, error } = await supabase.rpc("wallet_create_for_advertiser");
      if (error) throw error;
      return data as Wallet;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["wallet"], data);
      queryClient.invalidateQueries({ queryKey: ["wallet"] });
    },
  });

  // Auto-create the wallet if missing (same behaviour as before).
  useEffect(() => {
    if (isAdvertiser && advertiserId && tenantId && wallet === null) {
      createWallet();
    }
  }, [isAdvertiser, advertiserId, tenantId, wallet, createWallet]);

  const { data: activity } = useQuery<Topup[]>({
    queryKey: ["wallet-activity", wallet?.id],
    enabled: !!wallet?.id,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("wallet_topups")
        .select()
        .eq("wallet_id", wallet!.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as Topup[];
    },
  });

  const pending = (activity ?? []).filter(
    (t) => t.status !== "completed" && t.status !== "failed",
  );

  const rows = useMemo(() => {
    let list = [...(activity ?? [])];
    const q = search.trim().toLowerCase();
    if (q)
      list = list.filter(
        (t) =>
          (t.reference_no ?? "").toLowerCase().includes(q) ||
          (t.description ?? "").toLowerCase().includes(q),
      );
    if (statusFilter !== "all")
      list = list.filter((t) =>
        statusFilter === "credited"
          ? t.status === "completed"
          : t.status !== "completed",
      );
    list.sort((a, b) => {
      if (sort === "amount_desc") return Number(b.amount) - Number(a.amount);
      if (sort === "amount_asc") return Number(a.amount) - Number(b.amount);
      const da = dayjs(a.created_at).valueOf();
      const db = dayjs(b.created_at).valueOf();
      return sort === "oldest" ? da - db : db - da;
    });
    return list;
  }, [activity, search, statusFilter, sort]);

  const eur = Number(wallet?.eur_balance ?? 0);
  const usd = Number(wallet?.usd_balance ?? 0);

  if (!isAdvertiser) return null;

  return (
    <div
      className="psmview"
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
    >
      <div className="phead">
        <div>
          <h1>Wallet</h1>
          <p>Fund your ad accounts and pay invoices from here.</p>
        </div>
        <button
          className="btn grad"
          onClick={() => setTopupOpen(true)}
          disabled={!wallet}
        >
          <Plus /> Top up wallet
        </button>
      </div>

      <div className="grid2">
        <div className="wallet eur">
          <div className="wsh" />
          <div className="wl">EUR wallet</div>
          <div className="wv">{fmt(eur, "EUR")}</div>
          <div className="wavail">
            <b>{fmt(eur, "EUR")}</b> available
          </div>
          <div className="wa">
            <button
              className="wbtn"
              onClick={() => setTopupOpen(true)}
              disabled={!wallet}
            >
              <Plus /> Top up EUR
            </button>
            <button
              className="wbtn gh"
              onClick={() => setExchangeOpen(true)}
              disabled={!wallet}
            >
              Exchange
            </button>
          </div>
        </div>
        <div className="wallet usd">
          <div className="wsh" />
          <div className="wl">USD wallet</div>
          <div className="wv">{fmt(usd, "USD")}</div>
          <div className="wavail">
            <b>{fmt(usd, "USD")}</b> available
          </div>
          <div className="wa">
            <button
              className="wbtn"
              onClick={() => setTopupOpen(true)}
              disabled={!wallet}
            >
              <Plus /> Top up USD
            </button>
            <button
              className="wbtn gh"
              onClick={() => setExchangeOpen(true)}
              disabled={!wallet}
            >
              Exchange
            </button>
          </div>
        </div>
      </div>

      {pending.length > 0 && (
        <div className="card">
          <h2>Pending top-up{pending.length > 1 ? "s" : ""}</h2>
          {pending.map((t) => (
            <div key={t.id} className="list-row">
              <span
                className="ico"
                style={{
                  background: "var(--warn-soft)",
                  color: "var(--warn)",
                }}
              >
                <Clock />
              </span>
              <div>
                <div style={{ fontWeight: 700 }}>
                  {t.currency === "USD" ? "$" : "€"}
                  {fmt2(t.amount)} · bank transfer
                </div>
                <div style={{ color: "var(--faint)", fontSize: ".82rem" }}>
                  Ref {t.reference_no ?? "—"} · awaiting verification
                </div>
              </div>
              <span className="badge pend" style={{ marginLeft: "auto" }}>
                <Clock style={{ width: 13, height: 13 }} /> Verifying
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="card" style={{ padding: "16px 8px 8px" }}>
        <div style={{ padding: "0 14px 8px" }}>
          <h2>Wallet activity</h2>
        </div>
        <div className="fbar" style={{ margin: "0 6px 12px" }}>
          <label className="fsr">
            <Search />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search activity…"
            />
          </label>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="newest">Sort: Newest</option>
            <option value="oldest">Oldest</option>
            <option value="amount_desc">Amount ↓</option>
            <option value="amount_asc">Amount ↑</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="credited">Credited</option>
            <option value="pending">Pending</option>
          </select>
        </div>
        <div className="tblwrap">
          <table className="tbl wide">
            <thead>
              <tr>
                <th style={{ paddingLeft: 14 }}>Date</th>
                <th>Reference</th>
                <th>Description</th>
                <th className="r">Amount</th>
                <th className="r">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((t) => {
                  const b = statusBadge(t.status);
                  return (
                    <tr key={t.id}>
                      <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>
                        {dayjs(t.created_at).format("D MMM")}
                      </td>
                      <td className="mono">{t.reference_no ?? "—"}</td>
                      <td className="muted">
                        {t.description || "Wallet top-up"}
                      </td>
                      <td className="r mono" style={{ fontWeight: 700 }}>
                        {t.currency === "USD" ? "$" : "€"}
                        {fmt2(t.amount)}
                      </td>
                      <td className="r">
                        <span className={`badge ${b.cls}`}>{b.label}</span>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td
                    colSpan={5}
                    style={{
                      textAlign: "center",
                      padding: 28,
                      color: "var(--muted)",
                    }}
                  >
                    No wallet activity yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <WalletTopupDialog
        open={topupOpen}
        onOpenChange={setTopupOpen}
        walletId={wallet?.id ?? null}
        referenceNo={wallet?.reference_no ?? null}
        minTopup={wallet?.min_topup as number}
      />
      <WalletExchangeDialog
        open={exchangeOpen}
        onOpenChange={setExchangeOpen}
        walletId={wallet?.id ?? null}
        usdBalance={usd}
        eurBalance={eur}
      />
    </div>
  );
}
