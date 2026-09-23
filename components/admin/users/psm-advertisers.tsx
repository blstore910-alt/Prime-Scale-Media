"use client";

import { useSearchParams } from "next/navigation";

import ConfirmModal, { ConfirmFact } from "@/components/ui/confirm-modal";
import Link from "next/link";
import CreateSubscriptionDialog from "@/components/subscriptions/create-subscription-dialog";
import PsmSortFilter from "@/components/psm/sort-filter";
import { COMMISSION_TYPE_LABELS } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import { Advertiser } from "@/lib/types/advertiser";
import { formatCurrency } from "@/lib/utils";
import { Parser } from "json2csv";
import {
  Eye,
  FileDown,
  Monitor,
  HandCoins,
  Loader2,
  Plus,
  Search,
  UserCheck,
  UserX,
} from "lucide-react";
import { type MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import CommissionSetupDialog from "./commission-setup-dialog";
import type { Profile } from "./user-table";
import UserDetailsSheet from "./user-details-sheet";
import useUpdateUserProfile from "./use-update-user";
import {
  peopleStatusView,
  planStatusLabel,
} from "@/lib/pure-people-status";
import { PERK_KIND_LABELS, type PerkKind } from "@/lib/types/perk";
import useUsers from "./use-users";
import CustomerName from "@/components/psm/customer-name";
import { useAppContext } from "@/context/app-provider";
import { useQuery } from "@tanstack/react-query";
import { useAffiliateEarnings } from "@/hooks/use-affiliate-earnings";
import { getCompletedWalletTopupTotals } from "./wallet-topup-totals";
import PsmAvatar from "@/components/ui/psm-avatar";
import { safeIlikeTerm } from "@/lib/utils/search";
import { csvSafe } from "@/lib/csv-safe";
import { downloadCsv } from "@/lib/download-blob";

// Admin advertisers list, ported to the mockup look. Reuses the real
// `useUsers` data hook (unchanged query) and the real detail sheet +
// create-subscription + commission-setup dialogs + the updateUserProfile
// mutation hook (activate/deactivate) — presentation only.
export default function PsmAdvertisers() {
// ── A LINK CAN ARRIVE WITH A CUSTOMER ALREADY IN MIND ───────────────
//
// The subscriptions list, the requests queue and the accounts table all
// link here with ?q=PSM0005, because "show me this customer" is the
// question every one of those screens ends on. Without this the code in
// the URL was ignored and the admin retyped, by hand, the code they had
// just clicked.
//
// Read ONCE, as the initial state: after that the box belongs to
// whoever is typing in it, and re-syncing on every render would fight
// them.
  const initialQuery = useSearchParams().get("q") ?? "";
  const [search, setSearch] = useState(initialQuery);
  const [debounced, setDebounced] = useState(initialQuery);
  const [sort, setSort] = useState("newest");
  const [active, setActive] = useState("all"); // all | yes | no
  const [page, setPage] = useState(1);
  const perPage = 20;
  const [downloadingCSV, setDownloadingCSV] = useState(false);

  // One definition of "the list is narrowed", used by both the empty state
  // and the Reset control, so they can never disagree about it.
  // Affiliate earnings, keyed by email — the only identifier a standalone
  // affiliate and an advertiser-as-affiliate both carry.
  const { profile: me } = useAppContext();
  const { byEmail: earningsByEmail, isError: earningsBroken, isLoading: earningsLoading } =
    useAffiliateEarnings(me?.tenant_id);
  // One flag for the cell below: a dash covers both "the read failed"
  // and "it has not answered yet", because a zero is wrong in both.
  const earningsError = earningsBroken || earningsLoading;

  const narrowed = !!search.trim() || active !== "all";
  const resetFilters = () => {
    setSort("newest");
    setActive("all");
    setSearch("");
  };

  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [subscriptionOpen, setSubscriptionOpen] = useState(false);
  const [advertiserId, setAdvertiserId] = useState("");
  const [commissionOpen, setCommissionOpen] = useState(false);
  const [commissionAdvertiser, setCommissionAdvertiser] =
    useState<Advertiser | null>(null);

  // ADVERTISERS AND AFFILIATES ARE NOT THE SAME LIST. They were shown in
  // one, and an advertiser and an affiliate share almost no column: a plan,
  // a wallet and a top-up total mean nothing for somebody who never buys
  // anything, and earnings and referral links mean nothing for somebody who
  // does. Whichever heading the table carried, half its cells were wrong —
  // so every affiliate row read "Affiliate — no plan" under a column called
  // PLAN, which is an apology for the column rather than a value in it.
  // ── AND ?role=, for the same reason ?q= is read ────────────────────
  //
  // The push notification "Someone wants to join the affiliate
  // programme" opens /users?role=affiliate. Nothing read it: the tab is
  // local state, so tapping the notification landed on the Advertisers
  // tab with the applicant not on screen. Read once, as the initial
  // state, exactly like the query box -- after that the tab belongs to
  // whoever is clicking it.
  const initialKind =
    (useSearchParams().get("role") ?? "").toLowerCase() === "affiliate"
      ? "affiliate"
      : "advertiser";
  const [kind, setKind] = useState<"advertiser" | "affiliate">(initialKind);
  const isAffiliateTab = kind === "affiliate";

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 500);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => setPage(1), [debounced, sort, active, kind]);

  const { profiles, total, isLoading, isError, error, codeSearchFailed } =
    useUsers({
    role: kind,
    sort,
    search: debounced,
    active: active === "all" ? undefined : active === "yes",
    page,
    perPage,
  });

  // How many of each, independent of the search and filters inside the
  // list — a tab counts the people it holds, not the people a filter has
  // left showing. An unreadable count is a dash, never a zero.
  const { data: kindCounts } = useQuery({
    queryKey: ["people-counts", me?.tenant_id],
    enabled: !!me?.tenant_id,
    staleTime: 60_000,
    queryFn: async () => {
      const supabase = createClient();
      // Two numbers per role: how many there are, and how many are still
      // switched on. The tab badge answers the first; "how many are we
      // actually serving" is the one anybody asks, and it needed a filter
      // and a read of the pagination.
      // ── THE HEADER AND THE PILLS HAVE TO MEAN THE SAME THING ────
      //
      // "N active" counted `is_active` alone. Every row renders
      // peopleStatusView, which is off if EITHER column says off and
      // prints an unknown word as itself -- and pure-people-status says
      // in its own first paragraph that the two columns "disagree on
      // live rows". So 40 advertisers of whom 3 are is_active=true and
      // status='suspended' gave "40 active" over a table showing three
      // amber Suspended pills, and the Account status -> Active filter
      // returned rows that render as Suspended.
      const one = async (r: string, active?: boolean) => {
        let q = supabase
          .from("user_profiles")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", me?.tenant_id)
          .eq("role", r);
        if (active === true) {
          q = q.eq("is_active", true).eq("status", "active");
        } else if (active === false) {
          // Off if EITHER says off, which .or expresses and .eq cannot.
          q = q.or("is_active.eq.false,status.neq.active");
        }
        const { count, error } = await q;
        return error ? null : (count ?? 0);
      };
      const [advertiser, affiliate, advertiserOn, affiliateOn] =
        await Promise.all([
          one("advertiser"),
          one("affiliate"),
          one("advertiser", true),
          one("affiliate", true),
        ]);
      return { advertiser, affiliate, advertiserOn, affiliateOn };
    },
  });

  const rows = useMemo(
    () => (profiles?.data ?? []) as Profile[],
    [profiles?.data],
  );

  // ── WHICH PLAN, AND WHAT THEY GET OFF ────────────────────────────
  //
  // The Plan column showed a price. Two customers on different plans at
  // the same price were identical on screen, and a customer sitting on a
  // 100% fee waiver looked exactly like one paying full rate -- which is
  // the difference between an invoice that is right and one that is not.
  //
  // Three reads, each allowed to fail on its own: this data lives behind
  // migrations that are pasted by hand, and a screen that dies because
  // `plans` or `advertiser_perks` is not there yet is worse than a
  // screen without a plan name. A failure leaves that half dark, and
  // the price -- which comes from the row itself -- still prints.
  const advertiserIds = useMemo(
    () =>
      rows
        .map((r) => (r.advertiser?.[0] as { id?: string } | undefined)?.id)
        .filter((id): id is string => typeof id === "string" && !!id)
        // A page is ten rows; the cap is for a future page size, because
        // .in() with a couple of hundred uuids exceeds PostgREST's 8 KiB
        // request line and comes back as a 400 with no useful message.
        .slice(0, 120),
    [rows],
  );

  const { data: planBadges } = useQuery({
    queryKey: ["advertiser-plan-badges", me?.tenant_id, advertiserIds.join(",")],
    enabled: advertiserIds.length > 0 && !!me?.tenant_id,
    staleTime: 30_000,
    queryFn: async () => {
      const supabase = createClient();
      const out: Record<
        string,
        {
          planName?: string;
          perks: string[];
          included?: number | null;
          feePct?: number | null;
        }
      > = {};
      for (const id of advertiserIds) out[id] = { perks: [] };
      let degraded = false;

      // ── THE CUSTOMER'S OWN FIGURES, NOT THE TEMPLATE'S ─────────────
      //
      // This read the plan's NAME and nothing else, and the cell then
      // implied the template's terms. advertiser_plans carries a copy
      // per customer, and three of the five live rows disagree with the
      // plan they are named after -- PSM0004 wears a "Prime" badge (2
      // included, 3%) over a row that says 1 included at 5%.
      //
      // That is the badge an admin reads to answer "does their next ad
      // account cost EUR 50?", and actions/topup-actions puts
      // advertiser_plans.topup_fee_pct second in precedence for what is
      // actually charged. So the screen was stating the opposite of what
      // the customer pays.
      const { data: aplans, error: aplansErr } = await supabase
        .from("advertiser_plans")
        .select(
          "advertiser_id, plan_id, included_ad_accounts, topup_fee_pct",
        )
        .in("advertiser_id", advertiserIds);
      if (aplansErr) degraded = true;

      const planRows = (aplans ?? []) as unknown as {
        advertiser_id?: string;
        plan_id?: string | null;
        included_ad_accounts?: number | null;
        topup_fee_pct?: number | null;
      }[];
      for (const row of planRows) {
        if (!row.advertiser_id || !out[row.advertiser_id]) continue;
        out[row.advertiser_id].included = row.included_ad_accounts ?? null;
        out[row.advertiser_id].feePct = row.topup_fee_pct ?? null;
      }
      const planIds = Array.from(
        new Set(
          planRows
            .map((p) => p.plan_id)
            .filter((v): v is string => typeof v === "string" && !!v),
        ),
      );
      if (planIds.length > 0) {
        const { data: plans } = await supabase
          .from("plans")
          .select("id, name")
          .in("id", planIds);
        const nameById = new Map<string, string>(
          ((plans ?? []) as unknown as { id?: string; name?: string }[]).map(
            (p) => [String(p.id ?? ""), String(p.name ?? "")],
          ),
        );
        for (const row of planRows) {
          const nm = row.plan_id ? nameById.get(String(row.plan_id)) : "";
          if (row.advertiser_id && nm && out[row.advertiser_id]) {
            out[row.advertiser_id].planName = nm;
          }
        }
      }

      // A refused perks read is not "this customer has no perks". The
      // header of this file says what that costs: a customer on a 100%
      // fee waiver looked exactly like one paying full rate.
      const { data: perks, error: perksErr } = await supabase
        .from("advertiser_perks")
        .select("advertiser_id, kind, amount, starts_at, expires_at")
        .in("advertiser_id", advertiserIds)
        .eq("active", true);

      // A perk row can be dated in or out. `active` alone is not the
      // answer -- a discount that ran out last month is still active=true
      // until somebody switches it off.
      const now = Date.now();
      for (const raw of perks ?? []) {
        const p = raw as {
          advertiser_id?: string;
          kind?: string;
          amount?: number | string | null;
          starts_at?: string | null;
          expires_at?: string | null;
        };
        const started = !p.starts_at || new Date(p.starts_at).getTime() <= now;
        const live = !p.expires_at || new Date(p.expires_at).getTime() > now;
        if (!started || !live) continue;
        const bucket = p.advertiser_id ? out[p.advertiser_id] : undefined;
        if (!bucket) continue;
        const label =
          PERK_KIND_LABELS[p.kind as PerkKind] ?? String(p.kind ?? "Perk");
        const pct = Number(p.amount);
        bucket.perks.push(
          Number.isFinite(pct) && pct > 0 && String(p.kind ?? "").includes("discount")
            ? `${label} ${pct}%`
            : label,
        );
      }
      if (perksErr) degraded = true;
      return { byAdvertiser: out, degraded };
    },
  });
  const totalCount = total ?? 0;
  const from = totalCount === 0 ? 0 : (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, totalCount);
  const hasPrev = page > 1;
  const hasNext = page * perPage < totalCount;

  const handleDownload = async () => {
    // Customer-controlled text goes through csvSafe. Excel and Sheets
    // evaluate a cell starting with = + - @ as a formula, and json2csv's
    // default formatter only quotes, which does not stop it. `full_name`
    // is validated as min(2) and nothing else, so a customer can set
    // their own name to a =HYPERLINK payload and wait for an admin to
    // open the export. lib/csv-safe.ts exists for exactly this.
    const text = (v: unknown) => csvSafe(v ?? "");
    const fields = [
      { label: "ID", value: "id" },
      { label: "Status", value: "status" },
      {
        label: "Name",
        value: (r: Record<string, unknown>) => text(r.full_name),
      },
      { label: "Email", value: (r: Record<string, unknown>) => text(r.email) },
      { label: "Active", value: "is_active" },
      {
        label: "Tenant",
        value: (r: Record<string, unknown>) =>
          text((r.tenant as { name?: unknown } | null)?.name),
      },
      {
        label: "Client Code",
        value: (r: Record<string, unknown>) =>
          text(
            (r.advertiser as Array<{ tenant_client_code?: unknown }> | null)?.[0]
              ?.tenant_client_code,
          ),
      },
      { label: "Startup Fee", value: "advertiser.[0].startup_fee" },
      { label: "Fee Status", value: "advertiser.[0].fee_status" },
      { label: "Created At", value: "created_at" },
      { label: "Updated At", value: "updated_at" },
    ];
    const opts = { fields, withBOM: true };
    const supabase = createClient();
    try {
      setDownloadingCSV(true);
      // ── THE SAME ROWS THE SCREEN IS SHOWING ─────────────────────────
      //
      // This ran an unfiltered select: no tenant, no role, no active
      // filter, no search, no paging. The button sits in the filter bar
      // beside Search and Filter, and the table above it excludes admins
      // and the caller's own row — so an export headed "Advertisers"
      // contained affiliates, every employee admin and the super-admin,
      // with their email addresses, and disagreed with everything on
      // screen.
      //
      // Paged, because a select that stops at PostgREST's 1,000 rows
      // gives a short file with no sign that it is short.
      const PAGE = 1000;
      const rows: unknown[] = [];
      for (let from = 0; from < 50_000; from += PAGE) {
        let q = supabase
          .from("user_profiles")
          .select("*, advertiser:advertisers(*), tenant:tenants(*)")
          .eq("tenant_id", me?.tenant_id ?? "")
          .neq("role", "admin")
          .eq("role", kind);
        // ── "all" IS A STRING, AND IT IS THE DEFAULT ────────────────
        //
        // `active` is "all" | "yes" | "no", so `active !== undefined`
        // always passed and sent is_active=eq.all -> "invalid input
        // syntax for type boolean" -> "Unable to export users".
        // Postgres happens to accept 'yes' and 'no', so the two
        // filtered cases worked and the state the screen ALWAYS OPENS
        // IN did not. The live list already maps this to a real boolean
        // before it queries; the export did not.
        if (active === "yes") q = q.eq("is_active", true);
        else if (active === "no") q = q.eq("is_active", false);
        // ...and the same row the table hides. The list excludes the
        // person doing the looking; the file carried them.
        if (me?.user_id) q = q.neq("user_id", me.user_id);
        if (debounced && debounced.trim().length > 0) {
          const term = safeIlikeTerm(debounced);
          if (term.length > 0) {
            q = q.or(`full_name.ilike."*${term}*",email.ilike."*${term}*"`);
          }
        }
        const { data: page, error: pageErr } = await q
          .order("created_at", { ascending: false })
          // AND A UNIQUE TIEBREAKER. Postgres gives no defined order
          // among rows sharing a created_at — a batch of invite-accepts
          // lands in the same second — so a row on the 1,000 boundary
          // could appear twice or vanish. useUsers adds this for exactly
          // that reason, and the same fault was fixed in the stats page
          // walk earlier today.
          .order("id", { ascending: true })
          .range(from, from + PAGE - 1);
        if (pageErr) throw pageErr;
        rows.push(...(page ?? []));
        if ((page ?? []).length < PAGE) break;
      }
      // The typed field accessors above make json2csv infer a stricter
      // row type than `unknown[]`; the rows are plain objects.
      const data = rows as Record<string, unknown>[];
      const parser = new Parser(opts);
      const csv = parser.parse(data);
      downloadCsv(csv, `${kind}s.csv`);
    } catch (err) {
      toast.error("Unable to export users", {
        description: err instanceof Error ? err.message : "Export failed.",
      });
    } finally {
      setDownloadingCSV(false);
    }
  };

  const openDetails = (profile: Profile) => {
    setSelectedProfile(profile);
    setDetailsOpen(true);
  };
  const openCreateSubscription = (advId: string) => {
    setAdvertiserId(advId);
    setSubscriptionOpen(true);
  };
  const openCommission = (adv: Advertiser | undefined) => {
    if (!adv) return;
    setCommissionAdvertiser(adv);
    setCommissionOpen(true);
  };

  return (
    <div
      className="psmview"
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
    >
      <div className="mitabs" role="tablist" aria-label="People">
        {(
          [
            {
              key: "advertiser" as const,
              label: "Advertisers",
              short: "Advertisers",
              count: kindCounts?.advertiser,
            },
            {
              key: "affiliate" as const,
              label: "Affiliates",
              short: "Affiliates",
              count: kindCounts?.affiliate,
            },
          ]
        ).map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={kind === t.key}
            className={"mitab" + (kind === t.key ? " on" : "")}
            onClick={() => setKind(t.key)}
          >
            <span className="milong">{t.label}</span>
            <span className="mishort">{t.short}</span>
            {t.count === undefined ? null : (
              <em>{t.count === null ? "—" : t.count}</em>
            )}
          </button>
        ))}
      </div>

      <div className="phead phead-actions">
        <div className="ptxt">
          <h1>{isAffiliateTab ? "Affiliates" : "Advertisers"}</h1>
          <p>
            {isAffiliateTab
              ? "Who refers, what they have earned."
              : "Plans, money and status."}
          </p>
          {kindCounts ? (
            <p className="subcounts">
              {(() => {
                const total = isAffiliateTab
                  ? kindCounts.affiliate
                  : kindCounts.advertiser;
                const on = isAffiliateTab
                  ? kindCounts.affiliateOn
                  : kindCounts.advertiserOn;
                const off =
                  total === null || on === null ? null : total - on;
                return (
                  <>
                    <span className="on">{on === null ? "—" : on} active</span>
                    {off ? <span>{off} deactivated</span> : null}
                  </>
                );
              })()}
            </p>
          ) : null}
        </div>
      </div>

      <div className="fbar">
        <label className="fsr">
          <Search />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or email…"
          />
        </label>
        <PsmSortFilter
          sort={sort}
          onSortChange={setSort}
          sortOptions={[
            { value: "newest", label: "Newest first" },
            { value: "oldest", label: "Oldest first" },
            { value: "a-z", label: "Name A → Z" },
            { value: "z-a", label: "Name Z → A" },
          ]}
          filters={[
            {
              id: "active",
              label: "Account status",
              value: active,
              onChange: setActive,
              options: [
                { value: "all", label: "All" },
                { value: "yes", label: "Active" },
                { value: "no", label: "Inactive" },
              ],
            },
          ]}
          searchActive={!!search.trim()}
          onReset={resetFilters}
        />
        <button
          className="fexp"
          onClick={handleDownload}
          disabled={downloadingCSV}
          aria-label="Download CSV"
          title="Download CSV"
        >
          {downloadingCSV ? <Loader2 className="animate-spin" /> : <FileDown />}
          <span>Download CSV</span>
        </button>
      </div>

      {isLoading ? (
        <p className="muted">Loading…</p>
      ) : isError ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            Failed to load {isAffiliateTab ? "affiliates" : "advertisers"}.{" "}
            {(error as Error)?.message ?? ""}
          </p>
        </div>
      ) : rows.length ? (
        <>
          <div className="card" style={{ padding: 0 }}>
            <div className="tblwrap">
              <table className="tbl wide">
                <thead>
                  <tr>
                    <th>{isAffiliateTab ? "Affiliate" : "Advertiser"}</th>
                    <th>{isAffiliateTab ? "Commission" : "Plan"}</th>
                    <th className="r">
                      {isAffiliateTab ? "Earnings" : "Wallet topups"}
                    </th>
                    <th>Status</th>
                    <th className="r">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((profile) => (
                    <AdvertiserRow
                      key={profile.id}
                      profile={profile}
                      onView={() => openDetails(profile)}
                      onCreateSubscription={openCreateSubscription}
                      onCommissionSetup={openCommission}
                      earningsByEmail={earningsByEmail}
                      earningsError={earningsError}
                      planBadge={
                        planBadges?.byAdvertiser?.[
                          (profile.advertiser?.[0] as { id?: string } | undefined)
                            ?.id ?? ""
                        ]
                      }
                      planBadgeDegraded={!!planBadges?.degraded}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <span className="muted" style={{ fontSize: ".85rem" }}>
              Showing {from}–{to} of {totalCount}
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="btn ghost sm"
                disabled={!hasPrev}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <button
                className="btn ghost sm"
                disabled={!hasNext}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </>
      ) : narrowed ? (
        /* "You have none" and "your filters match none" are different facts
           and have to read differently — otherwise a filter left on from
           five minutes ago looks exactly like an empty database, and the
           way out of it is not on screen. */
        <div className="card">
          {/* A FAILED PSM-NUMBER LOOKUP IS NOT "NO SUCH CUSTOMER".
              Every deep link into this screen carries ?q=PSM0005, and
              when the client-code half of the search cannot run the
              name/email half finds nothing -- which rendered as the
              customer not existing. */}
          <p className="muted" style={{ margin: 0 }}>
            {codeSearchFailed
              ? "We couldn't search by PSM number just now, only by name and email — so this may not be the whole answer."
              : `No ${isAffiliateTab ? "affiliates" : "advertisers"} match the current search or filters.`}
          </p>
          <button
            className="btn ghost sm"
            style={{ marginTop: 12 }}
            onClick={resetFilters}
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            No {isAffiliateTab ? "affiliates" : "advertisers"} yet.
          </p>
        </div>
      )}

      <UserDetailsSheet
        open={detailsOpen}
        key={selectedProfile?.id}
        profileId={(selectedProfile?.id as string) ?? null}
        onOpenChange={() => {
          setSelectedProfile(null);
          setDetailsOpen(false);
        }}
      />
      <CreateSubscriptionDialog
        open={subscriptionOpen}
        onOpenChange={(value) => {
          setSubscriptionOpen(value);
          if (!value) setAdvertiserId("");
        }}
        defaultAdvertiserId={advertiserId}
      />
      <CommissionSetupDialog
        open={commissionOpen}
        onOpenChange={(value) => {
          setCommissionOpen(value);
          if (!value) setCommissionAdvertiser(null);
        }}
        advertiser={commissionAdvertiser}
      />
    </div>
  );
}

function AdvertiserRow({
  profile,
  onView,
  planBadge,
  planBadgeDegraded,
  onCreateSubscription,
  onCommissionSetup,
  earningsByEmail,
  earningsError,
}: {
  profile: Profile;
  onView: () => void;
  planBadge?: {
    planName?: string;
    perks: string[];
    included?: number | null;
    feePct?: number | null;
  };
  /** One of the two reads behind this cell was refused. A missing perk
   *  pill would otherwise mean "no perks", and a missing plan name
   *  "no plan" -- both of which are claims. */
  planBadgeDegraded?: boolean;
  onCreateSubscription: (advertiserId: string) => void;
  onCommissionSetup: (advertiser: Advertiser | undefined) => void;
  earningsByEmail: Record<string, { eur: number; usd: number; links: number }>;
  earningsError: boolean;
}) {
  const { updateUserProfile, isPending } = useUpdateUserProfile();
  const { isSuperAdmin } = useAppContext();

  const advertiser = profile.advertiser?.[0];
  // is_active and status are separate columns and they disagree on live
  // rows. peopleStatusView settles it in one place: either saying off
  // means off.
  const status = peopleStatusView(profile.status, profile.is_active);
  const isActive = status.tone === "ok";

  const subscriptions = advertiser?.subscriptions;
  const hasSubscription = !!subscriptions?.length;
  const subscriptionStatus = hasSubscription
    ? subscriptions?.[0]?.status
    : null;
  // What the PLAN is, not whether it is active. The cell used to render the
  // subscription's status as a green "Active" pill, directly above the
  // account's status as an identical green "Active" pill — two pills, same
  // word, same colour, adjacent, about two different things. An amount can
  // never be mistaken for an account status.
  const sub0 = subscriptions?.[0] as
    | { status?: string; amount?: number | string | null; currency?: string | null }
    | undefined;
  const planAmount =
    sub0?.amount != null && Number.isFinite(Number(sub0.amount))
      ? `${(sub0.currency ?? "EUR").toUpperCase() === "USD" ? "$" : "€"}${Number(sub0.amount).toFixed(0)} / mo`
      : null;

  const planName = planBadge?.planName ?? null;
  // What THIS customer's row says, which is what they are actually
  // charged -- not the template the badge is named after.
  const planIncluded = planBadge?.included ?? null;
  const planFeePct = planBadge?.feePct ?? null;
  // One pill, however many perks: a row is not the place for a list, and
  // "3 perks" with the names on hover is honest about there being more.
  const perks = planBadge?.perks ?? [];
  const perkLabel =
    perks.length === 0 ? null : perks.length === 1 ? perks[0] : `${perks.length} perks`;
  const perkTitle = perks.join(" · ");

  const commissionType = advertiser?.commission_type
    ? COMMISSION_TYPE_LABELS[advertiser.commission_type] ??
      advertiser.commission_type
    : null;

  const topupTotals = useMemo(
    () => getCompletedWalletTopupTotals(advertiser?.wallet_topups),
    [advertiser],
  );

  // ── Deactivating is not just an access switch ───────────────────────
  // updateUserProfile ALSO bulk-writes every one of this advertiser's
  // subscriptions to 'inactive' (actions/admin-actions.ts) — and
  // reactivating writes only the profile back, so nothing restores them.
  // One click therefore removes access AND silently ends the recurring
  // billing, and the Activate button that appears next does not undo it.
  // The admins table already asks before its equivalent; this did not.
  const [askDeactivate, setAskDeactivate] = useState(false);
  const [askActivate, setAskActivate] = useState(false);

  const toggleStatus = () => {
    updateUserProfile(
      {
        userId: profile.id,
        data: {
          status: isActive ? "inactive" : "active",
          is_active: !isActive,
        },
      },
      {
        onSuccess: () =>
          toast.success(
            `User has been ${isActive ? "deactivated" : "activated"} successfully`,
          ),
        // Both ways: the dialog stays up with its busy label until the
        // write resolves, and then closes -- including on a failure, so
        // the red toast is not left behind a modal.
        onSettled: () => {
          setAskDeactivate(false);
          setAskActivate(false);
        },
      },
    );
  };

  // ── AN ERASURE REQUEST IS NOT A SWITCHED-OFF CUSTOMER ────────────
  //
  // account_deletion_decide writes status='pending_erasure' with
  // is_active=false, and the status helper reads is_active alone -- so
  // the row flipped to an ordinary "Activate" button whose confirmation
  // talks about access and subscriptions and never mentions that this
  // person asked us to delete their account. One press signs them back
  // in and restarts the monthly charge.
  const erasureRequested =
    String(profile.status ?? "").toLowerCase() === "pending_erasure";

  const askToggle = () => {
    // Reactivating is NOT harmless any more. It used to write only the
    // profile, which is why it skipped the question — and that was the
    // bug: the subscriptions stayed inactive and the customer was never
    // invoiced again. Now it puts them back on, so it restarts a
    // recurring charge, and that is not something to do on one click
    // without saying so.
    if (!isActive) {
      setAskActivate(true);
      return;
    }
    setAskDeactivate(true);
  };

  const stop = (fn: () => void) => (e: MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  // ── A CLOSING DIALOG MUST NOT OPEN THE DRAWER BEHIND IT ───────────
  //
  // The row is clickable, and the confirmation portals to the body on
  // top of it. When it closed, the pointer-up landed on the card
  // underneath and the details drawer opened -- so every deactivation
  // ended with a panel the admin had not asked for, showing the status
  // from before the write. Whichever way the dialog closes, ignore the
  // row for a moment after.
  const muteRow = useRef(0);
  const closeGuard = () => {
    muteRow.current = Date.now() + 450;
  };
  const onRowClick = () => {
    if (Date.now() < muteRow.current) return;
    onView();
  };

  const clientCode = advertiser?.tenant_client_code ?? "";
  const isAffiliate = (profile.role ?? "").toLowerCase() === "affiliate";
  const earnings =
    earningsByEmail[(profile.email ?? "").trim().toLowerCase()] ?? {
      eur: 0,
      usd: 0,
      links: 0,
    };

  return (
    <tr style={{ cursor: "pointer" }} onClick={onRowClick}>
      {/* .fullcell: on a phone this stacks under its label at full width
          instead of being squeezed into the right-hand value column, where
          an avatar plus a name plus an email wrapped into three differently
          aligned lines and read as broken. */}
      <td data-label="Advertiser" className="fullcell">
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          {/* THE FACE IS THE PERSON, not the row.
              This was `ci ${TONES[i % 4]}` — a colour picked from the
              row's INDEX, so the same customer changed colour the moment
              the list was sorted or filtered, which is the opposite of
              what a coloured chip is for. The avatar is generated from
              the profile id, so it is the same picture here, in the
              top-up queue and in their own header; and the hue family
              says advertiser or affiliate without reading a word.
              Drawn locally — see lib/pure-avatar.ts for why not an
              avatar service. */}
          <PsmAvatar
            seed={profile.id}
            name={profile.full_name}
            email={profile.email}
            role={isAffiliate ? "affiliate" : "advertiser"}
            size={36}
          />
          {/* Code first, name under it. The desk works in client codes —
              they are on the invoice, they prefix every payment reference,
              and they are unique where a name is not. Scanning a list for
              PSM0002 while the codes are set as small grey subtitles means
              reading the quiet line instead of the loud one.
              The email is not here: it pushed this to a third line on every
              row and is one tap away in Details, where it can be copied. */}
          <CustomerName
            clientCode={advertiser?.tenant_client_code}
            name={profile.full_name}
            full
          />
        </div>
      </td>
      <td data-label="Plan">
        {hasSubscription ? (
          <div>
            {/* The amount leads, because that is what a plan IS. A status
                word here was indistinguishable from the account status pill
                one row below it — same word, same green. A non-active plan
                still needs saying, so it keeps a pill, but only when it is
                NOT the ordinary case. */}
            {planAmount ? (
              <div style={{ fontWeight: 700 }}>{planAmount}</div>
            ) : (
              <div style={{ fontWeight: 700 }}>Subscribed</div>
            )}
            {/* THE PLAN'S NAME, WHICH IS WHAT AN ADMIN ASKS FOR.
                "EUR 150 / mo" says what it costs and not which plan it
                is, so two customers on different plans at the same price
                were indistinguishable. */}
            {planName ? (
              <div className="muted" style={{ fontSize: ".76rem", marginTop: 2 }}>
                {planName}
                {/* AND WHAT THIS CUSTOMER'S OWN ROW SAYS. The name alone
                    implied the template's terms, and three of the five
                    live rows disagree with the plan they are named
                    after. This is the line an admin reads to answer
                    "does their next ad account cost EUR 50, and what do
                    we charge on their top-ups?" */}
                {planIncluded != null || planFeePct != null ? (
                  <>
                    {" · "}
                    {planIncluded != null ? `${planIncluded} incl` : null}
                    {planIncluded != null && planFeePct != null ? " · " : null}
                    {planFeePct != null ? `${planFeePct}%` : null}
                  </>
                ) : null}
              </div>
            ) : planBadgeDegraded ? (
              <div className="muted" style={{ fontSize: ".76rem", marginTop: 2 }}>
                plan could not be read
              </div>
            ) : null}
            {/* Never the bare word "Inactive": that is the customer's
                word, one row below, and the two were being read as one. */}
            {planStatusLabel(subscriptionStatus) && (
              <span className="badge pend" style={{ marginTop: 4 }}>
                {planStatusLabel(subscriptionStatus)}
              </span>
            )}
            {!perkLabel && planBadgeDegraded ? (
              <span
                className="badge"
                style={{ marginTop: 4 }}
                title="We couldn't read this customer's perks — this is NOT 'they have none'."
              >
                perks ?
              </span>
            ) : null}
            {perkLabel ? (
              <span
                className="badge info"
                style={{ marginTop: 4, marginLeft: planStatusLabel(subscriptionStatus) ? 4 : 0 }}
                title={perkTitle}
              >
                {perkLabel}
              </span>
            ) : null}
            {commissionType && (
              <div
                className="muted"
                style={{ fontSize: ".76rem", marginTop: 4 }}
              >
                {commissionType}
              </div>
            )}
          </div>
        ) : advertiser ? (
          /* createSubscriptionAsAdmin is owner-only on the server
             ("Only the account owner can start, stop or price a
             subscription"), and this page is requireAdmin — so for an
             employee admin this opened a dialog, took a monthly figure,
             and ended in a red toast. */
          isSuperAdmin ? (
            <button
              className="btn ghost sm"
              onClick={stop(() => onCreateSubscription(advertiser.id))}
            >
              <Plus /> Subscription
            </button>
          ) : null
        ) : isAffiliate ? (
          /* An affiliate has no advertiser record because an affiliate does
             not buy anything — that is the normal shape of the row, not a
             fault, and a red badge on it read as an alarm for every affiliate
             in the list. The PLAN column answers "which plan", so it says
             which: none, and why. */
          <span className="muted" style={{ fontSize: ".86rem" }}>
            Affiliate — no plan
          </span>
        ) : (
          /* An ADVERTISER with no advertisers row is a different story: no
             wallet, no ad accounts, no subscription possible. Still stated
             plainly in the plan column rather than shouted, with the
             consequence in the tooltip. The Subscription button used to sit
             here disabled and silent, which is what "the subscription button
             doesn't work" turned out to be. */
          <span
            className="muted"
            style={{ fontSize: ".86rem" }}
            title="This profile has no advertiser record, so it has no wallet, no ad accounts and cannot hold a subscription. It needs fixing before anything can be billed."
          >
            No plan
          </span>
        )}
      </td>
      {/* An affiliate has no wallet and never tops one up — showing them
          "WALLET TOPUPS €0.00" was a column of zeros that could never be
          anything else. What they DO have is earnings, and that is the
          number the desk wants next to their name. So the cell reports
          whichever one the row actually has. */}
      {isAffiliate ? (
        <td data-label="Earnings" className="r mono">
          {earningsError ? (
            <span className="muted" title="Earnings could not be read">
              —
            </span>
          ) : (
            <>
              <div>{formatCurrency(earnings.eur, "EUR")}</div>
              <div style={{ color: "var(--faint)" }}>
                {formatCurrency(earnings.usd, "USD")}
              </div>
            </>
          )}
        </td>
      ) : (
        <td data-label="Wallet Topups" className="r mono">
          <div>{formatCurrency(topupTotals.eur, "EUR")}</div>
          <div style={{ color: "var(--faint)" }}>
            {formatCurrency(topupTotals.usd, "USD")}
          </div>
        </td>
      )}
      <td data-label="Status">
        {/* One pill, from lib/pure-people-status, so an advertiser, an
            affiliate and an admin are drawn identically -- and a
            deliberately switched-off customer is grey rather than the
            red that meant "something went wrong". */}
        <span className={status.cls}>{status.label}</span>
      </td>
      {/* .actrow keeps all four on ONE row at every width by letting them
          shrink together — a 3+1 wrap reads as an accident, and the odd one
          out looks like it belongs to the row below. Under 420px the labels
          give way to the icons, which is the only honest way to fit four
          controls in 340px without shrinking the tap target. */}
      <td data-label="Actions" className="r fullcell">
        <div className="actrow">
          <button className="btn ghost sm" onClick={stop(onView)} title="Details">
            <Eye /> <span className="alab">Details</span>
          </button>
          {/* Straight to this advertiser's ad accounts, pre-filtered by the
              client code — the same string the accounts search matches on.
              It was two screens and a retyped code away, and "show me
              everything this customer runs" is the question the desk asks
              most. Disabled without a code, because the filter would then
              land on the whole table and look like their accounts. */}
          <Link
            className={`btn ghost sm${clientCode ? "" : " disabled"}`}
            href={
              clientCode
                ? `/accounts?q=${encodeURIComponent(clientCode)}`
                : "/accounts"
            }
            onClick={(e) => {
              e.stopPropagation();
              if (!clientCode) e.preventDefault();
            }}
            aria-disabled={!clientCode}
            title={
              clientCode
                ? "Ad accounts"
                : "No client code yet — nothing to filter by"
            }
          >
            <Monitor /> <span className="alab">Accounts</span>
          </Link>
          {/* COMMISSION NEEDS AN ADVERTISER ROW, and an affiliate has
              none by design — the Plan cell on this same row prints
              "Affiliate — no plan" for exactly that reason. The handler
              bails on a missing row, and stop() kills the row click
              first, so on the whole Affiliates tab this button did
              absolutely nothing: not even open the details sheet. Same
              on any advertiser profile whose advertisers row is missing.
              Disabled and explained, like the Accounts link above it. */}
          <button
            className="btn ghost sm"
            disabled={!advertiser}
            onClick={stop(() => {
              if (advertiser) onCommissionSetup(advertiser);
            })}
            title={
              advertiser
                ? "Commission"
                : "Commission terms live on the advertiser record, and this profile has none"
            }
          >
            <HandCoins /> <span className="alab">Commission</span>
          </button>
          {/* Tinted when it is the destructive direction. On a phone this
              is the one control in the row that shows its glyph alone —
              there is not enough width for a fourth word — and an unnamed
              grey icon beside three named ones reads as a button that
              failed to render. Tinted, it reads as the stop control, which
              is what it is. Activating is not destructive and stays plain. */}
          <button
            /* keeplab: the card layout hides the fourth control's label
               to fit four on a phone, and this is the fourth — so the one
               button that switches a paying customer off was a bare glyph
               beside three named ones, identified only by a title a phone
               never shows. It keeps its word; the other three give theirs
               up. */
            /* A ghost button in danger ink on a white card is a red
               word and nothing else -- on the phone screenshot it read
               as a label, not a control. It keeps a visible edge and a
               tint so it is plainly a button, which matters most for
               the one button that switches a paying customer off. */
            className={
              "btn sm keeplab" + (isActive ? " danger soft" : " ghost")
            }
            disabled={isPending || (!isActive && erasureRequested)}
            onClick={stop(askToggle)}
            title={isActive ? "Deactivate" : "Activate"}
          >
            {isPending ? (
              <Loader2 className="animate-spin" />
            ) : isActive ? (
              <UserX />
            ) : (
              <UserCheck />
            )}
            <span className="alab">{isActive ? "Deactivate" : "Activate"}</span>
          </button>
          {/* The reason, on screen. A disabled button dispatches no
              events, so a title never reaches a phone at all -- and
              this is the one that would sign a customer who asked to be
              deleted back in and restart their monthly charge. */}
          {!isActive && erasureRequested ? (
            <span
              className="muted"
              style={{
                display: "block",
                fontSize: ".72rem",
                lineHeight: 1.35,
                marginTop: 4,
                maxWidth: "26ch",
              }}
            >
              They asked us to delete their account. Switching them back on
              is not a button — handle it in their Details.
            </span>
          ) : null}

          {/* Inside the cell: a <tr> may not have a non-<tr> sibling, and
              the dialog portals to the body regardless. */}
      <ConfirmModal
        open={askDeactivate}
        onOpenChange={(next) => {
          if (!next) { closeGuard(); setAskDeactivate(false); }
        }}
        title="Deactivate this customer?"
        /* THIS NAMED THE ONE CONSEQUENCE THAT IS FALSE AND OMITTED THE
           TWO THAT ARE TRUE. Deactivating writes every subscription to
           `inactive`, which stops NEW invoices being raised — but the
           auto-debit loop filters only on `<> 'cancelled'`, so an invoice
           already issued is still taken out of the switched-off
           customer's wallet on its due date. And when that debit
           succeeds, the paid-invoice trigger sets the subscription back
           to `active` and rolls the period forward, so billing resumes
           monthly for somebody who cannot log in to see it.

           Nothing in the app writes `cancelled`, which is the only status
           the billing run treats as terminal. Until that is fixed in SQL,
           the least this screen can do is stop promising the opposite. */
        /* REWRITTEN, because the thing it warned about is fixed. The
           debit pass now skips a subscription whose owner is switched
           off, and the paid-invoice trigger no longer turns a terminal
           subscription back on. Warning an admin off a safe action and
           sending them to do a check that no longer matters is its own
           kind of wrong — and it left the one real consequence unsaid. */
        lead="They lose access immediately, their subscriptions stop, and nothing further is taken from their wallet — an invoice already issued is no longer collected while they are switched off. Switching them back on restarts the monthly charge; it will ask you first."
        cta="Yes, deactivate"
        busy={isPending}
        busyLabel="Saving…"
        tone="danger"
        onConfirm={() => {
          closeGuard();
          setAskDeactivate(false);
          toggleStatus();
        }}
      >
        <ConfirmFact
          label="Customer"
          value={profile.advertiser?.[0]?.tenant_client_code ?? profile.email ?? "—"}
        />
        <ConfirmFact label="Also stops" value="Their subscriptions" strong />
      </ConfirmModal>

      <ConfirmModal
        open={askActivate}
        onOpenChange={(next) => {
          if (!next) { closeGuard(); setAskActivate(false); }
        }}
        title="Switch this customer back on?"
        lead="They get access back, and the subscriptions that were stopped when you switched them off start running again. The next invoice is raised from today, not back-dated for the time they were off — they are not charged for the months they could not use the account. A subscription you cancelled or paused deliberately stays as it is."
        cta="Yes, switch them on"
        busy={isPending}
        busyLabel="Saving…"
        onConfirm={() => {
          // closeGuard, like the Deactivate path two blocks up. Without
          // it the details drawer slid open unasked the moment this
          // dialog closed, showing the status from before the write.
          // And not closing here: ConfirmModal's busy holds it up until
          // the write lands, which is what busy is for.
          closeGuard();
          toggleStatus();
        }}
      >
        <ConfirmFact
          label="Customer"
          value={profile.advertiser?.[0]?.tenant_client_code ?? profile.email ?? "—"}
        />
        <ConfirmFact label="Also restarts" value="Their monthly charge" strong />
      </ConfirmModal>
        </div>
      </td>
    </tr>
  );
}
