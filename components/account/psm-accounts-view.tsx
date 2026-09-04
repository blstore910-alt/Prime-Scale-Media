"use client";

import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";
import { PLATFORMS } from "@/lib/constants";
import { AdAccount } from "@/lib/types/account";
import { useQuery } from "@tanstack/react-query";
import { Parser } from "json2csv";
import { Download, Eye, Monitor, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import CreateTopupDialog from "../topups/create-topup-dialog";
import { AccountDetailsSheet } from "./account-details-sheet";
import RequestAdAccountDialog from "./request-ad-account-dialog";

const platformLabel = (p: string | null) =>
  PLATFORMS.find((x) => x.value === p)?.label ?? p ?? "—";

// Faithful port of the advertiser ad-accounts view (advertiser-app.html):
// a filterable grid of account cards. Reuses the real dialogs for
// request / top-up / details (which carries the withdraw flow).
export default function PsmAccountsView() {
  const { profile } = useAppContext();
  const advertiserId = profile?.advertiser?.[0]?.id ?? null;

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("newest");
  const [platform, setPlatform] = useState("all");
  const [status, setStatus] = useState("all");

  const [topupAccount, setTopupAccount] = useState<AdAccount | null>(null);
  const [topupOpen, setTopupOpen] = useState(false);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const { data: accounts, isLoading } = useQuery<AdAccount[]>({
    queryKey: ["psm-accounts", advertiserId],
    enabled: !!advertiserId,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("ad_accounts")
        .select("*")
        .eq("advertiser_id", advertiserId);
      if (error) throw error;
      return (data ?? []) as AdAccount[];
    },
  });

  const rows = useMemo(() => {
    let list = [...(accounts ?? [])];
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((a) => (a.name ?? "").toLowerCase().includes(q));
    if (platform !== "all") list = list.filter((a) => a.platform === platform);
    if (status !== "all") list = list.filter((a) => a.status === status);
    list.sort((a, b) => {
      if (sort === "name") return (a.name ?? "").localeCompare(b.name ?? "");
      if (sort === "fee_desc") return Number(b.fee) - Number(a.fee);
      return 0;
    });
    return list;
  }, [accounts, search, platform, status, sort]);

  const exportCsv = () => {
    if (!rows.length) {
      toast.error("Nothing to export.");
      return;
    }
    try {
      const csv = new Parser({
        fields: ["name", "platform", "status", "fee", "currency"],
      }).parse(
        rows.map((a) => ({
          name: a.name,
          platform: a.platform,
          status: a.status,
          fee: a.fee,
          currency: a.currency,
        })),
      );
      const url = URL.createObjectURL(
        new Blob([csv], { type: "text/csv;charset=utf-8;" }),
      );
      const el = document.createElement("a");
      el.href = url;
      el.download = "ad-accounts.csv";
      document.body.appendChild(el);
      el.click();
      el.remove();
      URL.revokeObjectURL(url);
      toast.success("Exported CSV");
    } catch {
      toast.error("Could not export CSV.");
    }
  };

  const statusCls = (s: string | null) =>
    s === "active" ? "ok" : s === "paused" ? "pend" : "due";

  return (
    <div
      className="psmview"
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
    >
      <div className="phead">
        <div>
          <h1>Ad accounts</h1>
          <p>Top up, monitor spend and request withdrawals.</p>
        </div>
        <RequestAdAccountDialog>
          <button className="btn grad">
            <Plus /> Request ad account
          </button>
        </RequestAdAccountDialog>
      </div>

      <div className="fbar">
        <label className="fsr">
          <Search />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ad accounts…"
          />
        </label>
        <select value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="newest">Sort: Newest</option>
          <option value="name">Name A–Z</option>
          <option value="fee_desc">Fee ↓</option>
        </select>
        <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
          <option value="all">All platforms</option>
          {PLATFORMS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="banned">Banned</option>
        </select>
        <button className="fexp" onClick={exportCsv}>
          <Download /> Export
        </button>
      </div>

      {isLoading ? (
        <p className="muted">Loading ad accounts…</p>
      ) : rows.length ? (
        <div className="grid3">
          {rows.map((a) => (
            <div key={a.id} className="acard">
              <div className="top">
                <span className="pfi">
                  <Monitor />
                </span>
                <div style={{ minWidth: 0 }}>
                  <div className="nm">{a.name || "Ad account"}</div>
                  <div className="sub">{platformLabel(a.platform)}</div>
                </div>
                <span
                  className={`badge ${statusCls(a.status)}`}
                  style={{ marginLeft: "auto", textTransform: "capitalize" }}
                >
                  {a.status}
                </span>
              </div>
              <div className="kv">
                <span>Fee</span>
                <b>{a.fee ?? 0}%</b>
              </div>
              {a.currency && (
                <div className="kv">
                  <span>Currency</span>
                  <b>{a.currency}</b>
                </div>
              )}
              <div className="acts">
                <button
                  className="btn sm"
                  onClick={() => {
                    setTopupAccount(a);
                    setTopupOpen(true);
                  }}
                >
                  <Plus /> Top up
                </button>
                <button
                  className="btn ghost sm"
                  onClick={() => {
                    setDetailsId(a.id);
                    setDetailsOpen(true);
                  }}
                >
                  <Eye /> View
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            No ad accounts yet. Request your first one to get started.
          </p>
        </div>
      )}

      <CreateTopupDialog
        open={topupOpen}
        setOpen={setTopupOpen}
        account={topupAccount}
      />
      <AccountDetailsSheet
        open={detailsOpen}
        setOpen={() => setDetailsOpen(false)}
        accountId={detailsId}
      />
    </div>
  );
}
