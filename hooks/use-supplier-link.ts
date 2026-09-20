"use client";

import { useQuery } from "@tanstack/react-query";

import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";
import {
  normalizeSupplierUrl,
  supplierPillLabel,
  supplierUrlHost,
} from "@/lib/pure-supplier-link";

// ── WHERE AN ADMIN GOES TO DO THE TOP-UP BY HAND ─────────────────────
//
// One ad-account type tops up over the API. Every other type means an
// admin opens the supplier's own dashboard in another tab, moves the
// money there and comes back here to press Verify — and the review
// screen never said which supplier, let alone linked to one. With three
// or four suppliers in play that is a guess made against a customer's
// money, and the person who knows the mapping by heart is the one who
// is away when it matters.
//
// The chain is: top-up -> ad_accounts.platform (a type slug) ->
// ad_account_types (the supplier and its dashboard). Both reads are
// tenant-scoped and both are admin-only — the supplier's name must
// never reach an advertiser or an affiliate, in the UI or in the JSON
// behind it, so nothing customer-facing may call this hook.

export type SupplierLink = {
  /** What to print on the pill. */
  label: string;
  /** Normalised, http(s) only. Null when none is recorded. */
  url: string | null;
  /** For the line under the pill, so four open tabs stay tellable apart. */
  host: string;
  /** The ad-account type's own name, e.g. "Meta-EU-PSM". */
  typeLabel: string;
  /** True when this type funds itself and no hand top-up is needed. */
  apiEnabled: boolean;
};

type TypeRow = {
  slug: string | null;
  label: string | null;
  api_topup_enabled: boolean | null;
  supplier_label?: string | null;
  supplier_url?: string | null;
};

type AccountRow = {
  id: string;
  platform: string | null;
};

/**
 * Resolve the supplier behind each of a set of ad accounts.
 *
 * Pass the account ids on screen; the hook reads them in one go and
 * hands back a lookup. An empty list makes no request.
 */
export function useSupplierLinks(accountIds: string[]) {
  const { profile } = useAppContext();
  const tenantId = profile?.tenant_id;
  // Sorted and de-duplicated so the query key is stable across renders
  // that produce the same set in a different order.
  const ids = Array.from(new Set(accountIds.filter(Boolean))).sort();

  const { data } = useQuery({
    queryKey: ["supplier-links", tenantId, ids.join(",")],
    enabled: !!tenantId && ids.length > 0,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const supabase = createClient();

      // A COLUMN A MIGRATION HAS NOT ADDED YET. supplier_label/_url
      // arrive with 20260920120000; ask for them and, on error, ask
      // again without. The pill stays dark until the migration lands
      // instead of taking the review screen down with it.
      const BASE = "slug, label, api_topup_enabled";
      const typeQuery = (cols: string) =>
        supabase
          .from("ad_account_types")
          .select(cols)
          .eq("tenant_id", tenantId);

      let types = await typeQuery(`${BASE}, supplier_label, supplier_url`);
      if (types.error) types = await typeQuery(BASE);

      const accounts = await supabase
        .from("ad_accounts")
        .select("id, platform")
        .eq("tenant_id", tenantId)
        .in("id", ids);

      // A read we could not make is not "no supplier". Returning an
      // empty map would hide the pill and tell the admin nothing, which
      // is how they end up guessing; an error leaves the caller able to
      // say so.
      if (types.error || accounts.error) {
        throw types.error ?? accounts.error;
      }

      const bySlug = new Map<string, TypeRow>();
      for (const row of (types.data ?? []) as unknown as TypeRow[]) {
        const slug = String(row.slug ?? "").toLowerCase();
        if (slug) bySlug.set(slug, row);
      }

      const byAccount = new Map<string, SupplierLink>();
      for (const acct of (accounts.data ?? []) as unknown as AccountRow[]) {
        const slug = String(acct.platform ?? "").toLowerCase();
        const type = slug ? bySlug.get(slug) : undefined;
        if (!type) continue;
        const url = normalizeSupplierUrl(type.supplier_url);
        byAccount.set(String(acct.id), {
          label: supplierPillLabel(type.supplier_label, type.label),
          url,
          host: supplierUrlHost(type.supplier_url),
          typeLabel: String(type.label ?? "").trim(),
          apiEnabled: type.api_topup_enabled === true,
        });
      }
      return byAccount;
    },
  });

  return {
    supplierFor: (accountId: string | null | undefined): SupplierLink | null =>
      (accountId ? data?.get(String(accountId)) : null) ?? null,
  };
}
