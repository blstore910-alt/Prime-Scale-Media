"use client";

import { useQuery } from "@tanstack/react-query";

import { createClient } from "@/lib/supabase/client";

/**
 * THE LEDGER, AND THE ONE QUESTION IT EXISTS TO ANSWER.
 *
 * The owner, 28-09: "waar is grootboek?" and then "daarin kan ik ook
 * dus alle geld lekken enz checken ofzo?"
 *
 * Yes — that is the whole point. `wallets` carries a BALANCE; until
 * today the movements behind it were spread over eight tables and the
 * balance was raised and lowered in place, so if one ever went wrong we
 * could not PROVE what it should have been. `wallet_ledger` (plak 125)
 * writes one line per movement, with the balance before and after, from
 * a trigger on `wallets` — so nothing can move without a line.
 *
 * Two reads:
 *
 *   `offBooks` — wallets whose balance is NOT the sum of their own
 *                lines. Zero is the answer you want. Any row is money
 *                that moved without the ledger seeing it, or the other
 *                way round.
 *   `lines`    — the movements themselves, newest first.
 *
 * WHAT IT CANNOT TELL YOU, and the screen says so too: nothing from
 * before the trigger went on. Every wallet starts with one `opening`
 * line carrying today's balance, and that line is not evidence of
 * anything — it is the starting point. The ledger is authoritative from
 * 28-09 onward and not one day earlier.
 */

const MISSING = /42P01|does not exist|schema cache|PGRST20\d/i;

export type LedgerLine = {
  id: string;
  occurred_at: string;
  advertiser_id: string | null;
  wallet_id: string;
  currency: string;
  delta: number;
  balance_before: number;
  balance_after: number;
  source: string;
  reason: string | null;
  actor_user_id: string | null;
};

export type OffBooksRow = {
  advertiser_id: string | null;
  currency: string;
  balance: number;
  fromLines: number;
};

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Does every wallet balance equal the sum of its own movements?
 *
 * Worked out here rather than in a view, because the view would have to
 * be created by a plak and this answer must be available the moment the
 * table is. The two reads are small: one row per wallet, one row per
 * line, and there are tens of them.
 */
export function useLedgerCheck(tenantId: string | null | undefined) {
  return useQuery<{ off: OffBooksRow[]; notSwitchedOn: boolean; wallets: number }>({
    queryKey: ["ledger-check", tenantId ?? ""],
    enabled: !!tenantId,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const supabase = createClient();

      const { data: wallets, error: wErr } = await supabase
        .from("wallets")
        .select("id, advertiser_id, eur_balance, usd_balance")
        .eq("tenant_id", tenantId!);
      if (wErr) throw wErr;

      const { data: lines, error: lErr } = await supabase
        .from("wallet_ledger")
        .select("wallet_id, currency, delta")
        .eq("tenant_id", tenantId!);
      if (lErr) {
        if (MISSING.test(lErr.message)) {
          return { off: [], notSwitchedOn: true, wallets: (wallets ?? []).length };
        }
        throw lErr;
      }

      const sums = new Map<string, number>();
      for (const l of (lines ?? []) as { wallet_id: string; currency: string; delta: unknown }[]) {
        const key = `${l.wallet_id}|${String(l.currency).toUpperCase()}`;
        sums.set(key, Math.round(((sums.get(key) ?? 0) + num(l.delta)) * 100) / 100);
      }

      const off: OffBooksRow[] = [];
      for (const w of (wallets ?? []) as {
        id: string;
        advertiser_id: string | null;
        eur_balance: unknown;
        usd_balance: unknown;
      }[]) {
        for (const cur of ["EUR", "USD"] as const) {
          const balance =
            Math.round(num(cur === "EUR" ? w.eur_balance : w.usd_balance) * 100) / 100;
          const fromLines = sums.get(`${w.id}|${cur}`) ?? 0;
          if (balance !== fromLines) {
            off.push({ advertiser_id: w.advertiser_id, currency: cur, balance, fromLines });
          }
        }
      }
      return { off, notSwitchedOn: false, wallets: (wallets ?? []).length };
    },
  });
}

/** The movements themselves, newest first. */
export function useLedgerLines(
  tenantId: string | null | undefined,
  opts: { source?: string; limit?: number } = {},
) {
  const { source = "", limit = 200 } = opts;
  return useQuery<{ rows: LedgerLine[]; notSwitchedOn: boolean }>({
    queryKey: ["ledger-lines", tenantId ?? "", source, limit],
    enabled: !!tenantId,
    queryFn: async () => {
      const supabase = createClient();
      let q = supabase
        .from("wallet_ledger")
        .select(
          "id, occurred_at, advertiser_id, wallet_id, currency, delta, balance_before, balance_after, source, reason, actor_user_id",
        )
        .eq("tenant_id", tenantId!)
        .order("occurred_at", { ascending: false })
        .limit(limit);
      if (source) q = q.eq("source", source);

      const { data, error } = await q;
      if (error) {
        if (MISSING.test(error.message)) return { rows: [], notSwitchedOn: true };
        throw error;
      }
      const rows = ((data ?? []) as Record<string, unknown>[]).map((r) => ({
        id: String(r.id),
        occurred_at: String(r.occurred_at),
        advertiser_id: (r.advertiser_id as string | null) ?? null,
        wallet_id: String(r.wallet_id),
        currency: String(r.currency ?? "EUR").toUpperCase(),
        // PostgREST hands numeric over as a string often enough that
        // every one of these goes through Number() rather than some.
        delta: num(r.delta),
        balance_before: num(r.balance_before),
        balance_after: num(r.balance_after),
        source: String(r.source ?? "unknown"),
        reason: (r.reason as string | null) ?? null,
        actor_user_id: (r.actor_user_id as string | null) ?? null,
      }));
      return { rows, notSwitchedOn: false };
    },
  });
}
