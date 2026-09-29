"use client";

// ── WELKE COMMISSIES ZITTEN ER IN DEZE UITBETALING ──────────────────
//
// De eigenaar, 29-09: "bij payouts als ik op 1 tile klik moet ik
// detailed zien welke commissies etc, per commissie en per groep."
//
// Een uitbetaling is vandaag een bedrag en een aantal ("12
// commissions"). Dat is genoeg om hem te herkennen en te weinig om
// hem te controleren: als een affiliate vraagt waar zijn EUR 99,96
// vandaan komt, is het antwoord "twaalf regels" en dan moet iemand
// naar de database.
//
// `referral_commissions.payout_id` wordt gestempeld door
// `affiliate_payout_request`, dus de koppeling bestaat al -- ze is
// alleen nooit teruggelezen.
//
// WAAROM NIET DE VIEW. `referral_commissions_with_details` draagt de
// namen maar NIET `payout_id` (gemeten), dus daar valt niet op te
// filteren. Dus: de tabel voor de bedragen, en de link apart voor de
// naam van de klant waar de commissie op verdiend is. Twee smalle
// leesacties in plaats van een view aanpassen die op vijf schermen
// wordt gebruikt.

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export type PayoutCommission = {
  id: string;
  payout_id: string;
  created_at: string;
  type: string | null;
  amount: number;
  currency: string;
  status: string | null;
  /** Waar het over gerekend is, als de accrual dat heeft vastgelegd. */
  base_amount: number | null;
  pct: number | null;
  source: string | null;
  /** De klant waar deze commissie op is verdiend. */
  customer: string | null;
  customerCode: string | null;
};

const MISSING = /42P01|42703|does not exist/i;

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * @param payoutIds de uitbetalingen van EEN groep. Leeg of null =
 *   niets lezen, zodat een dichtgeklapte rij geen query doet.
 */
export function usePayoutCommissions(payoutIds: string[] | null) {
  const ids = (payoutIds ?? []).filter(Boolean).sort();
  return useQuery<{ rows: PayoutCommission[]; notSwitchedOn: boolean }>({
    // De ids IN de sleutel, gesorteerd: twee groepen naast elkaar open
    // mogen elkaars antwoord niet krijgen.
    queryKey: ["payout-commissions", ids.join(",")],
    enabled: ids.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("referral_commissions")
        .select(
          "id, payout_id, created_at, type, amount, currency, status, base_amount, pct, source, referral_link_id",
        )
        .in("payout_id", ids)
        .order("created_at", { ascending: true });
      if (error) {
        // Vóór plak 50 bestaat payout_id niet. Dan is het scherm niet
        // stuk, er is alleen nog niets te tonen.
        if (MISSING.test(error.message)) {
          return { rows: [], notSwitchedOn: true };
        }
        throw error;
      }

      const raw = (data ?? []) as Record<string, unknown>[];
      const linkIds = [
        ...new Set(
          raw
            .map((r) => (r.referral_link_id as string | null) ?? "")
            .filter(Boolean),
        ),
      ];

      // De naam van de klant. Een mislukte lees hiervan maakt de
      // bedragen niet verkeerd, dus die laat de regels staan met een
      // lege naam in plaats van het hele paneel te laten vallen -- maar
      // hij liegt ook niet: er komt een streepje, geen verzonnen naam.
      const names = new Map<string, { name: string | null; code: string | null }>();
      if (linkIds.length) {
        const { data: links } = await supabase
          .from("referral_links_with_details")
          .select(
            "id, referred_advertiser_name, referred_advertiser_tenant_client_code",
          )
          .in("id", linkIds);
        for (const l of (links ?? []) as Record<string, unknown>[]) {
          names.set(String(l.id), {
            name: (l.referred_advertiser_name as string | null) ?? null,
            code:
              (l.referred_advertiser_tenant_client_code as string | null) ??
              null,
          });
        }
      }

      return {
        rows: raw.map((r) => {
          const who = names.get(String(r.referral_link_id ?? "")) ?? {
            name: null,
            code: null,
          };
          return {
            id: String(r.id),
            payout_id: String(r.payout_id ?? ""),
            created_at: String(r.created_at ?? ""),
            type: (r.type as string | null) ?? null,
            amount: num(r.amount),
            currency: String(r.currency ?? "EUR").toUpperCase(),
            status: (r.status as string | null) ?? null,
            base_amount:
              r.base_amount === null || r.base_amount === undefined
                ? null
                : num(r.base_amount),
            pct: r.pct === null || r.pct === undefined ? null : num(r.pct),
            source: (r.source as string | null) ?? null,
            customer: who.name,
            customerCode: who.code,
          };
        }),
        notSwitchedOn: false,
      };
    },
  });
}
