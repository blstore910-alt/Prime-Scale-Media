"use client";

import { useAppContext } from "@/context/app-provider";
import { CURRENCIES, TOPUP_TYPES } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import { AdAccount } from "@/lib/types/account";
import { ExchangeRate } from "@/lib/types/exchange-rates";
import { calculateTopupAmount } from "@/lib/utils";
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
import { updateTopupLogs } from "./use-update-topup";

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
  values: FormValues,
  author: object,
  fee: number,
  advertiser_id: string | undefined,
  tenant_id: string,
) => {
  const supabase = createClient();
  const feeApplicableTypes = ["top-up", "first-top-up"];
  const isEuMetaPremium = account?.platform === "eu-meta-premium";
  const feePercent = fee / 100;
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
  const payload = {
    ...values,
    amount_usd: amountUSD.toFixed(2),
    topup_amount: topupAmount.toFixed(2),
    author,
    fee,
    advertiser_id,
    tenant_id,
    account_id: account?.id || undefined,
    fee_amount: feeAmount.toFixed(2),
    ...(account && {
      account_id: account.id,
      ...(isEuMetaPremium && {
        eur_value:
          values.amount_received * (1 - Math.max(feePercent - 0.02, 0)),
        eur_topup: values.amount_received * (1 - feePercent),
      }),
    }),
  };

  const { data, error } = await supabase
    .from("top_ups")
    .insert(payload)
    .select()
    .single();

  if (error) throw error;
  return data;
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
      a.advertiser.tenant_client_code.localeCompare(
        b.advertiser.tenant_client_code,
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
    onSuccess: async (data) => {
      await updateTopupLogs(data, "create");
      const description =
        "Your payment has been sent for approval. Please wait until it gets approved from the team.";
      toast.success("Topup requested successfully", {
        description,
      });
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["top-ups", "recent"] });
    },
    onError: (err) => {
      console.error(err);
      toast.error("Something went wrong", { description: err.message });
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
