import { useAppContext } from "@/context/app-provider";
import { CURRENCIES } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Resolver, useForm } from "react-hook-form";
import z from "zod";
import SelectField from "../form/select-field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";

import { AdAccount } from "@/lib/types/account";
import { ExchangeRate } from "@/lib/types/exchange-rates";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import InputField from "../form/input-field";
import useExchangeRates from "../settings/finance/use-exchange-rates";
import { Button } from "../ui/button";
import { createTopup } from "./topup-form";
import { updateTopupLogs } from "./use-update-topup";

import SwitchField from "../form/switch-field";

type FormValues = {
  type: string;
  currency: string;
  amount_received: number;
  payment_slip?: string;
  advertiser_id: string;
  account_id: string;
  fee: string;
  mark_paid: boolean;
};

export function AdminTopupDialog({
  open,
  setOpen,
  type = "advertiser",
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  type?: "account" | "advertiser" | string;
}) {
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Topup</DialogTitle>
          <DialogDescription>
            Create new topup to an{" "}
            {type === "account" ? "ad account" : "advertiser"}
          </DialogDescription>
          <TopupForm type={type} closeDialog={() => setOpen(false)} />
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}

function TopupForm({
  type,
  closeDialog,
}: {
  type: string;
  closeDialog: () => void;
}) {
  const { profile } = useAppContext();
  // const [uploading, setUploading] = useState(false);
  const { exchangeRates } = useExchangeRates({ activeOnly: true });
  const [account, setAccount] = useState<AdAccount | null>(null);
  const queryClient = useQueryClient();
  const { data: advertisers } = useQuery({
    queryKey: ["advertisers"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("advertisers")
        .select("*, profile:user_profiles(*)")
        .eq("tenant_id", profile?.tenant_id);
      if (error) throw error;
      return data;
    },
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
  const { control, handleSubmit, setValue, watch } = useForm<FormValues>({
    defaultValues: {
      type: "top-up",
      currency: "EUR",
      amount_received: 0,
      payment_slip: "",
      advertiser_id: "",
      account_id: "",
      fee: "",
      mark_paid: false,
    },
    resolver: zodResolver(
      z
        .object({
          type: z.string().min(1, "Top-up type is required"),
          currency: z.string().min(1, "Currency is required"),
          amount_received: z.coerce
            .number()
            .min(0, `Amount must be at least 0`),
          payment_slip: z.string().optional(),
          advertiser_id: z.string().optional(),
          account_id: z.string().optional(),
          fee: z.string().min(1, "Fee is required"),

          mark_paid: z.boolean().default(false),
        })
        .superRefine((data, ctx) => {
          if (type === "advertiser" && !data.advertiser_id) {
            ctx.addIssue({
              path: ["advertiser_id"],
              message: "Advertiser is required",
              code: "custom",
            });
          } else if (type === "account" && !data.account_id) {
            ctx.addIssue({
              path: ["account_id"],
              message: "Account is required",
              code: "custom",
            });
          }
        }),
    ) as Resolver<FormValues>,
  });

  const { mutate, isPending } = useMutation({
    mutationKey: ["create-top-up"],
    mutationFn: (values: FormValues) => {
      const author = {
        id: profile?.id,
        name: profile?.full_name,
        email: profile?.email,
      };

      let fee: string | number = values.fee;
      let advertiser_id: string | undefined = values.advertiser_id;
      let tenant_id = profile?.tenant_id || "";

      if (type === "account" && account) {
        fee = account?.fee;
        advertiser_id = account?.advertiser_id;
        tenant_id = account?.tenant_id;
      }

      const payload = {
        ...values,
        status: values.mark_paid ? "completed" : "pending",
        mark_paid: undefined,
      };

      const data = createTopup(
        exchangeRates as ExchangeRate[],
        account as AdAccount,
        payload,
        author,
        Number(fee),
        advertiser_id,
        tenant_id,
      );
      return data;
    },
    onSuccess: async (data) => {
      await updateTopupLogs(data, "create");
      toast.success("Topup added successfully");
      closeDialog();
      queryClient.invalidateQueries({ queryKey: ["top-ups"] });
    },
    onError: (err) => {
      console.error(err);
      toast.error("Something went wrong", { description: err.message });
    },
  });

  // const paymentSlip = watch("payment_slip");
  const advertiserOptions = advertisers?.map((advertiser) => {
    const {
      id,
      tenant_client_code,
      profile: { full_name },
    } = advertiser;
    return {
      value: id,
      label: (
        <span className="inline-flex w-full justify-between">
          <span>{tenant_client_code}:</span>
          &nbsp;
          <span>{`${full_name}`}</span>&nbsp;&nbsp;
        </span>
      ),
    };
  });

  const accountOptions = accounts
    ?.filter((acc) => acc.advertiser)
    .sort((a, b) =>
      a.advertiser?.tenant_client_code.localeCompare(
        b.advertiser?.tenant_client_code,
        undefined,
        { numeric: true, sensitivity: "base" },
      ),
    )
    .map((account) => {
      return {
        value: account.id,
        label: (
          <span className="inline-flex w-full justify-between">
            <span>{account.advertiser?.tenant_client_code}&nbsp;/</span>
            &nbsp;
            <span>{`${account.name}`}</span>
          </span>
        ),
      };
    });

  const accountId = watch("account_id");
  useEffect(() => {
    if (accountId) {
      const account = accounts?.find((account) => account.id === accountId);
      setAccount(account);
      setValue("fee", String(account.fee));
    }
  }, [accountId, accounts, setValue]);
  return (
    <form
      id="topup-form"
      className="space-y-2"
      onSubmit={handleSubmit((values: FormValues) => mutate(values))}
    >
      {type === "account" ? (
        <SelectField
          label="Select Account"
          name="account_id"
          id="account-select"
          control={control}
          options={accountOptions || []}
          placeholder="Select"
        />
      ) : (
        <SelectField
          label="Select Advertiser"
          name="advertiser_id"
          id="advertiser-select"
          control={control}
          options={advertiserOptions || []}
          placeholder="Select"
        />
      )}
      <div className="flex gap-4">
        <SelectField
          label="Currency"
          name="currency"
          id="currency-select"
          control={control}
          options={CURRENCIES}
          placeholder="Select"
        />
      </div>
      <div className="flex gap-4">
        <InputField
          label="Amount"
          name="amount_received"
          id="amount"
          type="number"
          control={control}
        />
        <InputField
          label="Fee %"
          name="fee"
          id="fee"
          type="number"
          control={control}
        />
      </div>

      <div className="mt-4">
        <SwitchField
          control={control}
          id="status-field"
          name="mark_paid"
          label="Mark Topup as Paid ?"
        />
      </div>

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
    </form>
  );
}
