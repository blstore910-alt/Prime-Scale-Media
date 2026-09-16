import { updateAdAccountAsAdmin } from "@/actions/ad-account-actions";
import { AdAccount } from "@/lib/types/account";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

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
    // There was no onError at all, and every one of the six screens using
    // this hook writes to a REAL ad account — fee, status, minimum top-up.
    // A refusal (tenant guard, maintenance mode, a stale updated_at) threw
    // into nothing: no toast, no rollback, and the cell went on showing the
    // number that was never written. Silence is the worst possible answer
    // there, because the next person to look believes the screen.
    //
    // Callers that hold their own optimistic copy pass their own onError to
    // mutate() to put it back; react-query runs both, so they do not have to
    // repeat this message.
    onError: (err: Error) => {
      toast.error("Couldn't save the ad account", {
        description: err.message,
      });
      queryClient.invalidateQueries({ queryKey: ["ad-accounts"] });
    },
  });

  return { updateAccount, isPending, isError, error };
}
