import { createClient } from "@/lib/supabase/client";
import { WalletTopupWithAdvertiser } from "@/lib/types/wallet-topup";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

type UpdateAction = "approve" | "reject" | "undo";

interface UpdateTransactionPayload {
  status: "completed" | "rejected" | "pending";
  approved_by?: string | null;
  rejection_reason?: string | null;
  amount?: number | string;
}

export const useUpdateTransaction = (topup: WalletTopupWithAdvertiser) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      action: UpdateAction;
      data: UpdateTransactionPayload;
      rejectionReason?: string;
      approverId?: string;
    }) => {
      const supabase = createClient();

      // Update the transaction
      const updateData: Record<string, string | number | null | undefined> = {
        status: payload.data.status,
        updated_at: new Date().toISOString(),
        amount: payload.data.amount,
      };

      // Add optional fields based on action
      if (payload.action === "approve" && payload.approverId) {
        updateData.approved_by = payload.approverId;
      } else if (payload.action === "reject") {
        updateData.rejection_reason = payload.rejectionReason || null;
      } else if (payload.action === "undo") {
        updateData.approved_by = null;
        updateData.rejection_reason = null;
      }

      const { error: transactionError } = await supabase
        .from("wallet_topups")
        .update(updateData)
        .eq("id", topup.id);

      if (transactionError) throw transactionError;
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
