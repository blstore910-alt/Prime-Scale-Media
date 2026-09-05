"use client";

import { dmSans, jakarta } from "@/lib/fonts";
import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";
import { usePendingCounts } from "@/hooks/use-pending-counts";
import { PSM_APP_CSS } from "@/components/advertiser/psm-shell-css";
import {
  Bell,
  ChevronDown,
  Coins,
  Download,
  FileText,
  Gift,
  HelpCircle,
  History,
  LayoutGrid,
  type LucideIcon,
  LogOut,
  Mail,
  Menu,
  Monitor,
  Receipt,
  RefreshCw,
  Scale,
  ScrollText,
  Settings,
  Upload,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

type Item = { title: string; href: string; icon: LucideIcon; badge?: number };
type Group = { title?: string; items: Item[] };

const TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/users": "Advertisers",
  "/accounts": "Ad Accounts",
  "/ad-account-requests": "Account Requests",
  "/wallet-topups": "Wallet Topups",
  "/withdrawals": "Withdrawals",
  "/top-ups": "Ad-account Topups",
  "/wallets": "Wallets",
  "/invoices": "Invoices",
  "/subscriptions": "Subscriptions",
  "/promotions": "Promotions",
  "/reconciliation": "Reconciliation",
  "/affiliates": "Referral Links",
  "/commissions": "Referral Commissions",
  "/settings/finance": "Settings",
  "/activity-logs": "Activity Logs",
  "/audit": "Audit Log",
  "/invites": "Invites",
  "/admins": "Admins",
  "/help": "Get Help",
  "/notifications": "Notifications",
  "/profile": "Settings",
};

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}
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

export default function AdminShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile, isSuperAdmin } = useAppContext();
  const pathname = usePathname() ?? "/dashboard";
  const router = useRouter();
  const pending = usePendingCounts();
  const [open, setOpen] = useState(false);

  const name = (profile?.full_name as string) ?? "Admin";
  const ini = initials(name);
  const roleLabel = isSuperAdmin ? "Super admin" : "Admin";

  const groups: Group[] = [
    { title: "General", items: [{ title: "Dashboard", href: "/dashboard", icon: LayoutGrid }] },
    {
      title: "Customers",
      items: [
        { title: "Advertisers", href: "/users", icon: Users },
        { title: "Ad Accounts", href: "/accounts", icon: Monitor },
        {
          title: "Account Requests",
          href: "/ad-account-requests",
          icon: FileText,
          badge: pending.adAccountRequests,
        },
      ],
    },
    {
      title: "Money",
      items: [
        {
          title: "Wallet Topups",
          href: "/wallet-topups",
          icon: Upload,
          badge: pending.walletTopups,
        },
        { title: "Withdrawals", href: "/withdrawals", icon: Download },
        {
          title: "Ad-account Topups",
          href: "/top-ups",
          icon: Coins,
          badge: pending.topUps,
        },
        { title: "Wallets", href: "/wallets", icon: Wallet },
        { title: "Invoices", href: "/invoices", icon: Receipt },
        { title: "Subscriptions", href: "/subscriptions", icon: RefreshCw },
      ],
    },
    {
      title: "More",
      items: [
        { title: "Promotions", href: "/promotions", icon: Gift },
        { title: "Get Help", href: "/help", icon: HelpCircle },
      ],
    },
  ];

  if (isSuperAdmin) {
    groups.push({
      title: "Owner",
      items: [
        { title: "Reconciliation", href: "/reconciliation", icon: Scale },
        { title: "Referral Links", href: "/affiliates", icon: Mail },
        { title: "Commissions", href: "/commissions", icon: Coins },
        { title: "Settings", href: "/settings/finance", icon: Settings },
        { title: "Activity Logs", href: "/activity-logs", icon: History },
        { title: "Audit Log", href: "/audit", icon: ScrollText },
        { title: "Invites", href: "/invites", icon: Users },
        { title: "Admins", href: "/admins", icon: Users },
      ],
    });
  }

  const bottom: Item[] = [
    { title: "Advertisers", href: "/users", icon: Users },
    { title: "Requests", href: "/ad-account-requests", icon: FileText },
    { title: "Home", href: "/dashboard", icon: LayoutGrid },
    { title: "Topups", href: "/top-ups", icon: Coins },
    { title: "Wallets", href: "/wallets", icon: Wallet },
  ];

  const logout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
  };
  const close = () => setOpen(false);
  const title = TITLES[pathname] ?? "Dashboard";

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
            Prime Scale Media<small>{roleLabel}</small>
          </span>
        </div>
        {groups.map((g, gi) => (
          <div key={g.title ?? gi}>
            {g.title && <div className="navsec">{g.title}</div>}
            {g.items.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={close}
                  className={`navlink${isActive(pathname, item.href) ? " on" : ""}`}
                >
                  <Icon /> {item.title}
                  {typeof item.badge === "number" && item.badge > 0 && (
                    <span className="n">{item.badge > 99 ? "99+" : item.badge}</span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
        <div className="side-foot">
          <span className="avatar">{ini}</span>
          <div className="who">
            {name}
            <small>{roleLabel}</small>
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
            <span className="tool st" style={{ cursor: "default" }}>
              {roleLabel}
            </span>
            <Link className="tool ic-btn" href="/notifications" aria-label="Alerts">
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
          {bottom.map((b) => {
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

// PSM rocket mark (matches the mockup logo tile).
function Rocket() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
      <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
      <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
    </svg>
  );
}
