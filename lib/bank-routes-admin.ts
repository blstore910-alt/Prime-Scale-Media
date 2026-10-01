// Welke accounttypes naar welke begunstigde gaan -- alleen voor de
// beheerkant (de bankknop). Uit lib/bank-beneficiaries.ts gehaald, want
// dat bestand laadt ook in de browser van de klant (lekcontrole 01-10).

import type { BankGroup } from "@/lib/bank-groups";

export const BANK_ROUTES: Record<BankGroup, string> = {
  turlit: "Meta-EU-PSM · Google · TikTok · Taboola · Snapchat · Meta-HK",
  zanel: "Meta-EU-PSM-GH",
  muxue: "— (no longer used)",
};
