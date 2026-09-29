"use client";

import { useQuery } from "@tanstack/react-query";

import { createClient } from "@/lib/supabase/client";

/**
 * THE THREE QUESTIONS THE LEDGER PAGE ACTUALLY HAS TO ANSWER.
 *
 * The owner, 29-09, looking at six rows reading "opening +EUR 20.00":
 * "hier wordt ik niks wijzer van. een grootboek moet toch super
 * detailed zijn. en ook wat erg belangrijk is dus de binnenkomsten op
 * alle banken en dan de fees en profit die we overhouden, dat moet ook
 * kloppen anders hebben we ergens een lek."
 *
 * That is three questions, and the page answered none of them:
 *
 *   1. WHO and WHAT, per movement. A line with a delta and no name on
 *      it is a number, not a ledger entry.
 *   2. WHAT CAME IN, per bank, against what we credited. Money can
 *      only go missing between those two figures.
 *   3. WHAT WE KEEP. Fees, subscriptions and DST, minus the
 *      commissions we owe. If that does not tie out, there is a leak.
 *
 * Kept in its own file because `use-ledger.ts` answers a different
 * question — does each wallet balance equal the sum of its own
 * movements — and that one has to stay small and obviously correct.
 */

// Same rule as use-ledger.ts: only a missing RELATION means "not
// switched on". A missing COLUMN is a live fault and must throw, or a
// pending migration renders as "there is nothing here".
const MISSING = /42P01|relation .* does not exist|schema cache|PGRST20\d/i;

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const cents = (n: number) => Math.round(n * 100) / 100;

// ─────────────────────────────────────────────────────────────────────
// 1. WHO IS BEHIND EACH LINE
// ─────────────────────────────────────────────────────────────────────

export type LedgerNames = {
  customer: Map<string, { label: string; code: string | null }>;
  actor: Map<string, string>;
};

/**
 * Three reads for the whole page, instead of a join per row. The ledger
 * line carries `advertiser_id` and `actor_user_id`; this turns both
 * into something a person recognises.
 */
export function useLedgerNames(tenantId: string | null | undefined) {
  return useQuery<LedgerNames>({
    queryKey: ["ledger-names", tenantId ?? ""],
    enabled: !!tenantId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const supabase = createClient();

      const [adv, staff, comp] = await Promise.all([
        supabase
          .from("advertisers")
          .select("id, tenant_client_code, profile_id")
          .eq("tenant_id", tenantId!),
        supabase
          .from("user_profiles")
          .select("id, user_id, full_name, email")
          .eq("tenant_id", tenantId!),
        supabase
          .from("companies")
          .select("advertiser_id, name")
          .eq("tenant_id", tenantId!),
      ]);

      type Profile = {
        id: string;
        user_id: string | null;
        full_name: string | null;
        email: string | null;
      };
      const byProfile = new Map<string, Profile>();
      const byUser = new Map<string, Profile>();
      for (const p of (staff.data ?? []) as Profile[]) {
        byProfile.set(p.id, p);
        if (p.user_id) byUser.set(p.user_id, p);
      }

      const company = new Map<string, string>();
      for (const c of (comp.data ?? []) as {
        advertiser_id: string | null;
        name: string | null;
      }[]) {
        if (c.advertiser_id && c.name) company.set(c.advertiser_id, c.name);
      }

      // The company name is what the owner recognises; the client code
      // rides along as the tiebreaker, because two customers can share
      // a company name and the code is unique.
      const customer = new Map<string, { label: string; code: string | null }>();
      for (const a of (adv.data ?? []) as {
        id: string;
        tenant_client_code: string | null;
        profile_id: string | null;
      }[]) {
        const p = a.profile_id ? byProfile.get(a.profile_id) : undefined;
        customer.set(a.id, {
          label:
            company.get(a.id) ??
            p?.full_name ??
            p?.email ??
            a.tenant_client_code ??
            "Unknown customer",
          code: a.tenant_client_code,
        });
      }

      // Keyed by AUTH user id — that is what the ledger and the audit
      // trigger both write, not the profile id.
      const actor = new Map<string, string>();
      for (const [uid, p] of byUser) {
        actor.set(uid, p.full_name ?? p.email ?? "Staff");
      }

      return { customer, actor };
    },
  });
}

// ─────────────────────────────────────────────────────────────────────
// 2. WHAT CAME IN, PER BANK
// ─────────────────────────────────────────────────────────────────────

export type MoneyInRow = {
  currency: string;
  bankCount: number;
  bank: number;
  matchedCount: number;
  matched: number;
  creditedCount: number;
  credited: number;
};

/**
 * What the deposit feed says arrived, per currency, against what we
 * actually credited to wallets.
 *
 * The gap is NOT automatically a leak and is deliberately not called
 * one: per docs/WISE_SETUP.md most of those deposits carry the OLD
 * system's client references, and exactly one has ever matched a
 * top-up. So three figures, each named, and the reader draws the
 * conclusion — rather than one verdict that would be wrong every day.
 */
export function useMoneyIn(tenantId: string | null | undefined) {
  return useQuery<{ rows: MoneyInRow[]; notSwitchedOn: boolean }>({
    queryKey: ["ledger-money-in", tenantId ?? ""],
    enabled: !!tenantId,
    queryFn: async () => {
      const supabase = createClient();

      // The feed carries rows with a null tenant: a transfer nobody
      // could attribute yet. Those are ours until proven otherwise, so
      // this matches the deposit queue's own filter rather than
      // quietly dropping them out of the total.
      const [dep, tops] = await Promise.all([
        supabase
          .from("wise_incoming_transfers")
          .select("currency, amount_cents, matched_topup_id")
          .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
          .is("archived_at", null),
        supabase
          .from("wallet_topups")
          .select("currency, amount")
          .eq("tenant_id", tenantId!)
          .eq("status", "completed"),
      ]);
      if (dep.error) {
        if (MISSING.test(dep.error.message)) {
          return { rows: [], notSwitchedOn: true };
        }
        throw dep.error;
      }
      if (tops.error) throw tops.error;

      const acc = new Map<string, MoneyInRow>();
      const row = (c: string) => {
        const cur = c.toUpperCase();
        let r = acc.get(cur);
        if (!r) {
          r = {
            currency: cur,
            bankCount: 0,
            bank: 0,
            matchedCount: 0,
            matched: 0,
            creditedCount: 0,
            credited: 0,
          };
          acc.set(cur, r);
        }
        return r;
      };

      for (const d of (dep.data ?? []) as {
        currency: string | null;
        amount_cents: unknown;
        matched_topup_id: string | null;
      }[]) {
        const r = row(String(d.currency ?? "EUR"));
        const amt = Math.round(num(d.amount_cents)) / 100;
        r.bankCount += 1;
        r.bank = cents(r.bank + amt);
        if (d.matched_topup_id) {
          r.matchedCount += 1;
          r.matched = cents(r.matched + amt);
        }
      }
      for (const t of (tops.data ?? []) as {
        currency: string | null;
        amount: unknown;
      }[]) {
        const r = row(String(t.currency ?? "EUR"));
        r.creditedCount += 1;
        r.credited = cents(r.credited + num(t.amount));
      }

      return {
        rows: [...acc.values()].sort((a, b) => b.bank - a.bank),
        notSwitchedOn: false,
      };
    },
  });
}

// ─────────────────────────────────────────────────────────────────────
// 3. WHAT WE KEEP
// ─────────────────────────────────────────────────────────────────────

export type MarginLine = {
  label: string;
  source: string;
  currency: string;
  amount: number;
  count: number;
  /** A cost is subtracted; everything else is added. */
  cost?: boolean;
  /** Money that passed through us. Shown, but added to nothing. */
  through?: boolean;
};

/**
 * Income is NOT the money that passes through.
 *
 * A EUR 500 top-up that a customer spends on ads is theirs on the way
 * in and theirs on the way out; counting it as revenue would flatter
 * every figure here by two orders of magnitude, and that is exactly
 * the mistake a dashboard makes when nobody writes down what it means.
 *
 * What is OURS: the fee on ad-account funding, the subscriptions and
 * other invoices that were actually paid, and the DST we billed on.
 * Against that: the commissions we owe affiliates, split into paid and
 * still owed, because one has left the bank and the other has not.
 *
 * Every line names the table it came from, so a figure that looks
 * wrong can be traced in one step instead of argued about.
 */
export function useMargin(tenantId: string | null | undefined) {
  return useQuery<{ lines: MarginLine[]; notSwitchedOn: boolean }>({
    queryKey: ["ledger-margin", tenantId ?? ""],
    enabled: !!tenantId,
    queryFn: async () => {
      const supabase = createClient();

      const [fees, inv, dst, comm] = await Promise.all([
        supabase
          .from("top_ups")
          .select("currency, fee_amount")
          .eq("tenant_id", tenantId!)
          .eq("status", "completed"),
        supabase
          .from("invoices")
          .select("currency, total, type")
          .eq("tenant_id", tenantId!)
          .eq("status", "paid"),
        supabase
          .from("dst_charges")
          .select("currency, dst_amount")
          .eq("tenant_id", tenantId!),
        supabase
          .from("referral_commissions")
          .select("currency, amount, status")
          .eq("tenant_id", tenantId!),
      ]);
      for (const q of [fees, inv, dst, comm]) {
        if (q.error) {
          if (MISSING.test(q.error.message)) {
            return { lines: [], notSwitchedOn: true };
          }
          throw q.error;
        }
      }

      const bucket = new Map<string, MarginLine>();
      const add = (
        label: string,
        source: string,
        currency: string,
        amount: number,
        cost?: boolean,
      ) => {
        if (!amount) return;
        const cur = currency.toUpperCase();
        const key = `${label}|${cur}`;
        const at = bucket.get(key) ?? {
          label,
          source,
          currency: cur,
          amount: 0,
          count: 0,
          cost,
        };
        at.amount = cents(at.amount + amount);
        at.count += 1;
        bucket.set(key, at);
      };

      // Money that passed through us and is not ours. Shown, named,
      // and added to nothing.
      const addThrough = (label: string, currency: string, amount: number) => {
        if (!amount) return;
        const cur = currency.toUpperCase();
        const key = `${label}|${cur}`;
        const at = bucket.get(key) ?? {
          label,
          source: "invoices.total, status paid",
          currency: cur,
          amount: 0,
          count: 0,
          through: true,
        };
        at.amount = cents(at.amount + amount);
        at.count += 1;
        bucket.set(key, at);
      };

      for (const f of (fees.data ?? []) as {
        currency: string | null;
        fee_amount: unknown;
      }[]) {
        add(
          "Fee on ad-account funding",
          "top_ups.fee_amount, completed",
          String(f.currency ?? "EUR"),
          num(f.fee_amount),
        );
      }
      // ── NOT EVERY PAID INVOICE IS INCOME ────────────────────────
      //
      // Measured 29-09, and it caught this very panel out. The paid
      // invoices on the real tenant are:
      //
      //   wallet_topup      6  EUR 1,165.00
      //   ad_account_topup  8  EUR   597.70
      //   subscription      5  EUR   180.00
      //
      // A `wallet_topup` invoice is the customer putting money into
      // their OWN wallet. Every cent of it is theirs; it is already
      // counted on the other panel as "credited to wallets", and
      // adding it here would be counting the same money twice and
      // calling the second time profit.
      //
      // An `ad_account_topup` invoice is the gross ad spend. The
      // supplier gets almost all of it. What is OURS is the fee inside
      // it, and that is already the first line of this panel, taken
      // from top_ups.fee_amount -- so adding the gross would inflate
      // and double-count at the same time.
      //
      // Left in, at zero, deliberately. A figure that has been
      // considered and excluded is worth more on this page than one
      // that silently is not there: without these two lines the owner
      // has no way to tell "we thought about it" from "we forgot".
      for (const i of (inv.data ?? []) as {
        currency: string | null;
        total: unknown;
        type: string | null;
      }[]) {
        const cur = String(i.currency ?? "EUR");
        const amt = num(i.total);
        if (i.type === "wallet_topup") {
          addThrough("Wallet top-ups (the customer's own money)", cur, amt);
        } else if (i.type === "ad_account_topup") {
          addThrough("Ad spend (goes to the supplier)", cur, amt);
        } else {
          add(
            i.type === "subscription" ? "Subscriptions paid" : "Other invoices paid",
            "invoices.total, status paid",
            cur,
            amt,
          );
        }
      }
      for (const d of (dst.data ?? []) as {
        currency: string | null;
        dst_amount: unknown;
      }[]) {
        add(
          "DST billed on",
          "dst_charges.dst_amount",
          String(d.currency ?? "EUR"),
          num(d.dst_amount),
        );
      }
      for (const c of (comm.data ?? []) as {
        currency: string | null;
        amount: unknown;
        status: string | null;
      }[]) {
        add(
          c.status === "paid"
            ? "Affiliate commission paid"
            : "Affiliate commission owed",
          "referral_commissions.amount",
          String(c.currency ?? "EUR"),
          num(c.amount),
          true,
        );
      }

      return {
        lines: [...bucket.values()].sort((a, b) => {
          const rank = (l: MarginLine) => (l.cost ? 2 : l.through ? 1 : 0);
          return rank(a) - rank(b) || b.amount - a.amount;
        }),
        notSwitchedOn: false,
      };
    },
  });
}
