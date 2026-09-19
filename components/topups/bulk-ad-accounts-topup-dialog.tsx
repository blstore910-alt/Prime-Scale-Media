import { Controller, useFieldArray, useForm } from "react-hook-form";
import { calculateTopupAmount, type MinimalRate } from "@/lib/utils-pure";
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
import ConfirmModal, { ConfirmFact } from "@/components/ui/confirm-modal";
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
import { bulkCreateTopupsAsAdmin } from "@/actions/topup-actions";
import { Coins } from "lucide-react";
import { useIsTablet } from "@/hooks/use-is-tablet";

type BulkTopupRow = {
  account_id: string;
  account_name: string;
  enabled: boolean;
  currency: string;
  /** What the ACCOUNT is denominated in, or null when it does not say.
   *  Carried on the row so the schema can refuse a mismatch the way the
   *  single-account form already does. */
  account_currency: string | null;
  amount: string;
  fee: string;
  min_topup: number;
};

const prepareTopupObject = (
  row: Partial<BulkTopupRow>,
  exchangeRates: MinimalRate[],
) => {
  const { currency, amount, account_id, fee } = row;
  const receivedAmount = Number(amount);
  const feePct = Number(fee);
  const cur = String(currency ?? "USD");

  // Use the SAME helper the single top-up form uses. This did its own
  // arithmetic and got the direction wrong in both places: the rate is
  // "1 USD = N <currency>" — the convention lib/utils-pure.ts documents and
  // the server RPCs follow — so converting a foreign amount to USD DIVIDES.
  // This multiplied. At a 0.86 EUR rate a EUR 1000 top-up was stored as $860
  // instead of $1162.79, and a USD 1000 one as EUR 1163 instead of EUR 860.
  //
  // It also took the fee off the PAID amount while the single form takes it
  // off the USD amount, so the two paths disagreed about fee_amount for the
  // same top-up. One helper, one answer.
  const { topupAmount, amountUSD, feeAmount } = calculateTopupAmount(
    receivedAmount,
    exchangeRates,
    cur,
    feePct,
  );

  // EUR figures alongside the USD ones. Same convention, other direction:
  // USD -> EUR MULTIPLIES by the rate.
  const eurRate = Number(exchangeRates?.[0]?.eur ?? 0);
  const toEur = (usd: number) => (eurRate > 0 ? usd * eurRate : 0);
  const eurAmount = cur === "EUR" ? receivedAmount : toEur(amountUSD);
  const eurTopupAmount = cur === "EUR" ? topupAmount * eurRate : toEur(topupAmount);

  return {
    amount_received: receivedAmount,
    account_id,
    amount_usd: amountUSD,
    topup_usd: topupAmount,
    topup_amount: topupAmount,
    currency,
    fee,
    fee_amount: feeAmount,
    eur_value: eurAmount,
    eur_topup: eurTopupAmount,
    rate: eurRate,
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
              account_currency: z.string().nullable(),
              amount: z.string(),
              fee: z.string(),
              min_topup: z.number(),
            })
            .superRefine((row, ctx) => {
              if (!row.enabled) return;

              // THE SAME REFUSAL THE SINGLE FORM MAKES. Funding a USD ad
              // account out of the EUR wallet is not a preference, it is
              // a mistake, and thirty rows at once is where it happens.
              if (
                row.account_currency &&
                row.currency !== row.account_currency
              ) {
                ctx.addIssue({
                  path: ["currency"],
                  code: "custom",
                  message: `This account is ${row.account_currency}`,
                });
              }

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
  const isTabletScreen = useIsTablet() ?? true;
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
        // THE ACCOUNT'S OWN CURRENCY, not EUR for everybody.
        //
        // Every row defaulted to EUR. An admin filling amounts for USD ad
        // accounts, leaving the default and submitting wrote EUR top-ups
        // against USD accounts, out of the EUR wallet. The single-account
        // form forbids exactly this — "Only USD wallet is allowed for this
        // account" — and nothing on this dialog or in
        // bulkCreateTopupsAsAdmin compared the row's currency to the
        // account's at all.
        //
        // USD when the account does not say: top_ups.topup_amount and
        // amount_usd are USD by construction, so USD is the safe guess
        // and EUR was never the right one.
        currency:
          String(account.currency ?? "").toUpperCase() === "EUR"
            ? "EUR"
            : "USD",
        account_currency:
          String(account.currency ?? "").toUpperCase() === "EUR"
            ? "EUR"
            : String(account.currency ?? "").toUpperCase() === "USD"
              ? "USD"
              : null,
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

  // ── N IRREVERSIBLE MOVEMENTS ON ONE CLICK, WITH NO CONFIRMATION ────
  //
  // This is the only multi-row money control in the app — up to 200 rows
  // — rows are opt-OUT (an untouched row is included), and it is
  // available to advertisers as well as admins. The single-account
  // equivalent asks first and says why: "It leaves your wallet now. Money
  // on an ad account can only come back through a withdrawal request,
  // which we have to approve." This one showed no total and asked
  // nothing.
  const [confirming, setConfirming] = useState<BulkTopupFormValues | null>(
    null,
  );

  // ── THE BUSY STATE HAD TO BE OUR OWN ────────────────────────────────
  //
  // When the confirmation was added, the real work moved OUT of
  // react-hook-form's submit: onSubmit became a synchronous
  // `setConfirming(values)`, so `isSubmitting` is true for one microtask
  // and false for the whole run, which happens later in onConfirm. Every
  // guard hung off it therefore did nothing — the confirm button was
  // never disabled, never said "Sending…", ConfirmModal's own close-guard
  // never engaged, and the Submit button behind it stayed live reading
  // "Submit Bulk Topup" while up to two hundred top-ups inserted.
  //
  // So the admin confirms, the modal vanishes, nothing on screen changes
  // for several seconds, and they press Submit again. The wallet is
  // debited twice for the same two hundred accounts, and money on an ad
  // account only comes back through a withdrawal we have to approve.
  const [running, setRunning] = useState(false);

  const handleBulkTopup = async (values: BulkTopupFormValues) => {
    if (running) return;
    setRunning(true);
    try {
      await runBulkTopup(values);
    } finally {
      setRunning(false);
    }
  };

  const runBulkTopup = async (values: BulkTopupFormValues) => {
    const filteredValues = values.rows.filter((row) => row.enabled);
    // useExchangeRates returns the raw array, which is [] (truthy) when no
    // active rate exists — guard on length AND the first row so we never
    // destructure undefined inside prepareTopupObject.
    if (!exchangeRates?.length || !exchangeRates[0]) {
      toast.error("No active exchange rate configured — try again shortly.");
      return;
    }
    const topupObjects = filteredValues.map((v) =>
      prepareTopupObject(v, exchangeRates),
    );

    const advertiserId = accounts[0]?.advertiser_id;
    if (!advertiserId) {
      toast.error("Missing advertiser context");
      return;
    }
    const payload = topupObjects.map((obj) => ({
      type: "top-up" as const,
      currency: obj.currency,
      amount_received: obj.amount_received,
      amount_usd: obj.amount_usd,
      topup_amount: obj.topup_amount,
      fee: Number(obj.fee),
      fee_amount: obj.fee_amount,
      eur_value: obj.eur_value,
      eur_topup: obj.eur_topup,
      account_id: obj.account_id,
      advertiser_id: advertiserId,
    }));

    const result = await bulkCreateTopupsAsAdmin(payload);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(
      `Successfully topped up ${result.data.inserted} ad accounts.`,
    );
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
      <DialogContent className="flex max-h-[90dvh] flex-col overflow-hidden sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Bulk Topup Ad Accounts</DialogTitle>
          <DialogDescription>
            Fill amount, fee, and currency for each ad account. Disable rows to
            skip them.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit((values) => setConfirming(values))}
          className="space-y-4 flex flex-col min-h-0"
        >
          {isTabletScreen ? (
            <ScrollArea className="flex-1 min-h-0">
              <div className="pr-4">
                <Table>
                  <TableHeader className="bg-background">
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
            /* A CARD per ad account. This branch used to be a 760px-wide
               table inside a horizontal scroller, which is backwards: the
               DESKTOP branch above has no minimum width and needs no
               scrolling, and the phone got the one that has to be dragged
               left and right — while holding the phone and typing amounts
               into it. The account name is the card's title with its switch,
               and the three fields sit under it. */
            <div className="flex-1 min-h-0 space-y-3 overflow-y-auto touch-pan-y pr-1">
              {fields.map((field, index) => {
                const isEnabled = rows?.[index]?.enabled ?? true;
                const rowError = errors.rows?.[index];
                const minTopup = rows?.[index]?.min_topup ?? 0;

                return (
                  <div
                    key={field.id}
                    className={`rounded-lg border p-3 ${isEnabled ? "" : "opacity-60"}`}
                  >
                    <div className="flex items-start gap-3">
                      <Controller
                        control={control}
                        name={`rows.${index}.enabled`}
                        render={({ field: enabledField }) => (
                          <Switch
                            checked={enabledField.value}
                            onCheckedChange={enabledField.onChange}
                            aria-label={`Include ${rows?.[index]?.account_name ?? "this account"}`}
                          />
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">
                          {rows?.[index]?.account_name}
                        </div>
                        {isAdvertiser && minTopup > 0 && (
                          <div className="text-xs text-muted-foreground">
                            Min topup: {minTopup}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <label className="grid gap-1">
                        <span className="text-xs text-muted-foreground">
                          Currency
                        </span>
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
                                <SelectValue placeholder="Currency" />
                              </SelectTrigger>
                              <SelectContent>
                                {CURRENCIES.filter(
                                  (c) => c.value === "USD" || c.value === "EUR",
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
                      </label>

                      <label className="grid gap-1">
                        <span className="text-xs text-muted-foreground">
                          Amount
                        </span>
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
                      </label>

                      <label className="col-span-2 grid gap-1">
                        <span className="text-xs text-muted-foreground">
                          Fee (%)
                        </span>
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
                        {rowError?.fee && <FieldError errors={[rowError.fee]} />}
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {errors.rows?.message && (
            <FieldError errors={[{ message: errors.rows.message }]} />
          )}

          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={running}>
              {running ? "Sending…" : "Submit Bulk Topup"}
            </Button>
          </div>
        </form>
      </DialogContent>

      <ConfirmModal
        open={!!confirming}
        onOpenChange={(next) => {
          if (!next && !running) setConfirming(null);
        }}
        title="Move this money to these ad accounts?"
        lead="It leaves the wallet now, for every account listed. Money on an ad account can only come back through a withdrawal request, which we have to approve — so this is as final as the single top-up, times the number of rows."
        cta="Yes, top them all up"
        busy={running}
        busyLabel="Sending…"
        onConfirm={() => {
          // Keep the modal up while it runs. Clearing `confirming` first
          // closed it instantly and put the admin back on a screen that
          // looked idle — which is half of why the run got fired twice.
          const values = confirming;
          if (!values) return;
          void handleBulkTopup(values).finally(() => setConfirming(null));
        }}
      >
        <ConfirmFact
          label="Accounts"
          value={String((confirming?.rows ?? []).filter((r) => r.enabled).length)}
          strong
        />
        {/* Per currency, never one total: a EUR row and a USD row are not
            summable, and printing a single figure over both is the fault
            this app spends the most comments warning about. */}
        {Object.entries(
          (confirming?.rows ?? [])
            .filter((r) => r.enabled)
            .reduce<Record<string, number>>((acc, r) => {
              const cur = String(r.currency ?? "").toUpperCase() || "—";
              acc[cur] = (acc[cur] ?? 0) + (Number(r.amount) || 0);
              return acc;
            }, {}),
        ).map(([cur, total]) => (
          <ConfirmFact
            key={cur}
            label={`Out of the ${cur} wallet`}
            value={`${cur} ${total.toFixed(2)}`}
            strong
          />
        ))}
        {(confirming?.rows ?? []).filter((r) => r.enabled).length === 0 && (
          <p className="pt-2 text-xs text-muted-foreground">
            Nothing is enabled, so nothing will be sent.
          </p>
        )}
      </ConfirmModal>
    </Dialog>
  );
}
