// De bankgegevens van MUXUE -- ALLEEN voor de beheerkant. Uit
// lib/bank-beneficiaries.ts gehaald (lekcontrole 01-10): dat bestand laadt
// ook bij de klant, en er gaat niets meer naar MUXUE.

import { bankInstructions, type BankGroup, type BankGroupConfig } from "@/lib/bank-beneficiaries";

const MUXUE = {
  muxue: {
    beneficiary: "MUXUE TRADE LIMITED",
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

/** Alle bankgegevens inclusief MUXUE, voor beheerschermen. */
export const bankInstructionsAdmin: Record<BankGroup, BankGroupConfig> = { ...bankInstructions, ...MUXUE };
