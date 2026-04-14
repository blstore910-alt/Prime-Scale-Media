import { Controller, useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { CURRENCIES } from "@/lib/constants";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import { AdAccount } from "@/lib/types/account";
import {
  Table,
  TableHeader,
  TableBody,
  TableCell,
  TableRow,
} from "../ui/table";
import useExchangeRates from "../settings/finance/use-exchange-rates";
import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";
import { Coins } from "lucide-react";
import { useMediaQuery } from "usehooks-ts";

type BulkTopupRow = {
  account_id: string;
  account_name: string;
  enabled: boolean;
  currency: string;
  amount: string;
  fee: string;
  min_topup: number;
};

const prepareTopupObject = (
  row: Partial<BulkTopupRow>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  exchangeRates: any,
) => {
  const { currency, amount, account_id, fee } = row;
  const receivedAmount = Number(amount);

  const feeAmount = (Number(receivedAmount) * Number(fee)) / 100;
  const topupAmount = receivedAmount - feeAmount;

  const { eur } = exchangeRates;
  const eurAmount =
    currency === "EUR" ? receivedAmount : receivedAmount * (1 / eur);
  const usdAmount = currency === "USD" ? receivedAmount : receivedAmount * eur;
  const eurTopupAmount =
    currency === "EUR" ? topupAmount : topupAmount * (1 / eur);
  const usdTopupAmount = currency === "USD" ? topupAmount : topupAmount * eur;

  return {
    amount_received: receivedAmount,
    account_id,
    amount_usd: usdAmount,
    topup_usd: usdTopupAmount,
    topup_amount: topupAmount,
    currency,
    fee,
    fee_amount: feeAmount,
    eur_value: eurAmount,
    eur_topup: eurTopupAmount,
    rate: eur,
  };
};

type BulkTopupFormValues = {
  rows: BulkTopupRow[];
};

const buildBulkTopupSchema = (isAdvertiser: boolean) =>
  z
    .object({
      rows: z
        .array(
          z
            .object({
              account_id: z.string(),
              account_name: z.string(),
              enabled: z.boolean(),
              currency: z.string().min(1, "Currency is required"),
              amount: z.string(),
              fee: z.string(),
              min_topup: z.number(),
            })
            .superRefine((row, ctx) => {
              if (!row.enabled) return;

              if (!row.amount.trim()) {
                ctx.addIssue({
                  path: ["amount"],
                  code: "custom",
                  message: "Amount is required",
                });
              } else {
                const amount = Number(row.amount);
                if (!Number.isFinite(amount) || amount <= 0) {
                  ctx.addIssue({
                    path: ["amount"],
                    code: "custom",
                    message: "Amount must be greater than 0",
                  });
                } else if (isAdvertiser) {
                  const minTopup = row.min_topup ?? 0;
                  if (amount < minTopup) {
                    ctx.addIssue({
                      path: ["amount"],
                      code: "custom",
                      message: `Amount must be at least ${minTopup}`,
                    });
                  }
                }
              }
              if (!row.fee.trim()) {
                ctx.addIssue({
                  path: ["fee"],
                  code: "custom",
                  message: "Fee is required",
                });
              } else {
                const fee = Number(row.fee);
                if (!Number.isFinite(fee)) {
                  ctx.addIssue({
                    path: ["fee"],
                    code: "custom",
                    message: "Fee must be a valid number",
                  });
                } else if (fee < 0 || fee > 100) {
                  ctx.addIssue({
                    path: ["fee"],
                    code: "custom",
                    message: "Fee must be between 0 and 100",
                  });
                }
              }
            }),
        )
        .min(1, "At least one ad account is required"),
    })
    .superRefine((values, ctx) => {
      if (!values.rows.some((row) => row.enabled)) {
        ctx.addIssue({
          path: ["rows"],
          code: "custom",
          message: "Enable at least one ad account to continue",
        });
      }
    });
export default function BulkTopupAdAccountsDialog({
  accounts,
}: {
  accounts: AdAccount[];
}) {
  const [open, setOpen] = useState(false);
  const { profile } = useAppContext();
  const { exchangeRates } = useExchangeRates({ activeOnly: true });
  const isAdmin = profile?.role === "admin";
  const isAdvertiser = profile?.role === "advertiser";
  const isTabletScreen = useMediaQuery("(min-width: 768px)");
  const bulkTopupSchema = useMemo(
    () => buildBulkTopupSchema(isAdvertiser),
    [isAdvertiser],
  );
  const defaultRows = useMemo<BulkTopupRow[]>(
    () =>
      accounts.map((account) => ({
        account_id: account.id,
        account_name: account.name,
        enabled: true,
        amount: "",
        currency: "EUR",
        fee: String(account.fee ?? 0),
        min_topup: account.min_topup ?? 0,
      })),
    [accounts],
  );

  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<BulkTopupFormValues>({
    defaultValues: {
      rows: defaultRows,
    },
    resolver: zodResolver(bulkTopupSchema),
  });

  const { fields } = useFieldArray({
    control,
    name: "rows",
  });

  const rows = watch("rows");

  useEffect(() => {
    if (open) {
      reset({ rows: defaultRows });
    }
  }, [open, reset, defaultRows]);

  const handleBulkTopup = async (values: BulkTopupFormValues) => {
    const filteredValues = values.rows.filter((row) => row.enabled);
    if (!exchangeRates) return;
    const topupObjects = filteredValues.map((v) =>
      prepareTopupObject(v, exchangeRates[0]),
    );

    const author = {
      id: profile?.id,
      name: profile?.full_name,
      email: profile?.email,
    };

    const payload = topupObjects.map((obj) => ({
      ...obj,
      author,
      tenant_id: profile?.tenant_id,
      advertiser_id: accounts[0].advertiser_id,
    }));

    // Dummy form handler for now; DB integration will replace this.
    console.log("Bulk topup ad accounts payload", payload);

    const supabase = createClient();

    const { error: topupError } = await supabase
      .from("top_ups")
      .insert(payload)
      .select();

    if (topupError) {
      toast.error(`${topupError.message}`);
      return;
    }
    toast.success(`Successfully topped up ${payload.length} ad accounts.`);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Coins />
          Bulk Topup
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Bulk Topup Ad Accounts</DialogTitle>
          <DialogDescription>
            Fill amount, fee, and currency for each ad account. Disable rows to
            skip them.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit(handleBulkTopup)}
          className="space-y-4 flex flex-col min-h-0"
        >
          {isTabletScreen ? (
            <ScrollArea className="flex-1 min-h-0">
              <div className="pr-4">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableCell className="w-24">Enable</TableCell>
                      <TableCell>Ad Account</TableCell>
                      <TableCell className="w-[180px]">Currency</TableCell>
                      <TableCell className="w-[180px]">Amount</TableCell>
                      <TableCell className="w-[180px]">Fee (%)</TableCell>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fields.map((field, index) => {
                      const isEnabled = rows?.[index]?.enabled ?? true;
                      const rowError = errors.rows?.[index];

                      return (
                        <TableRow key={field.id}>
                          <TableCell>
                            <Controller
                              control={control}
                              name={`rows.${index}.enabled`}
                              render={({ field: enabledField }) => (
                                <Switch
                                  checked={enabledField.value}
                                  onCheckedChange={enabledField.onChange}
                                />
                              )}
                            />
                          </TableCell>

                          <TableCell className={!isEnabled ? "opacity-60" : ""}>
                            <div className="text-sm font-medium">
                              {rows?.[index]?.account_name}
                            </div>
                          </TableCell>

                          <TableCell>
                            <Controller
                              control={control}
                              name={`rows.${index}.currency`}
                              render={({ field: currencyField }) => (
                                <Select
                                  value={currencyField.value}
                                  onValueChange={currencyField.onChange}
                                  disabled={!isEnabled}
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select currency" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {CURRENCIES.filter(
                                      (c) =>
                                        c.value === "USD" || c.value === "EUR",
                                    ).map((currency) => (
                                      <SelectItem
                                        key={currency.value}
                                        value={currency.value}
                                      >
                                        {currency.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                            />
                            {rowError?.currency && (
                              <FieldError errors={[rowError.currency]} />
                            )}
                          </TableCell>

                          <TableCell>
                            <Controller
                              control={control}
                              name={`rows.${index}.amount`}
                              render={({ field: amountField }) => (
                                <Input
                                  {...amountField}
                                  type="number"
                                  step="0.01"
                                  min={
                                    isAdvertiser
                                      ? (rows?.[index]?.min_topup ?? 0)
                                      : 0
                                  }
                                  placeholder="0.00"
                                  disabled={!isEnabled}
                                />
                              )}
                            />
                            {rowError?.amount && (
                              <FieldError errors={[rowError.amount]} />
                            )}
                          </TableCell>
                          <TableCell>
                            <Controller
                              control={control}
                              name={`rows.${index}.fee`}
                              render={({ field: feeField }) => (
                                <Input
                                  {...feeField}
                                  type="number"
                                  step="0.1"
                                  min={0}
                                  max={100}
                                  placeholder="0.0"
                                  disabled={!isEnabled || !isAdmin}
                                />
                              )}
                            />
                            {rowError?.fee && (
                              <FieldError errors={[rowError.fee]} />
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </ScrollArea>
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto touch-pan-y">
              <div className="pr-2">
                <div className="overflow-x-auto touch-pan-x">
                  <Table className="min-w-[760px]">
                    <TableHeader className="bg-muted/50">
                      <TableRow>
                        <TableCell className="w-24 sticky left-0 z-10 bg-background">
                          Enable
                        </TableCell>
                        <TableCell>Ad Account</TableCell>
                        <TableCell className="w-[180px]">Currency</TableCell>
                        <TableCell className="w-[180px]">Amount</TableCell>
                        <TableCell className="w-[180px]">Fee (%)</TableCell>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {fields.map((field, index) => {
                        const isEnabled = rows?.[index]?.enabled ?? true;
                        const rowError = errors.rows?.[index];
                        const minTopup = rows?.[index]?.min_topup ?? 0;

                        return (
                          <TableRow key={field.id}>
                            <TableCell className="sticky left-0 z-10 bg-background">
                              <Controller
                                control={control}
                                name={`rows.${index}.enabled`}
                                render={({ field: enabledField }) => (
                                  <Switch
                                    checked={enabledField.value}
                                    onCheckedChange={enabledField.onChange}
                                  />
                                )}
                              />
                            </TableCell>

                            <TableCell
                              className={!isEnabled ? "opacity-60" : ""}
                            >
                              <div className="text-sm font-medium">
                                {rows?.[index]?.account_name}
                              </div>
                              {isAdvertiser && minTopup > 0 && (
                                <div className="text-xs text-muted-foreground">
                                  Min topup: {minTopup}
                                </div>
                              )}
                            </TableCell>

                            <TableCell>
                              <Controller
                                control={control}
                                name={`rows.${index}.currency`}
                                render={({ field: currencyField }) => (
                                  <Select
                                    value={currencyField.value}
                                    onValueChange={currencyField.onChange}
                                    disabled={!isEnabled}
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select currency" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {CURRENCIES.filter(
                                        (c) =>
                                          c.value === "USD" ||
                                          c.value === "EUR",
                                      ).map((currency) => (
                                        <SelectItem
                                          key={currency.value}
                                          value={currency.value}
                                        >
                                          {currency.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                )}
                              />
                              {rowError?.currency && (
                                <FieldError errors={[rowError.currency]} />
                              )}
                            </TableCell>

                            <TableCell>
                              <Controller
                                control={control}
                                name={`rows.${index}.amount`}
                                render={({ field: amountField }) => (
                                  <Input
                                    {...amountField}
                                    type="number"
                                    step="0.01"
                                    min={isAdvertiser ? minTopup : 0}
                                    placeholder="0.00"
                                    disabled={!isEnabled}
                                  />
                                )}
                              />
                              {rowError?.amount && (
                                <FieldError errors={[rowError.amount]} />
                              )}
                            </TableCell>
                            <TableCell>
                              <Controller
                                control={control}
                                name={`rows.${index}.fee`}
                                render={({ field: feeField }) => (
                                  <Input
                                    {...feeField}
                                    type="number"
                                    step="0.1"
                                    min={0}
                                    max={100}
                                    placeholder="0.0"
                                    disabled={!isEnabled || !isAdmin}
                                  />
                                )}
                              />
                              {rowError?.fee && (
                                <FieldError errors={[rowError.fee]} />
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}

          {errors.rows?.message && (
            <FieldError errors={[{ message: errors.rows.message }]} />
          )}

          <div className="flex justify-end">
            <Button type="submit" size="sm">
              Submit Bulk Topup
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
