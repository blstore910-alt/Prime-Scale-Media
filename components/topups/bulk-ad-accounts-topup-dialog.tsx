import { useQuery } from "@tanstack/react-query";
import { quoteTopupFeePct } from "@/actions/topup-actions";
import { toastResult } from "@/lib/action-warning";
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
import { useEffect, useMemo, useState, useRef } from "react";
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
  // ── ROUNDED BEFORE IT IS STORED ───────────────────────────────────
  //
  // The server recomputes and rounds fee_amount, topup_amount and
  // amount_usd, but it never touches these two -- they are passed
  // through the allowlist exactly as the browser computed them. So a
  // EUR 1,234.56 bulk top-up wrote eur_topup = 1172.8319999999999, and
  // the customer's top-up card renders that column unformatted: "(€
  // 1172.8319999999999)". The single-account form has rounded these
  // since it was written.
  const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  const eurRate = Number(exchangeRates?.[0]?.eur ?? 0);
  const toEur = (usd: number) => (eurRate > 0 ? r2(usd * eurRate) : 0);
  const eurAmount = cur === "EUR" ? r2(receivedAmount) : toEur(amountUSD);
  const eurTopupAmount =
    cur === "EUR" ? r2(topupAmount * eurRate) : toEur(topupAmount);

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
  // One server-side quote per account, same call the single-account form
  // makes. Returns the percentage only — no plan name, no perk name,
  // nothing about where the rate comes from.
  const accountIds = useMemo(
    () => accounts.map((a) => a.id).filter(Boolean),
    [accounts],
  );
  const feeQuotes = useQuery({
    queryKey: ["bulk-topup-fee-quotes", accountIds.join(",")],
    enabled: accountIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const out: Record<string, number> = {};
      const results = await Promise.all(
        accountIds.map(async (id) => {
          const res = await quoteTopupFeePct(id);
          return res.ok ? ([id, res.data.pct] as const) : null;
        }),
      );
      for (const r of results) if (r) out[r[0]] = r[1];
      return out;
    },
  });
  const feesSettled = accountIds.length === 0 || feeQuotes.isSuccess;
  // A quote that ERRORED (network, not a refused single id -- those are
  // swallowed per-id) used to leave submit disabled for ever behind
  // "Working out the fee for each account", with nothing on screen
  // saying why. Fail closed, but say so and offer the retry.
  const feesFailed = accountIds.length > 0 && feeQuotes.isError;

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
        // The account's own column is the SEED only. What the server
        // actually charges is resolveEffectiveFeePct: account fee, else
        // the plan rate, else the caller's, then perks and the
        // Meta-EU-Premium two points. With fee = 0 on the row and a 5%
        // plan, every box here read 0, the confirmation showed only the
        // wallet total, and the server took 5% of each row — on up to
        // two hundred rows, which is real money nobody was shown. The
        // quote below replaces this as soon as it lands.
        // Seeded from the quote when it has already landed, so opening
        // the dialog shows the real rate from the first frame rather
        // than 0 followed by a flicker.
        fee: String(feeQuotes.data?.[account.id] ?? account.fee ?? 0),
        min_topup: account.min_topup ?? 0,
      })),
    [accounts, feeQuotes.data],
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

  // ── SEEDING ON OPEN MUST NOT UNDO THE QUOTE ──────────────────────
  //
  // Two effects both called reset, and the wrong one won. The quote
  // query is enabled on accountIds.length, NOT on `open`, so it fires
  // when the parent table mounts this component -- long before anybody
  // clicks Bulk Topup. Its result was written into a form nobody had
  // seen; then opening the dialog reset every row back to
  // String(account.fee ?? 0); and the quote effect never re-ran,
  // because `quoted` keeps its identity for staleTime and `reset` is
  // stable.
  //
  // So every box read the seed -- 0% on an account with no fee column
  // -- while bulkCreateTopupsAsAdmin passes that box only as a FALLBACK
  // to resolveEffectiveFeePct, which then charges the plan's 5%. The
  // admin reads 0 and the wallet is debited 5. On EUR 50,000 across
  // twenty rows that is about EUR 2,900 nobody was shown.
  //
  // It was intermittently right, which is worse: open the dialog before
  // the quote settles and the ordering reverses.
  //
  // Fixed by seeding on the OPEN TRANSITION only, from a ref, so a late
  // quote cannot trigger a full reset that would wipe amounts the admin
  // has already typed. The quote effect below still runs and touches
  // nothing but `fee`.
  const latestDefaults = useRef(defaultRows);
  latestDefaults.current = defaultRows;
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      reset({ rows: latestDefaults.current });
    }
    wasOpen.current = open;
  }, [open, reset]);

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

  // Rewrite the seeded fee boxes with the real rate the moment it
  // arrives, so what the admin reads is what the server will charge.
  const quoted = feeQuotes.data;
  useEffect(() => {
    if (!quoted) return;
    reset((prev) => ({
      ...prev,
      rows: prev.rows.map((r) =>
        quoted[r.account_id] == null
          ? r
          : { ...r, fee: String(quoted[r.account_id]) },
      ),
    }));
  }, [quoted, reset]);

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
    toastResult(
      result,
      `${result.data.inserted} top-ups filed — verify them to move the money.`,
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
            <Button
              type="submit"
              size="sm"
              disabled={running || !feesSettled}
              title={
                feesSettled
                  ? undefined
                  : feesFailed
                    ? "We could not work out the fee for these accounts"
                    : "Working out the fee for each account"
              }
            >
              {running
                ? "Sending…"
                : feesSettled
                  ? "Submit Bulk Topup"
                  : feesFailed
                    ? "Fees unavailable"
                    : "Checking fees…"}
            </Button>
          </div>
          {/* FAIL CLOSED, BUT SAY SO. Submitting on the seeded rate
              would charge the plan's percentage while the boxes read 0,
              so this stays disabled -- but it used to sit there for
              ever behind "Working out the fee", with nothing on screen
              explaining it and no way forward. */}
          {feesFailed ? (
            <p className="text-sm text-destructive" role="alert">
              We couldn&apos;t work out the fee for these accounts, so this is
              held rather than charging a rate we cannot show you.{" "}
              <button
                type="button"
                className="underline underline-offset-2"
                onClick={() => feeQuotes.refetch()}
              >
                Try again
              </button>
              .
            </p>
          ) : null}
        </form>
      </DialogContent>

      <ConfirmModal
        open={!!confirming}
        onOpenChange={(next) => {
          if (!next && !running) setConfirming(null);
        }}
        title="Move this money to these ad accounts?"
        lead="This files a top-up for every account listed. Nothing leaves the wallet yet — each row still has to be verified on the Pending top-ups desk before the money moves, and once it has moved it only comes back through a withdrawal we approve."
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
            /* "To be verified", not "Out of the wallet". bulkCreate
               writes every row as pending and never touches a wallet, so
               this label promised a debit that had not happened —
               against a confirmation that also called it as final as the
               single top-up. */
            label={`To be verified, ${cur}`}
            value={`${cur} ${total.toFixed(2)}`}
            strong
          />
        ))}
        {/* ── AND THE FEE, WHICH THIS DID NOT MENTION AT ALL ────────
            The rows carry a fee box each, the server charges it, and the
            confirmation listed only the amounts -- so the one screen
            where an admin commits up to two hundred movements at once
            showed the gross and said nothing about what comes off it.
            The rate is per row, so this is the sum of the rows'
            OWN rates, which is the figure that will actually be taken.
            Split by currency, because two currencies are not summable. */}
        {Object.entries(
          (confirming?.rows ?? [])
            .filter((r) => r.enabled)
            .reduce<Record<string, number>>((acc, r) => {
              const cur = String(r.currency ?? "").toUpperCase() || "—";
              const amt = Number(r.amount) || 0;
              const pct = Number(r.fee) || 0;
              acc[cur] = (acc[cur] ?? 0) + (amt * pct) / 100;
              return acc;
            }, {}),
        )
          .filter(([, fee]) => fee > 0.005)
          .map(([cur, fee]) => (
            <ConfirmFact
              key={`fee-${cur}`}
              label={`Fee included, ${cur}`}
              value={`${cur} ${fee.toFixed(2)}`}
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
