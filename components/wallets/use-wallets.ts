import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";
import { WalletWithAdvertiser } from "@/lib/types/wallet";
import { useQuery } from "@tanstack/react-query";
import { pageAllRows } from "@/lib/page-all-rows";

export default function useWallets() {
  const { profile } = useAppContext();

  const {
    data: wallets,
    isLoading,
    isError,
    error,
  } = useQuery<WalletWithAdvertiser[]>({
    queryKey: ["wallets", profile?.tenant_id],
    enabled: profile?.role === "admin" && !!profile?.tenant_id,
    queryFn: async () => {
      const supabase = createClient();
      // ── NO .limit() DOES NOT MEAN "ALL OF THEM" ───────────────────
      //
      // It means PostgREST's default ceiling, returned with no error and
      // no marker. Every filter, sort and page on /wallets is computed
      // in the browser from this one array, so past the cap searching
      // for a customer beyond it prints "No wallets found." -- about a
      // customer who exists and holds money.
      //
      // A unique tiebreaker after created_at, because wallets are
      // created in batches at signup and rows sharing a timestamp have
      // no defined order: one could appear twice or vanish across a page
      // boundary.
      const paged = await pageAllRows<WalletWithAdvertiser>(
        (from: number, to: number) =>
          supabase
            .from("wallets")
            .select(
              "*, advertiser:advertisers(tenant_client_code, profile:user_profiles(full_name, email))",
            )
            .eq("tenant_id", profile?.tenant_id)
            .order("created_at", { ascending: false })
            .order("id", { ascending: true })
            .range(from, to),
      );
      if (paged.error) throw new Error(paged.error);
      return paged.rows;
    },
  });

  return { wallets: wallets ?? [], isLoading, isError, error };
}
