"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { banksForAccountTypes } from "@/lib/bank-routing";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import * as z from "zod";
import {
  BankTransferInstructions,
  InstantTransferInstructions,
  bankTransferCurrencies,
  bankBeneficiary,
  type BankGroup,
  type TransferCurrency,
} from "./bank-transfer-instructions";

import { createClient } from "@/lib/supabase/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import useExchangeRates from "@/components/settings/finance/use-exchange-rates";
import { formatCurrency } from "@/lib/utils-pure";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Loader2,
  CheckCircle2,
  ArrowLeft,
  FileImage,
  RotateCcw,
  X,
} from "lucide-react";
import { useEffect, useState, type ChangeEvent } from "react";
import { useForm } from "react-hook-form";
import { useFormDraft } from "@/hooks/use-form-draft";
import { useAppContext } from "@/context/app-provider";

type CurrencyCode = "USD" | "EUR";

type FormValues = {
  amount: number;
};

const STEPS = {
  SELECTION: 1,
  BANK_DETAILS: 2,
  SUBMISSION: 3,
  SUCCESS: 4,
};

// Exchange-rate rows store "1 USD = N <currency>". Convert an amount held in
// the wallet currency (EUR/USD) into the currency the advertiser will
// physically transfer in. Display-only hint — the recorded top-up and the
// wallet credit stay in the EUR/USD wallet currency (the admin credits from
// the slip). Returns null when rates are unavailable so the hint hides.
function convertWalletToTransfer(
  amount: number,
  walletCurrency: CurrencyCode,
  transferCurrency: TransferCurrency,
  rate: { eur?: number | null; gbp?: number | null; hkd?: number | null } | undefined,
): number | null {
  if (!amount || amount <= 0) return null;
  if (walletCurrency === transferCurrency) return amount;
  const eur = Number(rate?.eur ?? 0);
  const gbp = Number(rate?.gbp ?? 0);
  const hkd = Number(rate?.hkd ?? 0);
  // First to a USD base.
  let usd: number;
  if (walletCurrency === "USD") {
    usd = amount;
  } else {
    if (eur <= 0) return null;
    usd = amount / eur;
  }
  // Then USD → the transfer currency (multiply by "N per USD").
  switch (transferCurrency) {
    case "USD":
      return usd;
    case "EUR":
      return eur > 0 ? usd * eur : null;
    case "GBP":
      return gbp > 0 ? usd * gbp : null;
    case "HKD":
      return hkd > 0 ? usd * hkd : null;
    default:
      return null;
  }
}

// Old drafts stored the 2-way "meta_eu" | "others" group. Map any stale value
// onto the current 3-bank groups so a restored draft never lands invalid.
function normalizeBankGroup(value: unknown): BankGroup {
  if (value === "turlit" || value === "zanel" || value === "muxue") {
    return value;
  }
  return value === "others" ? "muxue" : "turlit";
}

// Beneficiary bank options. Each lists the ad-account families that route to
// that bank.
const BANK_GROUP_OPTIONS: { value: BankGroup; title: string; sub: string }[] = [
  {
    value: "turlit",
    title: "TURLIT LLC",
    sub: "Meta-EU-PSM · Google · TikTok · Taboola · Snapchat",
  },
  {
    value: "zanel",
    title: "ZANEL ENTERPRISE",
    sub: "Meta-EU-PSM-GH · USD only",
  },
  {
    value: "muxue",
    title: "MUXUE TRADE LIMITED",
    sub: "Meta-HK-Premium · Meta-HK-Business",
  },
];


export default function WalletTopupDialog({
  open,
  onOpenChange,
  walletId,
  referenceNo,
  minTopup,
  accountTypeSlugs = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  walletId: string | null;
  referenceNo: number | null;
  minTopup: number | null;
  /** Type slugs of the advertiser's own ad accounts, to route the transfer. */
  accountTypeSlugs?: string[];
}) {
  const [step, setStep] = useState(STEPS.SELECTION);
  const [currency, setCurrency] = useState<CurrencyCode>("EUR");
  // Which beneficiary bank the transfer routes to.
  const [bankGroup, setBankGroup] = useState<BankGroup>("turlit");
  // The beneficiaries this advertiser could legitimately be paying. Empty
  // means "cannot tell from their accounts" — a new customer with none yet —
  // and the default stands.
  const bankChoices = banksForAccountTypes(accountTypeSlugs);
  const soleBank = bankChoices.length === 1 ? bankChoices[0] : null;
  // One possible destination: set it rather than ask. Also corrects a
  // restored draft that names a bank this advertiser has no accounts at.
  useEffect(() => {
    if (soleBank && bankGroup !== soleBank) setBankGroup(soleBank);
    else if (
      bankChoices.length > 1 &&
      !bankChoices.includes(bankGroup)
    ) {
      setBankGroup(bankChoices[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soleBank, bankChoices.join(","), bankGroup]);
  // The currency the advertiser will physically transfer in (picks the bank
  // account shown). Defaults to the wallet currency.
  const [transferCurrency, setTransferCurrency] =
    useState<TransferCurrency>("EUR");
  const [paymentSlipUrl, setPaymentSlipUrl] = useState<string | null>(null);
  const [paymentSlipPreview, setPaymentSlipPreview] = useState<
    "image" | "unavailable" | null
  >(null);
  const [paymentSlipError, setPaymentSlipError] = useState<string | null>(null);
  const [isUploadingSlip, setIsUploadingSlip] = useState(false);
  // Local object-URL for the slip image preview. The uploaded file lives in
  // a PRIVATE bucket, so the stored path can't be used as an <img src> (it
  // 404s). Preview the just-selected File instead; revoke on change/unmount.
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const minTopupAmount = minTopup || 300;
  const queryClient = useQueryClient();
  const { profile } = useAppContext();

  // Live FX rates (per 1 USD) to show a "you'll transfer ≈ X" hint when the
  // advertiser pays in a currency other than their wallet currency. Rates
  // are read-only here; advertisers already read these elsewhere.
  const { exchangeRates } = useExchangeRates({ activeOnly: true });
  const rate = exchangeRates?.[0] as
    | { eur?: number | null; gbp?: number | null; hkd?: number | null }
    | undefined;

  // The transfer currencies the chosen bank can receive.
  const availableTransferCurrencies = bankTransferCurrencies(bankGroup);

  // Keep the transfer currency valid for the selected bank. ZANEL is USD
  // only, so switching to it from an EUR transfer snaps back to USD.
  useEffect(() => {
    if (!availableTransferCurrencies.includes(transferCurrency)) {
      setTransferCurrency(
        availableTransferCurrencies.includes(currency)
          ? currency
          : availableTransferCurrencies[0],
      );
    }
  }, [bankGroup, currency, transferCurrency, availableTransferCurrencies]);
  const formSchema = z.object({
    amount: z
      .number()
      .min(minTopupAmount, `Minimum Amount: ${minTopupAmount}`)
      .positive("Amount is required"),
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
  } = useForm<FormValues>({
    defaultValues: {
      amount: 0,
    },
    resolver: zodResolver(formSchema),
  });

  // Draft persistence: multi-step form, easy to lose input on tab close.
  // Save the composite of {currency, accountType, amount, step,
  // paymentSlipUrl} so restore returns the user to where they were.
  const currentAmount = watch("amount");
  const draftValues = {
    currency,
    bankGroup,
    transferCurrency,
    amount: currentAmount,
    step,
    paymentSlipUrl,
  };
  const draft = useFormDraft<typeof draftValues>({
    formKey: `wallet-topup:${walletId ?? "unknown"}`,
    values: draftValues,
    userScope: profile?.id ?? null,
    // Stop persisting once the request is submitted: otherwise the debounced
    // saver re-writes the draft we just cleared (with step=SUCCESS), and the
    // next open shows a phantom "Resume" that jumps straight to the success
    // screen for a top-up that was never re-submitted.
    enabled: open && step !== STEPS.SUCCESS,
  });

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setStep(STEPS.SELECTION);
        setCurrency("EUR");
        setBankGroup("turlit");
        setTransferCurrency("EUR");
        setPaymentSlipUrl(null);
        setPaymentSlipPreview(null);
        setPreviewSrc(null);
        setPaymentSlipError(null);
        setIsUploadingSlip(false);

        reset();
      }, 300);
    }
  }, [open, reset]);

  useEffect(() => {
    return () => {
      if (previewSrc) URL.revokeObjectURL(previewSrc);
    };
  }, [previewSrc]);

  const handlePaymentSlipChange = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // 10 MB — plenty for a bank receipt scan, refuses accidental
    // upload of the family holiday video.
    const MAX_BYTES = 10 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      setPaymentSlipError("File is too large (max 10 MB).");
      setPaymentSlipUrl(null);
      setPaymentSlipPreview(null);
      setPreviewSrc(null);
      return;
    }

    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    // SVG deliberately excluded — SVG can carry embedded scripts that
    // execute when the file is opened. Bank slips are raster or PDF.
    const imageExtensions = new Set([
      "png",
      "jpg",
      "jpeg",
      "gif",
      "webp",
      "bmp",
    ]);
    const isImage =
      imageExtensions.has(extension) ||
      (file.type.startsWith("image/") && file.type !== "image/svg+xml");
    const isPdf = extension === "pdf" || file.type === "application/pdf";

    if (!isImage && !isPdf) {
      setPaymentSlipError("Only PNG / JPG / GIF / WEBP / BMP / PDF allowed.");
      setPaymentSlipUrl(null);
      setPaymentSlipPreview(null);
      setPreviewSrc(null);
      return;
    }

    setPaymentSlipError(null);
    setPaymentSlipUrl(null);
    setPaymentSlipPreview(isImage ? "image" : "unavailable");
    setPreviewSrc(isImage ? URL.createObjectURL(file) : null);
    setIsUploadingSlip(true);

    try {
      const supabase = createClient();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const filePath = `wallet-topups/${walletId ?? "unknown"}/${Date.now()}-${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from("wallet_payment_slips")
        .upload(filePath, file, { contentType: file.type, upsert: false });

      if (uploadError) throw uploadError;

      // Store the bucket PATH, not a public URL — the bucket is
      // private (bank receipts are PII). Admins read it later through
      // a short-lived signed URL minted server-side. See
      // actions/payment-slip-actions.ts.
      setPaymentSlipUrl(filePath);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unknown upload error.";
      setPaymentSlipUrl(null);
      setPaymentSlipError(message);
      toast.error("Unable to upload payment slip", { description: message });
    } finally {
      setIsUploadingSlip(false);
    }
  };

  const { mutate, isPending } = useMutation({
    mutationKey: ["create-wallet-topup", walletId],
    mutationFn: async (values: FormValues) => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc(
        "wallet_topup_advertiser_create",
        {
          p_amount: values.amount,
          p_currency: currency,
          // Slip is required for BOTH groups now — always send it.
          p_payment_slip: paymentSlipUrl,
        },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      setStep(STEPS.SUCCESS);
      await draft.clear();
      queryClient.invalidateQueries({
        queryKey: ["wallet-topups", walletId],
      });
      queryClient.invalidateQueries({
        queryKey: ["wallet"],
      });
      // The advertiser wallet page's pending-top-up card + activity table are
      // keyed ['adv-wallet-activity', walletId], which none of the above
      // prefixes cover — invalidate it too so the new pending top-up shows
      // without a full reload.
      queryClient.invalidateQueries({
        queryKey: ["adv-wallet-activity"],
      });
    },
    onError: (err: Error) => {
      toast.error("Unable to request topup", { description: err.message });
    },
  });

  const handleNextStep = () => {
    setStep((prev) => prev + 1);
  };

  const handlePrevStep = () => {
    setStep((prev) => prev - 1);
  };

  const handleSubmitForm = (values: FormValues) => {
    // Slip required for every topup, both account groups.
    if (isUploadingSlip) {
      toast.error("Payment slip is still uploading.");
      return;
    }
    if (!paymentSlipUrl) {
      setPaymentSlipError("Payment slip is required.");
      return;
    }

    mutate(values);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {step === STEPS.SUCCESS
              ? "Topup Requested"
              : "Request Wallet Topup"}
          </DialogTitle>
        </DialogHeader>

        {draft.hasDraft &&
          draft.restoredDraft &&
          step !== STEPS.SUCCESS && (
          <div className="rounded-md border border-blue-300 bg-blue-50 dark:bg-blue-950/30 p-2 flex items-center gap-2">
            <div className="flex-1 text-xs">
              Resume where you left off (
              {new Date(draft.restoredDraft.savedAt).toLocaleString()})
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                const v = draft.restoredDraft!.values;
                setCurrency(v.currency);
                setBankGroup(normalizeBankGroup(v.bankGroup));
                if (v.transferCurrency) setTransferCurrency(v.transferCurrency);
                setPaymentSlipUrl(v.paymentSlipUrl);
                setPaymentSlipPreview(v.paymentSlipUrl ? "image" : null);
                setValue("amount", v.amount || 0);
                setStep(v.step || STEPS.SELECTION);
                draft.dismissDraft();
              }}
            >
              <RotateCcw className="h-3 w-3 mr-1" />
              Resume
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => void draft.clear()}
              aria-label="Discard draft"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}
        <ScrollArea className="max-h-[70dvh] pr-2">
          <div className="px-1 py-2">
            {/* STEP 1: SELECTION */}
            {step === STEPS.SELECTION && (
              <div className="space-y-6">
                <div className="space-y-3">
                  <Label>Wallet to fund</Label>
                  <Select
                    value={currency}
                    onValueChange={(val: CurrencyCode) => setCurrency(val)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select currency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD - US Dollar wallet</SelectItem>
                      <SelectItem value="EUR">EUR - Euro wallet</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Your wallet is credited in {currency}. You can still
                    transfer in another currency below.
                  </p>
                </div>

                {/* Only asked when there is genuinely something to choose.
                    Every customer used to be shown all three beneficiary
                    companies and asked to route their own payment — including
                    a brand-new advertiser with no ad accounts at all, for whom
                    there was nothing to decide and no reason to see the
                    others. The destination follows from the accounts they
                    hold, so it is worked out rather than asked. */}
                {bankChoices.length > 1 ? (
                  <div className="space-y-3">
                    <Label>Which accounts are you funding?</Label>
                    <RadioGroup
                      value={bankGroup}
                      onValueChange={(val: BankGroup) => setBankGroup(val)}
                      className="grid gap-3"
                    >
                      {BANK_GROUP_OPTIONS.filter((o) =>
                        bankChoices.includes(o.value),
                      ).map((opt) => (
                        <div key={opt.value}>
                          <RadioGroupItem
                            value={opt.value}
                            id={`bankgroup-${opt.value}`}
                            className="peer sr-only"
                          />
                          <Label
                            htmlFor={`bankgroup-${opt.value}`}
                            className="flex flex-col items-start justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                          >
                            <span className="font-semibold text-base">
                              {opt.title}
                            </span>
                            <span className="mt-1.5 text-xs text-muted-foreground leading-snug">
                              {opt.sub}
                            </span>
                          </Label>
                        </div>
                      ))}
                    </RadioGroup>
                  </div>
                ) : null}

                <div className="space-y-3">
                  <Label>Transfer currency</Label>
                  <div className="flex flex-wrap gap-2">
                    {availableTransferCurrencies.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setTransferCurrency(c)}
                        className={
                          "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors " +
                          (transferCurrency === c
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-muted bg-popover hover:bg-accent hover:text-accent-foreground")
                        }
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {bankBeneficiary(bankGroup)} receives{" "}
                    {availableTransferCurrencies.join(" / ")}.
                    {transferCurrency !== currency
                      ? ` You'll pay in ${transferCurrency}; your ${currency} wallet is credited from the slip.`
                      : ""}
                  </p>
                </div>

                <Button className="w-full mt-4" onClick={handleNextStep}>
                  Continue
                </Button>
              </div>
            )}

            {/* STEP 2: BANK DETAILS */}
            {step === STEPS.BANK_DETAILS && (
              <div className="space-y-6">
                <div className="rounded-lg border bg-muted/20 p-4">
                  <BankTransferInstructions
                    group={bankGroup}
                    transferCurrency={transferCurrency}
                  />
                </div>

                {bankGroup === "muxue" && <InstantTransferInstructions />}

                <div className="rounded-lg border bg-muted/20 p-4">
                  <p className="text-sm text-muted-foreground">
                    Use the below reference no in your description / reference
                    of bank transfer.
                  </p>
                  <p className="text-center font-semibold font-mono text-xl">
                    {referenceNo}
                  </p>
                </div>

                <div className="flex gap-3 pt-2">
                  <Button variant="outline" onClick={handlePrevStep}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                  <Button className="flex-1" onClick={handleNextStep}>
                    I have made the transfer
                  </Button>
                </div>
              </div>
            )}

            {/* STEP 3: FORM SUBMISSION */}
            {step === STEPS.SUBMISSION && (
              <form
                className="space-y-6"
                onSubmit={handleSubmit(handleSubmitForm)}
              >
                {/* Summary of choices */}
                <div className="rounded-md bg-muted/40 p-3 text-sm flex justify-between items-center border">
                  <div className="flex flex-col">
                    <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                      Transferring to
                    </span>
                    <span className="font-medium">
                      {bankBeneficiary(bankGroup)} ({transferCurrency})
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto p-0 text-xs text-primary underline"
                    onClick={() => setStep(STEPS.SELECTION)}
                    type="button"
                  >
                    Change
                  </Button>
                </div>

                <div className="space-y-4">
                  <div className="grid gap-2">
                    <Label htmlFor="amount">
                      Amount to credit ({currency} wallet)
                    </Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">
                        {currency === "USD" ? "$" : "€"}
                      </span>
                      <Input
                        id="amount"
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        className="pl-7"
                        {...register("amount", { valueAsNumber: true })}
                      />
                    </div>
                    {errors.amount && (
                      <p className="text-sm text-destructive">
                        {errors.amount.message}
                      </p>
                    )}
                    {transferCurrency !== currency &&
                      (() => {
                        const converted = convertWalletToTransfer(
                          currentAmount,
                          currency,
                          transferCurrency,
                          rate,
                        );
                        if (converted === null) return null;
                        return (
                          <p className="text-xs text-muted-foreground">
                            ≈ transfer{" "}
                            <span className="font-semibold text-foreground">
                              {formatCurrency(converted, transferCurrency)}
                            </span>{" "}
                            to {bankBeneficiary(bankGroup)} (
                            {transferCurrency}). Your {currency} wallet is
                            credited {formatCurrency(currentAmount || 0, currency)}{" "}
                            from the slip.
                          </p>
                        );
                      })()}
                  </div>
                </div>

                {/* Slip required for every topup now */}
                {(
                  <div className="space-y-3">
                    <Label htmlFor="payment_slip">Payment Slip</Label>
                    <Input
                      id="payment_slip"
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={handlePaymentSlipChange}
                      disabled={isUploadingSlip}
                    />
                    {isUploadingSlip && (
                      <p className="text-xs text-muted-foreground flex items-center gap-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Uploading payment slip...
                      </p>
                    )}
                    {paymentSlipError && (
                      <p className="text-sm text-destructive">
                        {paymentSlipError}
                      </p>
                    )}
                    {paymentSlipUrl && (
                      <div className="rounded-md border bg-muted/20 p-3">
                        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-2">
                          <FileImage className="h-4 w-4" />
                          Preview
                        </div>
                        {paymentSlipPreview === "image" && previewSrc ? (
                          // eslint-disable-next-line @next/next/no-img-element -- user-uploaded slip of unknown dimensions in a preview modal
                          <img
                            src={previewSrc}
                            alt="Payment slip preview"
                            className="w-full max-h-56 object-contain rounded-md bg-background"
                          />
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            {paymentSlipPreview === "image"
                              ? "Uploaded — preview shows only for the file you just selected."
                              : "Preview not available for this file type."}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <Button
                    variant="outline"
                    type="button"
                    onClick={handlePrevStep}
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1"
                    disabled={
                      isPending ||
                      !walletId ||
                      !paymentSlipUrl ||
                      isUploadingSlip
                    }
                  >
                    {isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Submit Request
                  </Button>
                </div>
              </form>
            )}

            {/* STEP 4: SUCCESS */}
            {step === STEPS.SUCCESS && (
              <div className="flex flex-col items-center justify-center py-6 space-y-4 text-center">
                <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                  <CheckCircle2 className="h-6 w-6 text-green-600" />
                </div>
                <div className="space-y-2">
                  <h3 className="font-semibold text-lg">Request Successful!</h3>
                  <p className="text-sm text-muted-foreground max-w-[18rem] mx-auto">
                    Your topup request has been submitted.
                  </p>
                </div>

                <Button
                  onClick={() => onOpenChange(false)}
                  className="w-full mt-2"
                >
                  Close
                </Button>
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
