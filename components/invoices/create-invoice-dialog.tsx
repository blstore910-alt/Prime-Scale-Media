"use client";
import { defaultDueDate } from "./use-create-invoice";

import SelectField from "@/components/form/select-field";
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
import { Input } from "@/components/ui/input";
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
import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";
import { CURRENCIES } from "@/lib/constants";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import { Controller, Resolver, useForm } from "react-hook-form";
import { toast } from "sonner";
import z from "zod";
import useCreateInvoice from "./use-create-invoice";

type AdvertiserQueryRow = {
  id: string;
  tenant_client_code: string | null;
  profile: { full_name: string | null } | { full_name: string | null }[] | null;
};

const invoiceFormSchema = z.object({
  advertiser_id: z.string().min(1, "Advertiser is required"),
  currency: z.enum(["EUR", "USD"]),
  amount: z.coerce.number().gt(0, "Amount must be greater than 0"),
  description: z
    .string()
    .trim()
    .min(1, "Description is required")
    .max(200, "Keep it under 200 characters"),
  // yyyy-mm-dd, from a date input. Required, because an invoice with no
  // due date never appears under Overdue and is never chased -- see the
  // note in use-create-invoice.ts.
  due_date: z.string().min(1, "A due date is required"),
});

type InvoiceFormValues = z.infer<typeof invoiceFormSchema>;

function getDefaultValues(): InvoiceFormValues {
  return {
    advertiser_id: "",
    currency: "EUR",
    amount: 0,
    description: "",
    due_date: isoDay(new Date(defaultDueDate())),
  };
}

/** yyyy-mm-dd, which is what <input type="date"> wants. */
function isoDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function CreateInvoiceDialog({
  open,
  onOpenChange,
  defaultAdvertiserId,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  defaultAdvertiserId?: string;
}) {
  const { profile } = useAppContext();
  const { createInvoice, isPending } = useCreateInvoice();

  const defaultValues = getDefaultValues();
  if (defaultAdvertiserId) {
    defaultValues.advertiser_id = defaultAdvertiserId;
  }

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<InvoiceFormValues>({
    defaultValues,
    resolver: zodResolver(invoiceFormSchema) as Resolver<InvoiceFormValues>,
  });

  useEffect(() => {
    const newDefaultValues = getDefaultValues();
    if (defaultAdvertiserId) {
      newDefaultValues.advertiser_id = defaultAdvertiserId;
    }
    reset(newDefaultValues);
  }, [defaultAdvertiserId, reset]);

  const advertiserReadWillRun =
    profile?.role === "admin" && !!profile?.tenant_id;
  const {
    data: advertisers = [],
    isPending: isAdvertisersPending,
    isError: isAdvertisersError,
    error: advertisersError,
  } = useQuery<AdvertiserQueryRow[]>({
    queryKey: ["advertisers", profile?.tenant_id, "invoices"],
    enabled: advertiserReadWillRun,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("advertisers")
        .select("id, tenant_client_code, profile:user_profiles(full_name)")
        .eq("tenant_id", profile?.tenant_id)
        .order("tenant_client_code", { ascending: true });

      if (error) {
        throw error;
      }

      return (data ?? []) as AdvertiserQueryRow[];
    },
  });

  // ── isPending, WITH THE DISABLED WINDOW HANDLED ────────────────────
  //
  // This was `isLoading`, which is FALSE for a disabled query in
  // react-query v5. Between mount and the profile arriving, the picker
  // said "Select" over an empty list with the trigger ENABLED -- an
  // admin opens Create Invoice, finds no advertisers, and reads it as
  // "this tenant has none". `isPending` alone would hang for ever if
  // the query never runs, so it is pending OR not-yet-runnable.
  const isAdvertisersLoading = isAdvertisersPending || !advertiserReadWillRun;

  const currencyOptions = CURRENCIES.filter((currency) =>
    ["EUR", "USD"].includes(currency.value),
  );

  const advertiserOptions = advertisers.map((advertiser) => {
    const fullName = Array.isArray(advertiser.profile)
      ? (advertiser.profile[0]?.full_name ?? null)
      : (advertiser.profile?.full_name ?? null);

    return {
      value: advertiser.id,
      label: (
        <span className="inline-flex w-full justify-between">
          <span>{advertiser.tenant_client_code ?? "-"}</span>
          <span className="ml-2">{fullName ?? "-"}</span>
        </span>
      ),
    };
  });

  const onSubmit = (values: InvoiceFormValues) => {
    createInvoice(values, {
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
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) {
          const resetValues = getDefaultValues();
          if (defaultAdvertiserId) {
            resetValues.advertiser_id = defaultAdvertiserId;
          }
          reset(resetValues);
        }
        onOpenChange(value);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Invoice</DialogTitle>
          <DialogDescription>
            Create a manual invoice for an advertiser.
          </DialogDescription>
        </DialogHeader>

        <form
          id="invoice-form"
          className="space-y-4"
          onSubmit={handleSubmit(onSubmit)}
        >
          <SelectField
            label="Select Advertiser"
            name="advertiser_id"
            id="invoice-advertiser-select"
            control={control}
            options={advertiserOptions}
            placeholder={
              isAdvertisersLoading ? "Loading advertisers..." : "Select"
            }
            disabled={isAdvertisersLoading || isAdvertisersError}
          />

          {isAdvertisersError && (
            <p className="text-sm text-destructive">
              {advertisersError instanceof Error
                ? advertisersError.message
                : "Failed to load advertisers."}
            </p>
          )}

          <Field
            data-invalid={Boolean(errors.amount) || Boolean(errors.currency)}
          >
            <FieldLabel htmlFor="invoice-amount">Amount</FieldLabel>
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
                        id="invoice-currency-select"
                        aria-invalid={Boolean(errors.currency)}
                        className="h-9 min-w-22 rounded-none border-0 bg-transparent text-left"
                      >
                        <SelectValue placeholder="EUR" />
                      </SelectTrigger>
                      <SelectContent position="item-aligned">
                        {currencyOptions.map((option) => (
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
                    id="invoice-amount"
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="0.00"
                    // Click a money box and you are typing a new amount,
                    // never appending to the old one. Without this a 0
                    // left in the field turns a typed 50 into 050.
                    onFocus={(e) => e.currentTarget.select()}
                    aria-invalid={Boolean(errors.amount)}
                    className="h-9"
                  />
                )}
              />
            </InputGroup>
            {errors.currency && <FieldError errors={[errors.currency]} />}
            {errors.amount && <FieldError errors={[errors.amount]} />}
          </Field>

          <Field data-invalid={Boolean(errors.description)}>
            <FieldLabel htmlFor="invoice-description">Description</FieldLabel>
            <Controller
              name="description"
              control={control}
              render={({ field }) => (
                <Input
                  {...field}
                  id="invoice-description"
                  placeholder="What is this invoice for?"
                  aria-invalid={Boolean(errors.description)}
                />
              )}
            />
            {errors.description && (
              <FieldError errors={[errors.description]} />
            )}
          </Field>

          {/* ── WHEN IS IT DUE ──────────────────────────────────────
              There was no field here at all, so every hand-raised
              invoice went in with due_date null -- invisible to the
              Overdue filter for ever, and never collected, because the
              auto-debit only takes invoices carrying a subscription_id
              and this dialog cannot set one. Defaulted to fourteen
              days, the same as the subscription engine's first
              invoice. */}
          <Field data-invalid={Boolean(errors.due_date)}>
            <FieldLabel htmlFor="invoice-due-date">Due date</FieldLabel>
            <Controller
              name="due_date"
              control={control}
              render={({ field }) => (
                <Input
                  {...field}
                  id="invoice-due-date"
                  type="date"
                  aria-invalid={Boolean(errors.due_date)}
                />
              )}
            />
            <p className="text-muted-foreground text-xs">
              After this date it counts as overdue and shows up in the
              Overdue filter. Nothing is collected automatically from a
              hand-raised invoice — the customer pays it from their
              wallet.
            </p>
            {errors.due_date && <FieldError errors={[errors.due_date]} />}
          </Field>
        </form>

        <DialogFooter>
          <Button
            form="invoice-form"
            type="submit"
            disabled={isPending || isAdvertisersLoading || isAdvertisersError}
          >
            {isPending && <Loader2 className="animate-spin" />}
            Create Invoice
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
