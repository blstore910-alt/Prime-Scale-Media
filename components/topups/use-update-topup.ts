/* eslint-disable @typescript-eslint/no-explicit-any */
import { updateTopupAsAdmin } from "@/actions/topup-actions";
import { createClient } from "@/lib/supabase/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export default function useUpdateTopup() {
  const queryClient = useQueryClient();
  const { mutate: updateTopup, isPending } = useMutation<any, Error, any>({
    mutationKey: ["update-topup"],
    mutationFn: async (data) => {
      const result = await updateTopupAsAdmin(data.topupId, data.payload);
      if (!result.ok) throw new Error(result.error);
      // Return payload for onSuccess side-effects (topup_logs)
      return { id: data.topupId, ...data.payload };
    },
    onSuccess: async (data) => {
      await updateTopupLogs(data, data.is_deleted ? "delete" : "update");
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["top-ups"], exact: false });
      }, 500);
    },
  });

  return { updateTopup, isPending };
}

export const updateTopupLogs = async (data: any, action: string) => {
  const supabase = createClient();
  const {
    id,
    fee,
    topup_amount,
    amount_received,
    amount_usd,
    author,
    currency,
    status,
    is_deleted,
  } = data;
  const payload = {
    topup_id: id,
    updated_by: author.id,
    action,
    author,
    new_values: {
      fee,
      topup_amount,
      amount_received,
      amount_usd,
      currency,
      status,
      is_deleted,
    },
  };

  const { error } = await supabase.from("topup_logs").insert(payload);
  if (error) throw error;
  return data;
};
