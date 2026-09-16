"use client";

import { dmSans, jakarta } from "@/lib/fonts";
import { signOutCompletely } from "@/lib/auth/sign-out";
import { useAppContext } from "@/context/app-provider";
import { usePendingCounts } from "@/hooks/use-pending-counts";
import { PSM_APP_CSS } from "@/components/advertiser/psm-shell-css";
import {
  Bell,
  BookOpen,
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
  Boxes,
  Receipt,
  RefreshCw,
  Scale,
  ScrollText,
  Settings,
  Upload,
  User,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Item = {
  title: string;
  href: string;
  icon: LucideIcon;
  /** null = the count could not be read. NOT the same as 0. */
  badge?: number | null;
};
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
  "/manual": "Manual",
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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
        { title: "Account Pool", href: "/account-pool", icon: Boxes },
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
        { title: "Manual", href: "/manual", icon: BookOpen },
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
    // Clears the session AND the httpOnly profile_id cookie — see
    // lib/auth/sign-out.ts for why the second half matters.
    await signOutCompletely();
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
                  /* The sidebar holds up to 20 links and on a phone it lives
                     behind the hamburger, closed. Next still prefetched them
                     on load: measured four sidebar routes fetched during the
                     first paint at ~0.9-1.3s each, competing with the data
                     the visible page actually needed. prefetch={false} only
                     drops the on-render prefetch — hover and touch still
                     prefetch, so opening the drawer and tapping is no
                     slower. */
                  prefetch={false}
                  className={`navlink${isActive(pathname, item.href) ? " on" : ""}`}
                >
                  <Icon /> {item.title}
                  {/* An unreadable count used to render as no badge at all,
                      which says "nothing is waiting" — the one thing it does
                      not know. It gets a muted dash instead. */}
                  {item.badge === null ? (
                    <span className="n unknown" title="Count could not be read">
                      —
                    </span>
                  ) : (
                    typeof item.badge === "number" &&
                    item.badge > 0 && (
                      <span className="n">
                        {item.badge > 99 ? "99+" : item.badge}
                      </span>
                    )
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
          {/* Left cluster uses the SAME .toolbar treatment as the right one.
              Before, the bar held three different shape languages at once: a
              loose outlined square, a loose dark tile, and a grouped pill —
              which is why it never read as one object. Two matched clusters
              either side of the title does. */}
          <div className="toolbar tb-left">
            <button
              className="tool ic-btn ham"
              aria-label="Menu"
              onClick={() => setOpen((o) => !o)}
            >
              <Menu />
            </button>
            <span className="tb-brand">
              <span className="mark">
                <Rocket />
              </span>
            </span>
          </div>
          <span className="tb-title">{title}</span>
          <div className="tb-spacer" />
          <div className="toolbar">
            <span className="tool st" style={{ cursor: "default" }}>
              {roleLabel}
            </span>
            <Link className="tool ic-btn" href="/notifications" aria-label="Alerts">
              <Bell />
            </Link>
            <div className="usermenu" ref={menuRef}>
              <button
                className="tool ava-btn"
                onClick={() => setMenuOpen((o) => !o)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                title="Account"
              >
                <span className="avatar">{ini}</span>
                <ChevronDown />
              </button>
              {menuOpen && (
                <div className="umenu" role="menu">
                  <div className="umenu-hd">
                    {/* The avatar comes with you into the menu, so the panel
                        is visibly the tile it opened from. */}
                    <span className="umenu-av">{ini}</span>
                    <span className="umenu-who">
                      <span className="nm">{name}</span>
                      <span className="sub">{roleLabel}</span>
                    </span>
                  </div>
                  <button
                    className="umenu-item"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      router.push("/profile");
                    }}
                  >
                    <User /> Profile
                  </button>
                  <button
                    className="umenu-item danger"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      setSignOutOpen(true);
                    }}
                  >
                    <LogOut /> Sign out
                  </button>
                </div>
              )}
            </div>
            {/* Redundant on a phone: the avatar menu right next to it
                already carries Sign out, and two ways to do the same thing
                in a five-control bar is what made it feel cluttered. Kept on
                desktop, where there is room and one-click sign-out is a
                genuine convenience. */}
            <button
              className="tool ic-btn so-btn"
              onClick={() => setSignOutOpen(true)}
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

      {signOutOpen && (
        <div className="modal">
          <div className="mback" onClick={() => setSignOutOpen(false)} />
          <div className="mcard">
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
                className="btn"
                onClick={() => {
                  setSignOutOpen(false);
                  logout();
                }}
              >
                <LogOut /> Sign out
              </button>
            </div>
          </div>
        </div>
      )}
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
