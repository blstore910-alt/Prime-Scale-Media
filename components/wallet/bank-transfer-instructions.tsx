"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const bankInstructions = {
  USD: {
    meta_eu: {
      account_name: "Meta - EU - PSM USD",
      description:
        "Use these details to send USD wire or ACH (US) — or international transfer (non-US) — to TURLIT LLC’s Wise (US) checking account.",
      sections: [
        {
          title: "Beneficiary details",
          items: [
            { label: "Beneficiary Name", value: "TURLIT LLC", copyable: true },
            { label: "Account Type", value: "Checking", copyable: false },
            { label: "Account Number", value: "218065661196", copyable: true },
            {
              label: "Beneficiary / Bank Address (as shown by Wise)",
              value:
                "Wise US Inc\n108 W 13th St\nWilmington, DE 19801\nUnited States",
              copyable: true,
            },
          ],
        },
        {
          title: "US transfers (Wire + ACH)",
          items: [
            {
              label: "Routing Number (ABA)",
              value:
                "101019628\n(Use this routing number for both Wire and ACH from US banks.)",
              copyable: true,
            },
          ],
        },
        {
          title: "International transfers (non-US)",
          items: [
            {
              label: "SWIFT / BIC",
              value:
                "TRWIUS35XXX\n(Use this when sending from outside the US.)",
              copyable: true,
            },
          ],
        },
      ],
    },
    others: {
      account_name: "Other USD Ad Accounts",
      description:
        "Use these details to send USD to JP MORGAN CHASE BANK, N.A., Ltd via US ACH/Wire or international SWIFT.",
      sections: [
        {
          title: "Beneficiary details",
          items: [
            {
              label: "Account Holder",
              value: "MUXUE TRADE LIMITED",
              copyable: true,
            },
            {
              label: "Account Number",
              value: "20000013041715",
              copyable: true,
            },
            { label: "Account Type", value: "Checking", copyable: false },
          ],
        },
        {
          title: "US transfers (ACH + Wire)",
          items: [
            {
              label: "Routing Number (ACH)",
              value: "028000024",
              copyable: true,
            },
            {
              label: "Routing Number (Wire)",
              value: "021000021",
              copyable: true,
            },
          ],
        },
        {
          title: "International transfers (SWIFT)",
          items: [{ label: "SWIFT / BIC", value: "CHASUS33", copyable: true }],
        },
        {
          title: "Bank details",
          items: [
            {
              label: "Bank Name",
              value: "JP MORGAN CHASE BANK, N.A.",
              copyable: true,
            },
            {
              label: "Bank Address",
              value: "4 NEW YORK PLAZA FLOOR 15\nNew York,\nUnited States",
              copyable: true,
            },
          ],
        },
      ],
    },
  },
  EUR: {
    meta_eu: {
      account_name: "Meta - EU - PSM EUR",
      description:
        "Use these details to send EUR to TURLIT LLC’s Wise (Belgium) account via SEPA (preferred) or SWIFT.",
      sections: [
        {
          title: "Beneficiary details",
          items: [
            { label: "Account Holder", value: "TURLIT LLC", copyable: true },
            { label: "IBAN", value: "BE86967511906550", copyable: true },
          ],
        },
        {
          title: "Bank details",
          items: [
            { label: "Bank Name", value: "Wise", copyable: true },
            { label: "SWIFT / BIC", value: "TRWIBEB1XXX", copyable: true },
            {
              label: "Bank Address",
              value: "Rue du Trône 100, 3rd floor\nBrussels, 1050\nBelgium",
              copyable: true,
            },
          ],
        },
        {
          title: "Transfer type",
          items: [
            {
              label: "SEPA",
              value: "Preferred (EUR within SEPA zone)",
              copyable: false,
            },
            {
              label: "SWIFT",
              value: "Use if SEPA isn’t available",
              copyable: false,
            },
          ],
        },
      ],
    },
    others: {
      account_name: "Other EUR Ad Accounts",
      description:
        "Use these details to send EUR to J.P. MORGAN BANK LUXEMBOURG S.A. via SWIFT.",
      sections: [
        {
          title: "Beneficiary details",
          items: [
            {
              label: "Account Holder",
              value: "MUXUE TRADE LIMITED",
              copyable: true,
            },
            { label: "IBAN", value: "IE67CHAS93090301159013", copyable: true },
          ],
        },
        {
          title: "Bank details",
          items: [
            {
              label: "Bank Name",
              value: "J.P. MORGAN BANK LUXEMBOURG S.A., DUBLIN BRANCH",
              copyable: true,
            },
            { label: "SWIFT / BIC", value: "CHASIE4L", copyable: true },
            { label: "Bank Region", value: "IE", copyable: false },
            {
              label: "Bank Address",
              value:
                "200 Capital Dock 79\n Sir John Rogersons Quay\n Dublin 2 D02 RK57",
              copyable: true,
            },
          ],
        },
      ],
    },
  },
} as const;

export type CurrencyCode = keyof typeof bankInstructions;

export type AccountType = "meta_eu" | "others";

interface BankTransferInstructionsProps {
  currency: CurrencyCode;
  accountType: AccountType;
}

export function BankTransferInstructions({
  currency,
  accountType,
}: BankTransferInstructionsProps) {
  const currencyInstructions = bankInstructions[currency];

  const type = accountType;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-sm font-medium leading-relaxed">
          {currencyInstructions[type].description}
        </p>
      </div>

      {currencyInstructions[type].sections.map((section, idx) => (
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
          Note: Please use exact account name or your deposit may be rejected.
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

  const handleCopy = () => {
    const cleanValue = value.split("\n(")[0];
    navigator.clipboard.writeText(cleanValue);
    setCopied(true);
    toast.success(label + " Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
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
