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

  // TWO NAMES EACH. Three full labels plus three counts do not fit across a
  // phone, and the bar scrolled sideways with the third tab half off the
  // screen — a queue you cannot see is a queue nobody works. The short name
  // is used below 430px, where the tab bar is the only thing naming the
  // panel anyway.
  const TABS: {
    key: TabKey;
    label: string;
    short: string;
    caption: string;
    count: number | null | undefined;
  }[] = [
    {
      key: "topups",
      label: "Wallet top-ups",
      short: "Top-ups",
      caption: "Check the bank before you credit.",
      count: counts?.topups,
    },
    {
      key: "deposits",
      label: "Bank deposits",
      short: "Deposits",
      caption: "Money arriving in the bank, as Wise reports it.",
      count: counts?.deposits,
    },
    {
      key: "precharge",
      label: "Precharge",
      short: "Precharge",
      caption:
        "Advance wallet credit before a payment clears. It settles when the money arrives.",
      count: counts?.precharge,
    },
  ];
  const active = TABS.find((t) => t.key === tab);

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
            <span className="milong">{t.label}</span>
            <span className="mishort">{t.short}</span>
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

      {/* ONE heading for the screen, not two. Each panel printed its own
          title directly under the tab that already named it — "Wallet
          top-ups" over "Wallet Topups" — so the caption moves here and the
          panels lost their headings. */}
      {active ? (
        <div className="mihead">
          <h1>{active.label}</h1>
          <p>{active.caption}</p>
        </div>
      ) : null}

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

// The tab bar itself lives in the shared shell CSS — it is wanted on the
// people screen too, and two copies of a bar drift. What stays here is the
// one heading this screen puts under it.
const TAB_CSS = `
.mitabs-wrap{display:flex;flex-direction:column;gap:18px}
.mihead h1{margin:0;font-family:var(--hd);font-size:1.6rem;font-weight:800;
  letter-spacing:-.03em}
.mihead p{margin:4px 0 0;color:var(--txt-2);font-size:.9rem;line-height:1.45}
`;
