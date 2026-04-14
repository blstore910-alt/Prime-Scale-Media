"use client";

import InputField from "@/components/form/input-field";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useAppContext } from "@/context/app-provider";
import { getExchangeRate } from "@/lib/get-exchange-rates";
import { createClient } from "@/lib/supabase/client";
import { formatRate } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";
import ExchangeRateLogs from "./exchange-rates-logs";
import useExchangeRates from "./use-exchange-rates";

export default function ExchangeRates() {
  const { exchangeRates, isLoading, isError, error } = useExchangeRates({
    activeOnly: true,
  });

  return (
    <section className="max-w-xl mx-auto mt-10">
      <Card>
        <CardHeader>
          <div>
            <CardTitle> Set Exchange rates</CardTitle>
            <CardDescription>
              Update conversion rates from USD to the currencies below.
            </CardDescription>
          </div>
          <CardAction>
            <ExchangeRateLogs />
          </CardAction>
        </CardHeader>

        {exchangeRates && exchangeRates.length > 0 ? (
          <ExchangeRatesForm
            defaultValues={{
              GBP: String(formatRate(exchangeRates[0].gbp) ?? ""),
              HKD: String(formatRate(exchangeRates[0].hkd) ?? ""),
              EUR: String(formatRate(exchangeRates[0].eur) ?? ""),
            }}
          />
        ) : isLoading ? (
          <div className="p-6 flex items-center justify-center h-48">
            <Loader2 className="animate-spin" />
          </div>
        ) : isError ? (
          <div className="p-6 flex items-center justify-center h-48">
            <p className="text-destructive">{error?.message}</p>
          </div>
        ) : null}
      </Card>
    </section>
  );
}

const validations = z.object({
  HKD: z.string().refine((v) => !isNaN(Number(v)) && Number(v) >= 0, {
    message: "Must be a valid number",
  }),
  GBP: z.string().refine((v) => !isNaN(Number(v)) && Number(v) >= 0, {
    message: "Must be a valid number",
  }),
  EUR: z.string().refine((v) => !isNaN(Number(v)) && Number(v) >= 0, {
    message: "Must be a valid number",
  }),
});

function ExchangeRatesForm({
  defaultValues,
}: {
  defaultValues: { GBP: string; HKD: string; EUR: string };
}) {
  const { profile, user } = useAppContext();
  const queryClient = useQueryClient();
  const [isApplying, setIsApplying] = useState(false);

  type FormValues = z.infer<typeof validations>;

  const { control, handleSubmit, reset, formState, setValue } =
    useForm<FormValues>({
      defaultValues,
      resolver: zodResolver(validations),
      mode: "onChange",
    });

  const { mutate, isPending } = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!profile || !user) throw new Error("Missing user/profile");
      const supabase = createClient();
      const payload = {
        currency: "USD",
        hkd: Number(values.HKD),
        gbp: Number(values.GBP),
        eur: Number(values.EUR),
        updated_at: new Date().toISOString(),
        is_active: true,
        tenant_id: profile.tenant_id,
        updated_by: user.id,
        profile_id: profile?.id,
      };

      const { error } = await supabase.from("exchange_rates").insert(payload);
      if (error) throw error;
      return true;
    },
    onSuccess: (_, variables) => {
      toast.success("Exchange rates saved");
      queryClient.invalidateQueries({ queryKey: ["exchange-rates"] });
      reset(variables, { keepValues: true });
    },
    onError: (err) => {
      toast.error("Failed to save exchange rates", {
        description: err?.message,
      });
    },
  });

  const onSubmit = (values: FormValues) => {
    mutate(values);
  };

  const handleSetLatest = async () => {
    try {
      setIsApplying(true);
      const freshRates = await getExchangeRate("USD");
      const usdRates = freshRates?.usd;
      if (!usdRates) {
        toast.error("No latest exchange rate data available");
        return;
      }

      setValue("HKD", String(formatRate(1 / usdRates.hkd)), {
        shouldDirty: true,
      });
      setValue("GBP", String(formatRate(1 / usdRates.gbp)), {
        shouldDirty: true,
      });
      setValue("EUR", String(formatRate(1 / usdRates.eur)), {
        shouldDirty: true,
      });
      toast.success("Latest rates applied");
    } catch (error) {
      console.error(error);
      toast.error("Failed to fetch latest rates");
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <form id="exchange-rates-form" onSubmit={handleSubmit(onSubmit)}>
      <CardContent>
        <div className="flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <Label htmlFor="gbp-field" className="shrink-0">
              British Pound (£)
            </Label>
            <InputField
              name="GBP"
              control={control}
              id="gbp-field"
              className="max-w-40 ml-auto text-right"
              type="number"
              step="0.01"
            />
          </div>

          <div className="flex justify-between items-center">
            <Label htmlFor="eur-field" className="shrink-0">
              Euro (€)
            </Label>
            <InputField
              name="EUR"
              control={control}
              id="eur-field"
              className="max-w-40 ml-auto text-right"
              type="number"
              step="0.01"
            />
          </div>

          <div className="flex justify-between items-center">
            <Label htmlFor="hkd-field" className="shrink-0">
              Hong Kong Dollar (HK$)
            </Label>
            <InputField
              name="HKD"
              control={control}
              id="hkd-field"
              className="max-w-40 ml-auto text-right"
              type="number"
              step="0.01"
            />
          </div>
        </div>
      </CardContent>

      <CardFooter>
        <div className="flex w-full items-center justify-between gap-4 mt-6">
          <div className="flex gap-2 justify-between w-full">
            <Button
              variant="secondary"
              onClick={handleSetLatest}
              type="button"
              disabled={isApplying || isPending}
            >
              {isApplying ? (
                <Loader2 className="animate-spin" />
              ) : (
                "Apply Latest Rates"
              )}
            </Button>
            <Button form="exchange-rates-form" disabled={!formState.isDirty}>
              {isPending ? (
                <>
                  <Loader2 className="animate-spin" />
                  <span>Saving</span>
                </>
              ) : (
                "Save changes"
              )}
            </Button>
          </div>
        </div>
      </CardFooter>
    </form>
  );
}
