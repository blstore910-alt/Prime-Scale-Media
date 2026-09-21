"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Search } from "lucide-react";
import dayjs from "dayjs";

import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";
import {
  resolveCommissionRule,
  ruleLevelLabel,
  type CommissionRule,
} from "@/lib/pure-commission-rules";
import {
  useAffiliateBook,
  type AffiliateSummary,
  type BookCommission,
  type MoneyByCurrency,
} from "@/hooks/use-affiliate-book";
import CommissionRulesEditor from "./commission-rules-editor";
import ReferralStatusAction from "./referral-status-action";
import CommissionStatusAction from "@/components/commissions/commission-status-action";

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
  return legs
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([c, v]) => formatCurrency(v, c))
    .join(" + ");
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
    { open: false } | { open: true; affiliate: { id: string; label: string } | null }
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
          affiliates={data.affiliates}
          rulesMissing={data.rulesMissing}
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

function Overview({
  affiliates,
  rulesMissing,
  onDefaults,
}: {
  affiliates: AffiliateSummary[];
  rulesMissing: boolean;
  onDefaults: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return affiliates;
    return affiliates.filter((a) => {
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
  }, [affiliates, q]);

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
            placeholder="Search an affiliate or a customer…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
      </div>

      {rows.length ? (
        <div className="card" style={{ padding: 0 }}>
          <div className="tblwrap">
            <table className="tbl wide">
              <thead>
                <tr>
                  <th>Affiliate</th>
                  <th>Referred</th>
                  <th className="r">Earned</th>
                  <th className="r">Owed</th>
                  <th className="r">Paid</th>
                  <th>Rules</th>
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
              : "No affiliates yet. An affiliate appears here once somebody is referred by them."}
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
        .select("id, tenant_id, tenant_client_code, profile:user_profiles(full_name, email)")
        .eq("id", advertiserId)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as {
        id: string;
        tenant_id: string;
        tenant_client_code: string | null;
        profile: { full_name: string | null; email: string | null } | { full_name: string | null; email: string | null }[] | null;
      } | null;
    },
  });

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
  const notFound = !who.isLoading && !who.isError && !who.data && !summary;
  const otherTenant = !!who.data && !!profile?.tenant_id && who.data.tenant_id !== profile.tenant_id;

  const customerOf = (linkId: string) => summary?.links.find((l) => l.id === linkId) ?? null;

  const shownTypes = [...types]
    .filter((t) => t.is_active !== false)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  const effectiveRows = [
    { key: "topup|*", title: "Top-ups · all account types", source: "topup" as const, type: null as string | null },
    ...shownTypes.map((t) => ({ key: `topup|${t.slug}`, title: `Top-ups · ${t.label}`, source: "topup" as const, type: t.slug as string | null })),
    { key: "subscription|*", title: "Subscriptions · every paid invoice", source: "subscription" as const, type: null as string | null },
  ].map((r) => {
    const res = resolveCommissionRule(rules, {
      affiliateAdvertiserId: advertiserId,
      source: r.source,
      typeSlug: r.type,
    });
    return { ...r, pct: res?.pct ?? null, from: ruleLevelLabel(res?.level ?? null), own: res?.level === "own-type" || res?.level === "own-all" };
  });

  const history = rules
    .filter((r) => r.affiliate_advertiser_id === advertiserId)
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from));

  const calcLine = (c: BookCommission): string => {
    const t = c.topup_id ? topups.data?.get(c.topup_id) : null;
    const cur = String(c.currency ?? "EUR").toUpperCase();
    if (c.base_amount !== null && c.base_amount !== undefined && c.pct !== null && c.pct !== undefined) {
      const base = formatCurrency(Number(c.base_amount), cur);
      if ((c.source ?? "topup") === "subscription") {
        return `${pct(c.pct)} of ${base} invoice`;
      }
      const parts = [
        c.fee_amount !== null && c.fee_amount !== undefined ? `fee ${formatCurrency(Number(c.fee_amount), cur)}` : null,
        c.supplier_cost !== null && c.supplier_cost !== undefined
          ? `supplier ${pct(c.supplier_fee_pct)} = ${formatCurrency(Number(c.supplier_cost), cur)}`
          : null,
      ].filter(Boolean);
      return `${pct(c.pct)} of profit ${base}${parts.length ? ` (${parts.join(" − ")})` : ""}`;
    }
    // Booked before the profit rule existed: a share of what landed.
    if (t && t.topup_amount !== null) {
      return `Old rule: share of ${formatCurrency(Number(t.topup_amount), cur)} landed`;
    }
    return calcMissing ? "Calculation not recorded (old rule)" : DASH;
  };

  const fromLine = (c: BookCommission): string => {
    if (c.topup_id) {
      const t = topups.data?.get(c.topup_id);
      return t?.number ? `Top-up #${String(t.number).padStart(6, "0")}` : "Top-up";
    }
    if (c.invoice_id || (c.source ?? "") === "subscription") return "Subscription invoice";
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
            {who.isLoading && !summary ? "Loading…" : name || code || "Affiliate"}{" "}
            {code ? <span className="mono muted" style={{ fontSize: ".9rem" }}>{code}</span> : null}
          </h1>
          <p>{email || DASH}</p>
        </div>
        <div className="pacts">
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
                        if (st === "on_hold") continue;
                        earned[cur] = Math.round(((earned[cur] ?? 0) + Number(c.amount)) * 100) / 100;
                        if (st !== "paid") owed[cur] = Math.round(((owed[cur] ?? 0) + Number(c.amount)) * 100) / 100;
                      }
                      return (
                        <tr key={l.id}>
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
                                affiliateName={code}
                                referredName={l.referred_advertiser_tenant_client_code}
                              />
                            ) : (
                              statusBadge(l.status)
                            )}
                          </td>
                          <td className="r" data-label="Earned from them">{money(earned)}</td>
                          <td className="r" data-label="Owed">{money(owed)}</td>
                        </tr>
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
                              <span className="badge pend" title={c.note ?? undefined}>On hold</span>
                            ) : (
                              <CommissionStatusAction
                                commissionId={c.id}
                                status={c.status}
                                amount={c.amount}
                                currency={c.currency}
                                affiliate={code}
                              />
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
                        {r.source === "subscription" ? "Subscriptions" : `Top-ups · ${typeLabel ?? "all account types"}`}
                        {": "}
                        <b>{r.pct === null ? "cleared (uses the next rule down)" : pct(Number(r.pct))}</b>
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
