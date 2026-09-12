"use client";

import { dmSans, jakarta } from "@/lib/fonts";
import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";
import useAffiliateStats from "@/hooks/use-affiliate-stats";
import useNotifications from "@/components/notifications/use-notifications";
import { getNotificationCopy } from "@/components/notifications/notification-utils";
import { updateOwnProfileAndCompany } from "@/actions/company-actions";
import { getURL } from "@/lib/utils";
import { AdAccount } from "@/lib/types/account";
import { Wallet } from "@/lib/types/wallet";
import { PLATFORMS } from "@/lib/constants";
import { InvoiceWithRelations } from "@/lib/types/invoice-extended";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ADV_CSS } from "./adv-shell-css";
import { AdvIcons, Ic } from "./adv-icons";
import WalletTopupDialog from "@/components/wallet/wallet-topup-dialog";
import WalletExchangeDialog from "@/components/wallet/wallet-exchange-dialog";
import CreateTopupDialog from "@/components/topups/create-topup-dialog";
import RequestAdAccountDialog from "@/components/account/request-ad-account-dialog";
import { AccountDetailsSheet } from "@/components/account/account-details-sheet";
import OnboardingChecklist from "./onboarding-checklist";

dayjs.extend(relativeTime);

type View =
  | "dash"
  | "wallet"
  | "accounts"
  | "requests"
  | "billing"
  | "referrals"
  | "notif"
  | "settings"
  | "help";
const TITLES: Record<View, string> = {
  dash: "Dashboard",
  wallet: "Wallet",
  accounts: "Ad accounts",
  requests: "Requests",
  billing: "Billing",
  referrals: "Affiliate program",
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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

  // Advertiser-as-affiliate: their referral book (empty for a plain
  // advertiser). Shown under the "Affiliate program" view.
  const aff = useAffiliateStats({ enabled: !!advertiserId });
  const {
    notifications: notifs,
    markAsRead,
    markAllAsRead,
  } = useNotifications();

  const { data: company } = useQuery<Record<string, unknown> | null>({
    queryKey: ["adv-company", advertiserId],
    enabled: !!advertiserId,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("companies")
        .select("name, vat_no, country")
        .eq("advertiser_id", advertiserId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as Record<string, unknown> | null;
    },
  });
  const [comp, setComp] = useState({ name: "", vat_no: "", country: "" });
  const [savingComp, setSavingComp] = useState(false);
  useEffect(() => {
    if (company)
      setComp({
        name: (company.name as string) ?? "",
        vat_no: (company.vat_no as string) ?? "",
        country: (company.country as string) ?? "",
      });
  }, [company]);
  const saveCompany = async () => {
    setSavingComp(true);
    try {
      const res = await updateOwnProfileAndCompany({ company: comp });
      if (!res.ok) throw new Error(res.error);
      toast.success("Company saved");
      queryClient.invalidateQueries({
        queryKey: ["adv-company"],
        exact: false,
      });
    } catch (e) {
      toast.error("Couldn't save company", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setSavingComp(false);
    }
  };
  const referralCode = profile?.advertiser?.[0]?.tenant_client_code;
  const referralLink =
    profile?.tenant?.slug && referralCode
      ? (() => {
          const u = new URL(`${getURL().replace(/\/$/, "")}/auth/sign-up`);
          u.searchParams.set("t", profile.tenant.slug as string);
          u.searchParams.set("ref", referralCode);
          return u.toString();
        })()
      : "";
  const copyReferral = async () => {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      toast.success("Referral link copied.");
    } catch {
      toast.error("Couldn't copy the link.");
    }
  };

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
  const router = useRouter();
  const logout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
  };

  // Close the account menu on outside-click / Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  // Escape also closes the sign-out confirmation.
  useEffect(() => {
    if (!signOutOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSignOutOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [signOutOpen]);

  const [payingId, setPayingId] = useState<string | null>(null);
  const payInvoice = async (id: string) => {
    if (payingId) return;
    setPayingId(id);
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc("invoice_pay_from_wallet", {
        p_invoice_id: id,
      });
      if (error) throw error;
      toast.success("Invoice paid from your wallet.");
      queryClient.invalidateQueries({ queryKey: ["adv-invoices"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["wallet"], exact: false });
    } catch (e) {
      toast.error("Couldn't pay from wallet", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setPayingId(null);
    }
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
        <div className="navsec">Earn</div>
        <button
          className={`navlink${view === "referrals" ? " on" : ""}`}
          onClick={() => go("referrals")}
        >
          <Ic name="i-gift" /> Affiliate program
        </button>
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
            {subscription?.status && (
              <button
                className="tool st"
                onClick={() => go("billing")}
                title="Subscription"
              >
                <Ic name="i-shield" />{" "}
                {subscription.status[0].toUpperCase() +
                  subscription.status.slice(1)}
              </button>
            )}
            <button
              className="tool ic-btn"
              onClick={() => go("notif")}
              aria-label="Notifications"
            >
              <Ic name="i-bell" />
              {notifs.filter((n) => !n.is_read).length > 0 && (
                <span className="badge-n">
                  {notifs.filter((n) => !n.is_read).length}
                </span>
              )}
            </button>
            <div className="usermenu" ref={menuRef}>
              <button
                className="tool ava-btn"
                onClick={() => setMenuOpen((o) => !o)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                title="Account"
              >
                <span className="avatar">{ini}</span>
                <Ic name="i-chev" />
              </button>
              {menuOpen && (
                <div className="umenu" role="menu">
                  <div className="umenu-hd">
                    <div className="nm">{name}</div>
                    <div className="sub">
                      {(profile?.tenant?.name as string) ?? "Advertiser"}
                    </div>
                  </div>
                  <button
                    className="umenu-item"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      go("settings");
                    }}
                  >
                    <Ic name="i-user" /> Profile
                  </button>
                  <button
                    className="umenu-item danger"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      setSignOutOpen(true);
                    }}
                  >
                    <LogoutGlyph /> Sign out
                  </button>
                </div>
              )}
            </div>
            <button
              className="tool ic-btn"
              onClick={() => setSignOutOpen(true)}
              aria-label="Sign out"
              title="Sign out"
            >
              <LogoutGlyph />
            </button>
          </div>
        </div>

        <div className="content">
          {/* DASHBOARD */}
          <div className={`view${view === "dash" ? " on" : ""}`}>
            <OnboardingChecklist
              advertiserId={advertiserId}
              company={company ?? null}
              eurBalance={eurBal}
              usdBalance={usdBal}
              accountsCount={(accounts ?? []).length}
              onNavigate={(v) => go(v as View)}
            />
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

          {/* AFFILIATE PROGRAM (advertiser-as-affiliate) */}
          <div className={`view${view === "referrals" ? " on" : ""}`}>
            <div className="phead">
              <div>
                <h1>Affiliate program</h1>
                <p>Refer advertisers and earn commission on what they pay PSM.</p>
              </div>
            </div>
            <div className="card">
              <h2>Your referral link</h2>
              <p className="cap" style={{ margin: "6px 0 12px" }}>
                Anyone who signs up through your link is tracked as your
                referral.
              </p>
              {referralLink ? (
                <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
                  <div
                    className="mono"
                    style={{
                      flex: 1,
                      minWidth: 200,
                      background: "var(--panel-2)",
                      border: "1px solid var(--line-2)",
                      borderRadius: 11,
                      padding: "12px 13px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      fontSize: ".84rem",
                    }}
                  >
                    {referralLink}
                  </div>
                  <button className="btn" onClick={copyReferral}>
                    <Ic name="i-check" /> Copy link
                  </button>
                </div>
              ) : (
                <p className="muted" style={{ margin: 0 }}>
                  Your referral link isn&apos;t set up yet — ask an admin to
                  enable the affiliate program for your account, or apply via
                  Settings.
                </p>
              )}
            </div>
            <div className="stats">
              <div className="stat">
                <div className="k">
                  <span className="ci b">
                    <Ic name="i-user" />
                  </span>{" "}
                  Referred
                </div>
                <div className="v">{aff.rows.length}</div>
              </div>
              <div className="stat">
                <div className="k">
                  <span className="ci t">
                    <Ic name="i-trend" />
                  </span>{" "}
                  Active
                </div>
                <div className="v">
                  {aff.rows.filter((r) => Number(r.topup_count) > 0).length}
                </div>
              </div>
              <div className="stat">
                <div className="k">
                  <span className="ci g">
                    <Ic name="i-wallet" />
                  </span>{" "}
                  Commission
                </div>
                <div className="v">{eur(aff.totals.earnings_eur)}</div>
              </div>
              <div className="stat">
                <div className="k">
                  <span className="ci p">
                    <Ic name="i-trend" />
                  </span>{" "}
                  Spend driven
                </div>
                <div className="v">{eur(aff.totals.spend_eur)}</div>
              </div>
            </div>
            <div className="card" style={{ padding: "16px 8px 8px" }}>
              <div style={{ padding: "0 14px 8px" }}>
                <h2>Your referrals</h2>
              </div>
              <div className="tblwrap">
                <table className="tbl wide">
                  <thead>
                    <tr>
                      <th style={{ paddingLeft: 14 }}>Advertiser</th>
                      <th>Code</th>
                      <th className="r">Top-ups</th>
                      <th className="r">Spend</th>
                      <th className="r">Commission</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aff.rows.length ? (
                      aff.rows.map((r) => (
                        <tr key={r.referred_advertiser_id}>
                          <td style={{ fontWeight: 600 }}>
                            {r.referred_advertiser_name || "Advertiser"}
                          </td>
                          <td className="mono">
                            {r.referred_advertiser_code || "—"}
                          </td>
                          <td className="r">{r.topup_count}</td>
                          <td className="r mono">{eur(r.spend_eur)}</td>
                          <td
                            className="r mono"
                            style={{ fontWeight: 700, color: "var(--win)" }}
                          >
                            {eur(r.earnings_eur)}
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
                          No referrals yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
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
                    : "No plan"}
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
                      onClick={() => {
                        const unpaid = (invoices ?? []).find(
                          (i) => i.status !== "paid",
                        );
                        if (unpaid) payInvoice(unpaid.id);
                        else toast.message("No unpaid invoice to pay.");
                      }}
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
                      <th className="r"></th>
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
                            <td className="r">
                              {!paid && (
                                <button
                                  className="btn ghost sm"
                                  disabled={payingId === inv.id}
                                  onClick={() => payInvoice(inv.id)}
                                >
                                  {payingId === inv.id
                                    ? "Paying…"
                                    : "Pay now"}
                                </button>
                              )}
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
              {notifs.some((n) => !n.is_read) && (
                <button
                  className="btn ghost sm"
                  onClick={() => markAllAsRead.mutate()}
                >
                  Mark all read
                </button>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {notifs.length ? (
                notifs.map((n) => {
                  const copy = getNotificationCopy(n);
                  return (
                    <div
                      key={n.id}
                      className={`nrow${n.is_read ? "" : " unread"}`}
                      style={{ cursor: n.is_read ? "default" : "pointer" }}
                      onClick={() => !n.is_read && markAsRead.mutate(n.id)}
                    >
                      <span className="nic b">
                        <Ic name="i-bell" />
                      </span>
                      <div>
                        <div className="t">{copy.title}</div>
                        <div className="d">{copy.description}</div>
                      </div>
                      <span className="tm">
                        {dayjs(n.created_at).fromNow()}
                      </span>
                      {!n.is_read && <span className="undot" />}
                    </div>
                  );
                })
              ) : (
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
              )}
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
                    <input
                      placeholder="Your company B.V."
                      value={comp.name}
                      onChange={(e) =>
                        setComp((c) => ({ ...c, name: e.target.value }))
                      }
                    />
                  </div>
                  <div className="frow">
                    <div className="field">
                      <label>VAT / Tax ID</label>
                      <input
                        className="mono"
                        placeholder="NL0000.00.000.B00"
                        value={comp.vat_no}
                        onChange={(e) =>
                          setComp((c) => ({ ...c, vat_no: e.target.value }))
                        }
                      />
                    </div>
                    <div className="field">
                      <label>Country</label>
                      <input
                        placeholder="Netherlands"
                        value={comp.country}
                        onChange={(e) =>
                          setComp((c) => ({ ...c, country: e.target.value }))
                        }
                      />
                    </div>
                  </div>
                  <button
                    className="btn sm"
                    onClick={saveCompany}
                    disabled={savingComp}
                  >
                    {savingComp ? "Saving…" : "Save company"}
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

      {signOutOpen && (
        <div className="modal">
          <div className="mback" onClick={() => setSignOutOpen(false)} />
          <div className="mcard" style={{ width: "min(400px,100%)" }}>
            <div className="mhead">
              <h2>Sign out?</h2>
              <button
                className="iconbtn"
                onClick={() => setSignOutOpen(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <p className="cap">You&apos;ll need to log in again.</p>
            <div className="mfoot">
              <button
                className="btn ghost"
                onClick={() => setSignOutOpen(false)}
              >
                Cancel
              </button>
              <button
                className="btn danger"
                onClick={() => {
                  setSignOutOpen(false);
                  logout();
                }}
              >
                <LogoutGlyph /> Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Small logout glyph reused by the account menu + sign-out modal.
function LogoutGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" x2="9" y1="12" y2="12" />
    </svg>
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
