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
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["ad-accounts"] });
      // AND THE ROW'S OWN DETAIL CACHE, here rather than at each caller.
      //
      // AccountDetailsSheet reads ["account-details", id] with the app's
      // 30s staleTime. Two of the six screens that write through this hook
      // remembered to invalidate it themselves (update-account-form,
      // account-min-topup-dialog) and the rest did not — so the accounts
      // table's inline fee edit changed the row, showed the new number,
      // and reopening Details on that same account still printed the old
      // percentage. On the screen where the fee IS the product.
      //
      // One invalidation in the hook covers every caller, including the
      // next one. The two that already do it are now harmless repeats.
      if (vars?.id) {
        queryClient.invalidateQueries({
          queryKey: ["account-details", vars.id],
        });
      }
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
