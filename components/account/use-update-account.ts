import { toastResult } from "@/lib/action-warning";
import { updateAdAccountAsAdmin } from "@/actions/ad-account-actions";
import { AdAccount } from "@/lib/types/account";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface UpdateAccountArgs {
  id: string;
  payload: Partial<AdAccount>;
  /**
   * The `updated_at` the screen was looking at when the admin typed.
   *
   * WITHOUT THIS THE GUARD WAS DEAD. updateAdAccountAsAdmin takes an
   * ifUpdatedAt and calls versionMatches -- but versionMatches(x,
   * undefined) returns TRUE, and this interface had no field to put it
   * in, so all six screens that write through this hook were
   * structurally unable to send one. Every write was last-one-wins.
   *
   * `fee` is in the action's allowlist and resolveEffectiveFeePct puts
   * the ad account's own fee FIRST, above the plan. So: the owner sets
   * 4% on a premium account from Details while an employee admin has the
   * same row open in the table's inline fee cell at 2% and presses the
   * tick. 2% wins, silently, and it is our own margin on every future
   * top-up of that account. Nothing on any screen says a value was
   * overwritten.
   *
   * Pass the row's updated_at whenever you have it. A stale cached one
   * is exactly what makes the guard fire -- that is the point.
   */
  ifUpdatedAt?: string;
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

    mutationFn: async ({ id, payload, ifUpdatedAt }: UpdateAccountArgs) => {
      const result = await updateAdAccountAsAdmin(id, payload, ifUpdatedAt);
      if (!result.ok) throw new Error(result.error);
      return { warning: result.warning };
    },
    onSuccess: (res, vars) => {
      // The supplier-fee warnings were dropped here. They say what could
      // not be kept in step on the supplier side, which nobody can act on
      // if they never see it.
      if (res?.warning) {
        toastResult(res, "Ad account updated");
      }
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
