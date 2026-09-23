"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CURRENCIES } from "@/lib/constants";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import { Controller, Resolver, useForm } from "react-hook-form";
import { toast } from "sonner";

import { AD_ACCOUNT_REQUEST_FEE_EUR } from "@/lib/constants";
import z from "zod";
import useCreateAdAccountRequestInvoice from "./use-create-ad-account-request-invoice";
import { AdAccountRequest } from "@/lib/types/ad-account-request";

type FormValues = {
  currency: "EUR" | "USD";
  amount: number;
};

const schema = z.object({
  currency: z.enum(["EUR", "USD"]),
  amount: z.coerce.number().gt(0, "Amount must be greater than 0"),
});

// ── AN EMPTY BOX IS NOT A DEFAULT ────────────────────────────────────
//
// This opened at 0.00 EUR whatever the request said, and nothing
// anywhere on the screen stated what an extra ad account costs. So the
// amount was whatever the admin remembered, in a currency that might
// not be the customer's: type 5 instead of 50 and the invoice is
// created, payable, with a success toast, and the customer pays 5 for
// a 50 service. The request already knows its own currency, and the
// customer's own form has been quoting AD_ACCOUNT_REQUEST_FEE_EUR all
// along.
//
// `request_fee` in the metadata is what the RPC actually computed for
// THIS request, so it wins when it is there.
function getDefaultValues(request: AdAccountRequest | null): FormValues {
  const currency =
    String(request?.currency ?? "").toUpperCase() === "USD" ? "USD" : "EUR";
  const metadata = (request?.metadata ?? {}) as { request_fee?: unknown };
  const quoted = Number(metadata.request_fee);
  const amount =
    Number.isFinite(quoted) && quoted > 0
      ? quoted
      : currency === "EUR"
        ? AD_ACCOUNT_REQUEST_FEE_EUR
        : Math.round(AD_ACCOUNT_REQUEST_FEE_EUR / 0.86);
  return { currency, amount };
}

export default function CreateAdAccountRequestInvoiceDialog({
  request,
  open,
  onOpenChange,
}: {
  request: AdAccountRequest | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { createInvoiceFromRequest, isPending } =
    useCreateAdAccountRequestInvoice();

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: getDefaultValues(request),
    resolver: zodResolver(schema) as Resolver<FormValues>,
  });

  // On OPEN, so a dialog re-used for a second request does not keep the
  // first one's currency — the same fault the wallet top-up dialog had.
  useEffect(() => {
    if (!open) return;
    reset(getDefaultValues(request));
  }, [open, reset, request]);

  const onSubmit = (values: FormValues) => {
    if (!request?.id || !request.advertiser_id) {
      toast.error("Unable to create invoice: missing advertiser data.");
      return;
    }

    createInvoiceFromRequest(
      {
        advertiser_id: request.advertiser_id,
        currency: values.currency,
        amount: values.amount,
        ad_account_request_id: request.id,
      },
      {
        onSuccess: () => {
          toast.success("Invoice created successfully.");
          reset(getDefaultValues(request));
          onOpenChange(false);
        },
        onError: (error) => {
          toast.error("Failed to create invoice", {
            description: error.message,
          });
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) {
          reset(getDefaultValues(request));
        }
        onOpenChange(value);
      }}
    >
      <DialogContent className="sm:max-w-96">
        <DialogHeader>
          <DialogTitle>Create Invoice</DialogTitle>
          <DialogDescription>
            Enter the invoice amount for this ad account request.
          </DialogDescription>
        </DialogHeader>

        <form
          id="create-request-invoice-form"
          className="space-y-4"
          onSubmit={handleSubmit(onSubmit)}
        >
          <Field
            data-invalid={Boolean(errors.amount) || Boolean(errors.currency)}
          >
            <FieldLabel htmlFor="request-invoice-amount">Amount</FieldLabel>
            <InputGroup className="gap-0">
              <Controller
                name="currency"
                control={control}
                render={({ field }) => (
                  <InputGroupAddon className="px-0">
                    <Select
                      name={field.name}
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <SelectTrigger
                        id="request-invoice-currency-select"
                        aria-invalid={Boolean(errors.currency)}
                        className="h-9 min-w-22 rounded-none border-0 bg-transparent text-left"
                      >
                        <SelectValue placeholder="EUR" />
                      </SelectTrigger>
                      <SelectContent position="item-aligned">
                        {CURRENCIES.filter((currency) =>
                          ["EUR", "USD"].includes(currency.value),
                        ).map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </InputGroupAddon>
                )}
              />

              <Controller
                name="amount"
                control={control}
                render={({ field }) => (
                  <InputGroupInput
                    {...field}
                    id="request-invoice-amount"
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="0.00"
                    aria-invalid={Boolean(errors.amount)}
                    className="h-9"
                  />
                )}
              />
            </InputGroup>
            {errors.currency && <FieldError errors={[errors.currency]} />}
            {errors.amount && <FieldError errors={[errors.amount]} />}
          </Field>
        </form>

        <DialogFooter>
          {/* The corner X was the only way out of a dialog whose one
              button raises a payable invoice against the customer's
              wallet. Every sibling dialog on this journey pairs it. */}
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            form="create-request-invoice-form"
            type="submit"
            disabled={isPending}
          >
            {isPending && <Loader2 className="animate-spin" />}
            Create Invoice
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
