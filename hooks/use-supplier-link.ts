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
  /** What WE pay the supplier on this type, as a percent (Settings ->
   *  Ad account types, "We pay %"). ADMIN-ONLY cost data. Null = not set,
   *  which is not 0. */
  feePct: number | null;
};

type TypeRow = {
  id: string;
  slug: string | null;
  label: string | null;
  api_topup_enabled: boolean | null;
};

/**
 * The supplier side lives on its own table, because ad_account_types is
 * readable by ANY member of the tenant — deliberately, so the
 * ad-account create form can list the labels — and a supplier's name,
 * dashboard and price are not a customer's business. See
 * 20260920140000_supplier_link_admin_only.sql.
 */
type SupplierRow = {
  ad_account_type_id: string;
  supplier_label: string | null;
  supplier_url: string | null;
  supplier_fee_pct?: number | string | null;
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

      const types = await supabase
        .from("ad_account_types")
        .select("id, slug, label, api_topup_enabled")
        .eq("tenant_id", tenantId);

      // A TABLE A MIGRATION HAS NOT CREATED YET. This one is separate
      // from the types read on purpose: the types ARE the screen, and a
      // supplier link that cannot be read must leave the queue working.
      // Its error is swallowed for that reason and only that one.
      let suppliers: { data: unknown[] | null; error: unknown } = await supabase
        .from("ad_account_type_suppliers")
        .select("ad_account_type_id, supplier_label, supplier_url, supplier_fee_pct")
        .eq("tenant_id", tenantId);
      if (suppliers.error) {
        // The fee column is the newest part; the pill must not depend on it.
        suppliers = await supabase
          .from("ad_account_type_suppliers")
          .select("ad_account_type_id, supplier_label, supplier_url")
          .eq("tenant_id", tenantId);
      }

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

      const supplierByType = new Map<string, SupplierRow>();
      for (const row of (suppliers.data ?? []) as unknown as SupplierRow[]) {
        supplierByType.set(String(row.ad_account_type_id), row);
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
        const sup = supplierByType.get(String(type.id));
        const url = normalizeSupplierUrl(sup?.supplier_url);
        byAccount.set(String(acct.id), {
          label: supplierPillLabel(sup?.supplier_label, type.label),
          url,
          host: supplierUrlHost(sup?.supplier_url),
          typeLabel: String(type.label ?? "").trim(),
          apiEnabled: type.api_topup_enabled === true,
          feePct:
            sup?.supplier_fee_pct === null || sup?.supplier_fee_pct === undefined
              ? null
              : Number.isFinite(Number(sup.supplier_fee_pct))
                ? Number(sup.supplier_fee_pct)
                : null,
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
