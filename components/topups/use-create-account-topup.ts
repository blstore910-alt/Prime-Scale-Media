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
      // ONLY AN EXPLICIT REFUSAL. The first version of this rejected a
      // null answer too — and `supabase.rpc()` returns null for a
      // `returns void` function and an empty array for a set-returning
      // one with no rows, BOTH of which are what success looks like for
      // some shapes. top_up_create_for_advertiser exists only on the
      // live database, so its shape cannot be read here; rejecting null
      // would have told every customer their top-up failed over a
      // wallet that had already been debited, and invited the retry
      // that charges twice. Failing the other way costs one wrong
      // success message on a refusal the RPC signals in its payload,
      // which is the smaller of the two.
      const row = (Array.isArray(data) ? data[0] : data) as
        | { ok?: boolean; error?: string; id?: string }
        | null
        | undefined;
      if (row && typeof row === "object" && row.ok === false) {
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
      // The wallet statement reads this under its own key, and nothing
      // invalidated it — so the funding that just debited the wallet had
      // no line until a hard reload, which is exactly the "money
      // vanished" complaint the statement was extended to answer.
      // staleTime is 30s and the shell never remounts (its views are CSS
      // toggles), so without this the query is simply never refetched.
      queryClient.invalidateQueries({
        queryKey: ["adv-account-fundings"],
        exact: false,
      });
      queryClient.invalidateQueries({
        queryKey: ["adv-wallet-activity"],
        exact: false,
      });
      // "Funded to date" on the account card reads its own key, so
      // the figure never moved for the rest of the session -- on the
      // very card the customer had just funded.
      queryClient.invalidateQueries({ queryKey: ["adv-account-totals"] });
      // ── AND THE FINANCIAL REPORT ──────────────────────────────────
      //
      // ["finance-report", audience] is invalidated by NOTHING in the
      // repo, sits inside a CSS-toggled view so it never remounts, has
      // staleTime 60s and refetchOnWindowFocus false. With no mount, no
      // focus refetch and no invalidation there is no refetch trigger
      // at all -- so the screen headed "every top-up, funding, fee,
      // invoice and return in one place", with an Export CSV button on
      // it, showed pre-action figures for the whole session.
      queryClient.invalidateQueries({ queryKey: ["finance-report"] });
      onSuccess();
    },
    onError: (err: Error) => {
      toast.error("Unable to request topup", {
        description: err.message,
      });
    },
  });
}
