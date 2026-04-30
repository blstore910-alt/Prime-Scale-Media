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

function getDefaultValues(): FormValues {
  return {
    currency: "EUR",
    amount: 0,
  };
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
    defaultValues: getDefaultValues(),
    resolver: zodResolver(schema) as Resolver<FormValues>,
  });

  useEffect(() => {
    if (!open) return;
    reset(getDefaultValues());
  }, [open, reset]);

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
          reset(getDefaultValues());
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
          reset(getDefaultValues());
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
