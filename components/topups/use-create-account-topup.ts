import { createClient } from "@/lib/supabase/client";
import { AdAccount } from "@/lib/types/account";
import { Wallet } from "@/lib/types/wallet";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

type CurrencyCode = "USD" | "EUR";

type AccountRecord = Pick<
  AdAccount,
  "id" | "name" | "fee" | "advertiser_id" | "tenant_id" | "platform"
> & {
  advertiser?: { tenant_client_code?: string | null } | null;
};

type FormValues = {
  account_id: string;
  currency: CurrencyCode;
  amount: number;
};

type UseCreateAccountTopupOptions = {
  selectedAccount: AccountRecord | null;
  wallet: Wallet | null;
  exchangeRates: { eur: number | string }[] | null | undefined;
  profile: {
    id?: string;
    full_name?: string;
    email?: string;
  } | null;

  onSuccess: () => void;
};

export function useCreateAccountTopup({
  selectedAccount,
  wallet,
  exchangeRates,
  profile,
  onSuccess,
}: UseCreateAccountTopupOptions) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["create-ad-account-topup", selectedAccount?.id, wallet?.id],
    mutationFn: async (values: FormValues) => {
      if (!selectedAccount) {
        throw new Error("Select an ad account to continue.");
      }
      if (!wallet) {
        throw new Error("Wallet not found for this advertiser.");
      }

      const supabase = createClient();
      const amountValue = Number(values.amount);

      // compute fee and topup amounts
      let currentFee = Number(selectedAccount.fee);
      const isEuMeta = selectedAccount.platform === "eu-meta-premium";

      if (isEuMeta) {
        currentFee = Math.max(0, currentFee - 2);
      }

      const fee_amount = Number((amountValue * (currentFee / 100)).toFixed(2));
      const topup_amount = Number((amountValue - fee_amount).toFixed(2));

      // compute exchange conversions
      const eurRate =
        exchangeRates && exchangeRates.length > 0
          ? Number(exchangeRates[0].eur)
          : 1;

      let amount_usd: number;
      let topup_usd: number;
      let eur_value: number;
      let eur_topup: number;

      if (values.currency === "USD") {
        amount_usd = amountValue;
        topup_usd = topup_amount;
        eur_value =
          eurRate > 0
            ? Number((amountValue / eurRate).toFixed(2))
            : amountValue;
        eur_topup =
          eurRate > 0
            ? Number((topup_amount / eurRate).toFixed(2))
            : topup_amount;
      } else {
        // currency is EUR
        amount_usd = Number((amountValue * eurRate).toFixed(2));
        topup_usd = Number((topup_amount * eurRate).toFixed(2));
        eur_value = amountValue;
        eur_topup = topup_amount;
      }

      const payload = {
        advertiser_id: selectedAccount.advertiser_id,
        account_id: selectedAccount.id,
        topup_amount: topup_amount.toFixed(2),
        amount_received: amountValue.toFixed(2),
        currency: values.currency,
        fee: currentFee,
        fee_amount: fee_amount.toFixed(2),
        amount_usd: amount_usd.toFixed(2),
        topup_usd: topup_usd.toFixed(2),
        eur_value: eur_value.toFixed(2),
        eur_topup: eur_topup.toFixed(2),
        rate: eurRate,
        tenant_id: selectedAccount.tenant_id,
        author: {
          id: profile?.id,
          name: profile?.full_name,
          email: profile?.email,
        },
      };

      const { data: topupData, error: topupError } = await supabase
        .from("top_ups")
        .insert(payload)
        .select()
        .single();

      if (topupError) throw topupError;

      const currencyField =
        values.currency === "EUR" ? "eur_balance" : "usd_balance";

      const { data: walletUpdateData, error: walletUpdateError } =
        await supabase
          .from("wallets")
          .update({
            [currencyField]: (wallet[currencyField] as number) - amountValue,
            updated_at: new Date().toISOString(),
          })
          .eq("id", wallet?.id)
          .gte(currencyField, amountValue)
          .select();

      if (walletUpdateError) {
        // rollback: remove the inserted topup
        await supabase.from("top_ups").delete().eq("id", topupData.id);
        throw walletUpdateError;
      }

      if (
        !walletUpdateData ||
        (Array.isArray(walletUpdateData) && walletUpdateData.length === 0)
      ) {
        // rollback inserted topup
        await supabase.from("top_ups").delete().eq("id", topupData.id);
        throw new Error(
          "Failed to deduct wallet balance. Insufficient funds or wallet not found.",
        );
      }

      return topupData;
    },
    onSuccess: async () => {
      toast.success("Topup requested successfully");
      queryClient.invalidateQueries({ queryKey: ["top-ups"] });
      onSuccess();
    },
    onError: (err: Error) => {
      toast.error("Unable to request topup", {
        description: err.message,
      });
    },
  });
}
