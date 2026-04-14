import InputField from "@/components/form/input-field";
import SelectField from "@/components/form/select-field";
import useExchangeRates from "@/components/settings/finance/use-exchange-rates";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CURRENCIES, TOPUP_TYPES } from "@/lib/constants";
import { Advertiser } from "@/lib/types/advertiser";
import { Affiliate } from "@/lib/types/affiliate";
import { UserProfile } from "@/lib/types/user";
import { calculateTopupAmount } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Resolver, useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../ui/dialog";
import { createClient } from "@/lib/supabase/client";
import SwitchField from "@/components/form/switch-field";
import { useAppContext } from "@/context/app-provider";

interface Profile extends UserProfile {
  advertiser: Advertiser[];
  affiliate: Affiliate[];
}

export default function UserTopupDialog({
  open,
  setOpen,
  profile,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  profile: Profile | null;
}) {
  const clientCode = profile?.advertiser[0]?.tenant_client_code;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Topup</DialogTitle>
          <DialogDescription>
            Create new topup for <b>{profile?.full_name}</b>{" "}
            <span className="text-muted-foreground">{clientCode}</span>
          </DialogDescription>
          {profile && <TopupForm profile={profile} setOpen={setOpen} />}
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}

const validations = z.object({
  type: z.string().min(1, "Top-up type is required"),
  currency: z.string().min(1, "Currency is required"),
  fee: z.string().min(1, "Fee is required"),
  amount_received: z.coerce
    .number()
    .min(300, "Amount must be greater than 300"),

  mark_paid: z.boolean(),
});

type FormValues = z.infer<typeof validations>;

function TopupForm({
  profile,
  setOpen,
}: {
  profile: Profile;
  setOpen: (open: boolean) => void;
}) {
  const { profile: currentUser } = useAppContext();
  const { exchangeRates } = useExchangeRates({ activeOnly: true });
  const { control, handleSubmit, watch } = useForm<FormValues>({
    defaultValues: {
      type: "top-up",
      currency: "EUR",
      amount_received: 0,
      fee: "",
      mark_paid: false,
    },
    resolver: zodResolver(validations) as Resolver<FormValues>,
  });

  const amountReceived = watch("amount_received");
  const currency = watch("currency");
  const fee = watch("fee");

  const { mutate, isPending } = useMutation({
    mutationKey: ["create-top-up"],
    mutationFn: async (values: FormValues) => {
      const feeApplicableTypes = ["top-up", "first-top-up"];
      const { amountUSD, topupAmount } = calculateTopupAmount(
        values.amount_received,
        exchangeRates,
        values.currency,
        feeApplicableTypes.includes(values.type) ? Number(values.fee) : 0,
      );
      const payload = {
        ...values,
        topup_amount: topupAmount.toFixed(2),
        amount_usd: amountUSD.toFixed(2),
        advertiser_id: profile.advertiser[0]?.id || undefined,
        tenant_id: profile.tenant_id,
        mark_paid: undefined,
        status: values.mark_paid ? "completed" : "pending",
        author: {
          id: currentUser?.id,
          email: currentUser?.email,
          name: currentUser?.full_name,
        },
      };
      const supabase = createClient();
      const { data, error } = await supabase.from("top_ups").insert(payload);
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Topup added successfully", {
        description: `Topup added for ${profile.full_name}`,
      });
      setOpen(false);
    },
    onError: (err) => {
      console.error(err);
      toast.error("Something went wrong", { description: err.message });
    },
  });

  const handleCreateTopup = (values: FormValues) => mutate(values);

  return (
    <form
      id="topup-form"
      className="mt-6"
      onSubmit={handleSubmit(handleCreateTopup)}
    >
      <ScrollArea>
        <div className="px-1 space-y-4">
          <SelectField
            label="Top-up Type"
            name="type"
            id="type-select"
            control={control}
            options={TOPUP_TYPES}
            placeholder="Select"
          />
          <div className="flex gap-4">
            <SelectField
              label="Currency"
              name="currency"
              id="currency-select"
              control={control}
              options={CURRENCIES}
              placeholder="Select"
            />
            <InputField
              label="Fee %"
              name="fee"
              id="fee"
              type="number"
              min={0}
              max={100}
              control={control}
            />
          </div>
          <InputField
            label="Amount"
            name="amount_received"
            description={
              amountReceived
                ? `Topup Amount: $${calculateTopupAmount(
                    amountReceived,
                    exchangeRates,
                    currency,
                    Number(fee),
                  ).topupAmount.toFixed(2)} based on ${fee || 0}% fee. `
                : ""
            }
            id="amount"
            type="number"
            control={control}
          />

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
              Add Topup
            </Button>
          </div>
        </div>
      </ScrollArea>
    </form>
  );
}
