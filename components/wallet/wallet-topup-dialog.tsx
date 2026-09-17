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
import { formatPaymentReference } from "@/lib/payment-reference";
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
  Check,
  Copy,
  FileImage,
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
  // "muxue" is no longer offered, so a draft naming it lands on turlit —
  // which is where those accounts now send anyway.
  if (value === "turlit" || value === "zanel") return value;
  return "turlit";
}

// Beneficiary bank options, in the order they are offered. Each lists the
// ad-account families that route to it.
//
// MUXUE is gone. The Hong Kong families it used to take come to our own bank
// now, so there is one destination for everything except GH. The BankGroup
// union still carries "muxue" so historical top-ups and their stored bank
// details keep rendering — it is simply never offered and nothing routes to
// it. (Its Airwallex instant-transfer channel goes with it.)
const BANK_GROUP_OPTIONS: { value: BankGroup; title: string; sub: string }[] = [
  {
    value: "turlit",
    title: "TURLIT LLC",
    sub: "Meta-EU-PSM · Meta-HK · Google · TikTok · Taboola · Snapchat",
  },
  {
    value: "zanel",
    title: "ZANEL ENTERPRISE",
    sub: "Meta-EU-PSM-GH · USD only",
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
  // TWO DIFFERENT SITUATIONS, and collapsing them sent money to the wrong
  // company:
  //
  //   no ad accounts at all   → nothing to route yet, the default is
  //                             harmless, don't ask.
  //   accounts whose routing  → there IS something to decide, and we do not
  //   was never stated          know the answer. Offer all three, as before.
  //
  // lib/bank-routing.ts deliberately refuses to guess for a type nobody has
  // mapped (Meta-EU-Premium and Meta-HK-Business-Green are both real seeded
  // types it omits). This caller used to turn that refusal into "hide the
  // chooser and keep turlit" — so an advertiser whose accounts route to MUXUE
  // was shown TURLIT's IBAN with no control to correct it, and nothing
  // server-side would ever notice: the RPC takes amount, currency and slip,
  // and never learns which beneficiary the customer was shown.
  const routed = banksForAccountTypes(accountTypeSlugs);
  const routingUnknown = accountTypeSlugs.length > 0 && routed.length === 0;
  const bankChoices = routingUnknown
    ? BANK_GROUP_OPTIONS.map((o) => o.value)
    : routed;
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
  // ?? not ||. The caller derives this now, and 0 is a real answer meaning
  // "no minimum yet" — `|| 300` read that as unset and put the floor back,
  // which is the exact bug the derivation was written to remove.
  const minTopupAmount = minTopup ?? 300;
  const queryClient = useQueryClient();
  const { profile } = useAppContext();
  // Their own client code, for the payment reference below.
  const clientCode = profile?.advertiser?.[0]?.tenant_client_code ?? null;
  const [refCopied, setRefCopied] = useState(false);
  // The name of the file they picked, so the control can say what is attached
  // instead of leaving that to the browser's own "Geen bestand gekozen".
  const [slipName, setSlipName] = useState<string | null>(null);
  const copyReference = async () => {
    const ref = formatPaymentReference(clientCode, referenceNo);
    if (!ref) return;
    try {
      await navigator.clipboard.writeText(ref);
      setRefCopied(true);
      setTimeout(() => setRefCopied(false), 1800);
    } catch {
      // Blocked clipboard (insecure context, denied permission). Say so
      // rather than showing a tick for something that did not happen.
      toast.error("Couldn't copy — select the reference and copy it by hand.");
    }
  };

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

  // Restore silently. There used to be a blue "Resume where you left off
  // (16-9-2026, 22:41:23)" bar with a Resume button, which is a question
  // nobody wants asked: the answer is always yes, and a timestamp to the
  // second is not information anyone is deciding on. The protection is what
  // matters (CLAUDE.md: never lose typing), so what was typed simply comes
  // back and the draft is consumed.
  useEffect(() => {
    if (!open || !draft.hasDraft || !draft.restoredDraft) return;
    const v = draft.restoredDraft.values;
    setCurrency(v.currency);
    setBankGroup(normalizeBankGroup(v.bankGroup));
    if (v.transferCurrency) setTransferCurrency(v.transferCurrency);
    setPaymentSlipUrl(v.paymentSlipUrl);
    setPaymentSlipPreview(v.paymentSlipUrl ? "image" : null);
    setValue("amount", v.amount || 0);
    setStep(v.step || STEPS.SELECTION);
    draft.dismissDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, draft.hasDraft, draft.restoredDraft]);

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
        setSlipName(null);
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
    setSlipName(file.name);
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
                    {routingUnknown && (
                      <p className="text-xs text-muted-foreground">
                        We could not work this out from your ad accounts, so
                        please pick the one you were given. If you are not
                        sure, ask us before you send anything.
                      </p>
                    )}
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

                {/* Client code first, then the reference — so a bank
                    statement shows whose money it is before anything has been
                    matched. lib/payment-reference.ts also teaches the Wise
                    matcher this shape; without that the longest-digit-run
                    rule would read a six-digit client code as the reference
                    and send every prefixed payment to manual review. */}
                {/* Copyable. This is a number someone has to retype into a
                    banking app, character for character, and getting it wrong
                    is what sends their payment to manual review. Selecting it
                    by hand on a phone means a long-press and two drag
                    handles, usually catching the sentence above it too. */}
                <div className="rounded-xl border bg-muted/20 p-4">
                  <p className="text-sm text-muted-foreground">
                    Put this reference in the description of your transfer, so
                    we can match your payment.
                  </p>
                  <button
                    type="button"
                    onClick={copyReference}
                    className="mt-3 flex w-full items-center justify-center gap-2.5 rounded-lg border bg-background px-3 py-3 font-mono text-xl font-bold tracking-wide transition hover:border-ring hover:bg-accent/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    aria-label={`Copy reference ${formatPaymentReference(clientCode, referenceNo)}`}
                  >
                    {formatPaymentReference(clientCode, referenceNo)}
                    {refCopied ? (
                      <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                    ) : (
                      <Copy className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                  </button>
                  <p className="mt-2 text-center text-xs text-muted-foreground">
                    {refCopied ? "Copied" : "Tap to copy"}
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
                    {/* Ask what they DID, not what we will do. By this step
                        the transfer has already been made — the previous
                        button says "I have made the transfer" — so the
                        question is how much went out, and the consequence
                        goes underneath. "Amount to credit" reads like a
                        request for something we have not agreed to. */}
                    <Label htmlFor="amount">How much did you transfer?</Label>
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
                    <p className="text-xs text-muted-foreground">
                      This is what we will credit to your {currency} wallet
                      once we see it arrive. Enter the exact amount you sent —
                      it is what we match your payment against.
                    </p>
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
                    <Label htmlFor="payment_slip">Payment slip</Label>
                    {/* A browser's own file control renders as the operating
                        system's grey button plus "Geen bestand gekozen" in
                        whatever language the browser happens to be in — the
                        one control on this screen that looks like it came
                        from somewhere else. The input stays (it does the
                        work, and it stays reachable by keyboard); the label
                        in front of it is what people see and press. */}
                    <Input
                      id="payment_slip"
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={handlePaymentSlipChange}
                      disabled={isUploadingSlip}
                      className="sr-only"
                    />
                    <label
                      htmlFor="payment_slip"
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border border-dashed px-3.5 py-3 text-sm transition ${
                        isUploadingSlip
                          ? "pointer-events-none opacity-60"
                          : "hover:border-ring hover:bg-accent/40"
                      }`}
                    >
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                        <FileImage className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block font-medium">
                          {slipName ? "Replace file" : "Choose a file"}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {slipName ?? "A screenshot or PDF of the transfer"}
                        </span>
                      </span>
                    </label>
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
                        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          <FileImage className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">
                            {slipName ?? "Preview"}
                          </span>
                        </div>
                        {paymentSlipPreview === "image" && previewSrc ? (
                          /* Checkerboard, not white. A slip photographed
                             against paper, or a screenshot with a
                             transparent background, is white on white — the
                             preview then looks broken when it is working
                             perfectly, and the one thing this preview exists
                             to answer is "did the right file attach?". */
                          // eslint-disable-next-line @next/next/no-img-element -- user-uploaded slip of unknown dimensions in a preview modal
                          <img
                            src={previewSrc}
                            alt="Payment slip preview"
                            className="w-full max-h-56 object-contain rounded-md"
                            style={{
                              backgroundColor: "#eef1f7",
                              backgroundImage:
                                "linear-gradient(45deg,#dfe4ee 25%,transparent 25%,transparent 75%,#dfe4ee 75%),linear-gradient(45deg,#dfe4ee 25%,transparent 25%,transparent 75%,#dfe4ee 75%)",
                              backgroundSize: "16px 16px",
                              backgroundPosition: "0 0, 8px 8px",
                            }}
                          />
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            {paymentSlipPreview === "image"
                              ? "Attached. A preview only shows for the file you just picked."
                              : "No preview for this file type."}
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
