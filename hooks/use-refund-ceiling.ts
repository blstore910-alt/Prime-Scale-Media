"use client";

import { useQuery } from "@tanstack/react-query";

import { createClient } from "@/lib/supabase/client";
import { pageAllRows } from "@/lib/page-all-rows";
import { refundCeiling, refundFlag, type RefundCeiling } from "@/lib/pure-refund";

/**
 * THE MOST WE COULD GIVE EACH CUSTOMER BACK.
 *
 * The owner, 29-09: "refunds moeten we dus ook kunnen calculaten, alle
 * topups etc - onze fees en dan wat overblijft is de max refund."
 *
 * The arithmetic and the reasoning live in lib/pure-refund.ts, where
 * they are tested. This gathers the five figures it needs, per
 * customer and per currency, and nothing else.
 *
 * A note on what is NOT here: nothing on this page approves a refund.
 * It answers "what is the most this could be", which is the question
 * somebody reviewing a request needs answered before they look at the
 * request. Deciding stays where it was.
 */

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const r2 = (n: number) => Math.round(n * 100) / 100;

export type CustomerCeiling = {
  advertiser_id: string;
  currency: string;
  ceiling: RefundCeiling;
  walletBalance: number;
  flag: ReturnType<typeof refundFlag>;
};

export function useRefundCeilings(tenantId: string | null | undefined) {
  return useQuery<{ rows: CustomerCeiling[]; unreadable: string[] }>({
    queryKey: ["refund-ceilings", tenantId ?? ""],
    enabled: !!tenantId,
    queryFn: async () => {
      const supabase = createClient();
      const unreadable: string[] = [];

      // ── ALLE ZEVEN GEPAGINEERD ────────────────────────────────
      //
      // Dit getal geeft toestemming om geld TERUG te betalen, en het
      // was opgebouwd uit zeven onbegrensde leesacties. PostgREST kapt
      // stil op 1000 rijen, en de richting van die fout is de
      // verkeerde: `top_ups` levert `ourFees` en `spent`, allebei
      // AFTREKPOSTEN. Vallen er rijen weg, dan wordt er te weinig
      // afgetrokken en gaat de bovengrens OMHOOG -- dus staat er meer
      // uitbetaalbaar dan er is, en geen foutmelding die dat zegt.
      const [topups, fees, invoices, dst, refunds, precharges, wallets] =
        await Promise.all([
          pageAllRows<Record<string, unknown>>((from, to) =>
            supabase
              .from("wallet_topups")
              .select("advertiser_id, currency, amount")
              .eq("tenant_id", tenantId!)
              .eq("status", "completed")
              .order("id", { ascending: true })
              .range(from, to),
          ),
          // The funding rows carry both our fee and the spend that
          // left for the supplier. One read, two figures.
          pageAllRows<Record<string, unknown>>((from, to) =>
            supabase
              .from("top_ups")
              .select("advertiser_id, currency, topup_amount, fee_amount")
              .eq("tenant_id", tenantId!)
              .eq("status", "completed")
              .order("id", { ascending: true })
              .range(from, to),
          ),
          pageAllRows<Record<string, unknown>>((from, to) =>
            supabase
              .from("invoices")
              .select("advertiser_id, currency, total, type")
              .eq("tenant_id", tenantId!)
              .eq("status", "paid")
              .order("id", { ascending: true })
              .range(from, to),
          ),
          pageAllRows<Record<string, unknown>>((from, to) =>
            supabase
              .from("dst_charges")
              .select("advertiser_id, currency, dst_amount")
              .eq("tenant_id", tenantId!)
              .order("id", { ascending: true })
              .range(from, to),
          ),
          pageAllRows<Record<string, unknown>>((from, to) =>
            supabase
              .from("wallet_refunds")
              .select("advertiser_id, currency, amount")
              .eq("tenant_id", tenantId!)
              .in("status", ["approved", "paid", "completed"])
              .order("id", { ascending: true })
              .range(from, to),
          ),
          pageAllRows<Record<string, unknown>>((from, to) =>
            supabase
              .from("wallet_precharges")
              // `outstanding` is what is still owed; `amount` is what
              // was advanced. A partly settled precharge must subtract
              // only the part that is still out, or the ceiling is too
              // low and a customer is refused money that is theirs.
              .select("advertiser_id, currency, amount, outstanding")
              .eq("tenant_id", tenantId!)
              .not("status", "in", "(settled,cancelled,completed)")
              .order("id", { ascending: true })
              .range(from, to),
          ),
          pageAllRows<Record<string, unknown>>((from, to) =>
            supabase
              .from("wallets")
              .select("advertiser_id, eur_balance, usd_balance")
              .eq("tenant_id", tenantId!)
              .order("id", { ascending: true })
              .range(from, to),
          ),
        ]);

      type Bucket = {
        paidIn: number;
        ourFees: number;
        spent: number;
        alreadyRefunded: number;
        outstandingCredit: number;
        walletBalance: number;
      };
      const acc = new Map<string, Bucket>();
      const at = (adv: string | null, cur: string) => {
        if (!adv) return null;
        const key = `${adv}|${cur.toUpperCase()}`;
        let b = acc.get(key);
        if (!b) {
          b = {
            paidIn: 0,
            ourFees: 0,
            spent: 0,
            alreadyRefunded: 0,
            outstandingCredit: 0,
            walletBalance: 0,
          };
          acc.set(key, b);
        }
        return b;
      };
      const note = (
        q: { error: string | null; truncated: boolean },
        name: string,
      ) => {
        if (q.error) unreadable.push(name);
        // Afgekapt is geen fout maar wel een reden om dit cijfer niet
        // te vertrouwen -- en juist hier, waar afkappen de bovengrens
        // OMHOOG duwt, moet het naast de andere onleesbare bronnen
        // staan in plaats van stil te blijven.
        else if (q.truncated) {
          unreadable.push(`${name} (te veel rijen om in een keer te lezen)`);
        }
        return !q.error;
      };

      if (note(topups, "top-ups")) {
        for (const t of topups.rows) {
          const b = at(t.advertiser_id as string, String(t.currency ?? "EUR"));
          if (b) b.paidIn = r2(b.paidIn + num(t.amount));
        }
      }
      if (note(fees, "ad-account funding")) {
        for (const f of fees.rows) {
          const b = at(f.advertiser_id as string, String(f.currency ?? "EUR"));
          if (!b) continue;
          b.ourFees = r2(b.ourFees + num(f.fee_amount));
          // The funded amount has gone to the supplier. It is not in
          // the wallet and it is not coming back through us.
          b.spent = r2(b.spent + num(f.topup_amount));
        }
      }
      if (note(invoices, "invoices")) {
        for (const i of invoices.rows) {
          // Only what is genuinely OURS. A wallet_topup invoice is the
          // customer's own money and an ad_account_topup invoice is
          // the spend already counted above — see lib/pure-margin.ts.
          const type = String(i.type ?? "");
          if (type !== "subscription") continue;
          const b = at(i.advertiser_id as string, String(i.currency ?? "EUR"));
          if (b) b.ourFees = r2(b.ourFees + num(i.total));
        }
      }
      if (note(dst, "DST")) {
        for (const d of dst.rows) {
          const b = at(d.advertiser_id as string, String(d.currency ?? "EUR"));
          if (b) b.ourFees = r2(b.ourFees + num(d.dst_amount));
        }
      }
      if (note(refunds, "refunds")) {
        for (const r of refunds.rows) {
          const b = at(r.advertiser_id as string, String(r.currency ?? "EUR"));
          if (b) b.alreadyRefunded = r2(b.alreadyRefunded + num(r.amount));
        }
      }
      if (note(precharges, "advance credit")) {
        for (const p of precharges.rows) {
          const b = at(p.advertiser_id as string, String(p.currency ?? "EUR"));
          const still = p.outstanding == null ? num(p.amount) : num(p.outstanding);
          if (b) b.outstandingCredit = r2(b.outstandingCredit + still);
        }
      }
      if (note(wallets, "wallets")) {
        for (const w of wallets.rows) {
          const adv = w.advertiser_id as string;
          const e = at(adv, "EUR");
          if (e) e.walletBalance = r2(e.walletBalance + num(w.eur_balance));
          const u = at(adv, "USD");
          if (u) u.walletBalance = r2(u.walletBalance + num(w.usd_balance));
        }
      }

      const rows: CustomerCeiling[] = [];
      for (const [key, b] of acc) {
        const [advertiser_id, currency] = key.split("|");
        // A customer with nothing in and nothing out is not a row.
        if (
          b.paidIn === 0 &&
          b.walletBalance === 0 &&
          b.alreadyRefunded === 0 &&
          b.outstandingCredit === 0
        ) {
          continue;
        }
        const ceiling = refundCeiling(b);
        rows.push({
          advertiser_id,
          currency,
          ceiling,
          walletBalance: b.walletBalance,
          flag: refundFlag(b.walletBalance, ceiling.max),
        });
      }

      // The ones that need a person first: a warning, then a flag,
      // then the largest amounts.
      rows.sort((a, b) => {
        const rank = (r: CustomerCeiling) =>
          r.ceiling.warning ? 0 : r.flag.level === "look" ? 1 : 2;
        return rank(a) - rank(b) || b.ceiling.max - a.ceiling.max;
      });

      return { rows, unreadable };
    },
  });
}
