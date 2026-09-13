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

// Currency the wallet is credited in (what the RPC records).
export type WalletCurrency = "USD" | "EUR";
// Currency the advertiser may physically transfer in (picks the bank
// account shown). A superset of WalletCurrency for banks that hold more.
export type TransferCurrency = "USD" | "EUR" | "GBP" | "HKD";
// Which beneficiary bank the transfer goes to.
export type BankGroup = "turlit" | "zanel" | "muxue";

// Kept for backwards-compat with older imports.
export type CurrencyCode = WalletCurrency;

type BankItem = { label: string; value: string; copyable?: boolean };
type BankSection = { title: string; items: BankItem[] };
type BankDetail = {
  account_name: string;
  description: string;
  sections: BankSection[];
};

type BankGroupConfig = {
  // Beneficiary account holder, shown in the summary.
  beneficiary: string;
  // Human label for which ad-account families route here.
  routes: string;
  // Per transfer-currency bank details.
  accounts: Partial<Record<TransferCurrency, BankDetail>>;
};

export const bankInstructions: Record<BankGroup, BankGroupConfig> = {
  turlit: {
    beneficiary: "TURLIT LLC",
    routes: "Meta-EU-PSM · Google · TikTok · Taboola · Snapchat",
    accounts: {
      USD: {
        account_name: "TURLIT LLC — USD (Wise US)",
        description:
          "Send USD by wire or ACH (US banks) — or by international transfer (non-US) — to TURLIT LLC’s Wise US checking account.",
        sections: [
          {
            title: "Beneficiary details",
            items: [
              { label: "Beneficiary Name", value: "TURLIT LLC", copyable: true },
              { label: "Account Type", value: "Checking" },
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
                value: "TRWIUS35XXX\n(Use this when sending from outside the US.)",
                copyable: true,
              },
            ],
          },
        ],
      },
      EUR: {
        account_name: "TURLIT LLC — EUR (Wise BE)",
        description:
          "Send EUR to TURLIT LLC’s Wise (Belgium) account via SEPA (preferred) or SWIFT.",
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
              { label: "SEPA", value: "Preferred (EUR within the SEPA zone)" },
              { label: "SWIFT", value: "Use if SEPA isn’t available" },
            ],
          },
        ],
      },
      GBP: {
        account_name: "TURLIT LLC — GBP (Wise UK)",
        description:
          "Send GBP to TURLIT LLC’s Wise (UK) account. Use the sort code + account number for UK (domestic) transfers, or the IBAN / SWIFT internationally.",
        sections: [
          {
            title: "Beneficiary details",
            items: [
              { label: "Account Holder", value: "TURLIT LLC", copyable: true },
              { label: "Account Number", value: "45402484", copyable: true },
              {
                label: "Sort Code",
                value: "60-84-64\n(UK domestic transfers only.)",
                copyable: true,
              },
              { label: "IBAN", value: "GB69TRWI60846445402484", copyable: true },
            ],
          },
          {
            title: "International transfers",
            items: [
              { label: "SWIFT / BIC", value: "TRWIGB2LXXX", copyable: true },
            ],
          },
          {
            title: "Bank details",
            items: [
              {
                label: "Bank Name & Address",
                value:
                  "Wise Payments Limited\nWorship Square, 65 Clifton Street\nLondon, EC2A 4JE\nUnited Kingdom",
                copyable: true,
              },
            ],
          },
        ],
      },
      HKD: {
        account_name: "TURLIT LLC — HKD (Wise HK / DBS)",
        description:
          "Send HKD to TURLIT LLC’s Wise (Hong Kong) account, held with DBS Bank (Hong Kong).",
        sections: [
          {
            title: "Beneficiary details",
            items: [
              { label: "Account Holder", value: "TURLIT LLC", copyable: true },
              { label: "Account Number", value: "79680167588", copyable: true },
            ],
          },
          {
            title: "Bank details",
            items: [
              {
                label: "Bank Name & Code",
                value: "DBS Bank (Hong Kong) Limited (016)",
                copyable: true,
              },
              { label: "Branch Code", value: "478", copyable: true },
              { label: "SWIFT / BIC", value: "DHBKHKHH", copyable: true },
            ],
          },
        ],
      },
    },
  },

  zanel: {
    beneficiary: "ZANEL ENTERPRISE",
    routes: "Meta-EU-PSM-GH",
    accounts: {
      USD: {
        account_name: "ZANEL ENTERPRISE — USD (Slash / Column N.A.)",
        description:
          "Send a domestic or international wire, ACH, or FedNow transfer in USD to ZANEL ENTERPRISE’s Slash account (held with Column N.A.).",
        sections: [
          {
            title: "Beneficiary details",
            items: [
              {
                label: "Beneficiary Name",
                value: "ZANEL ENTERPRISE",
                copyable: true,
              },
              { label: "Account Number", value: "940045169143500", copyable: true },
              { label: "IBAN", value: "940045169143500", copyable: true },
              { label: "Account Type", value: "Checking" },
              {
                label: "Beneficiary Address",
                value: "30 N Gould St\nSheridan, WY 82801-6317\nUnited States",
                copyable: true,
              },
            ],
          },
          {
            title: "US transfers (Wire · ACH · FedNow)",
            items: [
              {
                label: "Routing Number (ABA)",
                value: "121145307",
                copyable: true,
              },
            ],
          },
          {
            title: "International transfers (SWIFT)",
            items: [
              {
                label: "SWIFT / BIC",
                value:
                  "CLNOUS66XXX\n(Remove the trailing XXX if an 8-character code is required.)",
                copyable: true,
              },
            ],
          },
          {
            title: "Bank details",
            items: [
              {
                label: "Bank Name",
                value: "Column N.A., Member FDIC",
                copyable: true,
              },
              {
                label: "Bank Address",
                value:
                  "1 Letterman Drive, Suite A4-700\nSan Francisco, CA 94129\nUnited States",
                copyable: true,
              },
            ],
          },
        ],
      },
    },
  },

  muxue: {
    beneficiary: "MUXUE TRADE LIMITED",
    routes: "Meta-HK-Premium · Meta-HK-Business",
    accounts: {
      USD: {
        account_name: "MUXUE TRADE LIMITED — USD (J.P. Morgan Chase)",
        description:
          "Send USD to MUXUE TRADE LIMITED via US ACH / Wire, or internationally via SWIFT.",
        sections: [
          {
            title: "Beneficiary details",
            items: [
              {
                label: "Account Holder",
                value: "MUXUE TRADE LIMITED",
                copyable: true,
              },
              { label: "Account Number", value: "20000013041715", copyable: true },
              { label: "Account Type", value: "Checking" },
            ],
          },
          {
            title: "US transfers (ACH + Wire)",
            items: [
              { label: "Routing Number (ACH)", value: "028000024", copyable: true },
              { label: "Routing Number (Wire)", value: "021000021", copyable: true },
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
                value: "4 New York Plaza, Floor 15\nNew York\nUnited States",
                copyable: true,
              },
            ],
          },
        ],
      },
      EUR: {
        account_name: "MUXUE TRADE LIMITED — EUR (J.P. Morgan Luxembourg)",
        description:
          "Send EUR to MUXUE TRADE LIMITED via SWIFT to J.P. Morgan Bank Luxembourg S.A. (Dublin Branch).",
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
              { label: "Bank Region", value: "IE" },
              {
                label: "Bank Address",
                value:
                  "200 Capital Dock, 79 Sir John Rogerson’s Quay\nDublin 2, D02 RK57\nIreland",
                copyable: true,
              },
            ],
          },
        ],
      },
    },
  },
};

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
