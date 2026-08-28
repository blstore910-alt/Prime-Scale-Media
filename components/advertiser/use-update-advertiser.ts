import { updateAdvertiser as updateAdvertiserAction } from "@/actions/admin-actions";
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
    Error,
    UpdatePayload
  >({
    mutationFn: async ({ id, payload }) => {
      const result = await updateAdvertiserAction(id, payload);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["user"] });
    },
  });
  return { updateAdvertiser, isPending };
}
