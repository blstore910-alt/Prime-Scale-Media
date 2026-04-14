import { createClient } from "@/lib/supabase/client";
import { PostgrestError } from "@supabase/supabase-js";
import { useMutation, useQueryClient } from "@tanstack/react-query";

type UpdatePayload = {
  id: string;
  payload: Partial<{
    startup_fee: number;
    fee_status: string;
    airtable: boolean;
    note: string;
    commission_type: string | null;
    commission_pct: number | null;
    commission_onetime: number | null;
    commission_monthly: number | null;
    commission_currency: string | null;
  }>;
};
export default function useUpdateAdvertiser() {
  const queryClient = useQueryClient();
  const { mutate: updateAdvertiser, isPending } = useMutation<
    unknown,
    PostgrestError,
    UpdatePayload
  >({
    mutationFn: async ({ id, payload }) => {
      const supabase = createClient();
      const { error, data } = await supabase
        .from("advertisers")
        .update(payload)
        .eq("id", id)
        .select("*");
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["user"] });
    },
  });
  return { updateAdvertiser, isPending };
}
