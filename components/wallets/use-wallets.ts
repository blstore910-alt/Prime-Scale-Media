import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";
import { WalletWithAdvertiser } from "@/lib/types/wallet";
import { useQuery } from "@tanstack/react-query";

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
      const { data, error } = await supabase
        .from("wallets")
        .select(
          "*, advertiser:advertisers(tenant_client_code, profile:user_profiles(full_name, email))",
        )
        .eq("tenant_id", profile?.tenant_id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as WalletWithAdvertiser[];
    },
  });

  return { wallets: wallets ?? [], isLoading, isError, error };
}
