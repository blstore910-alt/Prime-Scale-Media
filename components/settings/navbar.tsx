"use client";
import { useAppContext } from "@/context/app-provider";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";
const commonLinks = [{ href: "/settings/general", label: "General" }];

const adminLinks = [
  ...commonLinks,
  { href: "/settings/finance", label: "Finance" },
  { href: "/settings/ad-account-types", label: "Ad account types" },
  { href: "/settings/plans", label: "Plans" },
  { href: "/settings/integrations", label: "Integrations" },
  { href: "/settings/banks", label: "Banks" },
];

export default function SettingsNavbar() {
  const pathname = usePathname();
  const { profile } = useAppContext();
  const links = profile?.role === "admin" ? adminLinks : commonLinks;
  return (
    /* The strip spans the page, but its CONTENT lines up with the cards
       below it. It used to be w-full with its own padding while every
       settings page is max-w-3xl and centred, so the tabs and the rule under
       them ran wider than the card they belong to — which reads as two
       layouts stacked rather than one page. */
    /* Two boxes, not one. The OUTER nav paints the sticky background across
       the page; the INNER box is max-w-3xl with the same 16px inset as the
       cards below, carries the bottom rule, and is what the tabs scroll
       inside. It used to be a single scrolling ul that also owned the
       padding — so its right-hand inset scrolled away with the content and
       the strip ran past the right edge of the card underneath it, which
       reads as two layouts stacked rather than one page. */
    <nav
      aria-label="Section"
      className="sticky top-0 z-10 mt-4 w-full bg-background/95 backdrop-blur"
    >
      <div className="mx-auto max-w-3xl border-b px-4">
        {/* The strip is wider than a phone, so it scrolls in place instead of
            pushing the settings page sideways. The fade on the right says so
            — a tab cut dead at the edge reads as broken rather than as more
            to come. */}
        <div className="relative">
          <ul className="flex items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {links.map(({ href, label }) => {
              const active =
                pathname === href || pathname.startsWith(href + "/");
              return (
                <li key={href} className="shrink-0">
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative -mb-px inline-flex items-center whitespace-nowrap border-b-2 px-2.5 py-2 text-[13px] transition-colors sm:px-3 sm:text-sm",
                      active
                        ? "border-primary text-foreground font-semibold"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background to-transparent"
          />
        </div>
      </div>
    </nav>
  );
}
