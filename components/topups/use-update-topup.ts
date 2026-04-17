/* eslint-disable @typescript-eslint/no-explicit-any */
import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export default function useUpdateTopup() {
  const { profile } = useAppContext();
  const queryClient = useQueryClient();
  const { mutate: updateTopup, isPending } = useMutation<any, Error, any>({
    mutationKey: ["update-topup"],
    mutationFn: async (data) => {
      const supabase = createClient();
      const { data: updatedData, error } = await supabase
        .from("top_ups")
        .update({
          ...data.payload,
          updated_at: new Date().toISOString(),
          author: {
            id: profile?.id,
            name: profile?.full_name,
            email: profile?.email,
          },
        })
        .eq("id", data.topupId)
        .select()
        .order("created_at", { ascending: false })
        .single();

      if (error) throw error;

      return updatedData;
    },
    onSuccess: async (data) => {
      await updateTopupLogs(data, data.is_deleted ? "delete" : "update");
      // Delay invalidation to prevent sheet from closing
      // This updates the list in the background without affecting the detail view
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
