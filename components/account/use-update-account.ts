import { updateAdAccountAsAdmin } from "@/actions/ad-account-actions";
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
      const result = await updateAdAccountAsAdmin(id, payload);
      if (!result.ok) throw new Error(result.error);
      return null;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ad-accounts"] });
    },
  });

  return { updateAccount, isPending, isError, error };
}
