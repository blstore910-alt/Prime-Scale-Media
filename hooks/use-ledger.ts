"use client";

import { useQuery } from "@tanstack/react-query";

import { createClient } from "@/lib/supabase/client";
import { pageAllRows } from "@/lib/page-all-rows";

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

// ── "DOES NOT EXIST" IS TWO DIFFERENT ANSWERS ─────────────────────
//
// This was `/42P01|does not exist|schema cache|PGRST20\d/i`, and the
// bare "does not exist" catches the message for a missing COLUMN as
// well: `column wallet_ledger.xyz does not exist`. That is the pending
// -migration case CLAUDE.md warns about -- code ships in minutes,
// migrations are pasted by hand -- and it made the whole page render
// "Not switched on in the database yet, run plak 125" over a live
// ledger full of lines. The owner runs 125, it says it was already
// there, and nothing improves.
//
// So: only a missing RELATION counts. 42P01 is the relation code;
// 42703 (undefined column) deliberately falls through and throws, so
// the screen says it could not read rather than that there is nothing
// to read.
const MISSING = /42P01|relation .* does not exist|schema cache|PGRST20\d/i;

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
  source_id: string | null;
  reason: string | null;
  actor_user_id: string | null;
};

export type OffBooksRow = {
  advertiser_id: string | null;
  currency: string;
  balance: number;
  fromLines: number;
  /** Lines whose wallet no longer exists. There is no balance to
   *  compare them against, so they are their own kind of wrong. */
  orphan?: boolean;
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

      // Allebei gepagineerd. Afkappen van `wallet_ledger` faalt luid --
      // de saldi kloppen dan niet meer en de controle zegt dat ook.
      // Afkappen van `wallets` is de stille helft: dan zegt het scherm
      // "elk saldo klopt (N wallets)" over minder wallets dan er zijn,
      // en dat is een goedkeuring over iets wat niet bekeken is.
      const wRes = await pageAllRows<{
        id: string;
        advertiser_id: string | null;
        eur_balance: unknown;
        usd_balance: unknown;
      }>((from, to) =>
        supabase
          .from("wallets")
          .select("id, advertiser_id, eur_balance, usd_balance")
          .eq("tenant_id", tenantId!)
          .order("id", { ascending: true })
          .range(from, to),
      );
      if (wRes.error) throw new Error(wRes.error);
      const wallets = wRes.rows;

      const lRes = await pageAllRows<{
        wallet_id: string;
        currency: string | null;
        delta: unknown;
      }>((from, to) =>
        supabase
          .from("wallet_ledger")
          .select("wallet_id, currency, delta")
          .eq("tenant_id", tenantId!)
          .order("id", { ascending: true })
          .range(from, to),
      );
      const lines = lRes.rows;
      const lErr = lRes.error ? { message: lRes.error } : null;
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
      // ── A LINE WHOSE WALLET IS GONE ─────────────────────────────
      //
      // The loop above walks WALLETS and looks their lines up. A line
      // whose wallet was deleted is never visited, and there is no
      // foreign key on wallet_ledger.wallet_id (measured 29-09: zero
      // constraints). So deleting a funded wallet takes the balance
      // away, leaves the lines orphaned, and this verdict goes green --
      // the one action this page exists to catch erases its own alarm.
      //
      // Simulated on the live data: drop the wallet holding EUR 340.00
      // of lines and the check returns nothing to report.
      const known = new Set((wallets ?? []).map((w) => (w as { id: string }).id));
      const orphanSums = new Map<string, number>();
      for (const l of (lines ?? []) as { wallet_id: string; currency: string; delta: unknown }[]) {
        if (known.has(l.wallet_id)) continue;
        const cur = String(l.currency).toUpperCase();
        orphanSums.set(cur, Math.round(((orphanSums.get(cur) ?? 0) + num(l.delta)) * 100) / 100);
      }
      for (const [currency, fromLines] of orphanSums) {
        if (fromLines === 0) continue;
        off.push({ advertiser_id: null, currency, balance: 0, fromLines, orphan: true });
      }

      return { off, notSwitchedOn: false, wallets: (wallets ?? []).length };
    },
  });
}

/**
 * Hoeveel bewegingen per bron — over ALLE rijen, niet over een pagina.
 *
 * De chips werden geteld uit `useLedgerLines`, en die heeft een
 * `.limit(200)`. Het getal op elke chip was dus het aantal binnen de
 * nieuwste tweehonderd, gepresenteerd als het totaal — en het
 * commentaar erboven beweerde letterlijk "the counts are the real
 * ones". Dat was waar op de dag dat het geschreven werd en niet meer
 * zodra er 201 bewegingen zijn.
 *
 * Alleen de kolom `source`, dus de lees blijft goedkoop ook als het
 * grootboek groot wordt. `truncated` gaat mee naar buiten: een chip
 * met een te laag getal is nog steeds een getal, en de gebruiker hoort
 * te weten wanneer het een ondergrens is.
 */
export function useLedgerSourceCounts(tenantId: string | null | undefined) {
  return useQuery<{
    counts: [string, number][];
    truncated: boolean;
    notSwitchedOn: boolean;
  }>({
    queryKey: ["ledger-source-counts", tenantId ?? ""],
    enabled: !!tenantId,
    queryFn: async () => {
      const supabase = createClient();
      const res = await pageAllRows<{ source: string | null }>((from, to) =>
        supabase
          .from("wallet_ledger")
          .select("source")
          .eq("tenant_id", tenantId!)
          .order("id", { ascending: true })
          .range(from, to),
      );
      if (res.error) {
        if (MISSING.test(res.error)) {
          return { counts: [], truncated: false, notSwitchedOn: true };
        }
        throw new Error(res.error);
      }
      const seen = new Map<string, number>();
      for (const r of res.rows) {
        const k = String(r.source ?? "unknown");
        seen.set(k, (seen.get(k) ?? 0) + 1);
      }
      return {
        counts: [...seen.entries()].sort((a, b) => b[1] - a[1]),
        truncated: res.truncated,
        notSwitchedOn: false,
      };
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
          "id, occurred_at, advertiser_id, wallet_id, currency, delta, balance_before, balance_after, source, source_id, reason, actor_user_id",
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
        source_id: (r.source_id as string | null) ?? null,
        reason: (r.reason as string | null) ?? null,
        actor_user_id: (r.actor_user_id as string | null) ?? null,
      }));
      return { rows, notSwitchedOn: false };
    },
  });
}

/**
 * WHAT MOVED BEFORE THE LEDGER EXISTED.
 *
 * The ledger is authoritative from 28-09 and not one day earlier. But
 * the money before that date is not gone — `audit_events` carries the
 * `before_data` and `after_data` of every write to `wallets` since
 * 30-08, and a balance change is visible in there. Measured 29-09: 66
 * UPDATE rows, of which 45 moved EUR and 5 moved USD.
 *
 * ── WHY THIS IS NOT BACKFILLED INTO THE LEDGER ────────────────────
 *
 * It would break the one check that matters. Every wallet already
 * carries one `opening` line equal to its CURRENT balance, so adding
 * 50 reconstructed lines on top makes balance ≠ sum-of-lines for every
 * wallet touched — the daily "do the books add up" would go red and
 * stay red, and the only way to fix it would be to rewrite the opening
 * lines, on an append-only table.
 *
 * So the reconstruction stays out of the ledger and is shown beside
 * it, labelled for what it is. Nothing here is proof: the audit log
 * records what a row looked like before and after, not why, and an
 * actor is missing on the 11 rows written by the service role before
 * plak 132 made it carry one.
 */
export type PriorMove = {
  occurred_at: string;
  currency: string;
  delta: number;
  balance_before: number;
  balance_after: number;
  actor_user_id: string | null;
};

export function useLedgerPriorMoves(tenantId: string | null | undefined) {
  return useQuery<{ rows: PriorMove[]; notSwitchedOn: boolean }>({
    queryKey: ["ledger-prior", tenantId ?? ""],
    enabled: !!tenantId,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("audit_events")
        .select("occurred_at, actor_user_id, before_data, after_data")
        .eq("tenant_id", tenantId!)
        .eq("table_name", "wallets")
        .eq("action", "UPDATE")
        .order("occurred_at", { ascending: false })
        .limit(300);
      if (error) {
        if (MISSING.test(error.message)) return { rows: [], notSwitchedOn: true };
        throw error;
      }

      const rows: PriorMove[] = [];
      for (const e of (data ?? []) as {
        occurred_at: string;
        actor_user_id: string | null;
        before_data: Record<string, unknown> | null;
        after_data: Record<string, unknown> | null;
      }[]) {
        for (const [cur, key] of [
          ["EUR", "eur_balance"],
          ["USD", "usd_balance"],
        ] as const) {
          const before = num(e.before_data?.[key]);
          const after = num(e.after_data?.[key]);
          const delta = Math.round((after - before) * 100) / 100;
          // Most of these rows are an `updated_at` touch and nothing
          // else — 20 of the 66. A movement of zero is not a movement.
          if (delta === 0) continue;
          rows.push({
            occurred_at: e.occurred_at,
            currency: cur,
            delta,
            balance_before: Math.round(before * 100) / 100,
            balance_after: Math.round(after * 100) / 100,
            actor_user_id: e.actor_user_id,
          });
        }
      }
      return { rows, notSwitchedOn: false };
    },
  });
}
