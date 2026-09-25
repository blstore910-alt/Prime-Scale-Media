"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { recalculateCommission } from "@/actions/commission-rule-actions";
import {
  decideAdvertiserUpgrade,
  decideAffiliateApplication,
} from "@/actions/affiliate-application-actions";
import ConfirmModal, { ConfirmFact } from "@/components/ui/confirm-modal";
import { ArrowLeft, Search } from "lucide-react";
import dayjs from "dayjs";

import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";
import {
  affiliateRateLine,
  resolveCommissionRule,
  ruleLevelLabel,
  type CommissionRule,
} from "@/lib/pure-commission-rules";
import {
  useAffiliateBook,
  type AffiliateMember,
  type AffiliateSummary,
  type BookCommission,
  type BookLink,
  type MoneyByCurrency,
  type UpgradeRequest,
} from "@/hooks/use-affiliate-book";
import CommissionRulesEditor from "./commission-rules-editor";
import ReferralStatusAction from "./referral-status-action";
import PayoutQueue from "./payout-queue";
import PayoutMinimumCard from "./payout-minimum-card";

// ── THE AFFILIATE BOOK ──────────────────────────────────────────────────
//
// The owner, 2026-09-21: "first see all the affiliates, and when I click
// on one, all his referrals, and per affiliate the settings, per ad
// account type, detailed". /affiliates was one row per referral LINK, so
// an affiliate with twenty referrals was twenty rows and their total,
// their count and what is still owed were nowhere.
//
// Overview: one row per affiliate. Detail (?a=<advertiser id>): what they
// earn and where that rate comes from, every referred customer, every
// commission with its calculation, and the history of their rules.
//
// Every count and total on a card is computed from the rows listed one
// click away, from the same read -- they cannot disagree.

const DASH = "—";

function money(m: MoneyByCurrency): string {
  const legs = Object.entries(m).filter(([, v]) => Math.abs(v) >= 0.005);
  if (legs.length === 0) return formatCurrency(0, "EUR");
  // " · ", never " + ": euros and dollars are two figures, and a plus sign
  // between them invites the reader to add them up.
  return legs
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([c, v]) => formatCurrency(v, c))
    .join(" · ");
}

function statusBadge(st: string) {
  const s = (st ?? "").toLowerCase();
  if (s === "active") return <span className="badge ok">Active</span>;
  if (s === "pending") return <span className="badge pend">Pending</span>;
  if (s === "rejected") return <span className="badge due">Rejected</span>;
  return <span className="badge muted">Unknown</span>;
}

function pct(n: number | null | undefined) {
  if (n === null || n === undefined) return DASH;
  return `${Number(Number(n).toFixed(3))}%`;
}

export default function AffiliatesBook() {
  const { profile, isSuperAdmin } = useAppContext();
  const tenantId = profile?.tenant_id ?? null;
  const searchParams = useSearchParams();
  const selected = searchParams?.get("a") ?? null;
  const book = useAffiliateBook(tenantId);

  const [editor, setEditor] = useState<
    | { open: false }
    | { open: true; affiliate: { id: string; label: string } | null; approving?: boolean }
  >({ open: false });

  if (!profile) {
    return (
      <div className="psmview">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  const data = book.data;

  return (
    <div className="psmview" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {book.isLoading ? (
        <p className="muted">Loading…</p>
      ) : book.isError || !data ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            We couldn&apos;t load the affiliates. This is not an empty list —{" "}
            {(book.error as Error)?.message ?? "reload and try again"}.
          </p>
        </div>
      ) : selected ? (
        <AffiliateDetail
          advertiserId={selected}
          summary={data.affiliates.find((a) => a.affiliateId === selected) ?? null}
          rules={data.rules}
          rulesMissing={data.rulesMissing}
          calcMissing={data.calcMissing}
          types={data.types}
          canEdit={isSuperAdmin}
          onEdit={(label) => setEditor({ open: true, affiliate: { id: selected, label } })}
        />
      ) : (
        <Overview
          onApproveApplication={(m) =>
            setEditor({
              open: true,
              affiliate: {
                id: m.advertiserId,
                label: [m.name, m.code].filter(Boolean).join(" · ") || "this advertiser",
              },
              approving: true,
            })
          }
          affiliates={data.affiliates}
          members={data.members}
          rules={data.rules}
          upgrades={data.upgrades}
          rulesMissing={data.rulesMissing}
          linkStatusUnknown={data.linkStatusUnknown}
          tenantId={tenantId}
          canDecide={isSuperAdmin}
          onDefaults={() => setEditor({ open: true, affiliate: null })}
        />
      )}

      {data ? (
        <CommissionRulesEditor
          open={editor.open}
          onOpenChange={(open) => {
            if (!open) setEditor({ open: false });
          }}
          affiliate={editor.open ? editor.affiliate : null}
          rules={data.rules}
          types={data.types}
          canEdit={isSuperAdmin}
          notSwitchedOn={data.rulesMissing}
          approve={
            editor.open && editor.approving && editor.affiliate
              ? {
                  onApprove: async () => {
                    const res = await decideAffiliateApplication(editor.affiliate!.id, true, null);
                    if (!res.ok) throw new Error(res.error);
                  },
                }
              : undefined
          }
        />
      ) : null}
    </div>
  );
}

function RulesMissingNotice() {
  return (
    <div className="card" style={{ padding: "12px 16px" }}>
      <p className="muted" style={{ margin: 0 }}>
        Earning rules are not switched on in the database yet, so they can be
        read here but not saved. Until then commission is booked the old way.
      </p>
    </div>
  );
}

// ── WAITING FOR YOU ─────────────────────────────────────────────────────
//
// Two things only the owner can answer, in one list with one count: people
// who asked to become an affiliate, and customers who signed up through
// somebody's link and wait for approval. The count in the heading is the
// number of rows under it.
function WaitingForYou({
  applications,
  upgrades,
  pending,
  rules,
  canDecide,
  onApproveApplication,
  statusUnknown,
}: {
  applications: AffiliateMember[];
  upgrades: UpgradeRequest[];
  pending: { link: BookLink; affiliate: AffiliateSummary }[];
  /** For the approve confirmation: what the affiliate is ACTUALLY paid,
   *  resolved from commission_rules rather than the link column. */
  rules: CommissionRule[];
  canDecide: boolean;
  onApproveApplication: (m: AffiliateMember) => void;
  /** The referral-link statuses could not be read: the list may be short. */
  statusUnknown?: boolean;
}) {
  const n = applications.length + upgrades.length + pending.length;
  if (n === 0 && !statusUnknown) return null;
  if (n === 0 && statusUnknown) {
    return (
      <div className="card">
        <h2>Waiting for you</h2>
        <p className="cap" style={{ margin: "6px 0 0" }}>
          We couldn&apos;t read which referrals are waiting for approval —
          this is not &ldquo;none&rdquo;. Reload to try again.
        </p>
      </div>
    );
  }
  return (
    <div className="card" style={{ padding: 0 }}>
      <div style={{ padding: "16px 18px 6px" }}>
        <h2>Waiting for you ({n})</h2>
        <p className="cap" style={{ margin: "4px 0 8px" }}>
          People who asked to become an affiliate, and customers who signed up
          through somebody&apos;s link. Approving a customer also books what
          they already did since signing up, with the rules as they are now.
        </p>
      </div>
      <div className="tblwrap">
        <table className="tbl wide">
          <thead>
            <tr>
              <th>Who</th>
              <th>What</th>
              <th>Since</th>
              <th className="r">Decide</th>
            </tr>
          </thead>
          <tbody>
            {applications.map((m) => (
              <tr key={`app-${m.advertiserId}`}>
                <td data-label="Who">
                  <div style={{ fontWeight: 700 }}>
                    {m.name || DASH}{" "}
                    <span className="mono muted" style={{ fontSize: ".78rem" }}>
                      {m.code}
                    </span>
                  </div>
                  <div className="muted" style={{ fontSize: ".8rem" }}>
                    {m.email || DASH}
                  </div>
                </td>
                <td data-label="What">Wants to become an affiliate</td>
                <td data-label="Since">
                  {m.appliedAt ? dayjs(m.appliedAt).format("D MMM YYYY") : DASH}
                </td>
                <td className="r" data-label="Decide">
                  {canDecide ? (
                    <ApplicationDecision member={m} onApprove={() => onApproveApplication(m)} />
                  ) : (
                    <span className="badge pend">Waiting for the owner</span>
                  )}
                </td>
              </tr>
            ))}
            {upgrades.map((u) => (
              <tr key={`upg-${u.advertiserId}`}>
                <td data-label="Who">
                  <div style={{ fontWeight: 700 }}>
                    {u.name || DASH}{" "}
                    <span className="mono muted" style={{ fontSize: ".78rem" }}>
                      {u.code}
                    </span>
                  </div>
                  <div className="muted" style={{ fontSize: ".8rem" }}>
                    {u.email || DASH}
                  </div>
                </td>
                <td data-label="What">Affiliate who wants to advertise too</td>
                <td data-label="Since">{dayjs(u.requestedAt).format("D MMM YYYY")}</td>
                <td className="r" data-label="Decide">
                  {canDecide ? (
                    <UpgradeDecision
                      advertiserId={u.advertiserId}
                      who={[u.name, u.code].filter(Boolean).join(" · ") || "—"}
                      canRefuse
                    />
                  ) : (
                    <span className="badge pend">Waiting for the owner</span>
                  )}
                </td>
              </tr>
            ))}
            {pending.map(({ link: l, affiliate: a }) => (
              <tr key={`ref-${l.id}`}>
                <td data-label="Who">
                  <div style={{ fontWeight: 700 }}>
                    {l.referred_advertiser_name || DASH}{" "}
                    <span className="mono muted" style={{ fontSize: ".78rem" }}>
                      {l.referred_advertiser_tenant_client_code}
                    </span>
                  </div>
                  <div className="muted" style={{ fontSize: ".8rem" }}>
                    {l.referred_advertiser_email || DASH}
                  </div>
                </td>
                <td data-label="What">
                  Signed up through {a.name || a.code || "an affiliate"}{" "}
                  <span className="mono muted" style={{ fontSize: ".78rem" }}>
                    {a.name ? a.code : ""}
                  </span>
                </td>
                <td data-label="Since">{dayjs(l.created_at).format("D MMM YYYY")}</td>
                <td className="r" data-label="Decide">
                  {canDecide ? (
                    <ReferralStatusAction
                      referralLinkId={l.id}
                      status={l.status}
                      rateLine={affiliateRateLine(rules, a.affiliateId)}
                      affiliateName={[a.name, a.code].filter(Boolean).join(" · ") || null}
                      referredName={
                        [l.referred_advertiser_name, l.referred_advertiser_tenant_client_code]
                          .filter(Boolean)
                          .join(" · ") || null
                      }
                    />
                  ) : (
                    <span className="badge pend">Waiting for the owner</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Advertiser mode for an affiliate account: the same login, code, wallet
// and referrals, with the advertiser app on top. Answering a request can
// refuse (with a reason they are told); switching it on from their page
// cannot -- there is nothing to refuse.
function UpgradeDecision({
  advertiserId,
  who,
  canRefuse,
}: {
  advertiserId: string;
  who: string;
  canRefuse: boolean;
}) {
  const queryClient = useQueryClient();
  const [asking, setAsking] = useState<"approve" | "refuse" | null>(null);
  const [reason, setReason] = useState("");

  const decide = useMutation({
    mutationFn: async (approve: boolean) => {
      const res = await decideAdvertiserUpgrade(advertiserId, approve, approve ? null : reason);
      if (!res.ok) throw new Error(res.error);
      return approve;
    },
    onSuccess: (approve) => {
      queryClient.invalidateQueries({ queryKey: ["affiliate-book"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["affiliate-who", advertiserId] });
      setReason("");
      toast.success(approve ? "Advertiser mode is on" : "Request refused", {
        description: approve
          ? "Next time they open the app they get the advertiser dashboard, with their referrals still in it."
          : "They see your reason in their affiliate portal.",
      });
    },
    onError: (e: Error) => toast.error("Couldn't save that", { description: e.message }),
  });

  return (
    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
      {canRefuse ? (
        <button className="btn ghost sm" disabled={decide.isPending} onClick={() => setAsking("refuse")}>
          Refuse
        </button>
      ) : null}
      <button className="btn sm" disabled={decide.isPending} onClick={() => setAsking("approve")}>
        {decide.isPending ? "…" : canRefuse ? "Approve" : "Turn on advertiser mode"}
      </button>
      <ConfirmModal
        open={!!asking}
        onOpenChange={(next) => {
          if (!next && !decide.isPending) setAsking(null);
        }}
        title={asking === "refuse" ? "Refuse this request?" : "Let them advertise too?"}
        lead={
          asking === "refuse"
            ? "They are told, with your reason, and can ask again later."
            : "Their account becomes an advertiser account: same login, same code, same wallet, and their referrals and earnings stay. They set up their company and plan like any new advertiser."
        }
        cta={asking === "refuse" ? "Yes, refuse" : "Yes, turn it on"}
        tone={asking === "refuse" ? "danger" : undefined}
        busy={decide.isPending}
        busyLabel="Saving…"
        disabled={asking === "refuse" && !reason.trim()}
        onConfirm={() => {
          if (asking) decide.mutate(asking === "approve");
          setAsking(null);
        }}
      >
        <ConfirmFact label="Affiliate" value={who} />
        {asking === "refuse" ? (
          <label style={{ display: "grid", gap: 6, marginTop: 10, fontSize: ".86rem" }}>
            <span style={{ fontWeight: 600 }}>Why (they see this)</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="e.g. let's talk first — message us on WhatsApp"
              style={{
                border: "1px solid var(--line-2, #e5e7eb)",
                borderRadius: 10,
                padding: "8px 10px",
                font: "inherit",
                resize: "vertical",
              }}
            />
          </label>
        ) : null}
      </ConfirmModal>
    </div>
  );
}

function ApplicationDecision({
  member,
  onApprove,
}: {
  member: AffiliateMember;
  /** Opens the rules, prefilled with the defaults; approving happens there. */
  onApprove: () => void;
}) {
  const queryClient = useQueryClient();
  const [asking, setAsking] = useState<"approve" | "refuse" | null>(null);
  const [reason, setReason] = useState("");

  const decide = useMutation({
    mutationFn: async (approve: boolean) => {
      const res = await decideAffiliateApplication(member.advertiserId, approve, approve ? null : reason);
      if (!res.ok) throw new Error(res.error);
      return approve;
    },
    onSuccess: (approve) => {
      queryClient.invalidateQueries({ queryKey: ["affiliate-book"], exact: false });
      setReason("");
      toast.success(approve ? "Affiliate approved" : "Application refused", {
        description: approve
          ? "Their referral link is on, with the default rules. Open them to give them their own."
          : "They see your reason on their Referrals page.",
      });
    },
    onError: (e: Error) => toast.error("Couldn't save that", { description: e.message }),
  });

  const who = [member.name, member.code].filter(Boolean).join(" · ") || "—";

  return (
    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
      <button className="btn ghost sm" disabled={decide.isPending} onClick={() => setAsking("refuse")}>
        Refuse
      </button>
      <button className="btn sm" disabled={decide.isPending} onClick={onApprove}>
        {decide.isPending ? "…" : "Approve"}
      </button>
      <ConfirmModal
        open={!!asking}
        onOpenChange={(next) => {
          if (!next && !decide.isPending) setAsking(null);
        }}
        title={asking === "refuse" ? "Refuse this application?" : "Make them an affiliate?"}
        lead={
          asking === "refuse"
            ? "They are told, with your reason, and can apply again later."
            : "Their referral link switches on with the default rules. Everyone who signs up through it waits here for your approval."
        }
        cta={asking === "refuse" ? "Yes, refuse" : "Yes, approve"}
        tone={asking === "refuse" ? "danger" : undefined}
        busy={decide.isPending}
        busyLabel="Saving…"
        disabled={asking === "refuse" && !reason.trim()}
        onConfirm={() => {
          if (asking) decide.mutate(asking === "approve");
          setAsking(null);
        }}
      >
        <ConfirmFact label="Advertiser" value={who} />
        {asking === "refuse" ? (
          <label style={{ display: "grid", gap: 6, marginTop: 10, fontSize: ".86rem" }}>
            <span style={{ fontWeight: 600 }}>Why (they see this)</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="e.g. we are not taking new affiliates this month"
              style={{
                border: "1px solid var(--line-2, #e5e7eb)",
                borderRadius: 10,
                padding: "8px 10px",
                font: "inherit",
                resize: "vertical",
              }}
            />
          </label>
        ) : null}
      </ConfirmModal>
    </div>
  );
}

function Overview({
  affiliates,
  members,
  upgrades,
  rules,
  rulesMissing,
  linkStatusUnknown,
  tenantId,
  canDecide,
  onDefaults,
  onApproveApplication,
}: {
  affiliates: AffiliateSummary[];
  members: AffiliateMember[];
  upgrades: UpgradeRequest[];
  /** Passed straight down to the approve confirmation. */
  rules: CommissionRule[];
  rulesMissing: boolean;
  /** The referral-link statuses could not be read. */
  linkStatusUnknown?: boolean;
  /** Cache scope for the payout queue. */
  tenantId?: string | null;
  canDecide: boolean;
  onDefaults: () => void;
  onApproveApplication: (m: AffiliateMember) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState("");
  // Owed first, biggest at the top: on this screen the question is
  // almost always "who is waiting for money".
  const [sort, setSort] = useState<{
    key: "name" | "referred" | "earned" | "owed" | "paid";
    dir: "asc" | "desc";
  }>({ key: "owed", dir: "desc" });

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    const found = !t
      ? affiliates
      : affiliates.filter((a) => {
      const own = [a.name, a.code, a.email].some((v) =>
        String(v ?? "").toLowerCase().includes(t),
      );
      const theirs = a.links.some((l) =>
        [
          l.referred_advertiser_name,
          l.referred_advertiser_tenant_client_code,
          l.referred_advertiser_email,
        ].some((v) => String(v ?? "").toLowerCase().includes(t)),
      );
      return own || theirs;
    });

    // Two currencies cannot be added, and this is a sort key, not a
    // figure anyone reads: the biggest leg decides the order, and the
    // column still prints both.
    const big = (m: MoneyByCurrency) =>
      Object.values(m ?? {}).reduce((t, v) => Math.max(t, Number(v) || 0), 0);
    const val = (a: AffiliateSummary) => {
      switch (sort.key) {
        case "referred":
          return a.referrals.total;
        case "earned":
          return big(a.earned);
        case "owed":
          return big(a.owed);
        case "paid":
          return big(a.paid);
        default:
          return 0;
      }
    };
    const out = [...found].sort((a, b) => {
      if (sort.key === "name") {
        return String(a.name ?? a.code ?? "").localeCompare(
          String(b.name ?? b.code ?? ""),
        );
      }
      return val(a) - val(b);
    });
    return sort.dir === "desc" ? out.reverse() : out;
  }, [affiliates, q, sort]);

  const toggleSort = (key: typeof sort.key) =>
    setSort((p) =>
      p.key === key
        ? { key, dir: p.dir === "desc" ? "asc" : "desc" }
        : // A name reads A-Z; money reads biggest first.
          { key, dir: key === "name" ? "asc" : "desc" },
    );
  const SortTh = ({
    k,
    children,
    right,
  }: {
    k: typeof sort.key;
    children: React.ReactNode;
    right?: boolean;
  }) => (
    <th className={right ? "r" : undefined}>
      <button
        type="button"
        className={`sortth${sort.key === k ? " on" : ""}`}
        onClick={() => toggleSort(k)}
        title={`Sort by ${String(children)}`}
      >
        {children}
        <span className="ar" aria-hidden="true">
          {sort.key === k ? (sort.dir === "desc" ? "\u25be" : "\u25b4") : "\u25be"}
        </span>
      </button>
    </th>
  );

  const totals = useMemo(() => {
    const earned: MoneyByCurrency = {};
    const owed: MoneyByCurrency = {};
    let referrals = 0;
    for (const a of affiliates) {
      referrals += a.referrals.total;
      for (const [c, v] of Object.entries(a.earned)) earned[c] = Math.round(((earned[c] ?? 0) + v) * 100) / 100;
      for (const [c, v] of Object.entries(a.owed)) owed[c] = Math.round(((owed[c] ?? 0) + v) * 100) / 100;
    }
    return { earned, owed, referrals };
  }, [affiliates]);

  const open = (id: string) => router.push(`${pathname}?a=${encodeURIComponent(id)}`);

  const applications = useMemo(
    () =>
      members
        .filter((m) => m.status === "applied")
        .sort((x, y) => String(x.appliedAt ?? "").localeCompare(String(y.appliedAt ?? ""))),
    [members],
  );
  const pending = useMemo(
    () =>
      affiliates
        .flatMap((a) =>
          a.links
            .filter((l) => (l.status ?? "").toLowerCase() === "pending")
            .map((l) => ({ link: l, affiliate: a })),
        )
        .sort((x, y) => x.link.created_at.localeCompare(y.link.created_at)),
    [affiliates],
  );

  return (
    <>
      <div className="phead phead-actions">
        <div className="ptxt">
          <h1>Affiliates</h1>
          <p>Who brings in customers, what they earn, and what is still owed.</p>
        </div>
        <div className="pacts">
          <button className="btn ghost sm" onClick={onDefaults}>
            Default rules
          </button>
        </div>
      </div>

      {rulesMissing ? <RulesMissingNotice /> : null}

      <WaitingForYou
        applications={applications}
        upgrades={upgrades}
        pending={pending}
        rules={rules}
        canDecide={canDecide}
        onApproveApplication={onApproveApplication}
        statusUnknown={linkStatusUnknown}
      />

      {/* Money they asked for, above the book that explains it. One row
          per request; marking it paid settles exactly the commissions it
          was built from. */}
      <PayoutQueue
        canDecide={canDecide}
        tenantId={tenantId}
        nameOf={(id) => {
          const a = affiliates.find((x) => x.affiliateId === id);
          return { name: a?.name ?? "Affiliate", code: a?.code ?? "" };
        }}
      />

      <div className="stats">
        <div className="stat">
          <div className="k">Affiliates</div>
          <div className="v">{affiliates.length}</div>
        </div>
        <div className="stat">
          <div className="k">Referred customers</div>
          <div className="v">{totals.referrals}</div>
        </div>
        <div className="stat">
          <div className="k">Earned, all time</div>
          <div className="v" style={{ fontSize: "1.15rem" }}>{money(totals.earned)}</div>
        </div>
        <div className="stat">
          <div className="k">Still owed</div>
          <div className="v" style={{ fontSize: "1.15rem" }}>{money(totals.owed)}</div>
        </div>
      </div>

      <div className="fbar">
        <label className="fsr">
          <Search />
          <input
            placeholder="Search a name, a code or an email…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        {/* What the search actually did. Without it a filter that
            matches nothing looks the same as a book with nothing in
            it. */}
        <span className="muted" style={{ fontSize: ".82rem" }}>
          {q.trim()
            ? `${rows.length} of ${affiliates.length}`
            : `${affiliates.length} ${affiliates.length === 1 ? "affiliate" : "affiliates"}`}
        </span>
        {q.trim() ? (
          <button className="btn ghost sm" onClick={() => setQ("")}>
            Clear
          </button>
        ) : null}
      </div>

      {rows.length ? (
        <div className="card" style={{ padding: 0 }}>
          <div className="tblwrap">
            <table className="tbl wide">
              <thead>
                <tr>
                  <SortTh k="name">Affiliate</SortTh>
                  <SortTh k="referred">Referred</SortTh>
                  <SortTh k="earned" right>
                    Earned
                  </SortTh>
                  <SortTh k="owed" right>
                    Owed
                  </SortTh>
                  <SortTh k="paid" right>
                    Paid
                  </SortTh>
                  <th>Rules</th>
                  {/* The whole row opens, and nothing said so. An admin
                      should not have to discover a screen by clicking at
                      it. */}
                  <th className="r" />
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr
                    key={a.affiliateId}
                    onClick={() => open(a.affiliateId)}
                    style={{ cursor: "pointer" }}
                  >
                    <td data-label="Affiliate">
                      <div style={{ fontWeight: 700 }}>
                        {a.name || DASH}{" "}
                        <span className="mono muted" style={{ fontSize: ".78rem" }}>
                          {a.code}
                        </span>
                      </div>
                      <div className="muted" style={{ fontSize: ".8rem" }}>
                        {a.email || DASH}
                      </div>
                    </td>
                    <td data-label="Referred">
                      {a.referrals.total}
                      <span className="muted" style={{ fontSize: ".8rem" }}>
                        {" "}
                        · {a.referrals.active} active
                        {a.referrals.pending ? ` · ${a.referrals.pending} pending` : ""}
                      </span>
                    </td>
                    <td className="r" data-label="Earned">{money(a.earned)}</td>
                    <td className="r" data-label="Owed">{money(a.owed)}</td>
                    <td className="r" data-label="Paid">{money(a.paid)}</td>
                    <td data-label="Rules">
                      {a.hasOwnRules ? (
                        <span className="badge info">Own rules</span>
                      ) : (
                        <span className="badge muted">Default</span>
                      )}
                    </td>
                    <td className="r" data-label="">
                      <button
                        className="btn ghost sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          open(a.affiliateId);
                        }}
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            {q.trim()
              ? `No affiliate or customer matches “${q.trim()}”.`
              : "No affiliates yet. Approve an application, or set a referrer on a customer, and they appear here."}
          </p>
        </div>
      )}
    </>
  );
}

type TopupRef = {
  id: string;
  number: number | null;
  currency: string | null;
  topup_amount: number | null;
  fee_amount: number | null;
};

function AffiliateDetail({
  advertiserId,
  summary,
  rules,
  rulesMissing,
  calcMissing,
  types,
  canEdit,
  onEdit,
}: {
  advertiserId: string;
  summary: AffiliateSummary | null;
  rules: CommissionRule[];
  rulesMissing: boolean;
  calcMissing: boolean;
  types: { slug: string; label: string; sort_order: number | null; is_active: boolean | null }[];
  canEdit: boolean;
  onEdit: (label: string) => void;
}) {
  const { profile } = useAppContext();
  const pathname = usePathname();

  // Who this is, even with no referrals yet: rules can be set up for any
  // advertiser before their first customer arrives.
  const who = useQuery({
    queryKey: ["affiliate-who", advertiserId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("advertisers")
        .select("id, tenant_id, tenant_client_code, profile:user_profiles(full_name, email, role)")
        .eq("id", advertiserId)
        .maybeSingle();
      if (error) throw error;
      type WhoProfile = { full_name: string | null; email: string | null; role?: string | null };
      return data as unknown as {
        id: string;
        tenant_id: string;
        tenant_client_code: string | null;
        profile: WhoProfile | WhoProfile[] | null;
      } | null;
    },
  });

  const [openLink, setOpenLink] = useState<string | null>(null);
  const commissions = useMemo(
    () => [...(summary?.commissions ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [summary],
  );
  const topupIds = useMemo(
    () => commissions.map((c) => c.topup_id).filter((v): v is string => !!v),
    [commissions],
  );
  const topups = useQuery({
    queryKey: ["affiliate-topup-refs", topupIds.join(",")],
    enabled: topupIds.length > 0,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("top_ups")
        .select("id, number, currency, topup_amount, fee_amount")
        .in("id", topupIds);
      if (error) throw error;
      return new Map((data as TopupRef[]).map((t) => [t.id, t]));
    },
  });

  const whoProfile = Array.isArray(who.data?.profile) ? who.data?.profile[0] : who.data?.profile;
  const name = summary?.name ?? whoProfile?.full_name ?? null;
  const code = summary?.code ?? who.data?.tenant_client_code ?? null;
  const email = summary?.email ?? whoProfile?.email ?? null;
  const label = name || code || "this affiliate";
  // isPending, NOT isLoading. react-query v5 computes isLoading as
  // `isPending && isFetching`, so a PAUSED query -- offline, a dropped
  // connection -- reports isLoading false with undefined data. This then
  // says "There is no advertiser with this link in your organisation"
  // about an affiliate that exists, disables Edit rules and hides the
  // payout-minimum card entirely. The guard one line down was written
  // for this class and only covers isError.
  const notFound = !who.isPending && !who.isError && !who.data && !summary;
  // A read that FAILED used to fall through to the full layout: four
  // tiles at 0,00, "nobody referred", "no commission" -- five confident
  // statements about somebody we could not look up.
  const lookupFailed = who.isError && !summary;
  const otherTenant = !!who.data && !!profile?.tenant_id && who.data.tenant_id !== profile.tenant_id;

  const customerOf = (linkId: string) => summary?.links.find((l) => l.id === linkId) ?? null;

  if (lookupFailed) {
    return (
      <div className="card">
        <h2>We couldn&apos;t open this affiliate</h2>
        <p className="cap" style={{ margin: "6px 0 0" }}>
          The read failed — this is not an affiliate with nothing on their
          name. Reload, and tell us if it stays away.
        </p>
      </div>
    );
  }

  const shownTypes = [...types]
    .filter((t) => t.is_active !== false)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  const effectiveRows = [
    ...shownTypes.map((t) => ({ key: `topup|${t.slug}`, title: `Top-ups · ${t.label}`, source: "topup" as const, type: t.slug as string | null })),
    { key: "subscription|*", title: "Subscriptions · every paid invoice", source: "subscription" as const, type: null as string | null },
  ].map((r) => {
    const res = resolveCommissionRule(rules, {
      affiliateAdvertiserId: advertiserId,
      source: r.source,
      typeSlug: r.type,
    });
    // "default, all types" is right for a top-up row and wrong under
    // Subscriptions, which have no types at all.
    const from =
      r.source === "subscription" && res?.level === "default-all"
        ? "default"
        : r.source === "subscription" && res?.level === "own-all"
          ? "own rule"
          : ruleLevelLabel(res?.level ?? null);
    return { ...r, pct: res?.pct ?? null, from, own: res?.level === "own-type" || res?.level === "own-all" };
  });
  const onetime = resolveCommissionRule(rules, {
    affiliateAdvertiserId: advertiserId,
    source: "onetime",
  });
  const firstTopup = resolveCommissionRule(rules, {
    affiliateAdvertiserId: advertiserId,
    source: "first_topup",
  });

  const history = rules
    .filter((r) => r.affiliate_advertiser_id === advertiserId)
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from));

  // ── HOE HET BEDRAG ONTSTOND ───────────────────────────────────────
  //
  // De eigenaar: "niet supplier maar de fee die wij moeten betalen ofzo,
  // maak subtieler en slimmer."
  //
  // Het stond als één regel met alles tussen haakjes:
  //     20% of profit EUR 0.53 (fee EUR 3.00 - supplier 2% = EUR 2.45)
  // Dat leest van links naar rechts als een som terwijl het antwoord
  // vooraan staat, en "supplier" is een woord dat niemand hoeft te lezen
  // om te snappen wat er gebeurde.
  //
  // Nu twee regels: bovenaan het deel dat telt (het percentage en waar
  // het overheen gaat), eronder stil waar dat bedrag vandaan komt --
  // wat wij rekenden, en wat wij daarvan moeten afdragen. Wij, niet een
  // leverancier: dat is de partij waar het om gaat.
  const calcLine = (c: BookCommission) => {
    const t = c.topup_id ? topups.data?.get(c.topup_id) : null;
    const cur = String(c.currency ?? "EUR").toUpperCase();
    const wrap = (top: React.ReactNode, under?: React.ReactNode) => (
      <span className="calc">
        <span className="calc-t">{top}</span>
        {under ? <span className="calc-u">{under}</span> : null}
      </span>
    );

    if ((c.source ?? "") === "onetime") {
      return wrap("Welcome bonus", "one-off, for a new customer");
    }
    if ((c.status ?? "") === "reversed") {
      return wrap("Reversed", c.note ?? undefined);
    }
    if (
      c.base_amount !== null &&
      c.base_amount !== undefined &&
      c.pct !== null &&
      c.pct !== undefined
    ) {
      const base = formatCurrency(Number(c.base_amount), cur);
      if ((c.source ?? "topup") === "subscription") {
        return wrap(`${pct(c.pct)} of ${base}`, "monthly plan, once it is paid");
      }
      const fee =
        c.fee_amount !== null && c.fee_amount !== undefined
          ? formatCurrency(Number(c.fee_amount), cur)
          : null;
      const cost =
        c.supplier_cost !== null && c.supplier_cost !== undefined
          ? formatCurrency(Number(c.supplier_cost), cur)
          : null;
      return wrap(
        `${pct(c.pct)} of ${base}`,
        fee && cost ? (
          <>
            {/* Het echte minteken, niet "\u2212": in JSX-TEKST worden
                backslash-escapes NIET verwerkt, dus dat stond letterlijk
                op het scherm. */}
            {fee} charged <span className="calc-m">{"\u2212"}</span> {cost} we
            pay
            {c.supplier_fee_pct !== null && c.supplier_fee_pct !== undefined
              ? ` (${pct(c.supplier_fee_pct)})`
              : ""}
          </>
        ) : fee ? (
          `${fee} charged`
        ) : undefined,
      );
    }
    // Geboekt vóór de winstregel bestond: een deel van wat er landde.
    if (t && t.topup_amount !== null) {
      return wrap(
        `Share of ${formatCurrency(Number(t.topup_amount), cur)}`,
        "old rule, before the profit split",
      );
    }
    return wrap(calcMissing ? "Not recorded" : DASH, calcMissing ? "old rule" : undefined);
  };

  // Dezelfde vier statussen als de commissietabel verderop, zodat een
  // opengeklapte referral en die tabel nooit iets anders zeggen over
  // dezelfde rij.
  const commissionBadge = (status: string | null | undefined) => {
    const st = String(status ?? "unpaid").toLowerCase();
    if (st === "on_hold") return <span className="badge pend">Processing</span>;
    if (st === "reversed") return <span className="badge muted">Reversed</span>;
    if (st === "paid") return <span className="badge ok">Paid</span>;
    return <span className="badge pend">Unpaid</span>;
  };

  const fromLine = (c: BookCommission): string => {
    if (c.topup_id) {
      const t = topups.data?.get(c.topup_id);
      return t?.number ? `Top-up #${String(t.number).padStart(6, "0")}` : "Top-up";
    }
    if (c.subscription_invoice_id || (c.source ?? "") === "subscription") return "Subscription invoice";
    return DASH;
  };

  return (
    <>
      <div>
        <Link href={pathname} className="muted" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: ".86rem", textDecoration: "none" }}>
          <ArrowLeft size={15} /> All affiliates
        </Link>
      </div>

      <div className="phead phead-actions">
        <div className="ptxt">
          <h1>
            {who.isPending && !summary ? "Loading…" : name || code || "Affiliate"}{" "}
            {code ? <span className="mono muted" style={{ fontSize: ".9rem" }}>{code}</span> : null}
          </h1>
          <p>{email || DASH}</p>
        </div>
        <div className="pacts">
          {canEdit && String(whoProfile?.role ?? "").toLowerCase() === "affiliate" && !otherTenant ? (
            <UpgradeDecision advertiserId={advertiserId} who={label} canRefuse={false} />
          ) : null}
          <button
            className="btn sm"
            onClick={() => onEdit(label)}
            disabled={notFound || otherTenant}
          >
            {canEdit && !rulesMissing ? "Edit rules" : "View rules"}
          </button>
        </div>
      </div>

      {notFound || otherTenant ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            There is no advertiser with this link in your organisation.
          </p>
        </div>
      ) : (
        <>
          {rulesMissing ? <RulesMissingNotice /> : null}

          <div className="stats">
            <div className="stat">
              <div className="k">Referred customers</div>
              <div className="v">{summary?.referrals.total ?? 0}</div>
            </div>
            <div className="stat">
              <div className="k">Earned, all time</div>
              <div className="v" style={{ fontSize: "1.15rem" }}>{money(summary?.earned ?? {})}</div>
            </div>
            <div className="stat">
              <div className="k">Still owed</div>
              <div className="v" style={{ fontSize: "1.15rem" }}>{money(summary?.owed ?? {})}</div>
            </div>
            <div className="stat">
              <div className="k">Paid out</div>
              <div className="v" style={{ fontSize: "1.15rem" }}>{money(summary?.paid ?? {})}</div>
            </div>
          </div>

          <PayoutMinimumCard advertiserId={advertiserId} canEdit={canEdit} />

          <div className="card" style={{ padding: 0 }}>
            <div style={{ padding: "16px 18px 6px" }}>
              <h2>What {label} earns now</h2>
              <p className="cap" style={{ margin: "4px 0 8px" }}>
                Top-ups: a share of our profit — our fee minus what the supplier
                charges us. Subscriptions: a share of every paid invoice. A new
                rule counts from the moment it is saved.
              </p>
            </div>
            <div className="tblwrap">
              <table className="tbl wide">
                <thead>
                  <tr>
                    <th>On</th>
                    <th className="r">Share</th>
                    <th>Comes from</th>
                  </tr>
                </thead>
                <tbody>
                  {effectiveRows.map((r) => (
                    <tr key={r.key}>
                      <td data-label="On">{r.title}</td>
                      <td className="r" data-label="Share" style={{ fontWeight: 700 }}>
                        {pct(r.pct)}
                      </td>
                      <td data-label="Comes from">
                        {r.own ? <span className="badge info">{r.from}</span> : <span className="muted">{r.from}</span>}
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td data-label="On">First top-up of each new customer</td>
                    <td className="r" data-label="Share" style={{ fontWeight: 700 }}>
                      {firstTopup && firstTopup.pct === 0
                        ? "No commission"
                        : firstTopup
                          ? pct(firstTopup.pct)
                          : "as above"}
                    </td>
                    <td data-label="Comes from">
                      {firstTopup ? (
                        firstTopup.level === "own-all" ? (
                          <span className="badge info">
                            own rule{firstTopup.pct === 0 ? " — the fee is ours" : ""}
                          </span>
                        ) : (
                          <span className="muted">
                            default{firstTopup.pct === 0 ? " — the fee is ours" : ""}
                          </span>
                        )
                      ) : (
                        <span className="muted">no separate rule — the type rate applies</span>
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td data-label="On">
                      One-time bonus · first top-up (or first paid plan invoice) of each new
                      customer
                    </td>
                    <td className="r" data-label="Share" style={{ fontWeight: 700 }}>
                      {onetime?.amount != null
                        ? formatCurrency(onetime.amount, onetime.currency ?? "EUR")
                        : DASH}
                    </td>
                    <td data-label="Comes from">
                      {onetime?.level === "own-all" ? (
                        <span className="badge info">own rule</span>
                      ) : (
                        <span className="muted">
                          {onetime ? "default" : ruleLevelLabel(null)}
                        </span>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="card" style={{ padding: 0 }}>
            <div style={{ padding: "16px 18px 6px" }}>
              <h2>Referred customers ({summary?.referrals.total ?? 0})</h2>
            </div>
            {summary?.links.length ? (
              <div className="tblwrap">
                <table className="tbl wide">
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Since</th>
                      <th>Status</th>
                      <th className="r">Earned from them</th>
                      <th className="r">Owed</th>
                      {/* The owner: "ik moet ook knopje hebben om
                          referral details te zien, wat hij earnt op
                          wat". The totals were here; what they were
                          made of was not. */}
                      <th className="r" />
                    </tr>
                  </thead>
                  <tbody>
                    {summary.links.map((l) => {
                      const mine = summary.commissions.filter((c) => c.referral_link_id === l.id);
                      const earned: MoneyByCurrency = {};
                      const owed: MoneyByCurrency = {};
                      for (const c of mine) {
                        const cur = String(c.currency ?? "EUR").toUpperCase();
                        const st = (c.status ?? "unpaid").toLowerCase();
                        if (st === "on_hold" || st === "reversed") continue;
                        earned[cur] = Math.round(((earned[cur] ?? 0) + Number(c.amount)) * 100) / 100;
                        if (st !== "paid") owed[cur] = Math.round(((owed[cur] ?? 0) + Number(c.amount)) * 100) / 100;
                      }
                      // NET, like the tiles above and like the affiliate's
                      // own screen: what came back off this referral is off
                      // this referral. Gross here under a netted total made
                      // the column add up to more than the card.
                      const back = l.clawbacks ?? {};
                      for (const cur of Object.keys(back)) {
                        const n = back[cur] ?? 0;
                        earned[cur] = Math.max(Math.round(((earned[cur] ?? 0) - n) * 100) / 100, 0);
                        owed[cur] = Math.max(Math.round(((owed[cur] ?? 0) - n) * 100) / 100, 0);
                      }
                      return (
                        <React.Fragment key={l.id}>
                        <tr>
                          <td data-label="Customer">
                            <div style={{ fontWeight: 700 }}>
                              {l.referred_advertiser_name || DASH}{" "}
                              <span className="mono muted" style={{ fontSize: ".78rem" }}>
                                {l.referred_advertiser_tenant_client_code}
                              </span>
                            </div>
                            <div className="muted" style={{ fontSize: ".8rem" }}>
                              {l.referred_advertiser_email || DASH}
                            </div>
                          </td>
                          <td data-label="Since">{dayjs(l.created_at).format("D MMM YYYY")}</td>
                          <td data-label="Status">
                            {l.status === "pending" ? (
                              <ReferralStatusAction
                                referralLinkId={l.id}
                                status={l.status}
                                rateLine={affiliateRateLine(
                                  rules,
                                  summary?.affiliateId ?? null,
                                )}
                                affiliateName={code}
                                referredName={l.referred_advertiser_tenant_client_code}
                              />
                            ) : (
                              statusBadge(l.status)
                            )}
                          </td>
                          <td className="r" data-label="Earned from them">{money(earned)}</td>
                          <td className="r" data-label="Owed">{money(owed)}</td>
                          <td className="r" data-label="">
                            {mine.length ? (
                              <button
                                className="btn ghost sm"
                                onClick={() =>
                                  setOpenLink((p) => (p === l.id ? null : l.id))
                                }
                                aria-expanded={openLink === l.id}
                              >
                                {openLink === l.id ? "Hide" : "Details"}
                                <span className="muted" style={{ marginLeft: 6 }}>
                                  {mine.length}
                                </span>
                              </button>
                            ) : (
                              <span className="muted" style={{ fontSize: ".8rem" }}>
                                nothing yet
                              </span>
                            )}
                          </td>
                        </tr>
                        {/* WHAT THEY EARNED IT ON. The totals were on the
                            row; what they were made of was two screens
                            away. Every commission from this one customer,
                            with the whole calculation \u2014 the fee we
                            charged, what the supplier charges us, the
                            profit and the share. This is the admin book;
                            that chain belongs here and only here. */}
                        {openLink === l.id ? (
                          <tr className="subrow">
                            <td colSpan={6} style={{ padding: 0 }}>
                              <div className="linkdet">
                                {mine
                                  .slice()
                                  .sort((a, b) =>
                                    b.created_at.localeCompare(a.created_at),
                                  )
                                  .map((c) => (
                                    <div className="linkdet-row" key={c.id}>
                                      <span className="d">
                                        {dayjs(c.created_at).format("D MMM YYYY")}
                                      </span>
                                      <span className="w">{fromLine(c)}</span>
                                      <span className="c">{calcLine(c)}</span>
                                      <span className="a">
                                        {formatCurrency(
                                          Number(c.amount),
                                          String(c.currency ?? "EUR").toUpperCase(),
                                        )}
                                      </span>
                                      <span className="s">
                                        {commissionBadge(c.status)}
                                      </span>
                                    </div>
                                  ))}
                              </div>
                            </td>
                          </tr>
                        ) : null}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted" style={{ padding: "0 18px 16px", margin: 0 }}>
                Nobody has been referred by {label} yet.
              </p>
            )}
          </div>

          <div className="card" style={{ padding: 0 }}>
            <div style={{ padding: "16px 18px 6px" }}>
              <h2>Commissions ({commissions.length})</h2>
              <p className="cap" style={{ margin: "4px 0 8px" }}>
                Every commission booked for {label}, newest first, with how it
                was calculated.
              </p>
            </div>
            {commissions.length ? (
              <div className="tblwrap">
                <table className="tbl wide">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Customer</th>
                      <th>From</th>
                      <th>Calculation</th>
                      <th className="r">Amount</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {commissions.map((c) => {
                      const l = customerOf(c.referral_link_id);
                      const st = (c.status ?? "unpaid").toLowerCase();
                      return (
                        <tr key={c.id}>
                          <td data-label="Date">{dayjs(c.created_at).format("D MMM YYYY, HH:mm")}</td>
                          <td data-label="Customer">
                            {l?.referred_advertiser_name || DASH}{" "}
                            <span className="mono muted" style={{ fontSize: ".78rem" }}>
                              {l?.referred_advertiser_tenant_client_code}
                            </span>
                          </td>
                          <td data-label="From">{fromLine(c)}</td>
                          <td data-label="Calculation" className="muted" style={{ fontSize: ".84rem" }}>
                            {calcLine(c)}
                          </td>
                          <td className="r" data-label="Amount" style={{ fontWeight: 700 }}>
                            {formatCurrency(Number(c.amount), String(c.currency ?? "EUR").toUpperCase())}
                          </td>
                          <td data-label="Status">
                            {st === "on_hold" ? (
                              <RecalculateButton commissionId={c.id} note={c.note ?? null} canEdit={canEdit} />
                            ) : st === "reversed" ? (
                              <span className="badge muted" title={c.note ?? undefined}>Reversed</span>
                            ) : st === "paid" ? (
                              <span className="badge ok">Paid</span>
                            ) : (
                              // No Mark Paid per row (the owner: "hoef geen
                              // mark paid, dat moeten we in bulk doen"). An
                              // affiliate is paid out in one go -- F3.
                              <span className="badge pend">Unpaid</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted" style={{ padding: "0 18px 16px", margin: 0 }}>
                No commission booked for {label} yet.
              </p>
            )}
          </div>

          <div className="card">
            <h2>Rule history</h2>
            {rulesMissing ? (
              <p className="muted" style={{ margin: 0 }}>Not available until earning rules are switched on.</p>
            ) : history.length ? (
              <div>
                {history.map((r) => {
                  const typeLabel = r.ad_account_type
                    ? types.find((t) => t.slug === r.ad_account_type)?.label ?? r.ad_account_type
                    : null;
                  return (
                    <div key={r.id} className="list-row" style={{ justifyContent: "space-between" }}>
                      <span>
                        {r.source === "subscription"
                          ? "Subscriptions"
                          : r.source === "onetime"
                            ? "One-time bonus"
                            : r.source === "first_topup"
                              ? "First top-up of each new customer"
                              : `Top-ups · ${typeLabel ?? "all account types"}`}
                        {": "}
                        <b>
                          {r.source === "onetime"
                            ? r.amount === null || r.amount === undefined
                              ? "cleared (uses the default)"
                              : formatCurrency(Number(r.amount), String(r.currency ?? "EUR"))
                            : r.pct === null
                              ? "cleared (uses the next rule down)"
                              : pct(Number(r.pct))}
                        </b>
                      </span>
                      <span className="muted" style={{ fontSize: ".82rem", whiteSpace: "nowrap" }}>
                        from {dayjs(r.effective_from).format("D MMM YYYY, HH:mm")}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="muted" style={{ margin: 0 }}>
                {label} has no rules of their own — the defaults apply.
              </p>
            )}
          </div>
        </>
      )}
    </>
  );
}

// ── ON HOLD: THE SUPPLIER FEE WAS NOT RECORDED ──────────────────────────
// The accrual refuses to guess a cost, so the row sits at 0 until the
// account TYPE has a supplier fee (Settings -> Finance -> Ad-account types;
// the owner: "leverancierskost moet uit de ad acc type data komen").
// Then this asks the database to calculate it the same way it would have.
function RecalculateButton({
  commissionId,
  note,
  canEdit,
}: {
  commissionId: string;
  note: string | null;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      const res = await recalculateCommission(commissionId);
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    onSuccess: (d) => {
      toast.success(
        d.amount > 0
          ? `Recalculated: ${formatCurrency(d.amount, d.currency ?? "EUR")}`
          : "Recalculated: no profit on that top-up, so no commission",
      );
      queryClient.invalidateQueries({ queryKey: ["affiliate-book"], exact: false });
    },
    onError: (e: Error) => toast.error("Not recalculated", { description: e.message }),
  });
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <span className="badge pend" title={note ?? undefined}>On hold</span>
      {canEdit ? (
        <button className="btn ghost sm" onClick={() => mutate()} disabled={isPending}>
          {isPending ? "Recalculating…" : "Recalculate"}
        </button>
      ) : null}
    </span>
  );
}
