"use client";

import { useEffect, useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";
import type { User } from "@supabase/supabase-js";
import { AppProvider } from "@/context/app-provider";
import type { UserProfile } from "@/lib/types/user";
import { makeQueryClient } from "@/lib/make-query-client";
import { isBlockedInViewMode, isViewAsPath, VIEW_AS_REFUSAL } from "@/lib/pure-view-as";
import { Toaster } from "@/components/ui/sonner";
import AdvertiserDashboard from "@/components/role-split/advertiser-dashboard";

// ── THE BROWSER HALF OF READ-ONLY ─────────────────────────────────
//
// Installed once, and it checks the CURRENT path on every call rather
// than being torn down on unmount: leaving view mode by the back button
// is a client-side navigation into the owner's admin app, and a guard
// still standing there must not make the admin read-only. Outside
// /view-as/* it passes everything through untouched.
let installed = false;
function installGuard() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const original = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (isViewAsPath(window.location.pathname)) {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const method = init?.method ?? (typeof input === "object" && "method" in input ? (input as Request).method : "GET");
      if (isBlockedInViewMode(method, url)) {
        toast.error(VIEW_AS_REFUSAL, { id: "view-as-refused" });
        return Promise.resolve(
          new Response(JSON.stringify({ error: VIEW_AS_REFUSAL, message: VIEW_AS_REFUSAL }), {
            status: 403,
            headers: { "content-type": "application/json" },
          }),
        );
      }
    }
    return original(input, init);
  };
}

const queryClient = makeQueryClient();

export default function ViewAsApp({
  profile,
  user,
  code,
  name,
}: {
  profile: UserProfile;
  user: User;
  code: string;
  name: string;
}) {
  // Before the first child renders, so not even the first query or the
  // wallet bootstrap can get a write out.
  useState(() => {
    installGuard();
    return null;
  });

  // ── ONE LOG ROW PER SCREEN ──────────────────────────────────────
  // The customer app switches screens with ?view= and no navigation, so
  // there is no event to hang this on; the address is checked once a
  // second. The first screen is logged by the page itself.
  useEffect(() => {
    let last = new URLSearchParams(window.location.search).get("view") ?? "home";
    const t = window.setInterval(() => {
      const now = new URLSearchParams(window.location.search).get("view") ?? "home";
      if (now === last) return;
      last = now;
      void fetch("/api/view-as/log", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code, view: now }),
      }).catch(() => {});
    }, 1000);
    return () => window.clearInterval(t);
  }, [code]);

  return (
    <AppProvider user={user} profile={profile}>
      <QueryClientProvider client={queryClient}>
        <style>{CSS}</style>
        <div className="vas-frame" aria-hidden />
        <div className="vas-pill" role="status">
          <span className="vas-dot" />
          <span className="vas-txt">
            Viewing <b>{code}</b>
            {name ? <span className="vas-nm"> · {name}</span> : null} · read only
          </span>
          {/* A full page load, not a client navigation: the owner's admin
              app gets its own providers back from scratch. */}
          <a className="vas-exit" href="/users">
            Exit
          </a>
        </div>
        <AdvertiserDashboard />
        <Toaster position="top-right" />
      </QueryClientProvider>
    </AppProvider>
  );
}

const CSS = `
.vas-frame{position:fixed;inset:0;pointer-events:none;z-index:2147483646;box-shadow:inset 0 0 0 3px #f59e0b}
.vas-pill{position:fixed;left:50%;bottom:calc(76px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:2147483647;display:flex;align-items:center;gap:8px;max-width:calc(100vw - 32px);padding:7px 8px 7px 12px;border-radius:999px;background:#1c1917;color:#fff;font:600 12px/1.2 system-ui,-apple-system,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.25);white-space:nowrap}
.vas-dot{width:8px;height:8px;border-radius:50%;background:#f59e0b;flex:none}
.vas-txt{overflow:hidden;text-overflow:ellipsis;min-width:0}
.vas-txt b{font-weight:800}
.vas-nm{opacity:.75}
.vas-exit{flex:none;padding:5px 10px;border-radius:999px;background:#f59e0b;color:#1c1917;font-weight:800;text-decoration:none}
@media (min-width:1024px){.vas-pill{bottom:20px}}
`;
