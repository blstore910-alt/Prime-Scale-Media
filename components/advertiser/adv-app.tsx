"use client";

import { dmSans, jakarta } from "@/lib/fonts";
import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";
import { AdAccount } from "@/lib/types/account";
import { Wallet } from "@/lib/types/wallet";
import { PLATFORMS } from "@/lib/constants";
import { InvoiceWithRelations } from "@/lib/types/invoice-extended";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ADV_CSS } from "./adv-shell-css";
import { AdvIcons, Ic } from "./adv-icons";
import WalletTopupDialog from "@/components/wallet/wallet-topup-dialog";
import WalletExchangeDialog from "@/components/wallet/wallet-exchange-dialog";
import CreateTopupDialog from "@/components/topups/create-topup-dialog";
import RequestAdAccountDialog from "@/components/account/request-ad-account-dialog";
import { AccountDetailsSheet } from "@/components/account/account-details-sheet";

dayjs.extend(relativeTime);

type View =
  | "dash"
  | "wallet"
  | "accounts"
  | "requests"
  | "billing"
  | "notif"
  | "settings"
  | "help";
const TITLES: Record<View, string> = {
  dash: "Dashboard",
  wallet: "Wallet",
  accounts: "Ad accounts",
  requests: "Requests",
  billing: "Billing",
  notif: "Notifications",
  settings: "Settings",
  help: "Get help",
};

const eur = (n: number | string | null | undefined) =>
  "€" + Math.round(Number(n) || 0).toLocaleString("nl-NL");
const usd = (n: number | string | null | undefined) =>
  "$" + Math.round(Number(n) || 0).toLocaleString("nl-NL");
const money2 = (n: number | string | null | undefined) =>
  new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(n ?? 0));

const platformLabel = (p: string | null) =>
  PLATFORMS.find((x) => x.value === p)?.label ?? p ?? "—";

function initials(name?: string | null) {
  if (!name) return "PS";
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "PS"
  );
}

const statusBadge = (st: string | null) => {
  if (st === "active") return { cls: "ok", label: "Active" };
  if (st === "paused") return { cls: "pend", label: "Paused" };
  if (st === "pending") return { cls: "pend", label: "Setting up" };
  if (st === "banned") return { cls: "due", label: "Banned" };
  return { cls: "ok", label: st ?? "Active" };
};

export default function AdvertiserApp() {
  const { profile } = useAppContext();
  const queryClient = useQueryClient();
  const [view, setView] = useState<View>("dash");
  const [navOpen, setNavOpen] = useState(false);

  const [topupOpen, setTopupOpen] = useState(false);
  const [exchangeOpen, setExchangeOpen] = useState(false);
  const [acctTopup, setAcctTopup] = useState<AdAccount | null>(null);
  const [acctTopupOpen, setAcctTopupOpen] = useState(false);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const advertiserId = profile?.advertiser?.[0]?.id ?? null;
  const tenantId = profile?.tenant_id ?? null;
  const name = (profile?.full_name as string) ?? "there";
  const firstName = name.split(" ")[0];
  const ini = initials(name);

  const { data: wallet } = useQuery<Wallet | null>({
    queryKey: ["wallet", advertiserId],
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
      const supabase = createClient();
      const { data, error } = await supabase.rpc("wallet_create_for_advertiser");
      if (error) throw error;
      return data as Wallet;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["wallet", advertiserId], data);
      queryClient.invalidateQueries({ queryKey: ["wallet", advertiserId] });
    },
  });
  useEffect(() => {
    if (advertiserId && tenantId && wallet === null) createWallet();
  }, [advertiserId, tenantId, wallet, createWallet]);

  const { data: accounts } = useQuery<AdAccount[]>({
    queryKey: ["adv-accounts", advertiserId],
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

  const { data: subscription } = useQuery<{
    amount: number | null;
    status: string | null;
    next_payment_date: string | null;
  } | null>({
    queryKey: ["adv-subscription", advertiserId, tenantId],
    enabled: !!advertiserId && !!tenantId,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("subscriptions")
        .select("amount, status, next_payment_date")
        .eq("advertiser_id", advertiserId)
        .eq("tenant_id", tenantId)
        .order("start_date", { ascending: false })
        .limit(1);
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });

  const { data: activity } = useQuery<
    {
      id: string;
      created_at: string;
      currency: string | null;
      amount: number | string | null;
      status: string | null;
      reference_no: string | null;
      description: string | null;
    }[]
  >({
    queryKey: ["adv-wallet-activity", wallet?.id],
    enabled: !!wallet?.id,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("wallet_topups")
        .select()
        .eq("wallet_id", wallet!.id)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: invoices } = useQuery<InvoiceWithRelations[]>({
    queryKey: ["adv-invoices", advertiserId, tenantId],
    enabled: !!advertiserId && !!tenantId,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("invoices")
        .select("id, number, total, status, paid_at, created_at, items, type")
        .eq("tenant_id", tenantId)
        .eq("advertiser_id", advertiserId)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as InvoiceWithRelations[];
    },
  });

  const eurBal = Number(wallet?.eur_balance ?? 0);
  const usdBal = Number(wallet?.usd_balance ?? 0);
  const activeAccts = (accounts ?? []).filter((a) => a.status === "active");
  const pendingTopups = (activity ?? []).filter(
    (t) => t.status !== "completed" && t.status !== "failed",
  );

  const go = (v: View) => {
    setView(v);
    setNavOpen(false);
    if (typeof window !== "undefined") window.scrollTo(0, 0);
  };
  const openAcctTopup = (a: AdAccount) => {
    setAcctTopup(a);
    setAcctTopupOpen(true);
  };
  const openDetails = (id: string) => {
    setDetailsId(id);
    setDetailsOpen(true);
  };

  const NAV: { v: View; icon: string; label: string; aff?: boolean }[] = [
    { v: "dash", icon: "i-home", label: "Dashboard" },
    { v: "wallet", icon: "i-wallet", label: "Wallet" },
    { v: "accounts", icon: "i-ad", label: "Ad accounts" },
    { v: "requests", icon: "i-rocket", label: "Requests" },
    { v: "billing", icon: "i-receipt", label: "Billing" },
  ];
  const NAV2: { v: View; icon: string; label: string }[] = [
    { v: "notif", icon: "i-bell", label: "Notifications" },
    { v: "settings", icon: "i-settings", label: "Settings" },
    { v: "help", icon: "i-help", label: "Get help" },
  ];
  const BOTTOM: { v: View; icon: string; label: string }[] = [
    { v: "wallet", icon: "i-wallet", label: "Wallet" },
    { v: "accounts", icon: "i-ad", label: "Accounts" },
    { v: "dash", icon: "i-home", label: "Home" },
    { v: "billing", icon: "i-receipt", label: "Billing" },
    { v: "settings", icon: "i-settings", label: "Settings" },
  ];

  const AccountCard = ({ a }: { a: AdAccount }) => {
    const b = statusBadge(a.status);
    const locked =
      a.status === "banned" || a.status === "paused" || a.status === "pending";
    return (
      <div
        className={`acard${a.status === "banned" ? " banned" : ""}`}
        onClick={() => openDetails(a.id)}
      >
        <div className="top">
          <span className="pfi">
            <Ic name="i-ad" />
          </span>
          <div style={{ minWidth: 0 }}>
            <div className="nm">{a.name || "Ad account"}</div>
            <div className="sub">{platformLabel(a.platform)}</div>
          </div>
          <span style={{ marginLeft: "auto" }}>
            <span className={`badge ${b.cls}`}>{b.label}</span>
          </span>
        </div>
        <div className="kv">
          <span>Fee</span>
          <b>{a.fee ?? 0}%</b>
        </div>
        <div className="kv">
          <span>Currency</span>
          <b>{a.currency ?? "EUR"}</b>
        </div>
        {locked ? (
          <div className="acts">
            <div className={`lockmsg${a.status === "banned" ? " banned" : ""}`}>
              <Ic name={a.status === "banned" ? "i-shield" : "i-clock"} />
              {a.status === "banned"
                ? "Locked by PSM — top-ups & withdrawals are disabled."
                : a.status === "paused"
                  ? "Paused by PSM — actions are temporarily disabled."
                  : "Setting up — this account will be ready shortly."}
            </div>
          </div>
        ) : (
          <div className="acts">
            <button
              className="btn sm"
              onClick={(e) => {
                e.stopPropagation();
                openAcctTopup(a);
              }}
            >
              <Ic name="i-plus" /> Top up
            </button>
            <button
              className="btn ghost sm"
              onClick={(e) => {
                e.stopPropagation();
                openDetails(a.id);
              }}
            >
              Details
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`advapp app ${jakarta.variable} ${dmSans.variable}`}>
      <style>{ADV_CSS}</style>
      <AdvIcons />

      <div
        className={`scrim${navOpen ? " on" : ""}`}
        onClick={() => setNavOpen(false)}
      />

      <aside className={`sidebar${navOpen ? " open" : ""}`}>
        <div className="logo">
          <span className="mark">
            <Ic name="i-rocket" />
          </span>
          <span className="name">
            Prime Scale Media<small>Advertiser</small>
          </span>
        </div>
        {NAV.map((item) => (
          <button
            key={item.v}
            className={`navlink${view === item.v ? " on" : ""}`}
            onClick={() => go(item.v)}
          >
            <Ic name={item.icon} /> {item.label}
          </button>
        ))}
        <div className="navsec">Account</div>
        {NAV2.map((item) => (
          <button
            key={item.v}
            className={`navlink${view === item.v ? " on" : ""}`}
            onClick={() => go(item.v)}
          >
            <Ic name={item.icon} /> {item.label}
          </button>
        ))}
        <div className="side-foot">
          <span className="avatar">{ini}</span>
          <div className="who">
            {name}
            <small>{profile?.tenant?.name ?? "Advertiser"}</small>
          </div>
        </div>
      </aside>

      <div className="main">
        <div className="topbar">
          <button
            className="iconbtn ham"
            aria-label="Menu"
            onClick={() => setNavOpen(true)}
          >
            <Ic name="i-menu" />
          </button>
          <div className="tb-brand">
            <span className="mark">
              <Ic name="i-rocket" />
            </span>
            <span className="tb-title">{TITLES[view]}</span>
          </div>
          <div className="tb-spacer" />
          <div className="toolbar">
            <button
              className="tool wal"
              onClick={() => go("wallet")}
              title="Open wallet"
            >
              <Ic name="i-wallet" />
              <span className="e">
                <small>Wallet</small>
                <b>{eur(eurBal)}</b>
              </span>
            </button>
            <button
              className="tool st"
              onClick={() => go("billing")}
              title="Subscription"
            >
              <Ic name="i-shield" />{" "}
              {subscription?.status
                ? subscription.status[0].toUpperCase() +
                  subscription.status.slice(1)
                : "Active"}
            </button>
            <button
              className="tool ic-btn"
              onClick={() => go("notif")}
              aria-label="Notifications"
            >
              <Ic name="i-bell" />
            </button>
            <button
              className="tool ava-btn"
              onClick={() => go("settings")}
              title="Settings"
            >
              <span className="avatar">{ini}</span>
              <Ic name="i-chev" />
            </button>
          </div>
        </div>

        <div className="content">
          {/* DASHBOARD */}
          <div className={`view${view === "dash" ? " on" : ""}`}>
            <div className="phead">
              <div>
                <h1>Welcome back, {firstName}</h1>
                <p>Here&apos;s how your account is doing.</p>
              </div>
            </div>
            {subscription?.amount && subscription.next_payment_date && (
              <div className="alert">
                <span className="ai">
                  <Ic name="i-clock" />
                </span>
                <div className="atx">
                  <b>Monthly fee {eur(subscription.amount)}</b>
                  <span>
                    {" "}
                    · due {dayjs(subscription.next_payment_date).fromNow()}
                  </span>
                </div>
                <button className="btn sm" onClick={() => go("billing")}>
                  <Ic name="i-check" /> Pay now
                </button>
              </div>
            )}
            <div className="stats">
              <div className="stat" onClick={() => go("accounts")}>
                <div className="k">
                  <span className="ci b">
                    <Ic name="i-ad" />
                  </span>{" "}
                  Active ad accounts
                </div>
                <div className="v">{activeAccts.length}</div>
              </div>
              <div className="stat" onClick={() => go("wallet")}>
                <div className="k">
                  <span className="ci t">
                    <Ic name="i-wallet" />
                  </span>{" "}
                  Wallet balance
                </div>
                <div className="v">{eur(eurBal)}</div>
              </div>
              <div className="stat" onClick={() => go("wallet")}>
                <div className="k">
                  <span className="ci p">
                    <Ic name="i-wallet" />
                  </span>{" "}
                  USD balance
                </div>
                <div className="v">{usd(usdBal)}</div>
              </div>
              <div className="stat" onClick={() => go("billing")}>
                <div className="k">
                  <span className="ci g">
                    <Ic name="i-shield" />
                  </span>{" "}
                  Plan
                </div>
                <div className="v" style={{ textTransform: "capitalize" }}>
                  {subscription?.status ?? "—"}
                </div>
              </div>
            </div>
            <div className="card">
              <div className="phead" style={{ alignItems: "center" }}>
                <h2>Your ad accounts</h2>
                <button className="btn ghost sm" onClick={() => go("accounts")}>
                  View all <Ic name="i-arrow" />
                </button>
              </div>
              <div style={{ marginTop: 14 }}>
                {(accounts ?? []).length ? (
                  <div className="grid3">
                    {(accounts ?? []).slice(0, 3).map((a) => (
                      <AccountCard key={a.id} a={a} />
                    ))}
                  </div>
                ) : (
                  <p className="cap" style={{ margin: 0 }}>
                    No ad accounts yet — request your first one.
                  </p>
                )}
              </div>
            </div>
            <div className="phead" style={{ marginTop: 2 }}>
              <h2>Your wallets</h2>
              <button className="btn ghost sm" onClick={() => go("wallet")}>
                Open wallet <Ic name="i-arrow" />
              </button>
            </div>
            <div className="grid2">
              <WalletCard
                cur="eur"
                label="EUR wallet"
                value={eur(eurBal)}
                onTopup={() => setTopupOpen(true)}
                onExchange={() => setExchangeOpen(true)}
                disabled={!wallet}
              />
              <WalletCard
                cur="usd"
                label="USD wallet"
                value={usd(usdBal)}
                onTopup={() => setTopupOpen(true)}
                onExchange={() => setExchangeOpen(true)}
                disabled={!wallet}
              />
            </div>
          </div>

          {/* WALLET */}
          <div className={`view${view === "wallet" ? " on" : ""}`}>
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
                <Ic name="i-plus" /> Top up wallet
              </button>
            </div>
            <div className="grid2">
              <WalletCard
                cur="eur"
                label="EUR wallet"
                value={eur(eurBal)}
                onTopup={() => setTopupOpen(true)}
                onExchange={() => setExchangeOpen(true)}
                disabled={!wallet}
              />
              <WalletCard
                cur="usd"
                label="USD wallet"
                value={usd(usdBal)}
                onTopup={() => setTopupOpen(true)}
                onExchange={() => setExchangeOpen(true)}
                disabled={!wallet}
              />
            </div>
            {pendingTopups.length > 0 && (
              <div className="card">
                <h2>Pending top-up{pendingTopups.length > 1 ? "s" : ""}</h2>
                {pendingTopups.map((t) => (
                  <div className="list-row" key={t.id}>
                    <span
                      className="ico"
                      style={{
                        background: "var(--warn-soft)",
                        color: "var(--warn)",
                      }}
                    >
                      <Ic name="i-clock" />
                    </span>
                    <div>
                      <div style={{ fontWeight: 700 }}>
                        {t.currency === "USD" ? "$" : "€"}
                        {money2(t.amount)} · bank transfer
                      </div>
                      <div
                        style={{ color: "var(--faint)", fontSize: ".82rem" }}
                      >
                        Ref {t.reference_no ?? "—"} · awaiting verification
                      </div>
                    </div>
                    <span className="badge pend" style={{ marginLeft: "auto" }}>
                      Verifying
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="card" style={{ padding: "16px 8px 8px" }}>
              <div style={{ padding: "0 14px 8px" }}>
                <h2>Wallet activity</h2>
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
                    {(activity ?? []).length ? (
                      (activity ?? []).map((t) => (
                        <tr key={t.id}>
                          <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>
                            {dayjs(t.created_at).format("D MMM")}
                          </td>
                          <td className="mono">{t.reference_no ?? "—"}</td>
                          <td style={{ color: "var(--muted)" }}>
                            {t.description || "Wallet top-up"}
                          </td>
                          <td className="r mono" style={{ fontWeight: 700 }}>
                            {t.currency === "USD" ? "$" : "€"}
                            {money2(t.amount)}
                          </td>
                          <td className="r">
                            <span
                              className={`badge ${
                                t.status === "completed" ? "ok" : "pend"
                              }`}
                            >
                              {t.status === "completed" ? "Credited" : "Pending"}
                            </span>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td
                          colSpan={5}
                          style={{
                            textAlign: "center",
                            padding: 24,
                            color: "var(--faint)",
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
          </div>

          {/* AD ACCOUNTS */}
          <div className={`view${view === "accounts" ? " on" : ""}`}>
            <div className="phead">
              <div>
                <h1>Ad accounts</h1>
                <p>Top up, monitor and request withdrawals.</p>
              </div>
              <RequestAdAccountDialog>
                <button className="btn grad">
                  <Ic name="i-plus" /> Request ad account
                </button>
              </RequestAdAccountDialog>
            </div>
            {(accounts ?? []).length ? (
              <div className="grid3">
                {(accounts ?? []).map((a) => (
                  <AccountCard key={a.id} a={a} />
                ))}
              </div>
            ) : (
              <div className="card">
                <p className="cap" style={{ margin: 0 }}>
                  No ad accounts yet. Request your first one to get started.
                </p>
              </div>
            )}
          </div>

          {/* REQUESTS */}
          <div className={`view${view === "requests" ? " on" : ""}`}>
            <div className="phead">
              <div>
                <h1>Requests</h1>
                <p>Track your ad-account requests.</p>
              </div>
              <RequestAdAccountDialog>
                <button className="btn grad">
                  <Ic name="i-plus" /> New request
                </button>
              </RequestAdAccountDialog>
            </div>
            <div className="card">
              <p className="cap" style={{ margin: 0 }}>
                Your submitted requests appear here. Use{" "}
                <b>Request ad account</b> to start a new one — we set it up on
                our verified Business Manager, live in 3–12 hours.
              </p>
            </div>
          </div>

          {/* BILLING */}
          <div className={`view${view === "billing" ? " on" : ""}`}>
            <div className="phead">
              <div>
                <h1>Billing</h1>
                <p>Your subscription and invoices.</p>
              </div>
            </div>
            <div className="grid2">
              <div className="sub-card">
                <div className="ring" />
                <span className="pill">
                  <Ic name="i-shield" />{" "}
                  {subscription?.status
                    ? subscription.status[0].toUpperCase() +
                      subscription.status.slice(1)
                    : "Active"}
                </span>
                <div className="plan">
                  {subscription?.amount
                    ? `${eur(subscription.amount)} / month`
                    : "Subscription"}
                </div>
                <div className="meta">
                  {subscription?.next_payment_date
                    ? `Renews ${dayjs(subscription.next_payment_date).format("D MMM YYYY")}`
                    : "—"}
                </div>
                <div
                  style={{ opacity: 0.82, fontSize: ".78rem", marginTop: 16 }}
                >
                  Plan changes apply from your next billing cycle. Need it
                  sooner? Your PSM admin can switch it manually.
                </div>
              </div>
              <div className="card">
                <h2>This month</h2>
                <p className="cap">
                  Pay your monthly fee from your wallet, or let it auto-debit on
                  the due date.
                </p>
                {subscription?.amount && subscription.next_payment_date ? (
                  <>
                    <div className="list-row" style={{ borderTop: 0 }}>
                      <span
                        className="ico"
                        style={{
                          background: "var(--warn-soft)",
                          color: "var(--warn)",
                        }}
                      >
                        <Ic name="i-receipt" />
                      </span>
                      <div>
                        <div style={{ fontWeight: 700 }}>Monthly fee</div>
                        <div
                          style={{ color: "var(--faint)", fontSize: ".82rem" }}
                        >
                          Due{" "}
                          {dayjs(subscription.next_payment_date).format(
                            "D MMM YYYY",
                          )}{" "}
                          · {eur(subscription.amount)}
                        </div>
                      </div>
                      <span
                        className="badge due"
                        style={{ marginLeft: "auto" }}
                      >
                        {dayjs(subscription.next_payment_date).fromNow()}
                      </span>
                    </div>
                    <button
                      className="btn block grad"
                      style={{ marginTop: 14 }}
                      onClick={() =>
                        toast.message("Pay your invoice from the list below.")
                      }
                    >
                      <Ic name="i-check" /> Pay {eur(subscription.amount)} from
                      wallet
                    </button>
                  </>
                ) : (
                  <p className="cap" style={{ margin: 0 }}>
                    No subscription due right now.
                  </p>
                )}
              </div>
            </div>
            <div className="card" style={{ padding: "16px 8px 8px" }}>
              <div style={{ padding: "0 14px 8px" }}>
                <h2>Invoices</h2>
              </div>
              <div className="tblwrap">
                <table className="tbl wide">
                  <thead>
                    <tr>
                      <th style={{ paddingLeft: 14 }}>Invoice</th>
                      <th>Date</th>
                      <th className="r">Amount</th>
                      <th className="r">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(invoices ?? []).length ? (
                      (invoices ?? []).map((inv) => {
                        const paid = inv.status === "paid";
                        return (
                          <tr key={inv.id}>
                            <td style={{ fontWeight: 600 }}>{inv.number}</td>
                            <td>{dayjs(inv.created_at).format("D MMM YYYY")}</td>
                            <td className="r mono">{eur(inv.total)}</td>
                            <td className="r">
                              <span className={`badge ${paid ? "ok" : "due"}`}>
                                {paid ? "Paid" : "Due"}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td
                          colSpan={4}
                          style={{
                            textAlign: "center",
                            padding: 24,
                            color: "var(--faint)",
                          }}
                        >
                          No invoices yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* NOTIFICATIONS */}
          <div className={`view${view === "notif" ? " on" : ""}`}>
            <div className="phead">
              <div>
                <h1>Notifications</h1>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div className="nrow">
                <span className="nic b">
                  <Ic name="i-bell" />
                </span>
                <div>
                  <div className="t">You&apos;re all caught up</div>
                  <div className="d">
                    Top-up, ad-account and billing updates will appear here.
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* SETTINGS */}
          <div className={`view${view === "settings" ? " on" : ""}`}>
            <div className="phead">
              <div>
                <h1>Settings</h1>
              </div>
            </div>
            <div className="grid2">
              <div className="card">
                <h2>
                  <span
                    style={{
                      display: "inline-flex",
                      gap: 8,
                      alignItems: "center",
                    }}
                  >
                    <Ic name="i-building" /> Company
                  </span>
                </h2>
                <div style={{ marginTop: 16 }}>
                  <div className="field">
                    <label>Company name</label>
                    <input placeholder="Your company B.V." />
                  </div>
                  <div className="frow">
                    <div className="field">
                      <label>VAT / Tax ID</label>
                      <input className="mono" placeholder="NL0000.00.000.B00" />
                    </div>
                    <div className="field">
                      <label>Country</label>
                      <input placeholder="Netherlands" />
                    </div>
                  </div>
                  <button
                    className="btn sm"
                    onClick={() => toast.success("Company saved")}
                  >
                    Save company
                  </button>
                </div>
              </div>
              <div className="card">
                <h2>Notification preferences</h2>
                <p className="cap">Choose what pings you.</p>
                <Toggle label="Top-up verified" desc="When a payment is credited" def />
                <Toggle label="Invoice / fee due" desc="Before your monthly fee is charged" def />
                <Toggle label="Ad account status" desc="When a request goes live or needs action" def />
                <Toggle label="Low balance" desc="When your wallet runs low" />
              </div>
            </div>
            <div className="card">
              <h2>
                <span
                  style={{ display: "inline-flex", gap: 8, alignItems: "center" }}
                >
                  <Ic name="i-gift" /> Become an affiliate
                </span>
              </h2>
              <p className="cap">
                Refer other advertisers and earn commission. Apply and our team
                reviews it.
              </p>
              <button
                className="btn ghost sm"
                onClick={() =>
                  toast.success("Affiliate application sent — we'll review it")
                }
              >
                Apply to the affiliate program
              </button>
            </div>
          </div>

          {/* HELP */}
          <div className={`view${view === "help" ? " on" : ""}`}>
            <div className="phead">
              <div>
                <h1>Get help</h1>
              </div>
            </div>
            <div className="grid2">
              <div className="card">
                <h2>How it works</h2>
                <div className="faq" style={{ marginTop: 14 }}>
                  <div>
                    <div className="q">How do I fund an ad account?</div>
                    <div className="a">
                      Top up your wallet by bank transfer, we verify it, then
                      move budget onto any ad account.
                    </div>
                  </div>
                  <div>
                    <div className="q">How fast do accounts go live?</div>
                    <div className="a">
                      Typically 3–12 hours after you request one, on our verified
                      Business Manager.
                    </div>
                  </div>
                  <div>
                    <div className="q">Can I get my money back?</div>
                    <div className="a">
                      You can request a withdrawal of an ad-account balance; our
                      team approves and returns it to your wallet.
                    </div>
                  </div>
                </div>
              </div>
              <div className="card">
                <h2>Talk to us</h2>
                <p className="cap">Your account manager is one tap away.</p>
                <button
                  className="btn block grad"
                  onClick={() => toast.success("Opening WhatsApp…")}
                >
                  <Ic name="i-mail" /> Message your manager
                </button>
              </div>
            </div>
          </div>
        </div>

        <nav className="bottombar">
          {BOTTOM.map((b) => (
            <button
              key={b.v + b.label}
              className={`bb${view === b.v ? " on" : ""}`}
              onClick={() => go(b.v)}
            >
              <span className="bbic">
                <Ic name={b.icon} />
              </span>
              {b.label}
            </button>
          ))}
        </nav>
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
        usdBalance={usdBal}
        eurBalance={eurBal}
      />
      <CreateTopupDialog
        open={acctTopupOpen}
        setOpen={setAcctTopupOpen}
        account={acctTopup}
      />
      <AccountDetailsSheet
        open={detailsOpen}
        setOpen={() => setDetailsOpen(false)}
        accountId={detailsId}
      />
    </div>
  );
}

function WalletCard({
  cur,
  label,
  value,
  onTopup,
  onExchange,
  disabled,
}: {
  cur: "eur" | "usd";
  label: string;
  value: string;
  onTopup: () => void;
  onExchange: () => void;
  disabled?: boolean;
}) {
  return (
    <div className={`wallet ${cur}`}>
      <div className="wsh" />
      <div className="wl">{label}</div>
      <div className="wv">{value}</div>
      <div className="wavail">
        <b>{value}</b> available
      </div>
      <div className="wa">
        <button className="wbtn" onClick={onTopup} disabled={disabled}>
          <Ic name="i-plus" /> Top up
        </button>
        <button className="wbtn gh" onClick={onExchange} disabled={disabled}>
          <Ic name="i-swap" /> Exchange
        </button>
      </div>
    </div>
  );
}

function Toggle({
  label,
  desc,
  def,
}: {
  label: string;
  desc: string;
  def?: boolean;
}) {
  const [on, setOn] = useState(!!def);
  return (
    <div className="toggle-row">
      <div>
        <div className="t">{label}</div>
        <div className="d">{desc}</div>
      </div>
      <button
        className={`sw${on ? " on" : ""}`}
        onClick={() => setOn((v) => !v)}
        aria-label={label}
      />
    </div>
  );
}
