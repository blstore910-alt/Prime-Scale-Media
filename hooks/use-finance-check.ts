"use client";

import { useQuery } from "@tanstack/react-query";

import { createClient } from "@/lib/supabase/client";

/**
 * THE FINANCE CHECK.
 *
 * The owner, 29-09: "ik wil ook dat er een finance check taak bestaat
 * voor alle transacties waarbij het niet auto approved is bij wise api
 * of slash api etc, dus 1 medewerker kan dan alle finances checken
 * zonder echte transactie approved of ad acc withdrawals enz."
 *
 * ── THE SHAPE, AND WHY IT MATTERS ─────────────────────────────────
 *
 * Whoever CHECKS must not be able to DECIDE. A person who reviews a
 * payment and also approves it is reviewing themselves, which is not
 * a review. So this page has no approve button, no reject button and
 * no button that moves a cent — by construction, not by discipline.
 * It reads, it recomputes, and it says what does not add up. The
 * approving stays exactly where it already was.
 *
 * ── WHAT LANDS HERE ───────────────────────────────────────────────
 *
 * Everything a machine did not settle on its own. The Wise feed can
 * match a deposit by reference and the supplier API can confirm a
 * funding; anything those two did NOT close is a decision a person has
 * to make, and every one of them is money.
 *
 *   wallet top-ups              somebody says they transferred
 *   bank deposits unmatched     money arrived, nobody attributed it
 *   ad-account funding          wallet out, supplier in, our fee
 *   money back off an account   supplier out, wallet in
 *   wallet refunds              money leaves us for good
 *   wallet adjustments          a balance changed by hand
 *   advance credit outstanding  we fronted it and it has not settled
 *
 * Each row carries its own checklist, because "review this" without
 * saying what to look at produces a tick and no review.
 */

const MISSING = /42P01|relation .* does not exist|schema cache|PGRST20\d/i;
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export type CheckItem = {
  kind: string;
  /** What this is, in words a person reads. */
  what: string;
  id: string;
  advertiser_id: string | null;
  currency: string;
  amount: number;
  /** Our cut, where there is one. */
  fee: number | null;
  status: string;
  created_at: string;
  reference: string | null;
  /** Whether a machine could have settled this and did not. */
  autoPossible: boolean;
  /** Exactly what to look at, in order. */
  checklist: string[];
};

export type FinanceQueue = {
  items: CheckItem[];
  /** Tables we could not read, named — so an empty queue is never a
   *  silent one. RLS refuses with zero rows and error null. */
  unreadable: string[];
  notSwitchedOn: boolean;
};

export function useFinanceQueue(tenantId: string | null | undefined) {
  return useQuery<FinanceQueue>({
    queryKey: ["finance-queue", tenantId ?? ""],
    enabled: !!tenantId,
    queryFn: async () => {
      const supabase = createClient();
      const unreadable: string[] = [];

      const [topups, deposits, funding, withdrawals, refunds, adjustments, precharges] =
        await Promise.all([
          supabase
            .from("wallet_topups")
            .select("id, advertiser_id, currency, amount, status, created_at, reference_no, payment_slip")
            .eq("tenant_id", tenantId!)
            .eq("status", "pending")
            .order("created_at", { ascending: true }),
          supabase
            .from("wise_incoming_transfers")
            .select("id, currency, amount_cents, status, created_at, reference, sender_name, matched_topup_id")
            .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
            .is("archived_at", null)
            .is("matched_topup_id", null)
            .order("created_at", { ascending: false })
            .limit(100),
          supabase
            .from("top_ups")
            .select("id, advertiser_id, currency, topup_amount, fee_amount, status, created_at, number")
            .eq("tenant_id", tenantId!)
            .in("status", ["pending", "payment_pending", "in_progress"])
            .order("created_at", { ascending: true }),
          supabase
            .from("ad_account_withdrawals")
            .select("id, advertiser_id, currency, amount, status, created_at")
            .eq("tenant_id", tenantId!)
            .eq("status", "pending")
            .order("created_at", { ascending: true }),
          supabase
            .from("wallet_refunds")
            .select("id, advertiser_id, currency, amount, status, created_at")
            .eq("tenant_id", tenantId!)
            .eq("status", "pending")
            .order("created_at", { ascending: true }),
          supabase
            .from("wallet_adjustments")
            .select("id, advertiser_id, currency, amount, status, created_at")
            .eq("tenant_id", tenantId!)
            .eq("status", "pending")
            .order("created_at", { ascending: true }),
          supabase
            .from("wallet_precharges")
            .select("id, advertiser_id, currency, amount, status, created_at")
            .eq("tenant_id", tenantId!)
            .eq("status", "outstanding")
            .order("created_at", { ascending: true }),
        ]);

      // A table that is not there yet is a pending migration, and the
      // page should still work. A table that FAILED is different and
      // gets named, so nobody reads a short queue as a quiet day.
      const guard = (q: { error: { message: string } | null }, name: string) => {
        if (!q.error) return true;
        if (MISSING.test(q.error.message)) return false;
        unreadable.push(name);
        return false;
      };

      const items: CheckItem[] = [];

      if (guard(topups, "wallet top-ups")) {
        for (const t of (topups.data ?? []) as Record<string, unknown>[]) {
          items.push({
            kind: "topup",
            what: "Wallet top-up waiting to be verified",
            id: String(t.id),
            advertiser_id: (t.advertiser_id as string | null) ?? null,
            currency: String(t.currency ?? "EUR").toUpperCase(),
            amount: num(t.amount),
            fee: null,
            status: String(t.status ?? ""),
            created_at: String(t.created_at),
            reference: (t.reference_no as string | null) ?? null,
            autoPossible: true,
            checklist: [
              "Is there a payment slip, and does the amount on it match the amount claimed?",
              "Does the reference on the slip match the reference on this top-up?",
              "Is there a deposit in the bank feed for the same amount, on or after this date?",
              t.payment_slip
                ? "A slip was uploaded."
                : "NO SLIP was uploaded — the house rule is that a top-up always has one.",
              "Has the same amount already been credited once? Check the customer's movements for a duplicate.",
            ],
          });
        }
      }

      if (guard(deposits, "bank deposits")) {
        for (const d of (deposits.data ?? []) as Record<string, unknown>[]) {
          items.push({
            kind: "deposit",
            what: "Money in the bank, attributed to nobody",
            id: String(d.id),
            advertiser_id: null,
            currency: String(d.currency ?? "EUR").toUpperCase(),
            amount: Math.round(num(d.amount_cents)) / 100,
            fee: null,
            status: String(d.status ?? ""),
            created_at: String(d.created_at),
            reference:
              (d.reference as string | null) ?? (d.sender_name as string | null) ?? null,
            autoPossible: true,
            checklist: [
              "Does the reference match any customer's code in THIS system?",
              "If it looks like an old-system code, that is expected — it will never match here and has to be attributed by hand.",
              "Is there a pending top-up for the same amount from the same sender?",
              "If nobody can be found: this is money we are holding for someone. It goes back, or it gets a name. It does not sit here.",
            ],
          });
        }
      }

      if (guard(funding, "ad-account funding")) {
        for (const f of (funding.data ?? []) as Record<string, unknown>[]) {
          items.push({
            kind: "funding",
            what: "Ad-account funding in flight",
            id: String(f.id),
            advertiser_id: (f.advertiser_id as string | null) ?? null,
            currency: String(f.currency ?? "EUR").toUpperCase(),
            amount: num(f.topup_amount),
            fee: num(f.fee_amount),
            status: String(f.status ?? ""),
            created_at: String(f.created_at),
            reference: f.number ? `#${f.number}` : null,
            autoPossible: true,
            checklist: [
              "Was the wallet actually debited for the amount PLUS the fee?",
              "Is the fee the rate this customer is on, not the default?",
              "Did the supplier confirm receipt? If this has been in flight for more than a day, the automatic path did not finish.",
              "Money has left the wallet and has not arrived anywhere. This is the state that loses money quietly.",
            ],
          });
        }
      }

      if (guard(withdrawals, "ad-account withdrawals")) {
        for (const w of (withdrawals.data ?? []) as Record<string, unknown>[]) {
          items.push({
            kind: "withdrawal",
            what: "Money back off an ad account",
            id: String(w.id),
            advertiser_id: (w.advertiser_id as string | null) ?? null,
            currency: String(w.currency ?? "EUR").toUpperCase(),
            amount: num(w.amount),
            fee: null,
            status: String(w.status ?? ""),
            created_at: String(w.created_at),
            reference: null,
            autoPossible: false,
            checklist: [
              "Does the ad account actually hold this much, according to the supplier — not according to us?",
              "Is any of this money an advance we extended and have not been paid for?",
              "Does a commission get clawed back when this lands? Check the referral if there is one.",
              "This credits a wallet. After it, the refund ceiling for this customer goes UP.",
            ],
          });
        }
      }

      if (guard(refunds, "wallet refunds")) {
        for (const r of (refunds.data ?? []) as Record<string, unknown>[]) {
          items.push({
            kind: "refund",
            what: "Refund — money leaving us for good",
            id: String(r.id),
            advertiser_id: (r.advertiser_id as string | null) ?? null,
            currency: String(r.currency ?? "EUR").toUpperCase(),
            amount: num(r.amount),
            fee: null,
            status: String(r.status ?? ""),
            created_at: String(r.created_at),
            reference: null,
            autoPossible: false,
            checklist: [
              "Is the amount at or below this customer's refund ceiling? The ceiling is on this page — open the customer.",
              "Are our fees excluded? We do not refund our own margin.",
              "Is any of this an advance we fronted? That never arrived and cannot go back out.",
              "Is the bank account it goes to the one the money came FROM? A refund to a different account is how money is taken.",
              "This is irreversible once sent.",
            ],
          });
        }
      }

      if (guard(adjustments, "wallet adjustments")) {
        for (const a of (adjustments.data ?? []) as Record<string, unknown>[]) {
          items.push({
            kind: "adjustment",
            what: "A balance changed by hand",
            id: String(a.id),
            advertiser_id: (a.advertiser_id as string | null) ?? null,
            currency: String(a.currency ?? "EUR").toUpperCase(),
            amount: num(a.amount),
            fee: null,
            status: String(a.status ?? ""),
            created_at: String(a.created_at),
            reference: null,
            autoPossible: false,
            checklist: [
              "What is being corrected, and where is the evidence of the original mistake?",
              "Is there a matching entry on the other side, or does this create money out of nothing?",
              "An adjustment is the only way to move a balance without a transaction behind it. Every single one needs a reason a stranger could follow.",
            ],
          });
        }
      }

      if (guard(precharges, "advance credit")) {
        for (const p of (precharges.data ?? []) as Record<string, unknown>[]) {
          items.push({
            kind: "precharge",
            what: "Advance credit we are still owed",
            id: String(p.id),
            advertiser_id: (p.advertiser_id as string | null) ?? null,
            currency: String(p.currency ?? "EUR").toUpperCase(),
            amount: num(p.amount),
            fee: null,
            status: String(p.status ?? ""),
            created_at: String(p.created_at),
            reference: null,
            autoPossible: false,
            checklist: [
              "How long has this been outstanding? We fronted this money.",
              "Has the transfer it was advanced against actually arrived since?",
              "This amount is IN the customer's wallet but never reached our bank. It is subtracted from their refund ceiling for exactly that reason.",
            ],
          });
        }
      }

      items.sort((a, b) => b.amount - a.amount);
      return { items, unreadable, notSwitchedOn: false };
    },
  });
}
