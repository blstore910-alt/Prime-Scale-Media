"use client";

import { copyText } from "@/lib/copy-text";
import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─────────────────────────────────────────────────────────────────────
// Beneficiary bank routing for advertiser WALLET top-ups.
//
// Wallets are held in EUR/USD only. The recorded top-up (and the wallet
// credit) is always EUR/USD — but the advertiser may physically TRANSFER
// in a different currency to the matching bank account (e.g. pay TURLIT in
// GBP/HKD). The admin credits the EUR/USD wallet from the slip.
//
// Routing is by BANK GROUP (which ad-account family the advertiser funds):
//   • TURLIT LLC (Wise)          — Meta-EU-PSM, Google, TikTok, Taboola,
//                                  Snapchat.  Accepts EUR / USD / GBP / HKD.
//   • ZANEL ENTERPRISE (Slash /  — Meta-EU-PSM-GH.  USD only.
//     Column N.A.)
//   • MUXUE TRADE LIMITED (J.P.  — Meta-HK-Premium, Meta-HK-Business.
//     Morgan)                      Accepts EUR / USD. Airwallex = instant.
//
// All numbers here are verified against the account holders' own bank
// documents. NEVER edit an IBAN / account / routing / SWIFT without a
// re-verified source — advertisers send real money to these.
// ─────────────────────────────────────────────────────────────────────

// Types and data moved to lib/bank-beneficiaries.ts so they can be imported
// by plain-TypeScript code and covered by node --test; a unit test cannot
// import a file containing JSX. Re-exported here so every existing import of
// this module keeps working.
import {
  bankInstructions,
  type BankGroup,
  type TransferCurrency,
} from "@/lib/bank-beneficiaries";

export type {
  WalletCurrency,
  TransferCurrency,
  BankGroup,
  CurrencyCode,
} from "@/lib/bank-beneficiaries";
export { bankInstructions } from "@/lib/bank-beneficiaries";


// Canonical display order for currency chips.
const CURRENCY_ORDER: TransferCurrency[] = ["USD", "EUR", "GBP", "HKD"];

// The transfer currencies a bank group can receive, in canonical order.
export function bankTransferCurrencies(group: BankGroup): TransferCurrency[] {
  const available = bankInstructions[group].accounts;
  return CURRENCY_ORDER.filter((c) => available[c]);
}

export function bankBeneficiary(group: BankGroup): string {
  return bankInstructions[group].beneficiary;
}

interface BankTransferInstructionsProps {
  group: BankGroup;
  // The currency the advertiser is transferring in.
  transferCurrency: TransferCurrency;
}

export function BankTransferInstructions({
  group,
  transferCurrency,
}: BankTransferInstructionsProps) {
  const detail = bankInstructions[group].accounts[transferCurrency];

  if (!detail) {
    return (
      <div className="rounded-md bg-yellow-50 border border-yellow-600 p-3 text-sm text-yellow-700">
        {bankInstructions[group].beneficiary} does not accept {transferCurrency}.
        Please choose a different transfer currency.
      </div>
    );
  }

  return (
    /* ── ONE SHEET OF BANK DETAILS, NOT A STACK OF LABELS ─────────────
       This was a column of floating label/value pairs with a copy icon
       that only appeared on hover, three uppercase micro-headings and a
       yellow warning box at the end — a form to be filled rather than a
       thing to be read off and typed into a banking app.

       It is now one bordered sheet, the way a bank prints its own
       details: hairline-separated rows, the label small and quiet on the
       left, the value the thing your eye lands on, and the copy control
       always visible because that is the whole reason anyone opens this
       step. An account number, an IBAN and a BIC are set in the mono
       face, so a 6 and an 8 and a B and an 8 are distinguishable —
       which is the difference between a transfer arriving and a week of
       tracing it. */
    <div className="space-y-3">
      <p className="text-sm leading-relaxed text-muted-foreground">
        {detail.description}
      </p>

      <div className="overflow-hidden rounded-xl border bg-[color:var(--panel,#fff)] shadow-[0_1px_2px_-1px_rgba(20,30,80,.14)]">
        {detail.sections.map((section, idx) => (
          <div key={idx}>
            {/* A heading, not a ribbon. A filled band across the sheet
                for every group turned three short lists into six visual
                objects; a small label on the sheet's own ground, with a
                rule under it, groups them without competing with the
                values. */}
            <p className="border-b px-3.5 pb-1.5 pt-2.5 text-[10px] font-bold uppercase leading-none tracking-[.1em] text-muted-foreground/75">
              {section.title}
            </p>
            <div className="divide-y">
              {section.items.map((item) => (
                <InstructionItem
                  key={item.label}
                  label={item.label}
                  value={item.value}
                  copyable={item.copyable}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* The one sentence that stops a deposit being rejected, said once
          and quietly. A full-width yellow panel at the end of the block
          reads as an error on a screen where nothing has gone wrong. */}
      <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
        <span
          aria-hidden
          className="mt-[3px] inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
        />
        Use the exact account holder name shown above — a deposit under a
        different name can be rejected by the bank.
      </p>
    </div>
  );
}

/** Values that have to be read character by character. */
const MONO_LABELS = /iban|bic|swift|account number|routing|sort code|reference/i;

function InstructionItem({
  label,
  value,
  copyable = false,
}: {
  label: string;
  value: string;
  copyable?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  // ── DO NOT SAY "COPIED" WITHOUT CHECKING ───────────────────────────
  //
  // writeText returns a promise and it rejects routinely - mobile Safari
  // outside a user gesture, an unfocused document, a PWA, an insecure
  // context, a denied permission. This neither awaited it nor caught it,
  // so the tick and the toast fired unconditionally.
  //
  // These are the beneficiary name, the IBAN, the account number and the
  // SWIFT for a real bank transfer. Being told an IBAN copied when it did
  // not means pasting whatever was on the clipboard before into a
  // payment.
  //
  // The correct pattern is in the same flow, on the reference copy in
  // wallet-topup-dialog, and says the same thing in its own comment.
  const handleCopy = async () => {
    const cleanValue = value.split("\n(")[0];
    try {
      if (!(await copyText(cleanValue))) throw new Error("copy refused");
      setCopied(true);
      toast.success(label + " copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(
        "Couldn't copy - select the " +
          label.toLowerCase() +
          " and copy it by hand.",
      );
    }
  };

  return (
    /* ── THE VALUE GETS THE WHOLE ROW ──────────────────────────────────
       The label sat in a 104px column beside the value, which left an
       IBAN about 180px to live in — so BE86967511906550 broke across
       two lines, mid-number. An IBAN that wraps is an IBAN somebody
       copies wrong. The label goes above it now and the value spans the
       sheet, so every one of these fits on one line at phone width. */
    /* py-2 and a 32px button, so neither the padding nor the control
       drives the row height — the two lines of text do. With a 36px
       button spanning both rows and items-center, the rows stretched to
       the button and left a band of dead space under every value. */
    <div className="relative grid grid-cols-[1fr_auto] items-center gap-x-2 px-3.5 py-2">
      <span className="col-start-1 text-[10px] font-semibold uppercase leading-none tracking-[.08em] text-muted-foreground/75">
        {label}
      </span>
      <span
        className={cn(
          "col-start-1 mt-1 min-w-0 whitespace-pre-wrap break-words text-[15px] font-semibold leading-[1.25] text-foreground",
          MONO_LABELS.test(label) &&
            "font-mono text-[14.5px] tracking-[-.01em] tabular-nums",
        )}
      >
        {value}
      </span>
      {copyable && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          /* ALWAYS VISIBLE. This was opacity-0 until hover on large
             screens — on the one control the whole step exists for, and
             on a phone there is no hover at all, so it depended on the
             icon being rendered invisible and tapped anyway. */
          className={cn(
            "col-start-2 row-span-2 -mr-1 h-8 w-8 shrink-0 self-center transition-colors",
            copied
              ? "text-emerald-600"
              : "text-muted-foreground/70 hover:text-foreground",
          )}
          onClick={handleCopy}
          aria-label={`Copy ${label}`}
        >
          {copied ? (
            <Check className="h-4 w-4" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </Button>
      )}
    </div>
  );
}

// MUXUE also offers an instant Airwallex channel (USD / EUR).
export function InstantTransferInstructions() {
  return (
    <div className="rounded-lg border bg-muted/20 p-4">
      <p className="text-sm text-muted-foreground mb-4">
        For instant transfers, use these details below.
      </p>
      <div className="space-y-2">
        <InstructionItem
          label="Channel"
          value="Airwallex (instant - USD, EUR)"
        />
        <InstructionItem
          label="Account Name"
          value="牧雪貿易有限公司"
          copyable={true}
        />
        <InstructionItem
          label="Alternative Account Name"
          value="MUXUE TRADE LIMITED"
          copyable={true}
        />
        <InstructionItem
          label="Account Number"
          value="1011106829132869"
          copyable={true}
        />
      </div>
    </div>
  );
}
