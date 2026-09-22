"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// ── AD ACCOUNTS AND THE POOL THEY COME FROM, ON ONE SCREEN ──────────────
//
// The owner, 22-09: the Account Pool belongs ON the Ad Accounts screen as
// a tab, not as a sub-item behind the hamburger. Two routes stay two
// routes (a link to either still works); this row is how you move between
// them, and the menu lights "Ad Accounts" on both.

const TABS = [
  { href: "/accounts", label: "Ad accounts" },
  { href: "/account-pool", label: "Account pool" },
];

export default function AccountsSubnav() {
  const pathname = usePathname() ?? "";
  return (
    <nav className="subnav" aria-label="Ad accounts">
      {TABS.map((t) => {
        const on = pathname === t.href || pathname.startsWith(t.href + "/");
        return (
          <Link
            key={t.href}
            href={t.href}
            className={on ? "on" : undefined}
            aria-current={on ? "page" : undefined}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
