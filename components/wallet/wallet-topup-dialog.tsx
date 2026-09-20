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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { banksForAccountTypes } from "@/lib/bank-routing";
import { copyText } from "@/lib/copy-text";
import { DEFAULT_MIN_TOPUP } from "@/lib/min-topup";
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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  initialCurrency = null,
  accountsUnknown = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  walletId: string | null;
  referenceNo: number | null;
  minTopup: number | null;
  /** Type slugs of the advertiser's own ad accounts, to route the transfer. */
  accountTypeSlugs?: string[];
  /** Which wallet the customer pressed Top up on. */
  initialCurrency?: CurrencyCode | null;
  /**
   * The ad-accounts read did not come back — it failed, or it is still in
   * flight. NOT the same as "this advertiser has no accounts", and the
   * difference decides which company's IBAN we print.
   */
  accountsUnknown?: boolean;
}) {
  const [step, setStep] = useState(STEPS.SELECTION);
  // ── OPEN ON THE WALLET THEY PRESSED ────────────────────────────────
  //
  // Both wallet cards called the same setTopupOpen(true) with no
  // currency, and this hard-defaulted to EUR. So somebody pressing Top up
  // INSIDE the card labelled "USD wallet" got "Wallet to fund: EUR —
  // Euro wallet" three lines down, did not re-read it, wired $5,000 and
  // filed the claim as EUR 5,000. Only the admin comparing against the
  // slip would catch it, and only if they looked.
  const [currency, setCurrency] = useState<CurrencyCode>(
    initialCurrency === "USD" ? "USD" : "EUR",
  );
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
  // THE THIRD SITUATION, which fell into the harmless-default branch:
  //
  //   we could not READ the accounts → we know even less than "nobody
  //                                    mapped this type". Ask.
  //
  // `accounts ?? []` is [] while the query is in flight AND when it has
  // failed, so accountTypeSlugs arrived empty, routingUnknown was false,
  // bankChoices was empty, the chooser was not rendered and bankGroup
  // stayed at its useState default of "turlit". An advertiser whose
  // accounts route to ZANEL or MUXUE was shown TURLIT LLC's IBAN and
  // beneficiary name as the destination, with no control to correct it
  // and no notice that anything was uncertain — and then made a real
  // bank transfer to the wrong legal entity. Nothing server-side catches
  // it: wallet_topup_advertiser_create takes amount, currency and slip,
  // and never learns which beneficiary was on screen.
  // ── AND THE FOURTH: NO ACCOUNTS AT ALL ────────────────────────────
  //
  // `accountTypeSlugs.length > 0` excluded the one customer who most
  // needs asking: somebody who has just signed up and has NO ad
  // accounts yet. Their list is genuinely empty — not unread, not
  // unmapped — so routingUnknown stayed false, the chooser was not
  // rendered, and bankGroup stayed at its default of "turlit".
  //
  // That is their FIRST transfer, the one they have no basis to doubt,
  // and a customer whose plan is Meta-EU-PSM-GH belongs at ZANEL. The
  // wrong legal entity, and nothing downstream catches it:
  // wallet_topup_advertiser_create stores amount, currency and slip,
  // and never learns which beneficiary was on screen.
  //
  // We do not know where their money goes yet, so we say so and ask —
  // which is what the copy below already does for the other two cases.
  const routingUnknown =
    accountsUnknown || routed.length === 0;
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
  // ── NOT A LITERAL ───────────────────────────────────────────────────
  //
  // The floor is per advertiser and per community: wallets.min_topup is
  // an admin's decision about one customer and wins outright, NSA has
  // its own figure, and before the plan is paid there is no floor at
  // all. All of that lives in lib/min-topup.ts, which the caller has
  // already run — this is only the value to use if the prop never
  // arrives, and writing 300 here a second time means two places to
  // change and one of them will be missed.
  const minTopupAmount = minTopup ?? DEFAULT_MIN_TOPUP;
  const queryClient = useQueryClient();
  const { profile } = useAppContext();
  // Their own client code, for the payment reference below.
  const clientCode = profile?.advertiser?.[0]?.tenant_client_code ?? null;
  const [refCopied, setRefCopied] = useState(false);
  // The name of the file they picked, so the control can say what is attached
  // instead of leaving that to the browser's own "Geen bestand gekozen".
  const [slipName, setSlipName] = useState<string | null>(null);
  const [filedReference, setFiledReference] = useState<string | null>(null);

  // ── A CLAIM ALREADY WAITING, AND THE CODE IT CARRIES ──────────────
  //
  // The reference on the wallet is the one the NEXT claim will get. A
  // customer who filed one an hour ago and came back to re-read their
  // reference was shown that next code, and wired real money against
  // it -- a code no claim has ever carried, which the matcher can
  // never resolve. So before offering a fresh reference, say plainly
  // that one is already open and print ITS code.
  const { data: openTopups, isError: openTopupsError } = useQuery({
    queryKey: ["wallet-topup-open", walletId],
    enabled: open && !!walletId,
    staleTime: 15_000,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("wallet_topups")
        .select("id, amount, currency, status, reference_no, created_at")
        .eq("wallet_id", walletId!)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(3);
      if (error) throw error;
      return (data ?? []) as {
        id: string;
        amount: number | string | null;
        currency: string | null;
        reference_no: string | number | null;
        created_at: string;
      }[];
    },
  });
  const openTopup = (openTopups ?? [])[0] ?? null;
  const copyReference = async (override?: string | null) => {
    const ref = formatPaymentReference(clientCode, override ?? referenceNo);
    if (!ref) return;
    // copyText falls back to the legacy route when the Clipboard API is
    // unavailable or refused — which it is in an in-app browser, in an
    // iframe without clipboard-write, and on any non-secure origin. This
    // was reporting failure in all of those while the fallback would
    // have worked, on the one control that exists to stop a customer
    // retyping a payment reference by hand.
    if (await copyText(ref)) {
      setRefCopied(true);
      setTimeout(() => setRefCopied(false), 1800);
      return;
    }
    toast.error("Couldn't copy — select the reference and copy it by hand.");
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

  useEffect(() => {
    if (open) setFiledReference(null);
  }, [open]);

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

  // ── THE FIX ABOVE NEVER RAN ────────────────────────────────────────
  //
  // The comment above describes exactly this incident and the code that
  // was meant to close it is a useState INITIALISER — evaluated once,
  // when the shell first renders, at which point the parent's
  // topupCurrency is still its own default. The dialog is mounted
  // unconditionally with no key, so it never remounts and that
  // initialiser never runs again. The only other place the currency is
  // re-read is inside `if (!open)` below, which applies the currency of
  // the PREVIOUS opening.
  //
  // So pressing Top up inside the USD wallet card opened a dialog that
  // said "Wallet to fund: EUR", showed a EUR IBAN, asked how much to
  // credit to the EUR wallet, and sent p_currency: "EUR" to the RPC.
  // Dollars wired, claim filed against the euro wallet at 1:1.
  //
  // The sibling exchange dialog has had this effect all along
  // (wallet-exchange-dialog.tsx) — this one was written without it.
  useEffect(() => {
    if (!open) return;
    setCurrency(initialCurrency === "USD" ? "USD" : "EUR");
  }, [open, initialCurrency]);

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setStep(STEPS.SELECTION);
        setCurrency(initialCurrency === "USD" ? "USD" : "EUR");
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
  }, [open, reset, initialCurrency]);

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

      // A jsonb/void answer is not proof. `data` was returned unread, so
      // a null payload or one carrying a refusal resolved happily: the
      // customer saw "Request Successful!" and the draft holding their
      // amount and slip path was destroyed, for a top-up that was never
      // filed. Both sibling dialogs were hardened for exactly this.
      //
      // Read off production 2026-09-20: wallet_topup_advertiser_create
      // RETURNS wallet_topups — a row. So on success `data` is that row
      // and a null answer is a genuine failure, not the "returns void"
      // shape that makes null mean success elsewhere. Both are refused
      // here because both are true here.
      const row = (Array.isArray(data) ? data[0] : data) as
        | {
            ok?: boolean;
            error?: string;
            id?: string;
            reference_no?: string | number | null;
          }
        | null
        | undefined;
      if (row === null || row === undefined) {
        throw new Error(
          "The top-up was not filed. Nothing has been charged — try again in a moment.",
        );
      }
      if (typeof row === "object" && row.ok === false) {
        throw new Error(
          row.error ?? "The top-up was not filed. Nothing has been charged.",
        );
      }
      return row;
    },
    onSuccess: async (row) => {
      // ── THE REFERENCE THE CLAIM WAS FILED WITH ──────────────────
      //
      // wallet_topup_advertiser_create stamps the wallet's current
      // reference onto the new row and then ROTATES the wallet, so the
      // next claim gets a fresh code. That is right. What was wrong is
      // that the dialog reads wallet.reference_no and the success
      // handler invalidates ["wallet"] -- so the moment a customer
      // filed a claim, every screen showing "your reference" showed the
      // NEXT one.
      //
      // Which means: file the claim, walk to your banking app, come
      // back to re-read the reference, and copy a code that belongs to
      // no claim at all. The transfer then arrives quoting a reference
      // the matcher has never seen. Two tabs do it too -- both show
      // code A, the first submit consumes A, the second claim silently
      // carries B while the money was wired against A.
      //
      // The RPC returns the row, so the code it was actually filed with
      // is right here. Hold it and print THAT.
      const filed = row?.reference_no;
      setFiledReference(filed == null ? null : String(filed));
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
      // ── AND THE PENDING PANEL, WHICH HAS ITS OWN KEY ──────────────
      //
      // The "Pending wallet top-up" card and the wallet card's second
      // line read ['adv-pending-topups', walletId] — which none of the
      // prefixes above cover either, and staleTime is 30s while the
      // advertiser shell never remounts (its views are CSS toggles), so
      // that query is simply never refetched. A customer who had just
      // filed a EUR 5,000 transfer saw no sign of it anywhere on the
      // card and wired it a second time. The statement underneath DID
      // update, because that key IS invalidated — so one screen
      // contradicted itself.
      queryClient.invalidateQueries({
        queryKey: ["adv-pending-topups"],
      });
      // And the dialog's own "you already have one waiting" read, which
      // has its own key and a 15s staleTime -- so reopening inside that
      // window still offered a fresh reference over a claim just filed,
      // which is the exact fault that block exists to prevent.
      queryClient.invalidateQueries({ queryKey: ["wallet-topup-open"] });
      // ── AND THE FINANCIAL REPORT ──────────────────────────────────
      //
      // ["finance-report", audience] is invalidated by NOTHING in the
      // repo, sits inside a CSS-toggled view so it never remounts, has
      // staleTime 60s and refetchOnWindowFocus false. With no mount, no
      // focus refetch and no invalidation there is no refetch trigger
      // at all -- so the screen headed "every top-up, funding, fee,
      // invoice and return in one place", with an Export CSV button on
      // it, showed pre-action figures for the whole session.
      queryClient.invalidateQueries({ queryKey: ["finance-report"] });

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
    <Dialog
      open={open}
      /* ── NOT WHILE IT IS WRITING ──────────────────────────────────
         This was the raw setter. Escape, the X or a click on the
         overlay during the submit closed the sheet while the insert
         went through: the row is filed, wallets.reference_no rotates,
         the draft clears, and setStep(SUCCESS) paints a dialog nobody
         can see. The customer reopens at step 1, finds no claim, and
         wires again — and the RPC has no duplicate guard. ConfirmModal
         has refused this since it was written; this dialog never did. */
      onOpenChange={(next) => {
        if (!next && isPending) return;
        onOpenChange(next);
      }}
    >
      {/* ── THE BUTTON THAT STARTS THE PAYMENT WAS INSIDE A SCROLLER
              THAT COULD NOT SCROLL ─────────────────────────────────────

          Every step's action lived inside `<ScrollArea max-h-[70dvh]>`:
          Continue, "I have made the transfer", Submit, Close. A
          max-height on an auto-height ScrollArea Root means the
          viewport's `height:100%` resolves to `auto`, so the viewport
          never becomes a scrollport — the Root's `overflow:hidden`
          simply CUTS the form at about 450px, with no scrollbar and
          nothing to grab. On the charitable reading it does scroll, and
          then it is a scroller inside the sheet's own scroller, which on
          iOS loses the fling.

          Either way, on a 375px phone the customer could not reach the
          button that starts a bank transfer.

          The sibling ad-account top-up form was fixed for exactly this
          and its comment names THIS dialog while doing it. The shape
          that works is the one the bulk dialog uses: a flex column that
          owns the height and a flex-1 min-h-0 scroller, so the Root has a
          definite height and the viewport h-full resolves. The per-step
          actions are still INSIDE that scroller - they are reachable now
          rather than pinned, which is the part that mattered. */}
      <DialogContent className="flex max-h-[90dvh] flex-col overflow-hidden sm:max-w-md">
        <DialogHeader className="shrink-0">
          <DialogTitle>
            {step === STEPS.SUCCESS
              ? "Topup Requested"
              : "Request Wallet Topup"}
          </DialogTitle>
        </DialogHeader>
        {/* ── A PLAIN SCROLLPORT, NOT A ScrollArea ───────────────────
            Radix's ScrollArea puts an inner wrapper at `display:table`
            and its Viewport at `h-full`, and inside a flex child whose
            height comes from `flex-1` against a max-height, that height
            does not resolve — so the Root clips at `overflow:hidden` and
            nothing scrolls. The bank details on step 2 are the longest
            thing in this dialog, and they were simply cut off at the
            bottom of the sheet with no way to reach them: an IBAN you
            cannot read is the whole point of the screen.

            An ordinary overflow-y-auto div has none of that. It also
            keeps the header and the close button out of the scroll,
            which is why the outer box stays overflow-hidden.

            overscroll-contain so flicking past the end scrolls the
            dialog, not the page behind it. */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-2">
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
                        {accountTypeSlugs.length === 0
                          ? "You don't have an ad account yet, so we can't tell which of our accounts your transfer should go to. Use the one we gave you — and if you weren't given one, ask us before you send anything."
                          : "We could not work this out from your ad accounts, so please pick the one you were given. If you are not sure, ask us before you send anything."}
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

                {/* ── SAY THE MINIMUM BEFORE THEY SEND THE MONEY ────────
                    It existed only as a zod message on step 3 — AFTER the
                    IBAN, and after a primary button that says "I have made
                    the transfer". So somebody past their first paid invoice
                    opened this, got the account details, wired EUR 50,
                    pressed that button, typed 50, pressed Submit, and read
                    "Minimum Amount: 300" with the money already gone and no
                    way to file the claim. The server half of that trap was
                    fixed; the order of the screen re-created it. */}
                {/* ── THE SAME FLOOR STEP 2 STATES ──────────────────────
                    This said "Transfer at least EUR 300" using the WALLET
                    currency, which is the exact trap step 2 carries a
                    comment about: send GBP 300 against a EUR 300 floor
                    and you are a fifth short. Step 1 is where the
                    customer decides, so it is the worse place to get it
                    wrong. Same conversion, rounded up the same way. */}
                {minTopupAmount > 0 &&
                  (() => {
                    const inTransfer =
                      transferCurrency === currency
                        ? minTopupAmount
                        : convertWalletToTransfer(
                            minTopupAmount,
                            currency,
                            transferCurrency,
                            rate,
                          );
                    const shown = inTransfer
                      ? Math.ceil(inTransfer)
                      : minTopupAmount;
                    const cur = inTransfer ? transferCurrency : currency;
                    return (
                      <p className="text-sm font-medium">
                        Transfer at least{" "}
                        <strong>
                          {cur} {shown.toLocaleString("en-US")}
                        </strong>
                        . A smaller amount cannot be filed as a top-up.
                      </p>
                    );
                  })()}

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
                {/* A FAILED READ IS NOT "NOTHING IS WAITING". Without
                    this the amber panel simply did not render, and the
                    customer wired money against the NEXT reference while
                    an open claim carried a different one -- the exact
                    outcome this block exists to prevent. */}
                {openTopupsError ? (
                  <div className="mb-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-left dark:border-amber-500/40 dark:bg-amber-500/10">
                    <p className="text-sm font-semibold">
                      We couldn&apos;t check for an earlier top-up
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      If you have already filed one and not paid it yet, use
                      the reference from that one rather than the code below
                      — money sent against the wrong code has to be matched
                      by hand.
                    </p>
                  </div>
                ) : null}
                {openTopup ? (
                  <div className="mb-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-left dark:border-amber-500/40 dark:bg-amber-500/10">
                    <p className="text-sm font-semibold">
                      You already have a top-up waiting
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {formatCurrency(
                        Number(openTopup.amount) || 0,
                        (openTopup.currency ?? "EUR").toUpperCase() === "USD"
                          ? "USD"
                          : "EUR",
                      )}
                      , filed{" "}
                      {new Date(openTopup.created_at).toLocaleDateString()}. If
                      you have not sent that transfer yet, use its reference
                      below — starting a second one here gives you a different
                      code, and money sent against the wrong code has to be
                      matched by hand.
                    </p>
                    <button
                      type="button"
                      onClick={() => copyReference(
                        openTopup.reference_no == null
                          ? null
                          : String(openTopup.reference_no),
                      )}
                      className="mt-3 flex w-full items-center justify-center gap-2.5 rounded-lg border bg-background px-3 py-2.5 font-mono text-lg font-bold tracking-wide transition hover:border-ring"
                    >
                      {formatPaymentReference(
                        clientCode,
                        openTopup.reference_no == null
                          ? null
                          : String(openTopup.reference_no),
                      )}
                      <Copy className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                  </div>
                ) : null}
                <div className="rounded-xl border bg-muted/20 p-4">
                  <p className="text-sm text-muted-foreground">
                    {openTopup
                      ? "For a NEW transfer, use this reference instead:"
                      : "Put this reference in the description of your transfer, so we can match your payment."}
                  </p>
                  <button
                    type="button"
                    onClick={() => copyReference()}
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

                {/* The last moment before the money leaves their bank. */}
                {/* ── THE FLOOR, IN THE MONEY THEY ARE ABOUT TO SEND ──
                    One figure, in the currency on the screen. This said
                    "At least EUR 300" while the customer was looking at
                    a British account and a GBP IBAN — send GBP 300
                    against a EUR 300 floor and you are a fifth short and
                    the deposit is refused. Then it said both, which is
                    two numbers to reconcile on the last screen before
                    the money leaves their bank. The wallet currency is
                    not their problem here; what to type into the bank is. */}
                {minTopupAmount > 0 &&
                  (() => {
                    const inTransfer =
                      transferCurrency === currency
                        ? minTopupAmount
                        : convertWalletToTransfer(
                            minTopupAmount,
                            currency,
                            transferCurrency,
                            rate,
                          );
                    // Round UP. A floor rounded down is a transfer that
                    // arrives a cent under the minimum.
                    const shown = inTransfer
                      ? Math.ceil(inTransfer)
                      : minTopupAmount;
                    const cur = inTransfer ? transferCurrency : currency;
                    return (
                      <p className="pt-2 text-sm font-medium">
                        At least {cur} {shown.toLocaleString("en-US")}.
                        Anything less cannot be filed.
                      </p>
                    );
                  })()}

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
                    {/* ── ASK FOR THE FIGURE THAT IS ACTUALLY WRITTEN ──
                        This said "How much did you transfer?" with the
                        WALLET symbol in front of the box, under a line
                        reading "Transferring to TURLIT LLC (GBP)". The
                        helper then said both things at once: "this is
                        what we will credit to your EUR wallet" AND
                        "enter the exact amount you sent". Somebody who
                        wires GBP 2,150 and does what the sentence tells
                        them files a claim for EUR 2,150 — about a fifth
                        out, on every transfer in a currency that is not
                        the wallet's.

                        The RPC takes (p_amount, p_currency) where
                        p_currency IS the wallet currency, so the number
                        in this box is, and can only be, the wallet
                        credit. The question has to be that. What to send
                        is the line underneath, which already converts. */}
                    <Label htmlFor="amount">
                      How much should we credit to your {currency} wallet?
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
                    <p className="text-xs text-muted-foreground">
                      {transferCurrency === currency
                        ? `This is what we credit once we see it arrive, so it should be the exact amount you sent.`
                        : `This is what we credit once we see your transfer arrive. Your transfer is in ${transferCurrency} — the figure to send is below.`}
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
                    {filedReference
                      ? "Now send the transfer, quoting this reference."
                      : "Your topup request has been submitted."}
                  </p>
                </div>

                {/* THE CODE THIS CLAIM CARRIES -- not the wallet's, which
                    has already rotated to the next one. This is the last
                    screen before somebody opens their banking app. */}
                {filedReference ? (
                  <div className="w-full rounded-xl border bg-muted/20 p-4">
                    <button
                      type="button"
                      onClick={() => copyReference(filedReference)}
                      className="flex w-full items-center justify-center gap-2.5 rounded-lg border bg-background px-3 py-3 font-mono text-xl font-bold tracking-wide transition hover:border-ring hover:bg-accent/40"
                      aria-label={`Copy reference ${formatPaymentReference(clientCode, filedReference)}`}
                    >
                      {formatPaymentReference(clientCode, filedReference)}
                      {refCopied ? (
                        <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                      ) : (
                        <Copy className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                    </button>
                    <p className="mt-2 text-center text-xs text-muted-foreground">
                      {refCopied
                        ? "Copied"
                        : /* NOT "find it again on your wallet page": the
                             whole point of this block is that the
                             wallet has already rotated to the NEXT
                             code, so that page shows a different one. */
                          "Tap to copy — put it on the transfer."}
                    </p>
                  </div>
                ) : null}

                <Button
                  onClick={() => onOpenChange(false)}
                  className="w-full mt-2"
                >
                  Close
                </Button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
