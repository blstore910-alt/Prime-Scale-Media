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
  AccountType,
  InstantTransferInstructions,
} from "./bank-transfer-instructions";

import { createClient } from "@/lib/supabase/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, CheckCircle2, ArrowLeft, FileImage } from "lucide-react";
import { useEffect, useState, type ChangeEvent } from "react";
import { useForm } from "react-hook-form";

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

export default function WalletTopupDialog({
  open,
  onOpenChange,
  walletId,
  referenceNo,
  advertiserId,
  tenantId,
  createdBy,
  minTopup,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  walletId: string | null;
  referenceNo: number | null;
  advertiserId: string | null;
  tenantId: string | null;
  createdBy: string | null;
  minTopup: number | null;
}) {
  const [step, setStep] = useState(STEPS.SELECTION);
  const [currency, setCurrency] = useState<CurrencyCode>("EUR");
  const [accountType, setAccountType] = useState<AccountType>("meta_eu");
  const [paymentSlipUrl, setPaymentSlipUrl] = useState<string | null>(null);
  const [paymentSlipPreview, setPaymentSlipPreview] = useState<
    "image" | "unavailable" | null
  >(null);
  const [paymentSlipError, setPaymentSlipError] = useState<string | null>(null);
  const [isUploadingSlip, setIsUploadingSlip] = useState(false);
  const minTopupAmount = minTopup || 300;
  const queryClient = useQueryClient();
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
  } = useForm<FormValues>({
    defaultValues: {
      amount: 0,
    },
    resolver: zodResolver(formSchema),
  });

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setStep(STEPS.SELECTION);
        setCurrency("EUR");
        setAccountType("meta_eu");
        setPaymentSlipUrl(null);
        setPaymentSlipPreview(null);
        setPaymentSlipError(null);
        setIsUploadingSlip(false);

        reset();
      }, 300);
    }
  }, [open, reset]);

  useEffect(() => {
    if (accountType === "meta_eu") {
      setPaymentSlipUrl(null);
      setPaymentSlipPreview(null);
      setPaymentSlipError(null);
    }
  }, [accountType]);

  const handlePaymentSlipChange = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    const imageExtensions = new Set([
      "png",
      "jpg",
      "jpeg",
      "gif",
      "webp",
      "bmp",
      "svg",
    ]);
    const isImage =
      imageExtensions.has(extension) || file.type.startsWith("image/");
    const isPdf = extension === "pdf" || file.type === "application/pdf";

    if (!isImage && !isPdf) {
      setPaymentSlipError("Only image or PDF files are allowed.");
      setPaymentSlipUrl(null);
      setPaymentSlipPreview(null);
      return;
    }

    setPaymentSlipError(null);
    setPaymentSlipUrl(null);
    setPaymentSlipPreview(isImage ? "image" : "unavailable");
    setIsUploadingSlip(true);

    try {
      const supabase = createClient();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const filePath = `wallet-topups/${walletId ?? "unknown"}/${Date.now()}-${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from("wallet_payment_slips")
        .upload(filePath, file, { contentType: file.type, upsert: false });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from("wallet_payment_slips")
        .getPublicUrl(filePath);

      if (!data?.publicUrl) {
        throw new Error("Unable to fetch payment slip URL.");
      }

      setPaymentSlipUrl(data.publicUrl);
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
      if (!walletId || !advertiserId || !tenantId || !createdBy) {
        throw new Error("Missing wallet context.");
      }
      const supabase = createClient();

      const payload = {
        wallet_id: walletId,
        advertiser_id: advertiserId,
        tenant_id: tenantId,
        currency,
        amount: values.amount,
        status: "pending",
        created_by: createdBy,
        reference_no: referenceNo,
        payment_slip: accountType === "others" ? paymentSlipUrl : null,
      };

      const { data, error } = await supabase
        .from("wallet_topups")
        .insert(payload)
        .select("*")
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      setStep(STEPS.SUCCESS);
      const generatedRef = `${Date.now().toString().slice(-6)}${Math.floor(
        1000 + Math.random() * 9000,
      )}`;
      const supabase = createClient();
      const { error } = await supabase
        .from("wallets")
        .update({ reference_no: generatedRef })
        .eq("id", walletId);
      if (error) throw error;
      queryClient.invalidateQueries({
        queryKey: ["wallet-topups", walletId],
      });
      queryClient.invalidateQueries({
        queryKey: ["wallet"],
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
    if (accountType === "others") {
      if (isUploadingSlip) {
        toast.error("Payment slip is still uploading.");
        return;
      }

      if (!paymentSlipUrl) {
        setPaymentSlipError("Payment slip is required for this account group.");
        return;
      }
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

        <ScrollArea className="max-h-[70vh] pr-2">
          <div className="px-1 py-2">
            {/* STEP 1: SELECTION */}
            {step === STEPS.SELECTION && (
              <div className="space-y-6">
                <div className="space-y-3">
                  <Label>Select Currency</Label>
                  <Select
                    value={currency}
                    onValueChange={(val: CurrencyCode) => setCurrency(val)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select currency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD - US Dollar</SelectItem>
                      <SelectItem value="EUR">EUR - Euro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-3">
                  <Label>Choose Account Group</Label>
                  <RadioGroup
                    value={accountType}
                    onValueChange={(val: AccountType) => setAccountType(val)}
                    className="grid gap-3"
                  >
                    <div>
                      <RadioGroupItem
                        value="meta_eu"
                        id="meta_eu"
                        className="peer sr-only"
                      />
                      <Label
                        htmlFor="meta_eu"
                        className="flex flex-col items-start justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                      >
                        <span className="font-semibold text-base">
                          Meta - EU - PSM
                        </span>
                        <span className="mt-1.5 text-xs text-muted-foreground leading-snug">
                          Select this option if you are topping up for Meta EU
                          PSM accounts.
                        </span>
                      </Label>
                    </div>

                    <div>
                      <RadioGroupItem
                        value="others"
                        id="others"
                        className="peer sr-only"
                      />
                      <Label
                        htmlFor="others"
                        className="flex flex-col items-start justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                      >
                        <span className="font-semibold text-base">
                          Other Ad Accounts
                        </span>
                        <span className="mt-1.5 text-xs text-muted-foreground leading-snug">
                          Select this option for all other ad account types.
                        </span>
                      </Label>
                    </div>
                  </RadioGroup>
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
                    currency={currency}
                    accountType={accountType}
                  />
                </div>

                {accountType === "others" && <InstantTransferInstructions />}

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
                      {accountType === "meta_eu"
                        ? "TURLIT LLC"
                        : "Guangzhou Haoqianyi"}{" "}
                      ({currency})
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
                    <Label htmlFor="amount">Transferred Amount</Label>
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
                  </div>
                </div>

                {accountType === "others" && (
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
                        {paymentSlipPreview === "image" ? (
                          <img
                            src={paymentSlipUrl}
                            alt="Payment slip preview"
                            className="w-full max-h-56 object-contain rounded-md bg-background"
                          />
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            Preview not available for this file type.
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
                      (accountType === "others" &&
                        (!paymentSlipUrl || isUploadingSlip))
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
