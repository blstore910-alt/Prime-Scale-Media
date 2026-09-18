"use client";

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
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-sm font-medium leading-relaxed">
          {detail.description}
        </p>
      </div>

      {detail.sections.map((section, idx) => (
        <div key={idx} className="space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80 border-b pb-1">
            {section.title}
          </p>
          <div className="grid gap-3">
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
      <div className="rounded-md bg-yellow-50 border border-yellow-600 p-3 ">
        <p className="text-yellow-600">
          Note: Please use the exact account name or your deposit may be
          rejected.
        </p>
      </div>
    </div>
  );
}

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
      await navigator.clipboard.writeText(cleanValue);
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
    <div className="group relative grid gap-1 pr-10">
      <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
        {label}
      </span>
      <span className="text-sm text-foreground whitespace-pre-wrap leading-snug font-medium">
        {value}
      </span>
      {copyable && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            "absolute top-0 right-0 h-8 w-8 transition-all",
            copied
              ? "text-green-500"
              : "text-muted-foreground hover:text-foreground lg:opacity-0 lg:group-hover:opacity-100",
          )}
          onClick={handleCopy}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
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
