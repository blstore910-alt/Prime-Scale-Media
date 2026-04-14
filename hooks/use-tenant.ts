import { createClient } from "@/lib/supabase/client";
import { useQuery } from "@tanstack/react-query";

export default function useTenant(tenant_id: string | undefined) {
  const supabase = createClient();

  const {
    isLoading,
    isError,
    data: tenant,
    error,
  } = useQuery({
    queryKey: ["tenant", tenant_id],
    queryFn: async function () {
      const { data, error } = await supabase
        .from("tenants")
        .select()
        .eq("id", tenant_id);
      if (error) throw error;

      return data?.[0] ?? null;
    },
    enabled: !!tenant_id,
  });

  return { tenant, isLoading, isError, error };
}
