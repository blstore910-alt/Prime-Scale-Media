import { createClient } from "@/lib/supabase/client";
import { Topup } from "@/lib/types/topup";
import { useQuery } from "@tanstack/react-query";

export default function useRecentTopups() {
  const supabase = createClient();

  return useQuery({
    queryKey: ["top-ups", "recent"],
    queryFn: async () => {
      // Calculate 1 hour ago
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

      const { data, error } = await supabase
        .from("top_ups")
        .select("*")
        .gte("created_at", oneHourAgo)
        .order("created_at", { ascending: false });

      if (error) {
        throw error;
      }

      return (data ?? []) as Topup[];
    },
  });
}
