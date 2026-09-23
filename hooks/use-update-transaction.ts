import {
  notifyWalletTopupRejected,
  notifyWalletTopupVerified,
} from "@/actions/wallet-topup-notify-actions";
// ── THROUGH A DOOR THAT CAN BE LOCKED ──────────────────────────────
//
// These three used to be `supabase.rpc(...)` from this client component
// with the browser's own session. So MAINTENANCE_MODE=true froze the
// ad-account queue and left the LARGER money event -- crediting a
// customer's wallet off a bank transfer -- wide open, a deactivated
// admin kept the power to do it (the RPCs test `role` and nothing
// else), and a wallet credit left no trace in the server logs. The RPC
// is still what writes; it is simply reached through a guard now.
import {
  rejectWalletTopupAsAdmin,
  undoWalletTopupAsAdmin,
  verifyWalletTopupAsAdmin,
} from "@/actions/wallet-topup-decide-actions";
import { WalletTopupWithAdvertiser } from "@/lib/types/wallet-topup";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

type UpdateAction = "approve" | "reject" | "undo";

export const useUpdateTransaction = (topup: WalletTopupWithAdvertiser) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      action: UpdateAction;
      rejectionReason?: string;
    }) => {
      let notifyProblem: string | null = null;

      if (payload.action === "approve") {
        const res = await verifyWalletTopupAsAdmin(topup.id);
        if (!res.ok) throw new Error(res.error);
        // ── AND TELL THE CUSTOMER ────────────────────────────────
        //
        // This is the money-in event of the product: someone wired
        // money and it has now landed in their wallet. Until this
        // line the only feedback in the whole system was a toast on
        // THIS admin's screen, and the customer's way of finding out
        // was to open the app and compare a figure to what they
        // remembered. Best effort and after the RPC, like every other
        // notify on a money path -- the credit has happened, and
        // failing the mutation now would say it had not.
        // The OUTCOME, not a shrug. "Credited, but the customer was
        // not told" is exactly the thing somebody has to act on, and it
        // was being swallowed twice over: once by this catch and once
        // by notifyAdvertiser's own. I watched a EUR 300 verify and a
        // EUR 1,000 refusal both reach the customer's bell as nothing
        // at all, with no way to see why from outside the database.
        try {
          const n = await notifyWalletTopupVerified(topup.id);
          if (!n.ok) notifyProblem = n.error;
        } catch (e) {
          notifyProblem = e instanceof Error ? e.message : "unknown";
        }
      } else if (payload.action === "reject") {
        const res = await rejectWalletTopupAsAdmin(
          topup.id,
          payload.rejectionReason ?? "",
        );
        if (!res.ok) throw new Error(res.error);
        // The reason is written to the customer -- that is the whole
        // point of demanding one, and it reached the database and
        // stopped there.
        try {
          const n = await notifyWalletTopupRejected(
            topup.id,
            payload.rejectionReason,
          );
          if (!n.ok) notifyProblem = n.error;
        } catch (e) {
          notifyProblem = e instanceof Error ? e.message : "unknown";
        }
      } else if (payload.action === "undo") {
        const res = await undoWalletTopupAsAdmin(topup.id);
        if (!res.ok) throw new Error(res.error);
      }
      return { notifyProblem };
    },
    onSuccess: (res, variables) => {
      const messages = {
        approve: {
          title: "Payment approved",
          description: "The wallet transaction is now completed.",
        },
        reject: {
          title: "Payment rejected",
          description: undefined,
        },
        undo: {
          title: "Transaction undone",
          description: "The wallet transaction has been reset to pending.",
        },
      };

      const message = messages[variables.action];
      toast.success(message.title, {
        description: message.description,
      });

      // ── AND SAY IT IF THE CUSTOMER WAS NOT TOLD ─────────────────
      //
      // The money has moved either way, so this is a warning and not a
      // failure — but it is the admin's to know. Until this line the
      // notification silently not being written looked exactly like it
      // having been written, from every screen we have.
      const problem = (res as { notifyProblem?: string | null } | undefined)
        ?.notifyProblem;
      if (problem) {
        toast.warning("The customer was NOT notified", {
          description: `${problem}. Tell them by hand, and send me this line.`,
          duration: 12_000,
        });
      }

      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ["wallet-transactions"] });
      // ── AND THE BANK-DEPOSIT PANEL BESIDE IT ───────────────────────
      //
      // All three panels on /wallet-topups are mounted at once and merely
      // hidden, so nothing remounts when the operator switches tab. This
      // credited the wallet and left the Wise card still reading "Ready
      // to credit" with Confirm & credit armed — clicking it then hits
      // "Topup no longer pending" and shows a red failure toast about a
      // payment that went through perfectly.
      queryClient.invalidateQueries({ queryKey: ["wise-incoming"] });
      queryClient.invalidateQueries({ queryKey: ["matched-deposits"] });
      queryClient.invalidateQueries({ queryKey: ["wise-match-candidates"] });
      queryClient.invalidateQueries({ queryKey: ["money-in-counts"] });
      queryClient.invalidateQueries({
        queryKey: ["wallet-transaction-details", topup.id],
      });
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
    },
    onError: (err: Error, variables) => {
      const errorMessages = {
        approve: "Failed to approve payment",
        reject: "Failed to reject payment",
        undo: "Failed to undo transaction",
      };

      toast.error(errorMessages[variables.action], {
        description: err.message,
      });
    },
  });
};
