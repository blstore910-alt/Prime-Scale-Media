"use client";

import { toastResult } from "@/lib/action-warning";

import { safeErrorMessage } from "@/lib/pure-error";
import { createTopupAsAdmin } from "@/actions/topup-actions";
import { useAppContext } from "@/context/app-provider";
import { CURRENCIES, TOPUP_TYPES } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import { AdAccount } from "@/lib/types/account";
import { ExchangeRate } from "@/lib/types/exchange-rates";
import { calculateTopupAmount, eurFigures } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useMemo } from "react";
import { Resolver, useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";
import InputField from "../form/input-field";
import SelectField from "../form/select-field";
import useExchangeRates from "../settings/finance/use-exchange-rates";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";
import { sameSlug } from "@/lib/pure-slug-key";

type FormValues = {
  type: string;
  currency: string;
  amount_received: number;
  payment_slip?: string;
  account_id: string;
};

export const createTopup = async (
  exchangeRates: ExchangeRate[],
  account: AdAccount | undefined,
  values: FormValues & { status?: "pending" | "completed"; mark_paid?: boolean },
  _author: object,
  fee: number,
  advertiser_id: string | undefined,
  _tenant_id: string,
) => {
  void _author;
  void _tenant_id;
  const feeApplicableTypes = ["top-up", "first-top-up"];
  // sameSlug: the settings screen and the seed spell this type two
  // different ways. See lib/pure-slug-key.
  const isEuMetaPremium = sameSlug(account?.platform, "eu-meta-premium");
  const feePercent = fee / 100;
  // The PREVIEW only. The server recomputes all of this from the
  // advertiser's plan, their perks and the account's platform — including
  // the Meta-EU-Premium two points, which used to live only here — so
  // whatever this produces is what the admin is shown, not what is stored.
  // Keeping the same arithmetic means the two agree; the server is the one
  // that decides.
  const { amountUSD, topupAmount, feeAmount } = calculateTopupAmount(
    values.amount_received,
    exchangeRates,
    values.currency,
    feeApplicableTypes.includes(values.type)
      ? isEuMetaPremium
        ? Math.max(feePercent - 0.02, 0) * 100
        : fee
      : 0,
  );
  if (!advertiser_id) throw new Error("advertiser_id required");
  const result = await createTopupAsAdmin({
    type: values.type,
    currency: values.currency,
    amount_received: values.amount_received,
    amount_usd: amountUSD.toFixed(2),
    topup_amount: topupAmount.toFixed(2),
    fee,
    fee_amount: feeAmount.toFixed(2),
    advertiser_id,
    account_id: account?.id,
    payment_slip: values.payment_slip,
    status: values.status,
    mark_paid: values.mark_paid,
    // The euro columns, with an actual exchange rate in them. See
    // eurFigures in lib/utils-pure.ts for what was wrong with the old
    // arithmetic — no rate, and the two fees the wrong way round.
    ...(isEuMetaPremium && {
      ...(() => {
        const { eurValue, eurTopup } = eurFigures({
          amountReceived: values.amount_received,
          currency: values.currency,
          amountUSD,
          topupAmount,
          eurRate: Number(exchangeRates?.[0]?.eur ?? 0),
        });
        return {
          eur_value: Number(eurValue.toFixed(2)),
          eur_topup: Number(eurTopup.toFixed(2)),
        };
      })(),
    }),
  });
  if (!result.ok) throw new Error(result.error);
  return { id: result.data.id, warning: result.warning };
};

export default function TopupForm({
  account,
  setOpen,
  type = "account",
}: {
  account?: AdAccount;
  setOpen: (open: boolean) => void;
  type?: "account" | "advertiser";
}) {
  const { profile } = useAppContext();
  const { exchangeRates } = useExchangeRates({ activeOnly: true });
  const isAdvertiser = profile?.role === "advertiser";

  const queryClient = useQueryClient();
  const { control, handleSubmit } = useForm<FormValues>({
    defaultValues: {
      type: "top-up",
      currency: "EUR",
      amount_received: 0,
      payment_slip: "",
      account_id: account ? account.id : "",
    },
    resolver: zodResolver(
      useMemo(() => {
        const minAmount = profile?.role === "advertiser" ? 300 : 0;
        return z.object({
          type: z.string().min(1, "Top-up type is required"),
          currency: z.string().min(1, "Currency is required"),
          amount_received: z.coerce
            .number()
            .min(minAmount, `Amount must be at least ${minAmount}`),
          payment_slip: z.string().min(1, "Payment slip is required"),
          account_id: z.string().min(1, "Account is required"),
        });
      }, [profile?.role]),
    ) as Resolver<FormValues>,
  });

  const { data: accounts } = useQuery({
    queryKey: ["accounts"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("ad_accounts")
        .select("*, advertiser:advertisers(tenant_client_code)")
        .eq("tenant_id", profile?.tenant_id);
      if (error) throw error;
      return data;
    },
  });

  const accountOptions = accounts
    ?.sort((a, b) =>
      (a.advertiser?.tenant_client_code ?? "").localeCompare(
        b.advertiser?.tenant_client_code ?? "",
        undefined,
        { numeric: true, sensitivity: "base" },
      ),
    )
    .map((account) => {
      return {
        value: account.id,
        label: (
          <span className="inline-flex w-full justify-between">
            <span>{`${account.name}`}</span>
          </span>
        ),
      };
    });

  const { mutate, isPending } = useMutation({
    mutationKey: ["create-top-up"],
    mutationFn: (values: FormValues) => {
      const author = {
        id: profile?.id,
        name: profile?.full_name,
        email: profile?.email,
      };

      let advertiser_id: string | undefined;
      let tenant_id = profile?.tenant_id || "";

      if (type === "account" && account) {
        advertiser_id = account.advertiser_id;
        tenant_id = account.tenant_id;
      } else if (type === "advertiser" && profile) {
        advertiser_id = profile.advertiser?.[0]?.id;
        tenant_id = profile.tenant_id;
      }

      const selectedAccount = accounts?.find((a) => a.id === values.account_id);
      const data = createTopup(
        exchangeRates as ExchangeRate[],
        account ? account : selectedAccount,
        values,
        author,
        selectedAccount?.fee || 0,
        advertiser_id,
        tenant_id,
      );
      return data;
    },
    onSuccess: (res) => {
      // The create audit row is written inside createTopupAsAdmin (server).
      const description =
        "Your payment has been sent for approval. Please wait until it gets approved from the team.";
      toastResult(res, "Topup requested successfully", {
        description,
      });
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["top-ups", "recent"] });
    },
    onError: (err) => {
      console.error(safeErrorMessage(err));
      toast.error("Something went wrong", {
        description: safeErrorMessage(err),
      });
    },
  });

  const handleCreateTopup = (values: FormValues) => mutate(values);

  return (
    <form id="topup-form" onSubmit={handleSubmit(handleCreateTopup)}>
      <ScrollArea>
        <div className="px-1 space-y-4">
          <div className="flex gap-4">
            <SelectField
              label="Top-up Type"
              name="type"
              id="type-select"
              control={control}
              options={
                isAdvertiser
                  ? TOPUP_TYPES.filter((t) => t.value === "top-up")
                  : TOPUP_TYPES
              }
              placeholder="Select"
            />
            <SelectField
              label="Currency"
              name="currency"
              id="currency-select"
              control={control}
              options={CURRENCIES}
              placeholder="Select"
            />
          </div>
          {type !== "account" && (
            <SelectField
              label="Select Account"
              name="account_id"
              id="account-select"
              control={control}
              options={accountOptions || []}
              placeholder="Select"
            />
          )}

          <InputField
            label="Amount"
            name="amount_received"
            id="amount"
            type="number"
            control={control}
          />

          <div className="text-end">
            <Button
              form="topup-form"
              type="submit"
              size={"sm"}
              disabled={isPending}
            >
              {isPending && <Loader2 className="animate-spin" />}
              Submit
            </Button>
          </div>
        </div>
      </ScrollArea>
    </form>
  );
}
