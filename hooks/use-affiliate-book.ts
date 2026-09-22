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

export type AffiliateSummary = {
  affiliateId: string;
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
  rules: CommissionRule[];
  /** The rules table is not there yet (plak 35) -- not "no rules". */
  rulesMissing: boolean;
  /** The calculation columns are not there yet -- not "no calculation". */
  calcMissing: boolean;
  types: AdAccountTypeRow[];
};

const LINK_COLUMNS =
  "id, created_at, referred_advertiser_id, affiliate_advertiser_id, referred_advertiser_name, referred_advertiser_email, referred_advertiser_tenant_client_code, affiliate_advertiser_name, affiliate_advertiser_email, affiliate_advertiser_tenant_client_code, earnings_eur, earnings_usd";
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

export function groupAffiliateBook(
  links: BookLink[],
  commissions: BookCommission[],
  rules: CommissionRule[],
): AffiliateSummary[] {
  const byAffiliate = new Map<string, AffiliateSummary>();
  const linkToAffiliate = new Map<string, string>();

  const ensure = (id: string, seed?: Partial<AffiliateSummary>) => {
    let a = byAffiliate.get(id);
    if (!a) {
      a = {
        affiliateId: id,
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

  for (const c of commissions) {
    const affId = linkToAffiliate.get(c.referral_link_id);
    if (!affId) continue;
    const a = byAffiliate.get(affId)!;
    a.commissions.push(c);
    const st = (c.status ?? "unpaid").toLowerCase();
    // Not money: on hold (profit unknown) or reversed (the top-up was
    // undone). Counting either as owed would ask the owner to pay it.
    if (st === "on_hold" || st === "reversed") continue;
    add(a.earned, c.currency, c.amount);
    if (st === "paid") add(a.paid, c.currency, c.amount);
    else add(a.owed, c.currency, c.amount);
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
      const links: BookLink[] = linksRes.rows.map((l) => ({
        ...l,
        status: "active",
      }));

      // The view does not carry `status` on this database; the table does.
      // A status we could not read is UNKNOWN, never a confident "active"
      // -- the accrual pays only on active (see affiliate-table.tsx).
      if (links.length) {
        const { data: st, error: stErr } = await supabase
          .from("referral_links")
          .select("id, status")
          .eq("tenant_id", tenantId!);
        if (stErr && !isMissingColumn(stErr.message)) {
          for (const l of links) l.status = "unknown";
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

      const { data: typesData, error: typesErr } = await supabase
        .from("ad_account_types")
        .select("slug, label, sort_order, is_active")
        .eq("tenant_id", tenantId!)
        .order("sort_order", { ascending: true });
      if (typesErr) throw new Error(typesErr.message);

      return {
        affiliates: groupAffiliateBook(links, commissionsRes.rows, rules),
        rules,
        rulesMissing,
        calcMissing,
        types: (typesData ?? []) as AdAccountTypeRow[],
      };
    },
  });
}
