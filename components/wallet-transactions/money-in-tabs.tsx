"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useAppContext } from "@/context/app-provider";
import PsmVerifyTopups from "@/components/wallet-transactions/psm-verify-topups";
import WiseReviewPanel from "@/components/wise/wise-review-panel";
import PrechargePanel from "@/components/withdrawals/precharge-panel";

/**
 * Money coming IN, as three tabs instead of three stacked screens.
 *
 * WHY TABS ARE SAFE HERE, AND WERE NOT BEFORE. These two lists used to be
 * one decision: the bank deposit is the evidence for the wallet top-up, and
 * a tab that hides the evidence at the moment somebody is about to credit
 * real money is worse than any amount of scrolling. That objection was
 * answered by putting the evidence on the cards themselves — a top-up card
 * carries "Matched with a bank deposit of EUR 5.00 from BL E-COMMERCE", and
 * a deposit card carries the customer it points at. Both lists now stand on
 * their own, so they can be put side by side.
 *
 * WHAT STACKING COST. Three sections down one page, with 231 deposits under
 * a dozen top-ups: on a phone the deposits queue began several screens below
 * the fold, and "1 to confirm" — a customer waiting on their money — was
 * something you had to scroll to discover.
 *
 * THE ONE RULE. Every tab carries its own count. A tab that hides a queue
 * with work in it is the only way this change could make things worse, so
 * the counts are read independently of whatever filters are set INSIDE each
 * panel, and they say what needs a person, not how many rows exist.
 *
 * All three panels stay mounted (inactive ones hidden) so switching is
 * instant, no query re-runs, and no count goes unknown because its tab
 * happens to be closed.
 */
type TabKey = "topups" | "deposits" | "precharge";

function useQueueCounts(tenantId: string | null) {
  return useQuery({
    queryKey: ["money-in-counts", tenantId],
    enabled: !!tenantId,
    staleTime: 30_000,
    queryFn: async () => {
      const supabase = createClient();

      // Three counts, three separate reads, so one unreadable queue does not
      // blank the other two. null means "we could not read it" and renders
      // as a dash — never as zero, which on this screen would mean "nobody
      // is waiting on you".
      const [topups, deposits, precharges] = await Promise.all([
        supabase
          .from("wallet_topups")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("status", "pending"),
        supabase
          .from("wise_incoming_transfers")
          .select("id", { count: "exact", head: true })
          .eq("status", "suggested")
          .is("archived_at", null),
        supabase
          .from("wallet_precharges")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("status", "outstanding"),
      ]);

      return {
        topups: topups.error ? null : (topups.count ?? 0),
        deposits: deposits.error ? null : (deposits.count ?? 0),
        precharge: precharges.error ? null : (precharges.count ?? 0),
      };
    },
  });
}

export default function MoneyInTabs() {
  const { profile } = useAppContext();
  const tenantId = profile?.tenant_id ?? null;
  const [tab, setTab] = useState<TabKey>("topups");
  const { data: counts } = useQueueCounts(tenantId);

  const TABS: { key: TabKey; label: string; count: number | null | undefined }[] =
    [
      { key: "topups", label: "Wallet top-ups", count: counts?.topups },
      { key: "deposits", label: "Bank deposits", count: counts?.deposits },
      { key: "precharge", label: "Precharge", count: counts?.precharge },
    ];

  return (
    <div className="psmview mitabs-wrap">
      <style>{TAB_CSS}</style>

      <div className="mitabs" role="tablist" aria-label="Money coming in">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            className={"mitab" + (tab === t.key ? " on" : "")}
            onClick={() => setTab(t.key)}
          >
            <span>{t.label}</span>
            {/* A zero is worth showing: "nothing is waiting" is an answer.
                An unreadable count is a dash, never a zero. */}
            {t.count === undefined ? null : (
              <em className={t.count ? "hot" : undefined}>
                {t.count === null ? "—" : t.count}
              </em>
            )}
          </button>
        ))}
      </div>

      {/* Hidden, not unmounted — see the note above. */}
      <div hidden={tab !== "topups"}>
        <PsmVerifyTopups defaultStatus="pending" />
      </div>
      <div hidden={tab !== "deposits"}>
        <WiseReviewPanel />
      </div>
      <div hidden={tab !== "precharge"}>
        {/* Precharge belongs with money arriving, not on /withdrawals. It
            advances wallet credit against a payment that has NOT cleared,
            and it settles when that payment is verified. */}
        <PrechargePanel />
      </div>
    </div>
  );
}

const TAB_CSS = `
.mitabs-wrap{display:flex;flex-direction:column;gap:18px}
.mitabs{display:flex;gap:6px;background:var(--panel-2);border-radius:13px;
  padding:4px;overflow-x:auto;scrollbar-width:none}
.mitabs::-webkit-scrollbar{display:none}
.mitab{flex:1 1 0;min-width:max-content;display:flex;align-items:center;
  justify-content:center;gap:7px;border:0;background:transparent;
  cursor:pointer;border-radius:10px;padding:9px 12px;font:inherit;
  font-size:.86rem;font-weight:650;color:var(--txt-2);white-space:nowrap;
  transition:background .15s,color .15s}
.mitab:hover{color:var(--ink)}
.mitab.on{background:var(--panel);color:var(--ink);box-shadow:var(--shadow-sm)}
.mitab em{font-style:normal;font-size:.72rem;font-weight:800;
  font-variant-numeric:tabular-nums;min-width:20px;padding:1px 6px;
  border-radius:999px;background:var(--line);color:var(--txt-2)}
.mitab em.hot{background:var(--warn);color:#fff}
.mitab.on em.hot{background:var(--warn);color:#fff}
`;
