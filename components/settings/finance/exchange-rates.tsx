"use client";

import ConfirmModal, { ConfirmFact } from "@/components/ui/confirm-modal";
import { safeErrorMessage } from "@/lib/pure-error";
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
import {
  latestReferenceRates,
  upsertExchangeRate,
} from "@/actions/exchange-rate-actions";
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
      const result = await upsertExchangeRate({
        currency: "USD",
        eur: Number(values.EUR),
        gbp: Number(values.GBP),
        hkd: Number(values.HKD),
        is_active: true,
      });
      if (!result.ok) throw new Error(result.error);
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

  // ── Ask, with the old and the new side by side ──────────────────────
  // This row prices EVERY conversion in the app: calculateTopupAmount
  // divides by it, the wallet RPCs assume it, every "in the other
  // currency" figure comes from it. And the only thing gating the Save
  // button is formState.isDirty — which a scroll wheel over a focused
  // number input sets silently, by one step. This file already carries a
  // note about that having happened.
  //
  // It is worse on the way out than on the way in: upsertExchangeRate
  // stands the current active row DOWN before writing the new one, so a
  // save that is then refused leaves the tenant with NO active rate.
  //
  // So the confirmation is a DIFF, not a warning. A wrong digit is obvious
  // beside the number it replaces and invisible on its own.
  const [pendingRates, setPendingRates] = useState<FormValues | null>(null);
  const onSubmit = (values: FormValues) => setPendingRates(values);

  const handleSetLatest = async () => {
    try {
      setIsApplying(true);
      // Fetched by the SERVER, not by this browser. See
      // latestReferenceRates() for why: these numbers price every
      // conversion in the app, and pulling them from an unauthenticated CDN
      // on the admin's own device is one poisoned response away from a wrong
      // rate on every top-up.
      const res = await latestReferenceRates();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const usdRates = res.data;

      // NOT 1/rate. Every rate in this system means "1 USD = N <currency>":
      // that is what calculateTopupAmount divides by, what the wallet RPCs
      // assume, and what ensureInitialExchangeRates writes (it stores
      // usdRates.usd.eur straight through, with no reciprocal). The provider
      // already answers in that direction for base USD, so inverting it here
      // stored 1.1628 where 0.86 was meant — and a €1000 top-up was then
      // credited $860 instead of $1162.79, out of the customer's pocket.
      setValue("HKD", String(formatRate(usdRates.hkd)), { shouldDirty: true });
      setValue("GBP", String(formatRate(usdRates.gbp)), { shouldDirty: true });
      setValue("EUR", String(formatRate(usdRates.eur)), { shouldDirty: true });
      toast.success("Latest rates applied");
    } catch (error) {
      console.error(safeErrorMessage(error));
      toast.error("Failed to fetch latest rates");
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <form id="exchange-rates-form" onSubmit={handleSubmit(onSubmit)}>
      <CardContent>
        {/* step="any". These rates carry six decimals — 0.872361 — and
            step="0.01" made every one of them fail the browser's own step
            validation, so the field sat in an :invalid state and the spinner
            arrows rounded a live exchange rate to two places. 0.87 instead
            of 0.872361 is a 0.27% error on every conversion the app does. */}
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
              step="any"
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
              step="any"
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
              step="any"
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

      <ConfirmModal
        open={!!pendingRates}
        onOpenChange={(next) => {
          if (!next) setPendingRates(null);
        }}
        title="Change the exchange rates?"
        lead="These price every conversion in the app — top-ups, wallet exchanges, and every figure shown in the other currency. Check each number against the one it replaces."
        cta="Yes, save these rates"
        busy={isPending}
        busyLabel="Saving…"
        onConfirm={() => {
          const v = pendingRates;
          setPendingRates(null);
          if (v) mutate(v);
        }}
      >
        {(["EUR", "GBP", "HKD"] as const).map((cur) => {
          const before = defaultValues[cur];
          const after = pendingRates?.[cur];
          const changed = String(before) !== String(after);
          return (
            <ConfirmFact
              key={cur}
              label={`1 USD in ${cur}`}
              value={
                changed ? `${before || "—"} → ${after}` : `${after} (unchanged)`
              }
              strong={changed}
            />
          );
        })}
      </ConfirmModal>
    </form>
  );
}
