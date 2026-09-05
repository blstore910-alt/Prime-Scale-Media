"use client";

import { dmSans, jakarta } from "@/lib/fonts";
import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";
import { Wallet as WalletType } from "@/lib/types/wallet";
import { useQuery } from "@tanstack/react-query";
import {
  Bell,
  ChevronDown,
  Coins,
  Gift,
  HelpCircle,
  Home,
  LogOut,
  type LucideIcon,
  Menu,
  Monitor,
  Receipt,
  Rocket,
  Settings,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { PSM_APP_CSS } from "./psm-shell-css";

type NavItem = { title: string; href: string; icon: LucideIcon };
type ShellVariant = "advertiser" | "affiliate";

type ShellConfig = {
  roleLabel: string;
  main: NavItem[];
  account: NavItem[];
  earn?: NavItem;
  bottom: NavItem[];
  showWallet: boolean;
  showSubscription: boolean;
};

const CONFIG: Record<ShellVariant, ShellConfig> = {
  advertiser: {
    roleLabel: "Advertiser",
    main: [
      { title: "Dashboard", href: "/dashboard", icon: Home },
      { title: "Wallet", href: "/wallet", icon: Wallet },
      { title: "Ad accounts", href: "/accounts", icon: Monitor },
      { title: "Topups", href: "/top-ups", icon: Coins },
      { title: "My subscription", href: "/my-subscription", icon: ShieldCheck },
      { title: "Invoices", href: "/invoices", icon: Receipt },
    ],
    account: [
      { title: "Notifications", href: "/notifications", icon: Bell },
      { title: "Settings", href: "/profile", icon: Settings },
      { title: "Get help", href: "/help", icon: HelpCircle },
    ],
    earn: { title: "Affiliate program", href: "/my-referrals", icon: Gift },
    bottom: [
      { title: "Accounts", href: "/accounts", icon: Monitor },
      { title: "Topups", href: "/top-ups", icon: Coins },
      { title: "Home", href: "/dashboard", icon: Home },
      { title: "Wallet", href: "/wallet", icon: Wallet },
      { title: "Invoices", href: "/invoices", icon: Receipt },
    ],
    showWallet: true,
    showSubscription: true,
  },
  affiliate: {
    // The affiliate's home is the referrals jackpot (/my-referrals);
    // /dashboard renders the admin overview and is redirected away for
    // affiliates in app/(app)/dashboard/page.tsx.
    roleLabel: "Affiliate",
    main: [
      { title: "My referrals", href: "/my-referrals", icon: Gift },
      { title: "Invoices", href: "/invoices", icon: Receipt },
    ],
    account: [
      { title: "Notifications", href: "/notifications", icon: Bell },
      { title: "Settings", href: "/profile", icon: Settings },
      { title: "Get help", href: "/help", icon: HelpCircle },
    ],
    bottom: [
      { title: "Referrals", href: "/my-referrals", icon: Gift },
      { title: "Invoices", href: "/invoices", icon: Receipt },
    ],
    showWallet: false,
    showSubscription: false,
  },
};

const TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/wallet": "Wallet",
  "/accounts": "Ad accounts",
  "/top-ups": "Topups",
  "/my-subscription": "My subscription",
  "/invoices": "Invoices",
  "/my-referrals": "My referrals",
  "/help": "Get help",
  "/profile": "Settings",
  "/notifications": "Notifications",
};

function isActive(pathname: string, href: string) {
  return href === "/dashboard"
    ? pathname === "/dashboard"
    : pathname === href || pathname.startsWith(href + "/");
}

function initials(name?: string | null) {
  if (!name) return "PS";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "PS";
}

const fmtEur = (v: number | string | null | undefined) =>
  new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(Number(v ?? 0));

export default function PsmAppShell({
  variant = "advertiser",
  children,
}: {
  variant?: ShellVariant;
  children: React.ReactNode;
}) {
  const cfg = CONFIG[variant];
  const { profile } = useAppContext();
  const pathname = usePathname() ?? "/dashboard";
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const advertiserId = profile?.advertiser?.[0]?.id ?? null;
  const fullName = (profile?.full_name as string) ?? cfg.roleLabel;
  const ini = initials(fullName);

  const { data: wallet } = useQuery<WalletType | null>({
    queryKey: ["wallet", advertiserId],
    enabled: cfg.showWallet && !!advertiserId,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("wallets")
        .select("*")
        .eq("advertiser_id", advertiserId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as WalletType | null;
    },
  });

  const logout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
  };

  const title = TITLES[pathname] ?? "Dashboard";
  const close = () => setOpen(false);

  const NavLink = ({ item, aff }: { item: NavItem; aff?: boolean }) => {
    const Icon = item.icon;
    return (
      <Link
        href={item.href}
        onClick={close}
        className={`navlink${aff ? " aff" : ""}${
          isActive(pathname, item.href) ? " on" : ""
        }`}
      >
        <Icon /> {item.title}
        {aff && <span className="n new">New</span>}
      </Link>
    );
  };

  return (
    <div className={`psmapp ${jakarta.variable} ${dmSans.variable}`}>
      <style>{PSM_APP_CSS}</style>

      <div className={`scrim${open ? " on" : ""}`} onClick={close} />

      <aside className={`sidebar${open ? " open" : ""}`}>
        <div className="logo">
          <span className="mark">
            <Rocket />
          </span>
          <span className="name">
            Prime Scale Media<small>{cfg.roleLabel}</small>
          </span>
        </div>
        {cfg.main.map((item) => (
          <NavLink key={item.href} item={item} />
        ))}
        <div className="navsec">Account</div>
        {cfg.account.map((item) => (
          <NavLink key={item.href} item={item} />
        ))}
        {cfg.earn && (
          <>
            <div className="navsec">Earn</div>
            <NavLink item={cfg.earn} aff />
          </>
        )}
        <div className="side-foot">
          <span className="avatar">{ini}</span>
          <div className="who">
            {fullName}
            <small>{profile?.tenant?.name ?? cfg.roleLabel}</small>
          </div>
        </div>
      </aside>

      <div className="main">
        <div className="topbar">
          <button
            className="iconbtn ham"
            aria-label="Menu"
            onClick={() => setOpen((o) => !o)}
          >
            <Menu />
          </button>
          <div className="tb-brand">
            <span className="mark">
              <Rocket />
            </span>
            <span className="tb-title">{title}</span>
          </div>
          <div className="tb-spacer" />
          <div className="toolbar">
            {cfg.showWallet && (
              <Link className="tool wal" href="/wallet" title="Open wallet">
                <Wallet />
                <span className="e">
                  <small>Wallet</small>
                  <b>{fmtEur(wallet?.eur_balance)}</b>
                </span>
              </Link>
            )}
            {cfg.showSubscription && (
              <Link
                className="tool st"
                href="/my-subscription"
                title="Subscription"
              >
                <ShieldCheck /> Active
              </Link>
            )}
            {!cfg.showWallet && (
              <Link className="tool st" href="/my-referrals" title="Earnings">
                <Gift /> Earnings
              </Link>
            )}
            <Link
              className="tool ic-btn"
              href="/notifications"
              aria-label="Notifications"
            >
              <Bell />
            </Link>
            <Link className="tool ava-btn" href="/profile" title="Settings">
              <span className="avatar">{ini}</span>
              <ChevronDown />
            </Link>
            <button
              className="tool ic-btn"
              onClick={logout}
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut />
            </button>
          </div>
        </div>

        <div className="content">{children}</div>

        <nav className="bottombar">
          {cfg.bottom.map((b) => {
            const Icon = b.icon;
            return (
              <Link
                key={b.href + b.title}
                href={b.href}
                onClick={close}
                className={`bb${isActive(pathname, b.href) ? " on" : ""}`}
              >
                <span className="bbic">
                  <Icon />
                </span>
                {b.title}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
