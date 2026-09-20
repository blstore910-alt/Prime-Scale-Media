import {
  notifyWalletTopupRejected,
  notifyWalletTopupVerified,
} from "@/actions/wallet-topup-notify-actions";
import { createClient } from "@/lib/supabase/client";
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
      const supabase = createClient();

      if (payload.action === "approve") {
        const { error } = await supabase.rpc("wallet_topup_admin_verify", {
          p_topup_id: topup.id,
        });
        if (error) throw error;
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
        try {
          await notifyWalletTopupVerified(topup.id);
        } catch {
          /* the credit stands either way */
        }
      } else if (payload.action === "reject") {
        const { error } = await supabase.rpc("wallet_topup_admin_reject", {
          p_topup_id: topup.id,
          p_reason: payload.rejectionReason ?? null,
        });
        if (error) throw error;
        // The reason is written to the customer -- that is the whole
        // point of demanding one, and it reached the database and
        // stopped there.
        try {
          await notifyWalletTopupRejected(topup.id, payload.rejectionReason);
        } catch {
          /* the refusal stands either way */
        }
      } else if (payload.action === "undo") {
        const { error } = await supabase.rpc("wallet_topup_admin_undo", {
          p_topup_id: topup.id,
        });
        if (error) throw error;
      }
    },
    onSuccess: (_, variables) => {
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
