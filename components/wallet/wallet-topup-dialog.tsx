"use client";

import { useT } from "@/hooks/use-t";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
// Alleen de bankGROEPEN (turlit/zanel), nooit de typeslugs: dit bestand
// laadt in de browser van de klant. Lekcontrole 01-10, L2.
import {
  bankGroupFromStored,
  destinationFromGroups,
  routedGroups,
} from "@/lib/bank-groups";
import { copyText } from "@/lib/copy-text";
import { DEFAULT_MIN_TOPUP } from "@/lib/min-topup";
import { formatPaymentReference } from "@/lib/payment-reference";
import {
  topupAgain,
  topupAgainBlocks,
  topupAgainMessage,
  topupAgainNeedsConfirm,
} from "@/lib/pure-topup-again";
import { toast } from "sonner";
import * as z from "zod";
import {
  BankTransferInstructions,
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
  ArrowLeft,
  ArrowRight,
  AlertTriangle,
  Check,
  Copy,
  FileImage,
  Info,
  Landmark,
  UploadCloud,
} from "lucide-react";
import {
  ChoiceCard,
  TopupStepper,
  TopupStyles,
  currencySymbol,
} from "@/components/topups/topup-ui";
import { useEffect, useState, type ChangeEvent } from "react";
import { useForm } from "react-hook-form";
import { useFormDraft } from "@/hooks/use-form-draft";
import { useAppContext } from "@/context/app-provider";
import AmountPills from "@/components/ui/amount-pills";

type CurrencyCode = "USD" | "EUR";

type FormValues = {
  amount: number;
};

const CONFETTI = [
  { x: -58, y: -40, color: "#5B8DFF" }, { x: 60, y: -44, color: "#8B5CF6" },
  { x: -66, y: 10, color: "#22C08A" }, { x: 68, y: 6, color: "#F2A516" },
  { x: -40, y: 56, color: "#8B5CF6" }, { x: 44, y: 58, color: "#5B8DFF" },
  { x: -10, y: -66, color: "#F2A516" }, { x: 14, y: 66, color: "#22C08A" },
  { x: -72, y: -14, color: "#FF6B9A" }, { x: 74, y: -18, color: "#FF6B9A" },
];

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

// The 2-way "meta_eu" | "others" mapper that stale drafts needed is gone
// with the draft restoring the bank group at all. A draft brings back the
// amount; which bank the money goes to is decided by the routing for the
// customer's own ad-account types, every time the dialog opens.

// Beneficiary bank options, in the order they are offered. Each lists the
// ad-account families that route to it.
//
// MUXUE is gone. The Hong Kong families it used to take come to our own bank
// now, so there is one destination for everything except GH. The BankGroup
// union still carries "muxue" so historical top-ups and their stored bank
// details keep rendering — it is simply never offered and nothing routes to
// it. (Its Airwallex instant-transfer channel goes with it.)
// ── THE ROUTING MAP IS OURS ──────────────────────────────────────────
//
// There used to be a BANK_GROUP_OPTIONS table here, rendered as a picker,
// and each option carried the ad-account families it serves —
// "Meta-EU-PSM · Meta-HK · Google · TikTok · Taboola · Snapchat". That is
// our routing map printed on a customer screen: which platforms we run,
// how they are split across two legal entities, and which of those a
// competitor would have to ask for. It is gone, and so is the choice —
// the customer is told where to send their money, never asked to work it
// out. `bankBeneficiary()` names the resolved one.
// Where a transfer goes when their accounts cannot tell us now lives in
// lib/bank-routing.ts, inside bankDestination, so the rule, the reason
// the owner gave for it and the tests all sit in one place.


export default function WalletTopupDialog({
  open,
  onOpenChange,
  walletId,
  referenceNo,
  minTopup,
  accountTypeSlugs = [],
  initialCurrency = null,
  accountsUnknown = false,
  assignedBankGroup = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  walletId: string | null;
  referenceNo: number | null;
  minTopup: number | null;
  /** De bankgroep per eigen ad account (my_ad_accounts.bank_group);
   *  null voor een account waarvan de route niet vastligt. */
  accountTypeSlugs?: Array<string | null>;
  /** Which wallet the customer pressed Top up on. */
  initialCurrency?: CurrencyCode | null;
  /**
   * The ad-accounts read did not come back — it failed, or it is still in
   * flight. NOT the same as "this advertiser has no accounts", and the
   * difference decides which company's IBAN we print.
   */
  accountsUnknown?: boolean;
  /** `advertisers.bank_group` -- what the owner put on them at the
   *  invite, for the stretch before they hold any ad account. Null
   *  until plak 128 lands, and null reads as "not said" = TURLIT. */
  assignedBankGroup?: string | null;
}) {
  const { t: tr } = useT();
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
  const routed = routedGroups(accountTypeSlugs);
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
  // ── AND WHEN WE CANNOT TELL, WE PICK ─────────────────────────────
  //
  // Everything above stays true: a customer on Meta-EU-PSM-GH belongs at
  // ZANEL and the wrong beneficiary is a real transfer to the wrong legal
  // entity. What changed is who answers it. Handing a brand-new customer
  // a list of our beneficiary companies and asking them to route their
  // own payment asks a question they have no way to answer — their first
  // transfer is the one they have least basis to doubt.
  //
  // So: when their accounts tell us, we follow them. When they cannot —
  // no accounts yet, or a type nobody mapped — we name the default and
  // SAY that we could not work it out, so a customer who was given a
  // different one knows to use it. The only time a choice is still
  // offered is when they genuinely hold accounts in BOTH families, which
  // is a real fork and not a guess.
  const routingUnknown =
    (accountsUnknown || routed.length === 0) &&
    // An assigned bank is not an unknown one: the notice below says we
    // could not work it out, and that stops being true the moment the
    // owner wrote it down at the invite.
    !bankGroupFromStored(assignedBankGroup);
  // ── ONE DESTINATION, WORKED OUT, NEVER ASKED ─────────────────────
  //
  // The customer is never shown a choice of beneficiary. They have no
  // way to answer it — on their first transfer least of all — and the
  // list of options was also our routing map. Their accounts decide it;
  // when their accounts cannot, the default does, and the line above
  // says so, so anybody who was given a different one knows to use it.
  // ── AND WHAT THE OWNER PUT ON THEM AT THE INVITE ─────────────────
  //
  // "bij aanmelding iedereen wallet topup naar turlit behalve GH mensen
  // naar zanel" (28-09). Everything above derives the bank from the
  // accounts somebody HOLDS, which a brand-new customer does not have —
  // so a GH customer was sent to TURLIT on the one transfer they had
  // least basis to doubt. We know who they are, because we invite them,
  // so it is written on their row and read back here.
  //
  // It only speaks when the accounts cannot: an account they hold is the
  // stronger fact, and in practice the two agree.
  const destination = destinationFromGroups({
    routed,
    accountsUnknown,
    assigned: assignedBankGroup,
  });
  const resolvedBank: BankGroup = destination.group;
  // ── AND THE FORK THE COMMENT ABOVE PROMISES ──────────────────────
  //
  // "The only time a choice is still offered is when they genuinely
  // hold accounts in BOTH families, which is a real fork and not a
  // guess." That chooser was gone; only the sentence describing it was
  // left. `routed.length > 1` made routingUnknown FALSE, so there was
  // no notice either, and `routed[0]` silently picked the first --
  // which is the same shape as the four incidents recorded above, where
  // the code chose while it did not know and a real transfer went to
  // the wrong legal entity.
  //
  // A customer holding Meta-EU-PSM (TURLIT) and Meta-EU-PSM-GH (ZANEL)
  // has a genuine question to answer, and unlike a brand-new customer
  // they CAN answer it: they were told which entity to pay when each
  // account was set up. So this one gets asked.
  const twoFamilies = !routingUnknown && routed.length > 1;
  // One possible destination: set it rather than ask. Also corrects a
  // restored draft that names a bank this advertiser has no accounts at.
  useEffect(() => {
    if (twoFamilies) {
      // Their choice stands, as long as it is one of theirs.
      if (!routed.includes(bankGroup)) setBankGroup(routed[0]);
      return;
    }
    if (bankGroup !== resolvedBank) setBankGroup(resolvedBank);
    // routed is rebuilt each render; its CONTENTS are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [twoFamilies, routed.join("|"), resolvedBank, bankGroup]);
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

  // ── THE BANK DETAILS THE OWNER TYPED, IF THEY TYPED ANY ──────────
  //
  // Settings -> Banks writes `bank_accounts` and, until now, nothing
  // ever read it: this dialog showed the built-in list from
  // lib/bank-beneficiaries.ts, which can only be changed by a deploy.
  // So the owner could "correct" an IBAN, be told it was saved, and the
  // customer would still be shown the old one -- money to the wrong
  // account, with a screen that said it had been fixed.
  //
  // Three things this read must never do, in order of how badly they
  // would end:
  //   - show NOTHING. A failed read gives [] and bankOverrideFor then
  //     answers "none", which is the built-in. Same as before.
  //   - show a GUESS. Several ad-account types route to one bank group;
  //     when their stored rows disagree the resolver refuses and the
  //     built-in answers. The comments two hundred lines down record
  //     four occasions on which picking anyway sent a real transfer to
  //     the wrong legal entity.
  //   - show HALF. The resolver requires an account number before a row
  //     counts as a destination at all.
  // De bankgegevens uit Settings -> Banks (bank_accounts) zijn sinds plak
  // 191 alleen voor admins, en de klant kreeg ze al nooit: de lees joinde
  // een admin-tabel. De klant ziet de ingebouwde gegevens.
  // Their own client code, for the payment reference below.
  const clientCode = profile?.advertiser?.[0]?.tenant_client_code ?? null;
  const [refCopied, setRefCopied] = useState(false);
  // The name of the file they picked, so the control can say what is attached
  // instead of leaving that to the browser's own "Geen bestand gekozen".
  const [slipName, setSlipName] = useState<string | null>(null);
  const [slipDrag, setSlipDrag] = useState(false);
  const [useNewRef, setUseNewRef] = useState(false);
  const [filedReference, setFiledReference] = useState<string | null>(null);
  const [filedAmount, setFiledAmount] = useState<number | null>(null);

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

  // ── THE SAME TRANSFER, FILED AGAIN ────────────────────────────────
  //
  // The owner, 28-09: somebody files ten top-ups for one payment,
  // because nothing lands until an admin verifies it and they think it
  // did not go through. A real second transfer must still be possible,
  // so this is a sentence and a second press, not a refusal -- only
  // the ceiling refuses. See lib/pure-topup-again.ts.
  //
  // The query above already reads the pending claims and caps at 3,
  // which is exactly the ceiling, so nothing new is fetched.
  const again = topupAgain({
    pendingCreatedAt: (openTopups ?? []).map((t) => t.created_at),
  });
  const againMessage = topupAgainMessage(again);
  const againBlocks = topupAgainBlocks(again);
  const [againAcknowledged, setAgainAcknowledged] = useState(false);
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
    toast.error(tr("wtop.couldnTCopySelectThe"));
  };

  // Live FX rates (per 1 USD) to show a "you'll transfer ≈ X" hint when the
  // advertiser pays in a currency other than their wallet currency. Rates
  // are read-only here; advertisers already read these elsewhere.
  const { exchangeRates, isError: ratesError } = useExchangeRates({
    activeOnly: true,
  });
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
    // The field starts EMPTY, not on 0. A money box holding "0" turns a
    // typed 300 into 0300 -- the owner hit it on the walk, and it is the
    // one number in this dialog that has to be exactly right.
    amount: z
      .number({ error: tr("wtop.fillInTheAmountYou") })
      .positive("Fill in the amount you sent.")
      .min(minTopupAmount, `Transfer at least ${currency} ${minTopupAmount}.`),
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
  } = useForm<FormValues>({
    // Empty, so the placeholder shows and nothing has to be deleted first.
    defaultValues: {},
    resolver: zodResolver(formSchema),
  });

  // Why the submit button is off, in the customer's words.
  const submitBlockedReason = isUploadingSlip
    ? "One moment — the slip is still uploading."
    : !walletId
      ? "We couldn't read your wallet just now. Reload and try again."
      : againBlocks
        ? againMessage
        : !paymentSlipUrl
          ? "Add the payment slip to submit — it is how we match your transfer."
          : topupAgainNeedsConfirm(again) && !againAcknowledged
            ? "Tick the box above to confirm this is a separate transfer."
            : null;

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
  // ── THE DRAFT BRINGS BACK THE TYPING, NOT THE DECISIONS ──────────
  //
  // useFormDraft loads from IndexedDB asynchronously, so on the first
  // open after a page load this effect runs a tick AFTER the open
  // effect below — and it used to set currency, bankGroup,
  // transferCurrency, the slip and the step, overwriting every one of
  // them. The draft key is `wallet-topup:<walletId>`, one record per
  // wallet and not per currency, and the "Resume where you left off"
  // bar was deliberately removed, so nothing told the customer that a
  // previous choice had come back.
  //
  // Press "Top up" inside the USD card with an unfinished EUR draft and
  // the dialog opened on USD and then flipped to EUR — landing them on
  // step 2 or 3 with the previous currency's IBAN and the previous slip
  // attached. That is the "a EUR slip filed against a USD claim"
  // incident this file is hardened against, arrived at from a third
  // direction.
  //
  // What the draft is FOR is the amount they typed (CLAUDE.md: never
  // lose typing). That is what it restores now. Which wallet, which
  // bank and which step are decisions the customer makes by pressing a
  // button, and the press is newer than the draft.
  useEffect(() => {
    if (!open || !draft.hasDraft || !draft.restoredDraft) return;
    const v = draft.restoredDraft.values;
    // An empty draft stays EMPTY: a restored 0 put "0" in the box, and
    // a typed 300 then reads 0300 (the note on the schema below).
    if (v.amount) setValue("amount", v.amount);
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
    // ── AND EVERYTHING ELSE THAT MUST NOT CARRY OVER ───────────────
    //
    // The close-timer below resets the rest 300ms after closing, and
    // its clearTimeout -- correctly added to stop a stale timer
    // overwriting a fresh open -- also cancels it on a fast reopen. So
    // after the fix, a close-and-reopen inside 300ms did NO reset at
    // all: the dialog came back on the CONFIRMATION step, with the
    // previous currency's bank details and the previous slip still
    // attached, while `currency` above had switched. That is a EUR slip
    // filed against a USD claim -- the same incident, arrived at from
    // the other side.
    //
    // Opening is the moment these are known, so they are set here,
    // synchronously. The typed amount is deliberately NOT cleared: the
    // draft hook exists to keep it, and losing it was the complaint
    // that put the 300ms timer here in the first place.
    setStep(STEPS.SELECTION);
    setBankGroup("turlit");
    setTransferCurrency("EUR");
    setPaymentSlipUrl(null);
    setPaymentSlipPreview(null);
    setPreviewSrc(null);
    setPaymentSlipError(null);
    setSlipName(null);
    setIsUploadingSlip(false);
    setUseNewRef(false);
  }, [open, initialCurrency]);

  // ── AN UNCANCELLED TIMER OUTLIVES THE CLOSE THAT STARTED IT ────────
  //
  // This dialog never unmounts -- it is mounted unconditionally by the
  // shell -- so a 300ms reset with no clearTimeout keeps running after
  // the dialog is opened again. Close the EUR top-up and press Top up
  // inside the USD card within 300ms: the open effect correctly sets
  // USD, then this fires with the captured initialCurrency and sets it
  // back to EUR, along with the step, the bank group, the transfer
  // currency and reset(). That is the "dollars wired, claim filed
  // against the euro wallet" incident this file documents further up,
  // still reachable -- and in the ordinary case it silently destroys a
  // half-finished top-up (typed amount, uploaded slip) on any quick
  // close-and-reopen.
  useEffect(() => {
    if (open) return;
    const t = setTimeout(() => {
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
    return () => clearTimeout(t);
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
      setPaymentSlipError(tr("wtop.fileIsTooLargeMax"));
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
    // ── THE BUCKET'S LIST, NOT "ANYTHING THE BROWSER CALLS AN IMAGE"
    //
    // The gate used to be `file.type.startsWith("image/")`, and the
    // bucket's allowed_mime_types is exactly
    // png / jpeg / gif / webp / bmp / pdf. So an iPhone photo
    // (image/heic), a TIFF or an AVIF passed here and was refused by
    // storage — and by then the customer has pressed "I have made the
    // transfer" and the money has left their bank. They landed on step
    // 3 with a raw Supabase storage message, Submit permanently
    // disabled, and no way forward. Most phone photos are HEIC.
    //
    // Refusing it here costs them a re-export and tells them what to
    // do; refusing it there costs them the transfer.
    const ALLOWED_IMAGE_TYPES = new Set([
      "image/png",
      "image/jpeg",
      "image/jpg",
      "image/gif",
      "image/webp",
      "image/bmp",
    ]);
    const isImage =
      ALLOWED_IMAGE_TYPES.has(file.type.toLowerCase()) ||
      // An empty file.type happens on some Android pickers; the
      // extension is then the only thing we have, and the bucket
      // sniffs the bytes anyway.
      (!file.type && imageExtensions.has(extension));
    const isPdf = extension === "pdf" || file.type === "application/pdf";

    if (!isImage && !isPdf) {
      setPaymentSlipError(
        extension === "heic" || extension === "heif" || file.type === "image/heic"
          ? tr("wtop.iphonePhotosHeicCanT")
          : tr("wtop.sendAPngJpgGif"),
      );
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
      toast.error(tr("wtop.unableToUploadPaymentSlip"), { description: message });
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
          tr("wtop.theTopUpWasNot"),
        );
      }
      if (typeof row === "object" && row.ok === false) {
        throw new Error(
          row.error ?? tr("wtop.theTopUpWasNot2"),
        );
      }
      return row;
    },
    onSuccess: async (row, values) => {
      setFiledAmount(Number(values.amount) || null);
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
      toast.error(tr("wtop.unableToRequestTopup"), { description: err.message });
    },
  });

  const handleNextStep = () => {
    setStep((prev) => prev + 1);
  };

  const handlePrevStep = () => {
    setStep((prev) => prev - 1);
  };

  // The one code step 2 shows: the open top-up's when there is one (use
  // it if that money has not gone yet), the wallet's next one on request.
  const shownRef: string | null =
    openTopup && !useNewRef
      ? openTopup.reference_no == null
        ? null
        : String(openTopup.reference_no)
      : referenceNo == null ? null : String(referenceNo);

  const handleSubmitForm = (values: FormValues) => {
    // Slip required for every topup, both account groups.
    if (isUploadingSlip) {
      toast.error(tr("wtop.paymentSlipIsStillUploading"));
      return;
    }
    if (!paymentSlipUrl) {
      setPaymentSlipError(tr("wtop.paymentSlipIsRequired"));
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
      <DialogContent className="tpx flex max-h-[92dvh] flex-col overflow-hidden sm:max-w-[480px]">
        <TopupStyles />
        <DialogHeader className="shrink-0">
          <DialogTitle>
            {step === STEPS.SUCCESS
              ? tr("wtop.topupRequested")
              : tr("wtop.requestWalletTopup")}
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
        <div
          key={step /* a new step starts at its top, not where the last one was scrolled to */}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-2"
        >
          <div className="px-1 py-2">
            {step !== STEPS.SUCCESS && (
              <TopupStepper
                step={step}
                labels={[tr("wtop.stepWallet"), tr("wtop.stepBank"), tr("wtop.stepSlip")]}
              />
            )}
            {/* STEP 1: SELECTION */}
            {/* ── CARDS, NOT A DROPDOWN AND A ROW OF CHIPS ────────────────
                De eigenaar, 01-10: "kan dit herdesign echt wow pro super
                strak ... grids cards". Two wallets is a choice you can see
                at once, so it is two cards; four transfer currencies are
                four tiles. Nothing about what a choice DOES changed: the
                wallet switch still drops a slip uploaded for the other
                wallet, and says so. */}
            {step === STEPS.SELECTION && (
              <div className="tpx-stack">
                <div>
                  <p className="tpx-sec">{tr("label.wtop.walletToFund")}</p>
                  {/* ── A SLIP BELONGS TO THE CLAIM IT WAS UPLOADED FOR ──
                      The "Change" link on step 3 comes back here. Switching
                      the wallet makes an uploaded slip the wrong document,
                      so it goes -- and is said out loud, because a silently
                      emptied upload is how somebody submits without one. */}
                  <div className="tpx-grid2">
                    {(["EUR", "USD"] as const).map((val) => (
                      <ChoiceCard
                        key={val}
                        on={currency === val}
                        coin={currencySymbol(val)}
                        title={val === "EUR" ? tr("wtop.walletEur") : tr("wtop.walletUsd")}
                        sub={val === "EUR" ? tr("wtop.euro") : tr("wtop.usDollar")}
                        onPick={() => {
                          if (val === currency) return;
                          setCurrency(val);
                          if (paymentSlipUrl || slipName) {
                            setPaymentSlipUrl(null);
                            setSlipName(null);
                            setPaymentSlipError(null);
                            toast.info(tr("wtop.addThePaymentSlipAgain"), {
                              description: tr("wtop.youSwitchedToTheWallet", { val: String(val) }),
                            });
                          }
                        }}
                      />
                    ))}
                  </div>
                </div>

                {/* ── WHICH OF THE THREE, AND accountsUnknown FIRST ──
                    `accountTypeSlugs` is [] for a new customer, a read in
                    flight AND a read that failed; the sentence keeps those
                    apart so a flaky connection is never told "you don't
                    have an ad account with us yet" over the wrong bank. */}
                {routingUnknown && (accountsUnknown || accountTypeSlugs.length > 0) && (
                  <div className="tpx-note">
                    <Info />
                    <span>
                      {accountsUnknown
                        ? tr("wtop.weCouldnTCheckWhich")
                        : accountTypeSlugs.length === 0
                          ? tr("wtop.youDonTHaveAn")
                          : tr("wtop.weCouldnTWorkThe")}
                    </span>
                  </div>
                )}

                {/* The real fork: accounts in both families. Asked, not
                    guessed -- they were told which entity to pay when each
                    account was set up. */}
                {twoFamilies && (
                  <div>
                    <p className="tpx-sec">{tr("wtop.whichOfOurAccountsAre")}</p>
                    <p className="tpx-hint" style={{ margin: "0 0 8px" }}>
                      {tr("wtop.yourAdAccountsAreSplit")}</p>
                    <div className="tpx-grid2">
                      {routed.map((g) => (
                        <ChoiceCard
                          key={g}
                          on={bankGroup === g}
                          coin={<Landmark className="h-5 w-5" />}
                          title={bankBeneficiary(g)}
                          onPick={() => setBankGroup(g)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <p className="tpx-sec">{tr("label.wtop.transferCurrency")}</p>
                  <div className="tpx-grid4">
                    {availableTransferCurrencies.map((c) => (
                      <button
                        key={c}
                        type="button"
                        className="tpx-card tpx-cur"
                        data-on={transferCurrency === c}
                        aria-pressed={transferCurrency === c}
                        onClick={() => setTransferCurrency(c)}
                      >
                        <span className="sym">{currencySymbol(c)}</span>
                        <span className="code">{c}</span>
                      </button>
                    ))}
                  </div>
                  {transferCurrency !== currency && <p className="tpx-hint">
                    {tr("wtop.receives", { v: String(bankBeneficiary(bankGroup)), v2: String(availableTransferCurrencies.join(" / ")), v3: String(transferCurrency !== currency
                      ? ` You'll pay in ${transferCurrency}; your ${currency} wallet is credited from the slip.`
                      : "") })}</p>}
                </div>

                {/* ── SAY THE MINIMUM BEFORE THEY SEND THE MONEY ────────
                    In the TRANSFER currency, rounded up -- send GBP 300
                    against a EUR 300 floor and you are a fifth short -- and
                    when that differs from the wallet, the wallet figure too,
                    because that is the number the box on step 3 asks for. */}
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
                      <div className="tpx-note">
                        <Info />
                        <span>
                          {tr("label.wtop.transferAtLeast")}{" "}
                          <strong>
                            {cur} {shown.toLocaleString("en-US")}
                          </strong>
                          {tr("wtop.aSmallerAmountCannotBe")}
                          {cur !== currency && (
                            <>
                              {" "}
                              {tr("label.wtop.thatIs")}{" "}
                              <strong>
                                {currency}{" "}
                                {minTopupAmount.toLocaleString("en-US")}
                              </strong>{" "}
                              {tr("wtop.creditedTheFigureWeAsk")}</>
                          )}
                        </span>
                      </div>
                    );
                  })()}

                <div className="tpx-actions">
                  <button type="button" className="tpx-cta" onClick={handleNextStep}>
                    {tr("label.wtop.continue")}
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2: BANK DETAILS */}
            {step === STEPS.BANK_DETAILS && (
              <div className="tpx-stack" style={{ gap: 14 }}>
                {/* A FAILED READ IS NOT "NOTHING IS WAITING". Without this
                    the customer wires money against the NEXT reference
                    while an open claim carries a different one. */}
                {openTopupsError ? (
                  <div className="tpx-note" data-tone="warn">
                    <AlertTriangle />
                    <span>
                      <strong>{tr("wtop.weCouldnTCheckFor")}</strong>{" "}
                      {tr("wtop.ifYouHaveAlreadyFiled")}
                    </span>
                  </div>
                ) : null}
                {openTopup ? (
                  <div className="tpx-note" data-tone="warn" >
                    <AlertTriangle />
                    <span>
                    <strong>{tr("wtop.youAlreadyHaveATop")}</strong>{" "}
                    <span>
                      {tr("wtop.filedIfYouHaveNot", { v: String(formatCurrency(
                        Number(openTopup.amount) || 0,
                        (openTopup.currency ?? "EUR").toUpperCase() === "USD"
                          ? "USD"
                          : "EUR",
                      )), v2: String(new Date(openTopup.created_at).toLocaleDateString()) })}</span>
                    </span>
                  </div>
                ) : null}

                <BankTransferInstructions
                  group={bankGroup}
                  transferCurrency={transferCurrency}
                  override={null}
                />

                {/* Client code first, then the reference -- a bank
                    statement shows whose money it is before anything has
                    been matched. Copyable: it is retyped into a banking
                    app character by character. */}
                {/* ── AN EMPTY BOX CAPTIONED "Tap to copy" ──────────
                    When there is no reference the flow is gated below and
                    this says why, instead of an empty box whose tap does
                    nothing -- an unreferenced deposit is one nothing can
                    match. */}
                {formatPaymentReference(clientCode, shownRef) ? (
                  <div className="tpx-ticket">
                    <span className="tpx-lbl">{tr("wtop.paymentReference")}</span>
                    <span className="tpx-ticket-code tpx-mono">
                      {formatPaymentReference(clientCode, shownRef)}
                    </span>
                    <div className="tpx-ticket-foot">
                      <p>
                        {openTopup && useNewRef
                          ? tr("wtop.forANewTransferUse")
                          : tr("wtop.putThisReferenceInThe")}
                      </p>
                      <button
                        type="button"
                        className="tpx-pill"
                        data-done={refCopied}
                        onClick={() => copyReference(shownRef)}
                        aria-label={tr("wtop.copyReference", { v: String(formatPaymentReference(clientCode, shownRef)) })}
                      >
                        {refCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        {refCopied ? tr("wtop.copied") : tr("wtop.copyShort")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="tpx-note" data-tone="warn">
                    {tr("wtop.weCouldNotProduceA")}</p>
                )}

                {openTopup ? (
                  <button
                    type="button"
                    className="tpx-link"
                    style={{ alignSelf: "center", marginTop: -6 }}
                    onClick={() => setUseNewRef((v) => !v)}
                  >
                    {useNewRef ? tr("wtop.useOpenRef") : tr("wtop.separateNewTransfer")}
                  </button>
                ) : null}

                {/* ── THE FLOOR, IN THE MONEY THEY ARE ABOUT TO SEND ──
                    One figure, in the transfer currency, rounded UP: a
                    floor rounded down arrives a cent under the minimum. */}
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
                      <div className="tpx-note">
                        <Info />
                        <span>{tr("wtop.atLeastAnythingLessCannot", { cur: String(cur), v: String(shown.toLocaleString("en-US")) })}</span>
                      </div>
                    );
                  })()}

                {/* ── AND THE GATE, NOT ONLY THE WARNING ──────────
                    No reference, no "I have made the transfer": a claim
                    filed without one is exactly the unmatchable deposit
                    the warning above exists to prevent. */}
                <div className="tpx-actions">
                  <button type="button" className="tpx-ghost" onClick={handlePrevStep}>
                    <ArrowLeft className="h-4 w-4" />
                    {tr("btn.back")}</button>
                  <button
                    type="button"
                    className="tpx-cta"
                    onClick={handleNextStep}
                    disabled={!formatPaymentReference(clientCode, referenceNo)}
                    title={
                      formatPaymentReference(clientCode, referenceNo)
                        ? undefined
                        : tr("wtop.weHaveNoReferenceFor")
                    }
                  >
                    {tr("wtop.iHaveMadeTheTransfer")}</button>
                </div>
              </div>
            )}

            {/* STEP 3: FORM SUBMISSION */}
            {step === STEPS.SUBMISSION && (
              <form
                className="tpx-stack"
                style={{ gap: 14 }}
                onSubmit={handleSubmit(handleSubmitForm)}
              >
                <div className="tpx-route">
                  <div className="tpx-route-head">
                    <span className="tpx-lbl">{tr("label.wtop.transferringTo")}</span>
                    <button
                      type="button"
                      className="tpx-link"
                      onClick={() => setStep(STEPS.SELECTION)}
                    >
                      {tr("label.wtop.change")}</button>
                  </div>
                  <div className="tpx-route-row">
                    <div className="tpx-route-box">
                      <small>{tr("wtop.youSend", { c: transferCurrency })}</small>
                      <b>{bankBeneficiary(bankGroup)}</b>
                    </div>
                    <span className="tpx-route-arrow"><ArrowRight className="h-4 w-4" /></span>
                    <div className="tpx-route-box">
                      <small>{tr("wtop.weCredit")}</small>
                      <b>{currency === "EUR" ? tr("wtop.walletEur") : tr("wtop.walletUsd")}</b>
                    </div>
                  </div>
                </div>

                {/* ── ASK FOR THE FIGURE THAT IS ACTUALLY WRITTEN ──
                    The RPC takes (p_amount, p_currency) where p_currency IS
                    the wallet currency, so the number in this box is, and
                    can only be, the wallet credit. What to SEND is the line
                    underneath, which converts. */}
                <div className="tpx-amount">
                  <label htmlFor="amount">
                    {tr("wtop.howMuchShouldWeCredit", { currency: String(currency) })}</label>
                  <div className="tpx-amount-in">
                    <span>{currency === "USD" ? "$" : "€"}</span>
                    <input
                      id="amount"
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      // Typing replaces what is there, never appends.
                      onFocus={(e) => e.currentTarget.select()}
                      {...register("amount", { valueAsNumber: true })}
                    />
                  </div>
                  <div className="tpx-pills">
                    <AmountPills
                      currency={currency}
                      onPick={(v) =>
                        setValue("amount", v, {
                          shouldValidate: true,
                          shouldDirty: true,
                        })
                      }
                    />
                  </div>
                  {errors.amount && (
                    <p className="tpx-err">{errors.amount.message}</p>
                  )}
                  <p className="tpx-hint">
                    {transferCurrency === currency
                      ? tr("wtop.thisIsWhatWeCredit")
                      : tr("wtop.thisIsWhatWeCredit2", { transferCurrency: String(transferCurrency) })}
                  </p>
                </div>

                {transferCurrency !== currency &&
                  (() => {
                    const converted = convertWalletToTransfer(
                      currentAmount,
                      currency,
                      transferCurrency,
                      rate,
                    );
                    // ── A MISSING FIGURE IS NOT NO FIGURE ─────
                    // Without a rate there is no transfer amount to show,
                    // and saying so beats two numbers in the wrong currency.
                    if (converted === null) {
                      return (
                        <div className="tpx-note" data-tone="warn">
                          <AlertTriangle />
                          <span>
                            {tr("wtop.weCanTWorkOut", { transferCurrency: String(transferCurrency), v: String(ratesError
                              ? " — we couldn't read today's rate"
                              : " — there is no rate published for it"), currency: String(currency), v2: String(formatCurrency(currentAmount || 0, currency)) })}</span>
                        </div>
                      );
                    }
                    return (
                      <div className="tpx-note">
                        <Info />
                        <span>
                          {tr("wtop.transfer")}{" "}
                          <strong>{formatCurrency(converted, transferCurrency)}</strong>{" "}
                          to {bankBeneficiary(bankGroup)} (
                          {transferCurrency}{tr("wtop.your")}{" "}{currency} {" "}{tr("wtop.walletIsCredited")}{" "}{formatCurrency(currentAmount || 0, currency)}{" "}
                          {tr("wtop.fromTheSlip")}
                        </span>
                      </div>
                    );
                  })()}

                {/* ── YOU HAVE ALREADY TOLD US ABOUT ONE ─────────────
                    Beside the amount, because that is where somebody is
                    about to file the second one. The tick is deliberate. */}
                {againMessage ? (
                  <div
                    className="tpx-note"
                    data-tone="warn"
                    style={{ flexDirection: "column", gap: 8, ...(againBlocks ? { background: "#FDECEC", color: "#8A1F1F" } : {}) }}
                  >
                    <span>{againMessage}</span>
                    {!againBlocks && (
                      <label className="flex cursor-pointer items-center gap-2 font-semibold" style={{ color: "var(--tpx-ink)" }}>
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer"
                          style={{ accentColor: "var(--primary)" }}
                          checked={againAcknowledged}
                          onChange={(e) =>
                            setAgainAcknowledged(e.target.checked)
                          }
                        />
                        <span>
                          {tr("wtop.yesThisIsADifferent")}</span>
                      </label>
                    )}
                  </div>
                ) : null}

                {/* Slip required for every topup. The real file input
                    stays (keyboard, and it does the work); the drop zone
                    is what people see, press -- or drop a file on. */}
                <div className="flex flex-col gap-2">
                  <p className="tpx-sec" style={{ margin: 0 }}>{tr("label.wtop.paymentSlip")}</p>
                  <input
                    id="payment_slip"
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={handlePaymentSlipChange}
                    disabled={isUploadingSlip}
                    className="sr-only"
                  />
                  <label
                    htmlFor="payment_slip"
                    className="tpx-drop"
                    data-busy={isUploadingSlip}
                    data-drag={slipDrag}
                    data-done={!!paymentSlipUrl && !isUploadingSlip}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (!slipDrag) setSlipDrag(true);
                    }}
                    onDragLeave={() => setSlipDrag(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setSlipDrag(false);
                      if (isUploadingSlip || !e.dataTransfer.files?.length) return;
                      void handlePaymentSlipChange({
                        target: { files: e.dataTransfer.files, value: "" },
                        currentTarget: { files: e.dataTransfer.files, value: "" },
                      } as unknown as ChangeEvent<HTMLInputElement>);
                    }}
                  >
                    <span className="tpx-drop-ic">
                      {isUploadingSlip ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : paymentSlipUrl ? (
                        <Check className="h-5 w-5" strokeWidth={3} />
                      ) : (
                        <UploadCloud className="h-5 w-5" />
                      )}
                    </span>
                    {paymentSlipUrl && !isUploadingSlip ? (
                      <>
                        <div>
                          <b>{tr("wtop.slipAttached")}</b>
                          <small>{slipName}</small>
                        </div>
                        <em>{tr("label.wtop.replaceFile")}</em>
                      </>
                    ) : (
                      <>
                        <b>
                          {isUploadingSlip
                            ? tr("wtop.uploadingPaymentSlip")
                            : tr("label.wtop.chooseAFile")}
                        </b>
                        <small>{slipName ?? tr("wtop.dropOrTap")}</small>
                      </>
                    )}
                  </label>
                  {paymentSlipError && (
                    <p className="tpx-err">{paymentSlipError}</p>
                  )}
                  {paymentSlipUrl && (
                    paymentSlipPreview === "image" && previewSrc ? (
                      /* Checkerboard, not white: a slip on paper or a
                         transparent screenshot would be white on white,
                         and this preview exists to answer "did the right
                         file attach?". */
                      <div className="tpx-preview">
                        {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded slip of unknown dimensions in a preview modal */}
                        <img
                          src={previewSrc}
                          alt={tr("wtop.paymentSlipPreview")}
                          style={{
                            backgroundColor: "#eef1f7",
                            backgroundImage:
                              "linear-gradient(45deg,#dfe4ee 25%,transparent 25%,transparent 75%,#dfe4ee 75%),linear-gradient(45deg,#dfe4ee 25%,transparent 25%,transparent 75%,#dfe4ee 75%)",
                            backgroundSize: "16px 16px",
                            backgroundPosition: "0 0, 8px 8px",
                          }}
                        />
                      </div>
                    ) : (
                      <p className="tpx-hint" style={{ margin: 0 }}>
                        <FileImage className="mr-1 inline h-3.5 w-3.5" />
                        {paymentSlipPreview === "image"
                          ? tr("wtop.attachedAPreviewOnlyShows")
                          : tr("wtop.noPreviewForThisFile")}
                      </p>
                    )
                  )}
                </div>

                <div className="tpx-actions">
                  <button type="button" className="tpx-ghost" onClick={handlePrevStep}>
                    <ArrowLeft className="h-4 w-4" />
                    {tr("btn.back")}</button>
                  <button
                    type="submit"
                    className="tpx-cta"
                    disabled={
                      isPending ||
                      !walletId ||
                      !paymentSlipUrl ||
                      isUploadingSlip
                    }
                  >
                    {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                    {tr("label.wtop.submitRequest")}</button>
                </div>
                {/* A button that cannot be pressed has to say why. */}
                {!isPending && submitBlockedReason ? (
                  <p className="tpx-hint" style={{ textAlign: "center", margin: 0 }}>
                    {submitBlockedReason}
                  </p>
                ) : null}
              </form>
            )}

            {/* STEP 4: SUCCESS */}
            {step === STEPS.SUCCESS && (
              <div className="tpx-done">
                <div className="tpx-burst" aria-hidden>
                  <span className="tpx-burst-ring" />
                  <span className="tpx-burst-ring" />
                  {CONFETTI.map((c, i) => (
                    <span
                      key={i}
                      className="tpx-confetti"
                      style={{ background: c.color, ["--x" as string]: c.x + "px", ["--y" as string]: c.y + "px", animationDelay: 0.2 + (i % 4) * 0.05 + "s" } as React.CSSProperties}
                    />
                  ))}
                  <span className="tpx-burst-core">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12.5l4.5 4.5L19 7.5" />
                    </svg>
                  </span>
                </div>
                <h3>{tr("wtop.requestSuccessful")}</h3>
                {filedAmount ? (
                  <div className="tpx-amt">{formatCurrency(filedAmount, currency)}</div>
                ) : null}
                <span className="tpx-status"><i />{tr("wtop.beingChecked")}</span>
                {/* The slip is already in, so the money has gone: this
                    screen confirms, it does not instruct (de eigenaar,
                    01-10: "klanten hebben al slip geupload dus ze hebben
                    al gestuurd"). */}
                <p>{tr("wtop.doneLead")}</p>

                {/* THE CODE THIS CLAIM CARRIES -- not the wallet's, which
                    has already rotated to the next one. This is the last
                    screen before somebody opens their banking app. */}
                {filedReference ? (
                  <div className="tpx-ticket" style={{ width: "100%", textAlign: "left" }}>
                    <span className="tpx-lbl">{tr("wtop.paymentReference")}</span>
                    <span className="tpx-ticket-code tpx-mono">
                      {formatPaymentReference(clientCode, filedReference)}
                    </span>
                    <div className="tpx-ticket-foot">
                      <p>{tr("wtop.keepRef")}</p>
                      <button
                        type="button"
                        className="tpx-pill"
                        data-done={refCopied}
                        onClick={() => copyReference(filedReference)}
                        aria-label={tr("wtop.copyReference", { v: String(formatPaymentReference(clientCode, filedReference)) })}
                      >
                        {refCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        {refCopied ? tr("wtop.copied") : tr("wtop.copyShort")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="tpx-hint">{tr("wtop.yourTopupRequestHasBeen")}</p>
                )}

                <div className="tpx-next">
                  <div className="tpx-next-row"><span>1</span>{tr("wtop.next1")}</div>
                  <div className="tpx-next-row"><span>2</span>{tr("wtop.next2")}</div>
                  <div className="tpx-next-row"><span>3</span>{tr("wtop.next3")}</div>
                </div>

                <div className="tpx-actions" style={{ width: "100%" }}>
                  <button type="button" className="tpx-cta" onClick={() => onOpenChange(false)}>
                    {tr("btn.close")}</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
