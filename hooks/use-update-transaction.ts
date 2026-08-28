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
      } else if (payload.action === "reject") {
        const { error } = await supabase.rpc("wallet_topup_admin_reject", {
          p_topup_id: topup.id,
          p_reason: payload.rejectionReason ?? null,
        });
        if (error) throw error;
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
