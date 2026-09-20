import { createClient } from "@/lib/supabase/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

type CurrencyCode = "USD" | "EUR";

type FormValues = {
  account_id: string;
  currency: CurrencyCode;
  amount: number;
};

type UseCreateAccountTopupOptions = {
  onSuccess: () => void;
};

export function useCreateAccountTopup({
  onSuccess,
}: UseCreateAccountTopupOptions) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["create-ad-account-topup"],
    mutationFn: async (values: FormValues) => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("top_up_create_for_advertiser", {
        p_account_id: values.account_id,
        p_currency: values.currency,
        p_amount_received: values.amount,
        p_type: "top-up",
        p_payment_slip: null,
      });

      if (error) throw error;

      // ── AN ANSWER IS NOT AN ERROR-FREE CALL ─────────────────────────
      //
      // Only `error` was checked and `data` was handed back unread, so a
      // refusal the RPC returns in its PAYLOAD rather than raising
      // resolved happily and the customer was told the money had gone
      // to their account over an unchanged wallet. The exchange dialog
      // was given this exact guard and says why: "A null row, or a row
      // carrying a refusal, resolved happily and the customer was told
      // ... over balances that had not moved."
      //
      // top_up_create_for_advertiser lives only on the live database, so
      // its return shape cannot be read from the repo. This accepts
      // anything that is not explicitly a refusal, and refuses null —
      // which is the one answer that can never mean "done".
      const row = (Array.isArray(data) ? data[0] : data) as
        | { ok?: boolean; error?: string; id?: string }
        | null
        | undefined;
      if (row === null || row === undefined) {
        throw new Error(
          "The top-up did not go through. Your wallet is unchanged — try again in a moment.",
        );
      }
      if (typeof row === "object" && row.ok === false) {
        throw new Error(
          row.error ??
            "The top-up did not go through. Your wallet is unchanged.",
        );
      }
      return data;
    },
    onSuccess: async () => {
      // "Taken from your wallet", not "on the account". The debit IS
      // immediate — the form says so — but the row lands in the admin
      // verify queue (psm-verify-ad-topups) which can reject it, so
      // promising it has arrived overstates the other half.
      toast.success("Taken from your wallet — we'll put it on the account");
      queryClient.invalidateQueries({ queryKey: ["top-ups"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["wallet"], exact: false });
      onSuccess();
    },
    onError: (err: Error) => {
      toast.error("Unable to request topup", {
        description: err.message,
      });
    },
  });
}
