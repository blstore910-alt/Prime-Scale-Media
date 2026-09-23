"use client";

import { useQuery } from "@tanstack/react-query";

import { createClient } from "@/lib/supabase/client";
import { isMissingColumn, pageAllRows } from "@/lib/page-all-rows";
import type { CommissionRule } from "@/lib/pure-commission-rules";

// ── ONE READ FOR THE WHOLE AFFILIATE BOOK ──────────────────────────────
//
// /affiliates was one row per LINK, so an affiliate with twenty referrals
// was twenty rows and their total, their count and what is open appeared
// nowhere. The owner: "first see all the affiliates, and when I click on
// one, all his referrals and his settings per account type, detailed".
//
// A tenant has tens of links, not thousands, so the book is read whole and
// grouped here. Every figure on the overview and the detail page comes out
// of these rows, so a count on a card is always the length of a list one
// click away (CLAUDE.md: a number must be verifiable against its list).

/** What was taken back on this referral, per currency (plak 35). */
export type BookLink = {
  id: string;
  created_at: string;
  status: string;
  referred_advertiser_id: string;
  affiliate_advertiser_id: string;
  referred_advertiser_name: string | null;
  referred_advertiser_email: string | null;
  referred_advertiser_tenant_client_code: string | null;
  affiliate_advertiser_name: string | null;
  affiliate_advertiser_email: string | null;
  affiliate_advertiser_tenant_client_code: string | null;
  earnings_eur: number | null;
  earnings_usd: number | null;
  /** The rate ON THIS LINK, which is what _accrue_referral_commission
   *  reads -- not the affiliate's settings. The two can disagree: the
   *  link is written once and the settings change afterwards, and for a
   *  while nothing copied the settings onto the link at all. A link
   *  with no rate earns nothing, however the dialog is filled in. */
  commission_type: string | null;
  commission_pct: number | null;
  /** What was taken back on this referral, per currency. Filled in by
   *  groupAffiliateBook so a per-customer figure nets like the totals. */
  clawbacks?: Record<string, number>;
};

export type BookCommission = {
  id: string;
  created_at: string;
  referral_link_id: string;
  type: string | null;
  amount: number;
  currency: string;
  status: string | null;
  topup_id: string | null;
  // The calculation, written by the accrual from plak 35 on. Absent on
  // older rows and until that plak lands -- read softly.
  source?: string | null;
  base_amount?: number | null;
  pct?: number | null;
  fee_amount?: number | null;
  supplier_fee_pct?: number | null;
  supplier_cost?: number | null;
  subscription_invoice_id?: string | null;
  note?: string | null;
};

export type AdAccountTypeRow = {
  slug: string;
  label: string;
  sort_order: number | null;
  is_active: boolean | null;
};

export type MoneyByCurrency = Record<string, number>;

/**
 * Where somebody stands on the affiliate program (plak 42): applied and
 * waiting, approved, or refused with a reason. Before plak 42 there is no
 * such column and nobody has a status -- see `statusMissing`.
 */
export type AffiliateMember = {
  advertiserId: string;
  status: "applied" | "approved" | "refused";
  appliedAt: string | null;
  decidedAt: string | null;
  refusalReason: string | null;
  name: string | null;
  email: string | null;
  code: string | null;
};

/** An affiliate who asked to advertise with us too (plak 43). */
export type UpgradeRequest = {
  advertiserId: string;
  requestedAt: string;
  name: string | null;
  email: string | null;
  code: string | null;
};

export type AffiliateSummary = {
  affiliateId: string;
  /** Their program status; null when there is none on record. */
  status: AffiliateMember["status"] | null;
  name: string | null;
  email: string | null;
  code: string | null;
  links: BookLink[];
  commissions: BookCommission[];
  referrals: { total: number; active: number; pending: number; rejected: number };
  earned: MoneyByCurrency;
  owed: MoneyByCurrency;
  paid: MoneyByCurrency;
  hasOwnRules: boolean;
};

export type AffiliateBook = {
  affiliates: AffiliateSummary[];
  /** Everybody with a program status, applicants and refused included. */
  members: AffiliateMember[];
  /** The status column is not there yet (plak 42) -- not "nobody applied". */
  statusMissing: boolean;
  /** Affiliates asking to advertise too; [] before plak 43. */
  upgrades: UpgradeRequest[];
  rules: CommissionRule[];
  /** The rules table is not there yet (plak 35) -- not "no rules". */
  rulesMissing: boolean;
  /** The calculation columns are not there yet -- not "no calculation". */
  calcMissing: boolean;
  /** The status of the referral links could not be read -- not "none pending". */
  linkStatusUnknown: boolean;
  types: AdAccountTypeRow[];
};

const LINK_COLUMNS =
  "id, created_at, referred_advertiser_id, affiliate_advertiser_id, referred_advertiser_name, referred_advertiser_email, referred_advertiser_tenant_client_code, affiliate_advertiser_name, affiliate_advertiser_email, affiliate_advertiser_tenant_client_code, earnings_eur, earnings_usd, commission_type, commission_pct";
const COMMISSION_BASE =
  "id, created_at, referral_link_id, type, amount, currency, status, topup_id";
const COMMISSION_CALC =
  // subscription_invoice_id, NOT invoice_id: plak 35 reused the column
  // that was already there. Asking for a column that does not exist sent
  // this read to its fallback, and every row -- the new EUR 0.11 too --
  // read "Old rule" on the owner's screen.
  ", source, base_amount, pct, fee_amount, supplier_fee_pct, supplier_cost, subscription_invoice_id, note";

// The select strings are built from parts, so supabase-js cannot infer the
// row shape from them; this is the shape they ask for.
type CommissionPage = {
  data: BookCommission[] | null;
  error: { message: string } | null;
};

function add(m: MoneyByCurrency, currency: string | null, amount: unknown) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return;
  const c = String(currency ?? "EUR").toUpperCase();
  m[c] = Math.round(((m[c] ?? 0) + n) * 100) / 100;
}

export type BookClawback = {
  referral_link_id: string;
  amount: number | string | null;
  currency: string | null;
};

export function groupAffiliateBook(
  links: BookLink[],
  commissions: BookCommission[],
  rules: CommissionRule[],
  members: AffiliateMember[] = [],
  clawbacks: BookClawback[] = [],
): AffiliateSummary[] {
  const byAffiliate = new Map<string, AffiliateSummary>();
  const linkToAffiliate = new Map<string, string>();

  const ensure = (id: string, seed?: Partial<AffiliateSummary>) => {
    let a = byAffiliate.get(id);
    if (!a) {
      a = {
        affiliateId: id,
        status: null,
        name: seed?.name ?? null,
        email: seed?.email ?? null,
        code: seed?.code ?? null,
        links: [],
        commissions: [],
        referrals: { total: 0, active: 0, pending: 0, rejected: 0 },
        earned: {},
        owed: {},
        paid: {},
        hasOwnRules: false,
      };
      byAffiliate.set(id, a);
    }
    return a;
  };

  for (const l of links) {
    const a = ensure(l.affiliate_advertiser_id, {
      name: l.affiliate_advertiser_name,
      email: l.affiliate_advertiser_email,
      code: l.affiliate_advertiser_tenant_client_code,
    });
    a.links.push(l);
    linkToAffiliate.set(l.id, l.affiliate_advertiser_id);
    a.referrals.total += 1;
    const st = (l.status ?? "active").toLowerCase();
    if (st === "active") a.referrals.active += 1;
    else if (st === "pending") a.referrals.pending += 1;
    else if (st === "rejected") a.referrals.rejected += 1;
  }

  // ── THE SAME ARITHMETIC THE AFFILIATE'S OWN SCREEN DOES ───────────
  //
  // affiliate_referral_stats subtracts referral_clawbacks per LINK and
  // floors at zero, and it leaves rejected links out altogether. This
  // book did neither, so the owner's "Still owed" could be hundreds
  // above what the affiliate's portal showed them for the same money --
  // and the owner pays from this screen.
  const linkStatus = new Map<string, string>();
  for (const l of links) linkStatus.set(l.id, (l.status ?? "active").toLowerCase());

  const clawByLink = new Map<string, MoneyByCurrency>();
  for (const cb of clawbacks) {
    const m = clawByLink.get(cb.referral_link_id) ?? {};
    add(m, cb.currency, cb.amount);
    clawByLink.set(cb.referral_link_id, m);
  }

  const perLink = new Map<
    string,
    { earned: MoneyByCurrency; owed: MoneyByCurrency; paid: MoneyByCurrency }
  >();
  for (const c of commissions) {
    const affId = linkToAffiliate.get(c.referral_link_id);
    if (!affId) continue;
    // A rejected referral earns nothing: the affiliate's own screens
    // drop it, so the owner's must too.
    if (linkStatus.get(c.referral_link_id) === "rejected") continue;
    const a = byAffiliate.get(affId)!;
    a.commissions.push(c);
    const st = (c.status ?? "unpaid").toLowerCase();
    // Not money: on hold (profit unknown) or reversed (the top-up was
    // undone). Counting either as owed would ask the owner to pay it.
    if (st === "on_hold" || st === "reversed") continue;
    const b = perLink.get(c.referral_link_id) ?? { earned: {}, owed: {}, paid: {} };
    add(b.earned, c.currency, c.amount);
    if (st === "paid") add(b.paid, c.currency, c.amount);
    else add(b.owed, c.currency, c.amount);
    perLink.set(c.referral_link_id, b);
  }

  // The same figure the affiliate's own screen subtracts, carried on the
  // link so the per-customer table can show it too instead of printing a
  // gross number under a netted total.
  for (const l of links) l.clawbacks = clawByLink.get(l.id) ?? {};

  for (const [linkId, b] of perLink) {
    const affId = linkToAffiliate.get(linkId);
    if (!affId) continue;
    const a = byAffiliate.get(affId)!;
    const cb = clawByLink.get(linkId) ?? {};
    const currencies = new Set([
      ...Object.keys(b.earned),
      ...Object.keys(b.owed),
      ...Object.keys(b.paid),
      ...Object.keys(cb),
    ]);
    for (const cur of currencies) {
      const back = cb[cur] ?? 0;
      add(a.earned, cur, Math.max((b.earned[cur] ?? 0) - back, 0));
      add(a.owed, cur, Math.max((b.owed[cur] ?? 0) - back, 0));
      add(a.paid, cur, b.paid[cur] ?? 0);
    }
  }

  // An APPROVED affiliate belongs in the book before their first customer
  // arrives -- that is when the owner sets their rules. Applicants and
  // refused people are listed where they are decided, not here.
  for (const m of members) {
    if (m.status === "approved") {
      ensure(m.advertiserId, { name: m.name, email: m.email, code: m.code });
    }
    const a = byAffiliate.get(m.advertiserId);
    if (a) a.status = m.status;
  }

  for (const r of rules) {
    if (!r.affiliate_advertiser_id) continue;
    const a = byAffiliate.get(r.affiliate_advertiser_id);
    if (a) a.hasOwnRules = true;
  }

  return [...byAffiliate.values()].sort((x, y) =>
    String(x.code ?? x.name ?? "").localeCompare(String(y.code ?? y.name ?? "")),
  );
}

export function useAffiliateBook(tenantId: string | null | undefined) {
  return useQuery<AffiliateBook>({
    queryKey: ["affiliate-book", tenantId ?? ""],
    enabled: !!tenantId,
    // The commission is booked in another session (the verify). Asking
    // again on focus is how the owner sees it without a reload.
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const supabase = createClient();

      const linksRes = await pageAllRows<Omit<BookLink, "status">>((from, to) =>
        supabase
          .from("referral_links_with_details")
          .select(LINK_COLUMNS)
          .eq("tenant_id", tenantId!)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
      );
      if (linksRes.error) throw new Error(linksRes.error);
      if (linksRes.truncated) {
        throw new Error(
          "There are more referral links than this screen can read at once — tell us and we'll page it.",
        );
      }
      let linkStatusUnknown = false;
      const links: BookLink[] = linksRes.rows.map((l) => ({
        ...l,
        status: "active",
      }));

      // The view does not carry `status` on this database; the table does.
      // A status we could not read is UNKNOWN, never a confident "active"
      // -- the accrual pays only on active (see affiliate-table.tsx).
      if (links.length) {
        // PAGED. PostgREST stops at 1,000 rows without saying so: past
        // that, every link on the later pages became "unknown" -- not
        // counted active, dropped from the approval queue -- while
        // linkStatusUnknown stayed false, so nothing on screen said why.
        const stRes = await pageAllRows<{ id: string; status: string | null }>(
          (from, to) =>
            supabase
              .from("referral_links")
              .select("id, status")
              .eq("tenant_id", tenantId!)
              .order("id", { ascending: true })
              .range(from, to),
        );
        const stErr = stRes.error ? { message: stRes.error } : null;
        const st = stRes.rows;
        if ((stErr && !isMissingColumn(stErr.message)) || stRes.truncated) {
          for (const l of links) l.status = "unknown";
          linkStatusUnknown = true;
        } else if (!stErr) {
          const byId = new Map(
            (st ?? []).map((s: { id: string; status: string | null }) => [
              s.id,
              s.status,
            ]),
          );
          for (const l of links) {
            l.status = byId.has(l.id) ? (byId.get(l.id) ?? "active") : "unknown";
          }
        }
      }

      let calcMissing = false;
      let commissionsRes = await pageAllRows<BookCommission>((from, to) =>
        supabase
          .from("referral_commissions")
          .select(COMMISSION_BASE + COMMISSION_CALC)
          .eq("tenant_id", tenantId!)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to) as unknown as PromiseLike<CommissionPage>,
      );
      if (commissionsRes.error && isMissingColumn(commissionsRes.error)) {
        calcMissing = true;
        commissionsRes = await pageAllRows<BookCommission>((from, to) =>
          supabase
            .from("referral_commissions")
            .select(COMMISSION_BASE)
            .eq("tenant_id", tenantId!)
            .order("created_at", { ascending: true })
            .order("id", { ascending: true })
            .range(from, to) as unknown as PromiseLike<CommissionPage>,
        );
      }
      if (commissionsRes.error) throw new Error(commissionsRes.error);
      if (commissionsRes.truncated) {
        throw new Error(
          "There are more commissions than this screen can read at once — tell us and we'll page it.",
        );
      }

      // What has been taken back. Absent table = nothing to subtract;
      // any other failure is a read we could not make, and money must not
      // be reported as if it had succeeded.
      let clawbacks: BookClawback[] = [];
      {
        // Paged for the same reason as the statuses: a clawback past the
        // thousandth row would silently not be subtracted, and the owner
        // pays from this figure.
        const res = await pageAllRows<BookClawback>((from, to) =>
          supabase
            .from("referral_clawbacks")
            .select("referral_link_id, amount, currency")
            .eq("tenant_id", tenantId!)
            .order("id", { ascending: true })
            .range(from, to),
        );
        if (res.error) {
          if (!isMissingColumn(res.error) && !/42P01/.test(res.error)) {
            throw new Error(res.error);
          }
        } else if (res.truncated) {
          throw new Error(
            "There are more clawbacks than this screen can read at once — tell us and we'll page it.",
          );
        } else {
          clawbacks = res.rows;
        }
      }

      let rulesMissing = false;
      let rules: CommissionRule[] = [];
      {
        const { data, error } = await supabase
          .from("commission_rules")
          .select(
            "id, tenant_id, affiliate_advertiser_id, source, ad_account_type, pct, amount, currency, effective_from, created_at, created_by",
          )
          .eq("tenant_id", tenantId!)
          .order("effective_from", { ascending: true });
        if (error) {
          // 42P01: the table is not there yet. Anything else is a failed
          // read, and a failed read of the RULES must not render as
          // "earns nothing".
          if (/42P01|does not exist|schema cache|PGRST20\d/i.test(error.message)) {
            rulesMissing = true;
          } else {
            throw new Error(error.message);
          }
        } else {
          rules = (data ?? []) as CommissionRule[];
        }
      }

      // Who applied, who is approved, who was refused (plak 42). A missing
      // column is "not switched on", never "nobody applied".
      let statusMissing = false;
      let members: AffiliateMember[] = [];
      {
        const { data, error } = await supabase
          .from("advertisers")
          .select(
            "id, tenant_client_code, affiliate_status, affiliate_applied_at, affiliate_decided_at, affiliate_refusal_reason, profile:user_profiles(full_name, email)",
          )
          .eq("tenant_id", tenantId!)
          .not("affiliate_status", "is", null);
        if (error) {
          if (isMissingColumn(error.message)) statusMissing = true;
          else throw new Error(error.message);
        } else {
          type MemberRow = {
            id: string;
            tenant_client_code: string | null;
            affiliate_status: string | null;
            affiliate_applied_at: string | null;
            affiliate_decided_at: string | null;
            affiliate_refusal_reason: string | null;
            profile:
              | { full_name: string | null; email: string | null }
              | { full_name: string | null; email: string | null }[]
              | null;
          };
          members = ((data ?? []) as unknown as MemberRow[])
            .filter((r) =>
              ["applied", "approved", "refused"].includes(String(r.affiliate_status ?? "")),
            )
            .map((r) => {
              const prof = Array.isArray(r.profile) ? r.profile[0] : r.profile;
              return {
                advertiserId: r.id,
                status: r.affiliate_status as AffiliateMember["status"],
                appliedAt: r.affiliate_applied_at,
                decidedAt: r.affiliate_decided_at,
                refusalReason: r.affiliate_refusal_reason,
                name: prof?.full_name ?? null,
                email: prof?.email ?? null,
                code: r.tenant_client_code,
              };
            });
        }
      }

      // Affiliates asking to advertise too (plak 43). Its own read, so a
      // column that is not there yet cannot take the applications with it.
      let upgrades: UpgradeRequest[] = [];
      {
        const { data, error } = await supabase
          .from("advertisers")
          .select("id, tenant_client_code, upgrade_requested_at, profile:user_profiles(full_name, email)")
          .eq("tenant_id", tenantId!)
          .not("upgrade_requested_at", "is", null);
        if (error) {
          if (!isMissingColumn(error.message)) throw new Error(error.message);
        } else {
          type UpgradeRow = {
            id: string;
            tenant_client_code: string | null;
            upgrade_requested_at: string;
            profile:
              | { full_name: string | null; email: string | null }
              | { full_name: string | null; email: string | null }[]
              | null;
          };
          upgrades = ((data ?? []) as unknown as UpgradeRow[]).map((r) => {
            const prof = Array.isArray(r.profile) ? r.profile[0] : r.profile;
            return {
              advertiserId: r.id,
              requestedAt: r.upgrade_requested_at,
              name: prof?.full_name ?? null,
              email: prof?.email ?? null,
              code: r.tenant_client_code,
            };
          });
        }
      }

      const { data: typesData, error: typesErr } = await supabase
        .from("ad_account_types")
        .select("slug, label, sort_order, is_active")
        .eq("tenant_id", tenantId!)
        .order("sort_order", { ascending: true });
      if (typesErr) throw new Error(typesErr.message);

      return {
        affiliates: groupAffiliateBook(links, commissionsRes.rows, rules, members, clawbacks),
        members,
        statusMissing,
        // The status read failed: every count is 0 and the waiting list is
        // empty, which reads as "nobody is waiting" -- the one thing we do
        // not know. The screen says so instead.
        linkStatusUnknown,
        upgrades,
        rules,
        rulesMissing,
        calcMissing,
        types: (typesData ?? []) as AdAccountTypeRow[],
      };
    },
  });
}
