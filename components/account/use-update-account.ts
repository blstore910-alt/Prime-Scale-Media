import { createClient } from "@/lib/supabase/client";
import { AdAccount } from "@/lib/types/account";
import { useMutation, useQueryClient } from "@tanstack/react-query";

interface UpdateAccountArgs {
  id: string;
  payload: Partial<AdAccount>;
}

export default function useUpdateAccount() {
  const queryClient = useQueryClient();
  const {
    mutate: updateAccount,
    isPending,
    isError,
    error,
  } = useMutation({
    mutationKey: ["update-account"],

    mutationFn: async ({ id, payload }: UpdateAccountArgs) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("ad_accounts")
        .update(payload)
        .eq("id", id)
        .select();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ad-accounts"] });
    },
  });

  return { updateAccount, isPending, isError, error };
}
