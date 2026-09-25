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
      // ---- THROUGH A SERVER ACTION, NOT STRAIGHT AT THE RPC --------
      //
      // This called `top_up_create_for_advertiser` from the browser.
      // That is a permitted shape -- CLAUDE.md names a SECURITY DEFINER
      // RPC as one of the three ways to write -- but it made this the
      // one money path `MAINTENANCE_MODE` could not stop, because the
      // guard lives in the server actions and this call never passed
      // through one. During an incident every other write is frozen and
      // customers keep moving money onto ad accounts.
      //
      // createAccountTopupForSelf is the same RPC with the same
      // arguments behind resolveUserContext(), which is the maintenance
      // guard plus the session, the profile_id cookie and the refusal
      // for a deactivated account. It also carries the payload-refusal
      // check that used to live here, so there is one place that talks
      // to that function.
      const { createAccountTopupForSelf } = await import(
        "@/actions/topup-actions"
      );
      const res = await createAccountTopupForSelf({
        account_id: values.account_id,
        currency: values.currency,
        amount: values.amount,
      });
      if (!res.ok) throw new Error(res.error);
      return res.data;
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
